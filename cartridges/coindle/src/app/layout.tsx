import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { FarcasterProvider } from "@/components/FarcasterProvider";

const sans = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-bricolage",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Coindle — Daily Crypto Guessing Game",
  description:
    "Guess the mystery cryptocurrency. A daily guessing game powered by Pyth price feeds.",
  other: {
    "fc:miniapp": JSON.stringify({
      version: "1",
      imageUrl: "https://coindle.xyz/og-image.png",
      button: {
        title: "Play Coindle",
        action: {
          type: "launch_miniapp",
          name: "Coindle",
          url: "https://coindle.xyz",
          splashBackgroundColor: "#141311",
        },
      },
    }),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className={`${sans.className} min-h-screen antialiased`}>
        <FarcasterProvider>{children}</FarcasterProvider>
      </body>
    </html>
  );
}
