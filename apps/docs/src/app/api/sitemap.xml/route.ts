import { NextResponse } from "next/server";
import { getPageMap } from "nextra/page-map";
import type { PageMapItem } from "../../../types/pageMap.type.ts";

function buildUrl(baseUrl: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

function flattenPageMap(
  pageMap: PageMapItem[],
  baseUrl: string,
  urls: Array<{
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: string;
  }> = [],
): void {
  for (const item of pageMap) {
    if (item.kind === "Folder") {
      if (item.children) {
        flattenPageMap(item.children, baseUrl, urls);
      }
    } else if (item.kind === "MdxPage" || item.kind === "Meta") {
      const route = item.route || item.name;
      if (route && route !== "/") {
        urls.push({
          loc: buildUrl(baseUrl, route),
          lastmod: new Date().toISOString(),
          changefreq: "weekly",
          priority: route === "/" ? "1.0" : "0.8",
        });
      }
    }
  }
}

export async function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://docs.deliverychat.com");

  const pageMap = (await getPageMap()) as unknown as PageMapItem[];
  const urls: Array<{
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: string;
  }> = [
    {
      loc: baseUrl,
      lastmod: new Date().toISOString(),
      changefreq: "weekly",
      priority: "1.0",
    },
  ];

  flattenPageMap(pageMap, baseUrl, urls);

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new NextResponse(sitemap, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
