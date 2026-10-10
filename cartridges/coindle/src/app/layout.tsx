import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FarcasterProvider } from "@/components/FarcasterProvider";

export const metadata: Metadata = {
  title: "Coindle — Daily Crypto Guessing Game",
  description:
    "Guess the mystery cryptocurrency! A daily guessing game powered by Pyth price feeds.",
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
          splashBackgroundColor: "#1A1F2B",
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
    <html lang="en">
      <body className="min-h-screen antialiased">
        <FarcasterProvider>{children}</FarcasterProvider>
      </body>
    </html>
  );
}
