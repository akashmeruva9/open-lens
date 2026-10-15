import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { SwRegister } from "@/components/pwa/sw-register";
import { themeInitScript } from "@/components/ui/theme-toggle";
import "./globals.css";

const display = Inter_Tight({ subsets: ["latin", "latin-ext", "vietnamese"], weight: ["600", "700", "800"], variable: "--font-display-face", display: "swap" });
const sans = Inter({ subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-sans-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OpenLens — news you can inspect", template: "%s · OpenLens" },
  description:
    "Video-first, evidence-first news for Asia-Pacific. Every story is built from a reviewed claim & evidence ledger: watch the brief, swipe perspectives, open the research.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "OpenLens", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#080808" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-bg"
        >
          Skip to content
        </a>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
