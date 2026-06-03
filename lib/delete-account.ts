// lib/delete-account.ts
//
// Client-side helper that orchestrates account deletion:
//   1. Resolve the current user's email.
//   2. Re-authenticate with the supplied password to verify identity.
//   3. Delete all application data (same order as deleteAllPortfolioData).
//   4. Call the /api/delete-account route to remove the Auth user.
//   5. Sign out locally to clear the session.
//
// Steps 3 and 4 are intentionally sequential: all portfolio data must be
// removed before the Auth user is deleted so that RLS policies (which check
// auth.uid()) still allow the DELETE statements in step 3.

import { supabase } from "@/lib/supabase";

async function deleteAllData(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const steps: Array<{ table: string; query: () => PromiseLike<{ error: { message: string } | null }> }> = [
        { table: "lot_matches", query: () => supabase.from("lot_matches").delete().eq("user_id", userId) },
        { table: "tax_lots", query: () => supabase.from("tax_lots").delete().eq("user_id", userId) },
        { table: "asset_transactions", query: () => supabase.from("asset_transactions").delete().eq("user_id", userId) },
        { table: "asset_prices", query: () => supabase.from("asset_prices").delete().eq("user_id", userId) },
        { table: "asset_valuations", query: () => supabase.from("asset_valuations").delete().eq("user_id", userId) },
        { table: "portfolio_assets", query: () => supabase.from("portfolio_assets").delete().eq("user_id", userId) },
        { table: "asset_categories", query: () => supabase.from("asset_categories").delete().eq("user_id", userId) },
    ];

    for (const step of steps) {
        const { error } = await step.query();
        if (error) {
            return { ok: false, message: `Failed to delete ${step.table}: ${error.message}` };
        }
    }

    return { ok: true };
}

export async function deleteAccount(
    password: string
): Promise<{ ok: true } | { ok: false; message: string }> {
    // 1. Resolve the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email) {
        return { ok: false, message: "You must be signed in to delete your account." };
    }

    // 2. Verify the password by re-authenticating
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
    });
    if (signInError) {
        return { ok: false, message: "Incorrect password. Please try again." };
    }

    // 3. Delete all application data while the session is still valid
    const dataResult = await deleteAllData(user.id);
    if (!dataResult.ok) {
        return dataResult;
    }

    // 4. Get the refreshed session token and call the server route to remove
    //    the Auth user (requires service-role key, so must be server-side)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        return { ok: false, message: "Session expired after data deletion. Sign in and try again." };
    }

    const response = await fetch("/api/delete-account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { ok: false, message: body.error ?? "Account deletion failed." };
    }

    // 5. Clear the local session
    await supabase.auth.signOut();

    return { ok: true };
}