import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string().max(70),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(), // 1200×627 PNG under /public — og:image, LinkedIn preview, RSS enclosure
    imageAlt: z.string().optional(),
    draft: z.boolean().default(false),
    proof: z.array(z.string()).default([]),
    tldr: z.string(),
  }),
});

export const collections = { blog };
