import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Orbitron } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CyberShield News — Live Threat Intelligence",
  description:
    "CyberShield News — real-time cyber threat intelligence aggregator parsing 20+ cybersecurity research streams and the official CISA Known Exploited Vulnerabilities catalog in real time. No mock data.",
  keywords: [
    "CyberShield",
    "threat intelligence",
    "CISA KEV",
    "cybersecurity news",
    "SOC dashboard",
    "zero-day",
    "live feed",
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
        className={`${inter.variable} ${orbitron.variable} ${geistMono.variable} font-sans antialiased bg-cyber-bg text-foreground`}
      >
        {children}
        <Toaster theme="dark" position="bottom-right" closeButton />
      </body>
    </html>
  );
}
