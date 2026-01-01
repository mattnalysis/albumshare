import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/albums`);
  }

  const supabase = await createSupabaseServerClient();

  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr) {
    console.error("exchangeCodeForSession failed:", exchangeErr);
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    console.error("getUser failed:", userErr);
    return NextResponse.redirect(`${origin}/login?error=get_user_failed`);
  }

  const user = userData.user;
  if (!user) {
    console.error("No user after exchangeCodeForSession");
    return NextResponse.redirect(`${origin}/login?error=no_user`);
  }

  const { error: profileErr } = await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
  });

  if (profileErr) {
    console.error("profile upsert failed:", profileErr);
    return NextResponse.redirect(`${origin}/login?error=profile_upsert_failed`);
  }

  return NextResponse.redirect(`${origin}/albums`);
}
