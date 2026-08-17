import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "./components/AuthProvider";
import ThemeProvider from "./components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import AppFooter from "@/components/AppFooter";
import ConditionalFooter from "@/components/ConditionalFooter";
import BugReportButton from "@/components/BugReportButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ULAB Marks Management System",
  description: "Student Marks Management System - University of Liberal Arts Bangladesh",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased transition-colors duration-200`}
      >
        <AuthProvider>
          <ThemeProvider>
            <div className="flex min-h-screen flex-col">
              <div className="flex-1">{children}</div>
              <ConditionalFooter>
                <AppFooter />
              </ConditionalFooter>
            </div>
            <Toaster richColors position="top-right" />
            <BugReportButton />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
