"use client";

import { useState, useEffect } from "react";
import { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { parseUserAgent } from "@/lib/user-agent-utils";
import { getUserSettings } from "@/lib/database";
import { ExternalLink } from "lucide-react"; // Imported for consistent UI iconography

export default function LoginHistory() {
  const [logins, setLogins] = useState<Tables<"login_history">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<string>("en-GB");

  useEffect(() => {
    getUserSettings().then((prefs) => { if (prefs.locale) setLocale(prefs.locale); });

    async function fetchLoginHistory() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user.id) {
        setError("User not authenticated");
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("login_history")
        .select("*")
        .eq("user_id", session.user.id)
        .order("login_at", { ascending: false })
        .limit(5);

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setLogins(data || []);
      }
      setLoading(false);
    }

    fetchLoginHistory();
  }, []);

  if (loading) {
    return (
      <div className="border border-dashed rounded-xl h-24 flex items-center justify-center text-muted-foreground text-xs bg-card animate-pulse">
        Loading login history metrics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/30 rounded-xl h-24 flex items-center justify-center text-destructive text-xs bg-destructive/10 font-medium">
        Error: {error}
      </div>
    );
  }

  if (logins.length === 0) {
    return (
      <div className="border border-dashed rounded-xl h-24 flex items-center justify-center text-muted-foreground text-xs bg-card">
        No registered login session entries recorded.
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card shadow-sm overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="bg-muted/60 border-b text-muted-foreground font-medium select-none">
            <th className="p-3 font-medium text-muted-foreground w-1/3">
              Date & Time
            </th>
            <th className="p-3 font-medium text-muted-foreground w-1/3">
              Authentication Device
            </th>
            <th className="p-3 font-medium text-muted-foreground w-1/3">
              IP Network Target
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {logins.map((login) => {
            // Clean the IP address by splitting off any CIDR block strings (e.g., "192.168.1.1/32" -> "192.168.1.1")
            const cleanIp = login.ip_address ? login.ip_address.split('/')[0].trim() : "";

            return (
              <tr key={login.id} className="hover:bg-muted/30 transition-colors">
                {/* Date & Time Column: Styled like primary Asset column anchor */}
                <td className="p-3 font-semibold text-foreground">
                  {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(login.login_at))}
                </td>

                {/* Device Column */}
                <td className="p-3 text-muted-foreground">
                  {parseUserAgent(login.user_agent)}
                </td>

                {/* IP Address Column: Styled with clean monospaced tech typography */}
                <td className="p-3 font-mono text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{login.ip_address || "Unknown"}</span>

                    {cleanIp && login.ip_address !== "Unknown" && (
                      <a
                        href={`https://whatismyipaddress.com/ip/${cleanIp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground/60 hover:text-primary transition-colors"
                        title={`Lookup geo-IP mapping for ${cleanIp}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}