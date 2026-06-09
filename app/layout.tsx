import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AuthProviderGate from "@/components/auth-provider-gate"; // We will create this next
import ThemeSyncProvider from "@/components/theme-sync-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Turbo Engine Portfolio",
  description: "Financial Asset Management Console Workspace Layout",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
        {/* Pass all rendering logic down safely to a client-side provider wrapper */}
        <AuthProviderGate>
          {children}
        </AuthProviderGate>
      </body>
    </html>
  );
}
