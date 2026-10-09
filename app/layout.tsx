import type { Metadata } from "next";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/gloock/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ripe HQ",
  description: "Founder desk for Ripe",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
