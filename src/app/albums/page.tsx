import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { likeAlbum, unlikeAlbum } from "./actions";

export const dynamic = "force-dynamic";



type AlbumRow = {
  id: number; // your screenshot shows int8
  album: string | null;
  artist: string | null;
  release_date: string | null;
};

export default async function AlbumsPage() {
  const supabaseServer = await createSupabaseServerClient();

  const { data: userData } = await supabaseServer.auth.getUser();
  const user = userData.user;

  const { data, error } = await supabaseServer
    .from("albums")
    .select("id, album, artist, release_date")
    .order("release_date", { ascending: false });

  if (error) {
    return (
      <main className="p-4">
        <h1 className="text-xl font-semibold">Albums</h1>
        <p className="mt-4 text-red-600">Error loading albums: {error.message}</p>
      </main>
    );
  }

  const albums = (data ?? []) as AlbumRow[];

//fetch likes + counts added 2026-01-01
// 1) total likes per album
const { data: likeRows, error: likeErr } = await supabaseServer
  .from("likes")
  .select("album_id");

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
if (user) {
  const { data: mine } = await supabaseServer
    .from("likes")
    .select("album_id")
    .eq("user_id", user.id);

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
        {albums.map((a) => (
  <li
  key={a.id}
  className="border rounded-xl p-3 flex items-start justify-between gap-3"
>
  <div>
    <div className="font-medium">{a.album ?? "Untitled album"}</div>
    <div className="text-sm text-gray-600">{a.artist ?? "Unknown artist"}</div>
    <div className="text-xs text-gray-500">
      {a.release_date ?? "Unknown release date"}
    </div>
  </div>

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

      {albums.length === 0 && (
        <p className="mt-6 text-gray-600">No albums yet.</p>
      )}
    </main>
  );
}
