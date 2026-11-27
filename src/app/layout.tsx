import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/layout/motion-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClarifyAI — Ambiguity Identification & Resolution",
  description:
    "Ambiguity-aware AI assistant that detects unclear intent, highlights ambiguous spans, asks one targeted question, and resolves safely.",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-[#070a11] font-sans text-slate-100 antialiased ms-canvas-bg selection:bg-sky-500/30 selection:text-sky-100">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
