"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function likeAlbum(albumId: number) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("likes").insert({
    user_id: user.id,
    album_id: albumId,
  });

  // ignore "already liked" due to unique constraint
  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }

  revalidatePath("/albums");
}

export async function unlikeAlbum(albumId: number) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) throw new Error("Not signed in");

  const { error } = await supabase
    .from("likes")
    .delete()
    .eq("album_id", albumId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/albums");
}
