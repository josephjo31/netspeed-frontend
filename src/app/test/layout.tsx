import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Speed Test — NetSpeed.me",
  description:
    "Run a real internet speed test. Measure download speed, upload speed, ping, jitter, and detect your ISP and location instantly.",
};

export default function TestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
