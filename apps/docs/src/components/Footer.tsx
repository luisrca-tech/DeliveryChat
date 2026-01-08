import { Footer } from "nextra-theme-docs";

export function DocsFooter() {
  return (
    <Footer>
      <span>
        MIT {new Date().getFullYear()} © Delivery Chat. Built with Nextra.
      </span>
    </Footer>
  );
}
