import { CursorProvider } from "@/components/CursorProvider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Figma Clone",
  description: "A canvas-based design tool prototype",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased font-sans`}>
        <CursorProvider>
          <ThemeProvider>
            {children}
            {/* Toast notifications - positioned above floating toolbar */}
            <Toaster
              position="bottom-center"
              expand={true}
              closeButton={false}
              toastOptions={{
                style: {
                  marginBottom: "48px",
                  left: "50%",
                  transform: "translateX(-50%)",
                },
              }}
            />
          </ThemeProvider>
        </CursorProvider>
        {/* Portal root for Radix components — must be positioned + high z so portals render above overlays */}
        <div id="portal-root" className="fixed inset-0 z-[100000] pointer-events-none [&>*]:pointer-events-auto" />
      </body>
    </html>
  );
}
