import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";
import { MDXComponents } from "nextra/mdx-components";
import { PricingCard, PricingGrid } from "./components/PricingCard";

export function useMDXComponents(
  components: MDXComponents = {}
): MDXComponents {
  const themeComponents = getThemeComponents(components);
  return {
    ...themeComponents,
    PricingCard,
    PricingGrid,
    ...components,
  };
}
