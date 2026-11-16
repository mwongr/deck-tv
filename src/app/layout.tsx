import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UpdateNotification } from "@/components/ui/UpdateNotification";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0A0A0A",
};

export const metadata: Metadata = {
  title: "Deck TV - IPTV Player",
  description: "A professional-grade, browser-based IPTV player with TiviMate-inspired UI",
  keywords: ["IPTV", "streaming", "TV", "DVR", "HLS", "M3U"],
  authors: [{ name: "Deck TV" }],
  manifest: "/manifest.json",
  icons: {
    icon: "/logo-icon.svg",
    apple: "/logo-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${inter.variable} antialiased`}>
        {children}
        <UpdateNotification />
      </body>
    </html>
  );
}
