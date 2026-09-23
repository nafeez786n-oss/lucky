import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LeakGuard — AI-Website Leak Detector",
  description:
    "Detect exposed API keys, hardcoded secrets, AI-tool fingerprints, exposed source maps, .env/.git leaks, and debug endpoints in any AI-generated website.",
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
    title: "LeakGuard — AI-Website Leak Detector",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
