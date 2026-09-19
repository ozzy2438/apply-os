import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { bootApp } from "@/lib/boot";
import { isDemoMode } from "@/lib/jev/client";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
});

export const metadata: Metadata = {
  title: "Apply OS — career decision engine",
  description:
    "Score job postings against your CV and goals with typed Jev decisions. Morning desk, citation-checked letters, safe discovery assistant, pipeline.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await bootApp();
  return (
    <html lang="en">
      <body className={`${sans.className} ${mono.variable} antialiased`}>
        <AppShell demo={isDemoMode()}>{children}</AppShell>
      </body>
    </html>
  );
}
