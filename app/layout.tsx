import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Task Dashboard",
  description:
    "Gestión personal de tareas: Telegram, clasificación con IA y panel web.",
  applicationName: "Task Dashboard",
  appleWebApp: {
    capable: true,
    title: "Tareas",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-touch-icon-v2.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F5F2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="font-sans">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
