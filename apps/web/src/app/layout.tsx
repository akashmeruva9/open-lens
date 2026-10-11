import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { SwRegister } from "@/components/pwa/sw-register";
import { themeInitScript } from "@/components/ui/theme-toggle";
import "./globals.css";

const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif-face", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OpenLens — news you can inspect", template: "%s · OpenLens" },
  description:
    "AI-native newsroom: every story is built from a reviewed claim & evidence ledger. Swipe perspectives, open the research, see corrections.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "OpenLens", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1014" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-bg"
        >
          Skip to content
        </a>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
