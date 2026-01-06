import { notFound } from "next/navigation";
import { importPage, generateStaticParamsFor } from "nextra/pages";
import { EXCLUDED_PATHS } from "@/src/constants/excludedPaths";
import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";

export const generateStaticParams = generateStaticParamsFor("slug");

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;

  if (slug.length > 0 && slug[0]) {
    const firstSegment = slug[0];
    if (
      EXCLUDED_PATHS.includes(firstSegment) ||
      firstSegment.startsWith(".") ||
      firstSegment.startsWith("_")
    ) {
      notFound();
    }
  }

  try {
    const {
      default: MDXContent,
      toc,
      metadata,
      sourceCode,
    } = await importPage(slug);

    const themeComponents = getThemeComponents({});
    const Wrapper = themeComponents.wrapper;

    return (
      <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
        <MDXContent />
      </Wrapper>
    );
  } catch {
    notFound();
  }
}
