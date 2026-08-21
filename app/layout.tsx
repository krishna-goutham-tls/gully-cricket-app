import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { AppGate } from "@/components/shell/AppGate";
import { ServiceWorker } from "@/components/shell/ServiceWorker";

const sans = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gullycricket.space"),
  title: {
    default: "Gully Cricket — Score your match while you play",
    template: "%s — Gully Cricket",
  },
  description:
    "The scorebook for gully cricket. Tap what happened, ball by ball — live scores for whoever's sitting out, full scorecards, leaderboards, records and match stories for your community.",
  keywords: [
    "gully cricket",
    "cricket scoring app",
    "street cricket",
    "cricket scorebook",
    "live cricket score",
    "cricket scorecard",
  ],
  manifest: "/manifest.webmanifest",
  applicationName: "Gully Cricket",
  openGraph: {
    type: "website",
    url: "https://gullycricket.space",
    siteName: "Gully Cricket",
    title: "Gully Cricket — Score your match while you play",
    description:
      "The scorebook for gully cricket. Live scores, scorecards, leaderboards and match stories for your community.",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: "Gully Cricket — Score your match while you play",
    description:
      "The scorebook for gully cricket. Live scores, scorecards, leaderboards and match stories for your community.",
    images: ["/icons/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    // iOS truncates home-screen labels around 12 characters — "Gully
    // Cricket" is 13, so the short label is just "Gully".
    title: "Gully",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#faf8f4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} antialiased`}>
        <ServiceWorker />
        <ConvexClientProvider>
          <AuthProvider>
            <AppGate>
              <div className="phone-shell">{children}</div>
            </AppGate>
          </AuthProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
