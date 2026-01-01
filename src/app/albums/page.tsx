import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { likeAlbum, unlikeAlbum } from "./actions";
import SearchBar from "./SearchBar"; //added in feature/albums-search
import { CoverThumb } from "@/components/CoverThumb";
import AlbumDateFilter from "@/components/AlbumDateFilter";

//export const dynamic = "force-dynamic";

type BucketRow = { year: number; month: number; month_name: string | null };

function parseFirst(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

function monthRangeUTC(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    startISO: start.toISOString().slice(0, 10),
    endISO: end.toISOString().slice(0, 10),
  };
}


type SearchParams =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

type AlbumRow = {
  id: number; // your screenshot shows int8
  album: string | null;
  artist: string | null;
  release_date: string | null;
  cover_url: string | null;
};

export default async function AlbumsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
 const sp = await Promise.resolve(searchParams);

const q = parseFirst(sp?.q);
const yearStr = parseFirst(sp?.year);
const monthStr = parseFirst(sp?.month);

const selectedYear = yearStr ? Number(yearStr) : null;
const selectedMonth = monthStr ? Number(monthStr) : null;


  const supabaseServer = await createSupabaseServerClient();

  const { data: userData } = await supabaseServer.auth.getUser();
  const user = userData.user;

  // NEW: fetch dropdown options from DB (via view)
  const { data: buckets, error: bucketsErr } = await supabaseServer
  .from("album_release_buckets")
  .select("year, month, month_name")
  .order("year", { ascending: false })
  .order("month", { ascending: false });

if (bucketsErr) {
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">Albums</h1>
      <p className="mt-4 text-red-600">Error loading filter options: {bucketsErr.message}</p>
    </main>
  );
}

const bucketRows = (buckets ?? []) as BucketRow[];
const years = Array.from(new Set(bucketRows.map((b) => b.year)));


  const monthsForYear = selectedYear
    ? bucketRows.filter((b) => b.year === selectedYear)
    : [];

  // Existing albums query (with NEW date filtering)
  let query = supabaseServer
    .from("albums")
    .select("id, album, artist, release_date, cover_url")
    .order("release_date", { ascending: false })
    .limit(200);

  const qMin = 1;
  const qOk = q.length >= qMin;

  if (qOk) {
    const escaped = q.replaceAll("%", "\\%").replaceAll("_", "\\_");
    query = query.or(`album.ilike.%${escaped}%,artist.ilike.%${escaped}%`);
  }

  // NEW: Apply year/month filters using date ranges (index-friendly)
 if (selectedYear && selectedMonth) {
  const { startISO, endISO } = monthRangeUTC(selectedYear, selectedMonth);
  query = query.gte("release_date", startISO).lt("release_date", endISO);
} else if (selectedYear && !selectedMonth) {
  const startISO = `${selectedYear}-01-01`;
  const endISO = `${selectedYear + 1}-01-01`;
  query = query.gte("release_date", startISO).lt("release_date", endISO);
}


  const { data, error } = await query;

  if (error) {
    return (
      <main className="p-4">
        <h1 className="text-xl font-semibold">Albums</h1>
        <p className="mt-4 text-red-600">Error loading albums: {error.message}</p>
      </main>
    );
  }

  const albums = (data ?? []) as AlbumRow[];
  const albumIds = albums.map((a) => a.id);

  //fetch likes + counts added 2026-01-01
  // 1) total likes per album
  const { data: likeRows, error: likeErr } = await supabaseServer
    .from("likes")
    .select("album_id")
    .in("album_id", albumIds);

  if (likeErr) {
    // optional: you can ignore likes errors and still show albums
    console.error(likeErr.message);
  }

  const likeCounts = new Map<number, number>();
  for (const row of likeRows ?? []) {
    const id = row.album_id as number;
    likeCounts.set(id, (likeCounts.get(id) ?? 0) + 1);
  }

  // 2) which albums THIS user has liked
  let myLiked = new Set<number>();
  if (user && albumIds.length) {
    const { data: mine } = await supabaseServer
      .from("likes")
      .select("album_id")
      .eq("user_id", user.id)
      .in("album_id", albumIds);

    myLiked = new Set((mine ?? []).map((r) => r.album_id as number));
  }

  return (
    <main className="p-4 max-w-xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-600">
          {user ? `Signed in as ${user.email}` : "Not signed in"}
        </div>
        {user ? (
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm underline">
              Sign out
            </button>
          </form>
        ) : (
          <Link href="/login" className="text-sm underline">
            Sign in
          </Link>
        )}
      </header>

      <h1 className="text-2xl font-semibold mb-4">New Albums</h1>

      <ul className="space-y-3">
        <AlbumDateFilter
          years={years}
          buckets={bucketRows}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
        />

        <div className="mt-4">
          <SearchBar defaultQuery={q} />
        </div>

        {albums.map((a) => (
          <li
            key={a.id}
            className="border rounded-xl p-3 flex items-start justify-between gap-3"
          >
            {/* LEFT SIDE: thumbnail + text */}
            <div className="flex items-start gap-3">
              <CoverThumb src={a.cover_url} alt={`${a.album ?? "Album"} cover`} />

              <div>
                <div className="font-medium">{a.album ?? "Untitled album"}</div>
                <div className="text-sm text-gray-600">
                  {a.artist ?? "Unknown artist"}
                </div>
                <div className="text-xs text-gray-500">
                  {a.release_date ?? "Unknown release date"}
                </div>
              </div>
            </div>

            {/* RIGHT SIDE: likes + actions */}
            <div className="flex flex-col items-end gap-2">
              <div className="text-xs text-gray-500">{likeCounts.get(a.id) ?? 0} ♥</div>

              {user ? (
                myLiked.has(a.id) ? (
                  <form action={unlikeAlbum.bind(null, a.id)}>
                    <button type="submit" className="border rounded-xl px-3 py-2 text-sm">
                      ♥ Liked
                    </button>
                  </form>
                ) : (
                  <form action={likeAlbum.bind(null, a.id)}>
                    <button type="submit" className="border rounded-xl px-3 py-2 text-sm">
                      ♡ Like
                    </button>
                  </form>
                )
              ) : (
                <Link href="/login" className="text-sm underline">
                  Sign in to like
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {albums.length === 0 && <p className="mt-6 text-gray-600">No albums yet.</p>}
    </main>
  );
}
