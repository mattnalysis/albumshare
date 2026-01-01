"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function SearchBar({ defaultQuery }: { defaultQuery: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(defaultQuery);

  const nextUrl = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = q.trim();

    if (trimmed) params.set("q", trimmed);
    else params.delete("q");

    const qs = params.toString();
    return qs ? `/albums?${qs}` : "/albums";
  }, [q, searchParams]);

  function submit() {
    router.push(nextUrl);
  }

  function clear() {
    setQ("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const qs = params.toString();
    router.push(qs ? `/albums?${qs}` : "/albums");
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-full max-w-xl">
        <input
          className="w-full rounded-md border px-3 py-2 pr-10"
          placeholder="Search artist or album…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button
          type="button"
          onClick={submit}
          aria-label="Search"
          title="Search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-sm"
        >
          🔎
        </button>
      </div>

      <button
        type="button"
        onClick={clear}
        className="rounded-md border px-3 py-2"
      >
        Clear
      </button>
    </div>
  );
}
