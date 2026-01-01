#!/usr/bin/env python3
"""
AlbumShare — MusicBrainz monthly importer (local script)

Workflow supported:
1) Fetch once (no Supabase writes), dump JSON into .\\mb_out\\
   python mb_import_month.py --year 2025 --month 12 --dry-run

2) Stage using the saved JSON (NO network calls)
   python mb_import_month.py --from-json .\\mb_out\\mb_2025_12.json --stage

3) Commit to albums using the saved JSON (NO network calls)
   python mb_import_month.py --from-json .\\mb_out\\mb_2025_12.json --write

Modes:
- --dry-run : no Supabase writes; still saves JSON
- --stage   : writes to staging table (upsert)
- --write   : writes to albums table (upsert)

Supabase writes require:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

Notes:
- This script imports MusicBrainz *releases* by date. You can store both release_id and release_group_id
  to dedupe/group later.
"""

import os
import json
import time
import argparse
import calendar
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from dotenv import load_dotenv
load_dotenv()

# -------------------------
# MusicBrainz configuration
# -------------------------
MB_BASE = "https://musicbrainz.org/ws/2"
UA = "AlbumShareMBImporter/0.3 ( matthew.m.snow@gmail.com )"  # update email if you want

# Throttle: MB typically expects ~1 req/sec
DEFAULT_SLEEP_S = 1.1

# Output folder for dumps
DEFAULT_OUT_DIR = "mb_out"


# -------------------------
# HTTP: Session + retries
# -------------------------
def make_session() -> requests.Session:
    s = requests.Session()
    retries = Retry(
        total=8,
        connect=8,
        read=8,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=10, pool_maxsize=10)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


SESSION = make_session()


def mb_get(path: str, params: Dict[str, Any], sleep_s: float = DEFAULT_SLEEP_S) -> Dict[str, Any]:
    headers = {"User-Agent": UA}
    url = f"{MB_BASE}{path}"

    time.sleep(sleep_s)

    r = SESSION.get(url, params=params, headers=headers, timeout=(10, 90))
    if r.status_code >= 400:
        try:
            detail = r.json()
        except Exception:
            detail = r.text[:500]
        raise RuntimeError(f"MB error {r.status_code} for {r.url}\n{detail}")

    return r.json()


# -------------------------
# Normalization helpers
# -------------------------
def safe_join_artist(artist_credit: List[Dict[str, Any]]) -> str:
    if not artist_credit:
        return "Unknown"
    return "".join([ac.get("name", "") + ac.get("joinphrase", "") for ac in artist_credit]).strip() or "Unknown"


def extract_country(release: Dict[str, Any]) -> Optional[str]:
    country = release.get("country")
    if country:
        return country
    events = release.get("release-events", []) or []
    if events:
        area = events[0].get("area", {}) or {}
        iso_codes = area.get("iso-3166-1-codes", []) or []
        if iso_codes:
            return iso_codes[0]
    return None


def extract_label(release: Dict[str, Any]) -> Optional[str]:
    label_info = release.get("label-info", []) or []
    for li in label_info:
        lbl = li.get("label")
        if lbl and lbl.get("name"):
            return lbl.get("name")
    return None


def extract_media_type(release: Dict[str, Any]) -> str:
    media = release.get("media", []) or []
    if media:
        return media[0].get("format", "Unknown") or "Unknown"
    return "Unknown"


def extract_links(release: Dict[str, Any], artist: str, title: str) -> Tuple[Optional[str], Optional[str], Optional[str], str]:
    spotify_url = None
    apple_music_url = None
    bandcamp_url = None

    relations = release.get("relations", []) or []
    for rel in relations:
        target = (rel.get("url") or {}).get("resource")
        rel_type = rel.get("type")
        if not target:
            continue

        if rel_type == "spotify":
            spotify_url = target
        elif rel_type == "itunes" or ("music.apple.com" in target):
            apple_music_url = target
        elif "bandcamp.com" in target:
            bandcamp_url = target

    youtube_music_url = f"https://music.youtube.com/search?q={artist.replace(' ', '+')}+{title.replace(' ', '+')}"
    return spotify_url, apple_music_url, bandcamp_url, youtube_music_url


def extract_tags(release: Dict[str, Any], limit: int = 10) -> List[str]:
    tags = release.get("tags", []) or []
    out: List[str] = []
    for t in tags:
        name = t.get("name")
        if name:
            out.append(name)
    return out[:limit]


def normalize_release(release: Dict[str, Any]) -> Dict[str, Any]:
    mb_release_id = release.get("id")
    title = release.get("title", "Unknown") or "Unknown"
    date_str = release.get("date")  # YYYY-MM-DD (often), sometimes YYYY or YYYY-MM

    release_group = release.get("release-group") or {}
    mb_release_group_id = release_group.get("id")

    artist = safe_join_artist(release.get("artist-credit", []) or [])
    media_type = extract_media_type(release)
    track_count = release.get("track-count")
    country = extract_country(release)
    label = extract_label(release)

    spotify_url, apple_music_url, bandcamp_url, youtube_music_url = extract_links(release, artist, title)

    tags_list = extract_tags(release, limit=10)

    cover_url = f"https://coverartarchive.org/release/{mb_release_id}/front" if mb_release_id else None

    return {
        # identity
        "mb_release_id": mb_release_id,
        "mb_release_group_id": mb_release_group_id,

        # core
        "album": title,
        "artist": artist,
        "release_date": date_str,
        "label": label,
        "cover_url": cover_url,

        # metadata
        "media_type": media_type,
        "track_count": track_count,
        "country": country,

        # links
        "spotify_url": spotify_url,
        "apple_music_url": apple_music_url,
        "youtube_music_url": youtube_music_url,
        "bandcamp_url": bandcamp_url,

        # raw-ish
        "tags": tags_list,
        "full_json": release,
    }


# -------------------------
# Supabase writer
# -------------------------
def get_supabase_client():
    from supabase import create_client  # pip install supabase

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. "
            "Set them before using --stage or --write."
        )
    return create_client(url, key)


def supabase_upsert_rows(table: str, rows: List[Dict[str, Any]], on_conflict: str):
    sb = get_supabase_client()
    return sb.table(table).upsert(rows, on_conflict=on_conflict).execute()


# -------------------------
# Fetch releases (network)
# -------------------------
def fetch_month_releases(year: int, month: int, sleep_s: float, page_size: int = 100) -> List[Dict[str, Any]]:
    _, last_day = calendar.monthrange(year, month)
    all_releases: List[Dict[str, Any]] = []

    for day in range(1, last_day + 1):
        date_str = f"{year}-{month:02d}-{day:02d}"
        print(f"\n--- Processing Date: {date_str} ---", flush=True)

        query = f"date:{date_str} AND status:official AND primarytype:Album"
        offset = 0
        total_count_for_day = None
        day_count = 0

        while True:
            try:
                data = mb_get(
                    "/release",
                    {
                        "query": query,
                        "fmt": "json",
                        "limit": page_size,
                        "offset": offset,
                        "inc": "url-rels",
                    },
                    sleep_s=sleep_s,
                )

                if total_count_for_day is None:
                    total_count_for_day = int(data.get("count", 0))
                    print(f"  Total results for {date_str}: {total_count_for_day}", flush=True)

                rels = data.get("releases", []) or []
                if not rels:
                    break

                all_releases.extend(rels)
                day_count += len(rels)
                offset += len(rels)

                if offset >= total_count_for_day:
                    break

                if offset > 10000:
                    print(f"  [Warn] Hit safety limit for {date_str}, moving to next day.", flush=True)
                    break

            except Exception as e:
                print(f"  [Error] Failed fetching page for {date_str}: {e}", flush=True)
                break

        print(f"  > Collected {day_count} releases for {date_str}", flush=True)

    return all_releases


# -------------------------
# JSON IO
# -------------------------
def ensure_out_dir(out_dir: str) -> str:
    out_dir = out_dir.strip() or DEFAULT_OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    return out_dir


def default_out_path(out_dir: str, year: int, month: int) -> str:
    out_dir = ensure_out_dir(out_dir)
    return os.path.join(out_dir, f"mb_{year}_{month:02d}.json")


def load_from_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, payload: Dict[str, Any]):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


# -------------------------
# Main
# -------------------------
def main():
    parser = argparse.ArgumentParser()

    # Network fetch mode
    parser.add_argument("--year", type=int, help="Year to fetch (required unless --from-json)")
    parser.add_argument("--month", type=int, help="Month to fetch (1-12, required unless --from-json)")
    parser.add_argument("--sleep", type=float, default=DEFAULT_SLEEP_S, help="Delay between MB requests (seconds)")

    # Local JSON workflow
    parser.add_argument("--from-json", type=str, help="Load from an existing JSON dump instead of refetching")
    parser.add_argument("--out-dir", type=str, default=DEFAULT_OUT_DIR, help="Folder to store JSON dumps (default mb_out)")
    parser.add_argument("--out", type=str, help="Explicit output JSON path (overrides --out-dir default naming)")

    # Modes (safety defaults)
    parser.add_argument("--dry-run", action="store_true", help="No Supabase writes; still saves JSON")
    parser.add_argument("--stage", action="store_true", help="Write rows to staging table (upsert)")
    parser.add_argument("--write", action="store_true", help="Write rows to albums table (upsert)")

    # Supabase target config
    parser.add_argument("--albums-table", type=str, default="albums")
    parser.add_argument("--staging-table", type=str, default="albums_import_staging")
    parser.add_argument("--on-conflict", type=str, default="mb_release_id", help="Unique key column for upsert")

    # Optional: keep only minimal fields to match your table
    parser.add_argument(
        "--minimal",
        action="store_true",
        help="Only keep core fields (recommended if your table doesn't have all optional columns yet)",
    )

    args = parser.parse_args()

    # Default: dry-run unless user explicitly stages or writes
    if not (args.dry_run or args.stage or args.write):
        args.dry_run = True

    if args.stage and args.write:
        raise SystemExit("Choose only one: --stage OR --write (or neither for --dry-run).")

    mode = "DRY-RUN" if args.dry_run else ("STAGE" if args.stage else "WRITE")
    print(f"Mode: {mode}", flush=True)

    # -------------------------
    # Load source releases
    # -------------------------
    releases: List[Dict[str, Any]] = []
    source_meta: Dict[str, Any] = {}

    if args.from_json:
        # No network calls
        payload = load_from_json(args.from_json)
        # Accept either a raw releases dump or a normalized dump
        if "releases" in payload:
            releases = payload.get("releases") or []
        elif "rows" in payload:
            # If user loads a normalized dump, we can skip normalization by treating rows as already normalized
            # We'll detect that later.
            releases = payload.get("rows") or []
        else:
            # fallback: try common names
            releases = payload.get("data") or []
        source_meta = {"from_json": args.from_json}
        print(f"Loaded from JSON: {args.from_json}", flush=True)
        print(f"Loaded items: {len(releases)}", flush=True)
    else:
        # Network fetch requires year/month
        if args.year is None or args.month is None:
            raise SystemExit("You must provide --year and --month unless using --from-json.")
        if args.month < 1 or args.month > 12:
            raise SystemExit("--month must be between 1 and 12.")

        releases = fetch_month_releases(args.year, args.month, sleep_s=args.sleep)
        source_meta = {"year": args.year, "month": args.month, "sleep": args.sleep}

    # -------------------------
    # Normalize (or detect already-normalized)
    # -------------------------
    normalized: List[Dict[str, Any]] = []
    seen_ids = set()
    missing_id = 0

    already_normalized = False
    if releases and isinstance(releases[0], dict) and ("mb_release_id" in releases[0] and "album" in releases[0]):
        already_normalized = True

    if already_normalized:
        # De-dupe just in case
        for row in releases:
            mbid = row.get("mb_release_id")
            if not mbid:
                missing_id += 1
                continue
            if mbid in seen_ids:
                continue
            seen_ids.add(mbid)
            normalized.append(row)
    else:
        for r in releases:
            row = normalize_release(r)
            mbid = row.get("mb_release_id")
            if not mbid:
                missing_id += 1
                continue
            if mbid in seen_ids:
                continue
            seen_ids.add(mbid)
            normalized.append(row)

    print(f"Normalized unique rows: {len(normalized)} (skipped missing id: {missing_id})", flush=True)

    # Optional: strip to minimal fields to match your current DB schema
    if args.minimal:
        keep = {
            "mb_release_id",
            "mb_release_group_id",
            "album",
            "artist",
            "release_date",
            "label",
            "cover_url",
        }
        normalized = [{k: v for k, v in row.items() if k in keep} for row in normalized]
        print(f"Applied --minimal. Fields kept: {sorted(list(keep))}", flush=True)

    # -------------------------
    # Always save a normalized dump (clean workflow)
    # -------------------------
    out_path: Optional[str] = None
    if args.out:
        out_path = args.out
    else:
        # If we loaded from JSON and year/month weren't provided, we still store into mb_out with a generic name
        if args.from_json and (args.year is None or args.month is None):
            out_dir = ensure_out_dir(args.out_dir)
            out_path = os.path.join(out_dir, "mb_loaded_normalized.json")
        else:
            out_path = default_out_path(args.out_dir, args.year, args.month)

    dump_payload = {
        "source": source_meta,
        "count_normalized_unique": len(normalized),
        "rows": normalized,
    }
    save_json(out_path, dump_payload)
    print(f"Saved normalized dump: {out_path}", flush=True)

    # -------------------------
    # If dry-run, stop here
    # -------------------------
    if args.dry_run:
        sample = normalized[:5]
        print("\nDry-run complete. Sample rows:", flush=True)
        for i, row in enumerate(sample, start=1):
            print(f"  [{i}] {row.get('artist')} — {row.get('album')} ({row.get('release_date')})", flush=True)
        print("\nNext step:", flush=True)
        print(f"  - Stage: python mb_import_month.py --from-json \"{out_path}\" --stage", flush=True)
        print(f"  - Write: python mb_import_month.py --from-json \"{out_path}\" --write", flush=True)
        return

    # -------------------------
    # Stage or Write to Supabase
    # -------------------------
    target_table = args.staging_table if args.stage else args.albums_table
    print(f"\nWriting to Supabase table: {target_table} (upsert on {args.on_conflict})", flush=True)

    chunk_size = 250
    total = len(normalized)
    written = 0

    for start in range(0, total, chunk_size):
        chunk = normalized[start : start + chunk_size]
        supabase_upsert_rows(target_table, chunk, on_conflict=args.on_conflict)
        written += len(chunk)
        print(f"  Upserted {written}/{total}", flush=True)

    print("\nDone.", flush=True)
    if args.stage:
        print("Staging complete. Inspect rows in Supabase staging table.", flush=True)
        print(f"Tip: when satisfied, write using: python mb_import_month.py --from-json \"{out_path}\" --write", flush=True)
    else:
        print("Write complete. Albums table should now contain upserted rows.", flush=True)


if __name__ == "__main__":
    main()
