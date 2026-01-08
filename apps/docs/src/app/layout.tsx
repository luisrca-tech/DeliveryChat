import { Head } from "nextra/components";
import { DocsLayout } from "../components/DocsLayout";
import "./globals.css";
import type { Metadata } from "next";

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
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0ea5e9" />
      </Head>
      <body>
        <DocsLayout>{children}</DocsLayout>
      </body>
    </html>
  );
}
