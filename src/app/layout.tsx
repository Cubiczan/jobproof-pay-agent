import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "JobProof Pay Agent | PayPal AI Hackathon",
  description:
    "AI verifies contractor before/after proof, then a PayPal agent pays via sandbox Orders + Payouts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-xs text-slate-400">
          JobProof Pay Agent · PayPal AI Hackathon MVP · MIT License
        </footer>
      </body>
    </html>
  );
}
