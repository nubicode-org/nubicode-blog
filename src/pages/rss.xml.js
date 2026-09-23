import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort((a, b) => b.data.pubDate - a.data.pubDate);
  return rss({
    title: "NubiCode Blog",
    description: "Cloud-native, Kubernetes, GitOps, FinOps and AI infrastructure notes from NubiCode.",
    site: context.site,
    // Match astro.config's trailingSlash: "never" — @astrojs/rss defaults this to
    // true regardless of the site config, which was emitting item links with a
    // trailing slash (e.g. /mcp-gateway-kubernetes/) inconsistent with the rest
    // of the site.
    trailingSlash: false,
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    items: posts.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.pubDate, link: `/${p.id}`, categories: p.data.tags, author: p.data.author })),
    // <atom:link rel="self"> is required by strict feed consumers (incl. LinkedIn's
    // Page RSS auto-share validator) to confirm the feed is self-describing.
    customData: `<language>en-us</language><atom:link href="${new URL("rss.xml", context.site)}" rel="self" type="application/rss+xml" />`,
  });
}
