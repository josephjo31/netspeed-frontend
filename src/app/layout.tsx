import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NetSpeed.me — Test Your Connection. Master Your Ping.",
  description:
    "Internet & Gaming Network Analyzer. Measure download speed, upload speed, ping, jitter, packet loss, and game-specific latency for CS2, Valorant, Rocket League, PUBG, and Fortnite.",
  keywords: [
    "internet speed test",
    "ping test",
    "gaming latency",
    "network analyzer",
    "CS2 ping",
    "Valorant ping",
    "download speed",
    "upload speed",
    "jitter test",
    "packet loss",
  ],
  authors: [{ name: "NetSpeed.me" }],
  openGraph: {
    title: "NetSpeed.me — Test Your Connection. Master Your Ping.",
    description:
      "Internet & Gaming Network Analyzer. Measure download speed, upload, ping, jitter, and game-specific latency.",
    url: "https://netspeed.me",
    siteName: "NetSpeed.me",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NetSpeed.me — Test Your Connection. Master Your Ping.",
    description:
      "Internet & Gaming Network Analyzer. Measure download speed, upload, ping, jitter, and game-specific latency.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090B10",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
