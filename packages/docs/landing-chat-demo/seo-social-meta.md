# SEO & Social Meta (Open Graph)

How the landing page (`apps/web`) renders link previews for LinkedIn, Facebook, WhatsApp, Slack, and X/Twitter.

## Problem

`Layout.astro` previously emitted only a `<title>` and favicon links. Social crawlers (LinkedInBot, facebookexternalhit, Slackbot, etc.) build link previews from **Open Graph** meta tags. With none present — and crucially no `og:image` — pasting `https://www.deliverychat.online` produced a bare, image-less preview.

## Solution

All meta tags live in `apps/web/src/layouts/Layout.astro` so every page inherits them. The layout accepts optional props for per-page overrides:

| Prop          | Default                                          |
| ------------- | ------------------------------------------------ |
| `title`       | `DeliveryChat - Multi-tenant Chat Platform`      |
| `description` | Multi-tenant SaaS chat one-liner                 |
| `path`        | `/` — used for `canonical` and `og:url`          |

Tags emitted: `description`, `canonical`, the full Open Graph set (`og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image` + `secure_url`/`type`/`width`/`height`/`alt`), and the Twitter Card set (`summary_large_image`).

## Why absolute URLs

LinkedIn (and most crawlers) **ignore relative image paths** and only ever fetch production. URLs are built with `getAbsoluteUrl(path)` from `apps/web/src/lib/urls.ts`, which joins the path onto the canonical origin `https://www.deliverychat.online` (constant `SITE_URL_PRODUCTION`). `getSiteUrl()` / `getAbsoluteUrl()` are unit-tested in `urls.test.ts`.

## The OG image

- File: `apps/web/public/og-image.png` — **1200×630** (the 1.91:1 ratio LinkedIn renders full-width), well under the 5 MB limit.
- Built from `public/favicon.png` (the clean, transparent logo). Note: `public/logo.png` has the editor transparency checkerboard baked into its pixels and must **not** be used as a source.

## Refreshing the preview after deploy

Crawlers cache aggressively. After deploying, force a re-scrape:

- LinkedIn — [Post Inspector](https://www.linkedin.com/post-inspector/)
- Facebook/WhatsApp — [Sharing Debugger](https://developers.facebook.com/tools/debug/)
- X/Twitter — Card Validator

## To change the preview image

Replace `apps/web/public/og-image.png` keeping the 1200×630 dimensions (update the `og:image:width/height` tags if you change them), then re-scrape via the inspectors above.
