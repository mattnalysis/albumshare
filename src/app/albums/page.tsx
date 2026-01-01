import { supabase } from "@/lib/supabaseClient";

type Album = {
  id: string;
  title: string;
  artist_name: string;
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
        <p className="mt-4 text-red-600">
          Error loading albums: {error.message}
        </p>
      </main>
    );
  }

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">New Albums</h1>

      <ul className="space-y-3">
        {(data ?? []).map((album: Album) => (
          <li key={album.id} className="border rounded-xl p-3">
            <div className="font-medium">{album.title}</div>
            <div className="text-sm text-gray-600">{album.artist_name}</div>
            <div className="text-xs text-gray-500">
              {album.release_date ?? "Unknown release date"}
            </div>
          </li>
        ))}
      </ul>

      {(data ?? []).length === 0 && (
        <p className="mt-6 text-gray-600">No albums yet.</p>
      )}
    </main>
  );
}
