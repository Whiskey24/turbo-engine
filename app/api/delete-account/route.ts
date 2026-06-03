// app/api/delete-account/route.ts
//
// Deletes the authenticated user's account from Supabase Auth.
// Requires SUPABASE_SERVICE_ROLE_KEY in environment — the service role is the
// only principal allowed to call auth.admin.deleteUser. It is never exposed
// to the browser; this route acts as the secure intermediary.
//
// The client must pass its current JWT in the Authorization header so we can
// verify identity before acting.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function DELETE(request: Request) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);

    // Admin client — never instantiated in browser code
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the token and resolve the user identity
    const { data: { user }, error: verifyError } = await adminClient.auth.getUser(token);
    if (verifyError || !user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    // Delete the user — this also cascades to auth.sessions, auth.identities, etc.
    // Application-level data (portfolio_assets, etc.) must be deleted by the client
    // before calling this route, or handled by ON DELETE CASCADE rules in the schema.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
