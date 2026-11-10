import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Noto_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-archivo" });
const noto = Noto_Sans({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-noto" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Beat Register",
  description: "Beats, bills, collection, delivery and evening checks for the distributor team.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Beat Register", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png", icon: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1B3380",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${noto.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
