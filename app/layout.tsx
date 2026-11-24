import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", apple: "/icon-192.png" },
  title: "Habit Grove · Personal planner",
  description: "Plan your habits, check in and follow your progress.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
