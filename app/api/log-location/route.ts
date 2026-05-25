import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { lookupIpLocation } from "@/lib/geo-cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabaseServer = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });

    // Grab latest login row for this user
    const { data: latestLogin, error: fetchError } = await supabaseServer
      .from("login_history")
      .select("*")
      .eq("user_id", userId)
      .order("login_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!latestLogin) {
      return NextResponse.json({ status: "no_login_history" });
    }

    // Only update if location is not set and ip is available
    if (!latestLogin.location && latestLogin.ip_address) {
      const location = await lookupIpLocation(latestLogin.ip_address);
      
      const { error: updateError } = await supabaseServer
        .from("login_history")
        .update({ location })
        .eq("id", latestLogin.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, location, id: latestLogin.id });
    }

    return NextResponse.json({ success: true, status: "skipped", location: latestLogin.location });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
