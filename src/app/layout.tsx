import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "LeakGuard — AI Security Scanner",
  description:
    "Premium AI security scanner. Detect exposed API keys, hardcoded secrets, AI-tool fingerprints, exposed source maps, .env/.git leaks, and debug endpoints in any AI-generated website.",
  keywords: [
    "leak detector",
    "API key scanner",
    "secret scanner",
    "AI website security",
    "v0 leak",
    "lovable leak",
    "source map",
    ".env exposed",
  ],
  authors: [{ name: "LeakGuard" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "LeakGuard — AI Security Scanner",
    description: "Bounded, loop-free scanner for API & data leaks in AI-generated websites.",
    url: "https://chat.z.ai",
    siteName: "LeakGuard",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeakGuard",
    description: "Bounded, loop-free scanner for API & data leaks in AI-generated websites.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
        <Toaster />
        <SonnerToaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
