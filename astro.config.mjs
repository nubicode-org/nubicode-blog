import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { readdirSync, readFileSync } from "node:fs";

// Sitemap <lastmod> per post from frontmatter (updatedDate, else pubDate); the index uses the newest post.
const lastmod = Object.fromEntries(
  readdirSync("src/content/blog").filter((f) => f.endsWith(".md")).map((f) => {
    const fm = readFileSync(`src/content/blog/${f}`, "utf8").split("---")[1] ?? "";
    const date = (fm.match(/^updatedDate:\s*(\S+)/m) ?? fm.match(/^pubDate:\s*(\S+)/m))?.[1];
    return [`https://blog.nubicode.com/${f.replace(/\.md$/, "")}`, date];
  }),
);
const newest = Object.values(lastmod).filter(Boolean).sort().at(-1);

export default defineConfig({
  site: "https://blog.nubicode.com",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [sitemap({
    filter: (page) => !/\/404\/?$/.test(page),
    serialize: (item) => {
      const url = item.url.replace(/\/$/, "");
      const date = url === "https://blog.nubicode.com" ? newest : lastmod[url];
      return date ? { ...item, lastmod: new Date(date).toISOString() } : item;
    },
  })],
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
