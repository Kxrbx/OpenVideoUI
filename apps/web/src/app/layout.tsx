import type { Metadata } from "next";
import { Beau_Rivage } from "next/font/google";
import "./globals.css";

const beauRivage = Beau_Rivage({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-idle-display"
});

export const metadata: Metadata = {
  title: "OpenVideoUI",
  description: "Project-centered studio for OpenRouter image and video generation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={beauRivage.variable}>{children}</body>
    </html>
  );
}
