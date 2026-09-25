import type { Metadata, Viewport } from "next";
import { Inter, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LangSync from "@/components/LangSync";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { AccessGate } from "@/components/billing/access-gate";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


// Pinch-zoom stays enabled (accessibility); the old maximumScale:1 is gone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0c0b",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Pages set a short title ("Write"); the tab shows "Write · Companheiro".
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // The preview image comes from app/opengraph-image.tsx (Next wires it in).
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: "You already have a vision.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "You already have a vision.",
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Companheiro",
  },
  formatDetection: {
    telephone: false,
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
      className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <LangSync />
        <ThemeProvider>
          <ConfirmProvider>
            {children}
            <AccessGate />
          </ConfirmProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
