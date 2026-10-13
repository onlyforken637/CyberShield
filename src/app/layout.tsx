import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Orbitron } from "next/font/google";
import { ThemeProvider } from "next-themes";
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
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${orbitron.variable} ${geistMono.variable} font-sans antialiased bg-cyber-bg text-foreground`}
      >
        {/* ambient aurora field — dark only; gives the frosted glass real depth */}
        <div aria-hidden="true" className="glass-aurora" />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
          storageKey="cs-theme"
        >
          {children}
          <Toaster position="bottom-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
