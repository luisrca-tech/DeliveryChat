import { DocsLayout } from "../components/DocsLayout";
import "./globals.css";
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0ea5e9",
};

export const metadata: Metadata = {
  title: "Delivery Chat - Documentation",
  description:
    "Complete documentation for the Delivery Chat embedded support platform",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <DocsLayout>{children}</DocsLayout>
      </body>
    </html>
  );
}
