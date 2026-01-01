import { supabase } from "@/lib/supabaseClient";
export const dynamic = "force-dynamic";

type AlbumRow = {
  id: number; // your screenshot shows int8
  album: string | null;
  artist: string | null;
  release_date: string | null;
};

export default async function AlbumsPage() {
  const { data, error } = await supabase
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

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">New Albums</h1>

      <ul className="space-y-3">
        {albums.map((a) => (
          <li key={a.id} className="border rounded-xl p-3">
            <div className="font-medium">{a.album ?? "Untitled album"}</div>
            <div className="text-sm text-gray-600">{a.artist ?? "Unknown artist"}</div>
            <div className="text-xs text-gray-500">
              {a.release_date ?? "Unknown release date"}
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
