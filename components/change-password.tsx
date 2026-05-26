"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export default function ChangePassword() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setMessage(null);

        if (newPassword !== confirmPassword) {
            setMessage({ type: "error", text: "New passwords do not match." });
            return;
        }

        if (newPassword.length < 6) {
            setMessage({
                type: "error",
                text: "New password must be at least 6 characters.",
            });
            return;
        }

        setLoading(true);

        // First, verify the current password by attempting a re-authentication
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.user.email) {
            setMessage({
                type: "error",
                text: "Unable to verify your account. Please sign in again.",
            });
            setLoading(false);
            return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: sessionData.session.user.email,
            password: currentPassword,
        });

        if (signInError) {
            setMessage({
                type: "error",
                text: "Current password is incorrect.",
            });
            setLoading(false);
            return;
        }

        // Update the password
        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword,
        });

        if (updateError) {
            setMessage({
                type: "error",
                text: updateError.message,
            });
        } else {
            setMessage({
                type: "success",
                text: "Password changed successfully!",
            });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        }

        setLoading(false);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            {/* Current Password */}
            <div>
                <label
                    htmlFor="current-password"
                    className="block text-sm font-medium text-gray-700 mb-1"
                >
                    Current Password
                </label>
                <input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter current password"
                />
            </div>

            {/* New Password */}
            <div>
                <label
                    htmlFor="new-password"
                    className="block text-sm font-medium text-gray-700 mb-1"
                >
                    New Password
                </label>
                <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter new password (min. 6 characters)"
                />
            </div>

            {/* Confirm New Password */}
            <div>
                <label
                    htmlFor="confirm-password"
                    className="block text-sm font-medium text-gray-700 mb-1"
                >
                    Confirm New Password
                </label>
                <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Re-enter new password"
                />
            </div>

            {/* Message */}
            {message && (
                <div
                    className={`rounded-md px-4 py-2 text-sm ${message.type === "success"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                >
                    {message.text}
                </div>
            )}

            {/* Submit */}
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading ? "Changing..." : "Change Password"}
            </Button>
        </form>
    );
}