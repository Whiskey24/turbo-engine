"use client";

import { useState, useEffect } from "react";
import { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { parseUserAgent } from "@/lib/user-agent-utils";

export default function LoginHistory() {
  const [logins, setLogins] = useState<Tables<"login_history">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
          {logins.map((login) => (
            <tr key={login.id}>
              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                {new Date(login.login_at).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                })}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                {parseUserAgent(login.user_agent)}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                {login.ip_address || "Unknown"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}