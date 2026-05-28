"use client";

import { useState, useEffect } from "react";
import { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { parseUserAgent } from "@/lib/user-agent-utils";
import { getUserSettings } from "@/lib/database";

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
    return <div className="text-center py-4">Loading login history...</div>;
  }

  if (error) {
    return <div className="text-center text-red-500 py-4">{error}</div>;
  }

  if (logins.length === 0) {
    return <div className="text-center py-4">No login history found</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date & Time
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Device
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              IP Address
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {logins.map((login) => {
            // 🚨 Clean the IP address by splitting off any CIDR notation (e.g., "192.168.1.1/32" -> "192.168.1.1")
            const cleanIp = login.ip_address ? login.ip_address.split('/')[0].trim() : "";

            return (
              <tr key={login.id}>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                  {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(login.login_at))}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                  {parseUserAgent(login.user_agent)}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    {/* Display the original IP string as recorded in the database */}
                    <span>{login.ip_address || "Unknown"}</span>

                    {cleanIp && login.ip_address !== "Unknown" && (
                      <a
                        href={`https://whatismyipaddress.com/ip/${cleanIp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-blue-500 transition-colors duration-150"
                        title={`Lookup IP details for ${cleanIp}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4"
                        >
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
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