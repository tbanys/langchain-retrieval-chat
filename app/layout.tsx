import "./globals.css";
import type { Metadata } from "next";
import { NextAuthProvider } from "@/components/NextAuthProvider";
import { Navbar } from "@/components/Navbar";
import { ToastContainer } from "react-toastify";
import { Toaster } from "@/components/ui/sonner";
import "react-toastify/dist/ReactToastify.css";

export const metadata: Metadata = {
  title: "AI Chat",
  description: "Interact with advanced AI models and save your conversations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NextAuthProvider>
          <Navbar />
          <div className="flex flex-col min-h-screen pt-24">
            {children}
          </div>
          <ToastContainer position="bottom-right" />
          <Toaster richColors />
        </NextAuthProvider>
      </body>
    </html>
  );
}
