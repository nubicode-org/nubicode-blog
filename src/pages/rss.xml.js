import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort((a, b) => b.data.pubDate - a.data.pubDate);
  return rss({
    title: "NubiCode Blog",
    description: "Cloud-native, Kubernetes, GitOps, FinOps and AI infrastructure notes from NubiCode.",
    site: context.site,
    items: posts.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.pubDate, link: `/${p.id}`, categories: p.data.tags, author: p.data.author })),
    customData: "<language>en-us</language>",
  });
}
