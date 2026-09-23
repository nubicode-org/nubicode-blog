import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { statSync } from "node:fs";

// Feed consumers (LinkedIn, readers, email digests) resolve nothing relative to the post,
// so every src/href in item content must be absolute.
const absolutize = (html, site) => html.replace(/(src|href)="\/(?!\/)/g, `$1="${site}`);

export async function GET(context) {
  const site = new URL("/", context.site).href;
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
    xmlns: { atom: "http://www.w3.org/2005/Atom", media: "http://search.yahoo.com/mrss/" },
    items: posts.map((p) => {
      const cover = p.data.image && new URL(p.data.image, site).href;
      const alt = (p.data.imageAlt ?? p.data.title).replace(/"/g, "&quot;");
      return {
        title: p.data.title,
        description: p.data.description,
        pubDate: p.data.pubDate,
        link: `/${p.id}`,
        categories: p.data.tags,
        author: p.data.author,
        // Full post (with diagrams as absolute PNG URLs) for readers that render content:encoded.
        content: p.rendered?.html
          ? absolutize(`${cover ? `<p><img src="${cover}" alt="${alt}" width="1200" height="627" /></p>` : ""}<p><strong>TL;DR</strong> ${p.data.tldr}</p>${p.rendered.html}`, site)
          : undefined,
        // Cover as enclosure + media:content: the image LinkedIn/feed tools pick for the share card.
        ...(cover && {
          enclosure: { url: cover, type: "image/png", length: statSync(`public${p.data.image}`).size },
          customData: `<media:content url="${cover}" medium="image" type="image/png" width="1200" height="627"><media:description type="plain">${alt}</media:description></media:content>`,
        }),
      };
    }),
    // <atom:link rel="self"> is required by strict feed consumers (incl. LinkedIn's
    // Page RSS auto-share validator) to confirm the feed is self-describing.
    customData: `<language>en-us</language><atom:link href="${new URL("rss.xml", context.site)}" rel="self" type="application/rss+xml" />`,
  });
}
