import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CYBER_SHIELD // LIVE_FEED",
  description:
    "CyberShield — premium SecOps dashboard streaming live cybersecurity news and the official CISA Known Exploited Vulnerabilities catalog in real time. No mock data.",
  keywords: [
    "CyberShield",
    "threat intelligence",
    "CISA KEV",
    "cybersecurity news",
    "SOC dashboard",
    "zero-day",
  ],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0F19",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-mono antialiased bg-cyber-bg text-foreground`}
      >
        {children}
        <Toaster theme="dark" position="bottom-right" closeButton />
      </body>
    </html>
  );
}
