"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { supabase } from "@/lib/supabase";;

export default function AuthScreen({ onAuthSuccess }: { onAuthSuccess: () => void }) {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage("");

        if (isSignUp) {
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) {
                setMessage(`Registration Error: ${error.message}`);
            } else {
                setMessage("Success! Check your email inbox for a verification link.");
            }
        } else {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setMessage(`Login Error: ${error.message}`);
            } else {
                onAuthSuccess();
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Card className="w-full max-w-md shadow-md">
                <CardHeader>
                    <CardTitle>{isSignUp ? "Create your account" : "Sign in to Dashboard"}</CardTitle>
                    <CardDescription>
                        {isSignUp ? "Enter your details to track your wealth metrics" : "Welcome back! Enter your login credentials"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAuth} className="space-y-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                required
                            />
                        </div>

                        {message && (
                            <p className="text-xs p-2.5 bg-muted rounded border text-center text-medium">
                                {message}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-primary-foreground font-medium py-2 rounded-md transition hover:opacity-90 disabled:opacity-50 text-sm"
                        >
                            {loading ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
                        </button>
                    </form>

                    <div className="mt-4 text-center">
                        <button
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setMessage("");
                            }}
                            className="text-xs text-muted-foreground hover:underline"
                        >
                            {isSignUp ? "Already have an account? Sign In" : "Don't have an account yet? Register here"}
                        </button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}