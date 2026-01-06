import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";
import { MDXComponents } from "nextra/mdx-components";
import { PricingCard, PricingGrid } from "./components/PricingCard";
import { Callout } from "./components/Callout";
import { CodeBlock } from "./components/CodeBlock";
import { QuickLinks } from "./components/QuickLinks";
import { StepByStep } from "./components/StepByStep";
import { Comparison } from "./components/Comparison";
import { ExampleCard } from "./components/ExampleCard";
import { FeatureList } from "./components/FeatureList";
import { FAQ } from "./components/FAQ";
import { ComingSoon } from "./components/ComingSoon";
import { ComparisonTable } from "./components/ComparisonTable";

export function useMDXComponents(
  components: MDXComponents = {}
): MDXComponents {
  const themeComponents = getThemeComponents(components);
  return {
    ...themeComponents,
    PricingCard,
    PricingGrid,
    Callout,
    CodeBlock,
    QuickLinks,
    StepByStep,
    Comparison,
    ExampleCard,
    FeatureList,
    FAQ,
    ComingSoon,
    ComparisonTable,
    ...components,
  };
}
