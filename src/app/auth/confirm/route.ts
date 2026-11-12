import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>(["invite", "recovery", "signup", "email", "email_change"]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const typeValue = url.searchParams.get("type");
  if (!isSupabaseConfigured() || !tokenHash || !typeValue || !allowedTypes.has(typeValue as EmailOtpType)) {
    return NextResponse.redirect(new URL("/login?status=invalid_link", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: typeValue as EmailOtpType });
  if (error) return NextResponse.redirect(new URL("/login?status=invalid_link", url.origin));
  const destination = typeValue === "invite" || typeValue === "recovery" ? "/account/update-password" : "/";
  return NextResponse.redirect(new URL(destination, url.origin));
}
