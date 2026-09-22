import { getCollection } from "astro:content";

export async function GET() {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort((a, b) => b.data.pubDate - a.data.pubDate);
  const body = posts
    .map((p) => `# ${p.data.title}\n\nURL: https://blog.nubicode.com/${p.id}\nAuthor: ${p.data.author}\nPublished: ${p.data.pubDate.toISOString().slice(0, 10)}\nTags: ${p.data.tags.join(", ")}\n\nTL;DR: ${p.data.tldr}\n\n${p.body}\n`)
    .join("\n\n---\n\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
