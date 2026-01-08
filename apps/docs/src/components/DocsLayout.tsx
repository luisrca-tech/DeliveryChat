import { Layout } from "nextra-theme-docs";
import { getPageMap } from "nextra/page-map";
import { DocsBanner } from "./Banner";
import { DocsNavbar } from "./Navbar";
import { DocsFooter } from "./Footer";

interface DocsLayoutProps {
  children: React.ReactNode;
}

export async function DocsLayout({ children }: DocsLayoutProps) {
  return (
    <Layout
      banner={<DocsBanner />}
      navbar={<DocsNavbar />}
      pageMap={await getPageMap()}
      docsRepositoryBase="https://github.com/luisrca-tech/DeliveryChat/tree/main/apps/docs"
      footer={<DocsFooter />}
      sidebar={{ defaultMenuCollapseLevel: 1, autoCollapse: true }}
    >
      {children}
    </Layout>
  );
}
