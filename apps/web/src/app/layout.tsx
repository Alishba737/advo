import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { RoleProvider } from "@/components/providers/role-provider";
import { AppSidebar } from "@/components/advo/app-sidebar";

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
  title: "ADVO — AI Legal Assistant for Pakistan",
  description:
    "Ask legal questions about Pakistani law in plain language, with citations to the exact statutes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full overflow-hidden">
        <RoleProvider>
          <Suspense fallback={<aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar" />}>
            <AppSidebar />
          </Suspense>
          <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
        </RoleProvider>
      </body>
    </html>
  );
}
