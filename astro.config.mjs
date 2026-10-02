import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://blog.nubicode.com",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [sitemap()],
  markdown: { shikiConfig: { theme: "github-dark" } },
  // Optimistic navigation: every internal link is fetched on hover, and with clientPrerender
  // Chromium fully prerenders it (Speculation Rules), so the click swaps in a finished page.
  // Other browsers fall back to a plain prefetch.
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  experimental: { clientPrerender: true },
  // The default CSS minifier (Lightning CSS) keeps only one of a prefixed/standard pair and drops the
  // standard backdrop-filter, leaving Chrome and Edge with no glass blur; cssTarget doesn't reach
  // component <style> blocks. esbuild's minifier keeps both.
  vite: { build: { cssMinify: "esbuild", cssTarget: ["chrome111", "edge111", "firefox114", "safari15"] } },
});
