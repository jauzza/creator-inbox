import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Creator Inbox", description: "Creator inbox and customer management" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d0f12" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh text-[14px] leading-relaxed">{children}</body>
    </html>
  );
}
