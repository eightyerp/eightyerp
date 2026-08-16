import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShellRouter from "@/components/dashboard/AppShellRouter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EIGHTY ERP",
  description: "주식회사 에잇티 ERP 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShellRouter>{children}</AppShellRouter>
      </body>
    </html>
  );
}
