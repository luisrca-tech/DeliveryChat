import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
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

const banner = (
  <Banner storageKey="delivery-chat-docs-banner">
    🎉 Welcome to Delivery Chat Documentation
  </Banner>
);

const navbar = (
  <Navbar
    logo={
      <span className="font-bold text-lg bg-linear-to-r from-primary to-primary-glow bg-clip-text text-transparent">
        Delivery Chat
      </span>
    }
  />
);

const footer = (
  <Footer>
    MIT {new Date().getFullYear()} © Delivery Chat. Built with Nextra.
  </Footer>
);

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
        <Layout
          banner={banner}
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/luisrca-tech/DeliveryChat/tree/main/apps/docs"
          footer={footer}
          sidebar={{ autoCollapse: true }}
        >
          <div
            className="nextra-content-wrapper"
            style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
          >
            {children}
          </div>
        </Layout>
      </body>
    </html>
  );
}
