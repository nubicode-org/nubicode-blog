import { getCollection } from "astro:content";

export const published = async () =>
  (await getCollection("blog", ({ data }) => !data.draft)).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

// ~230 wpm for technical prose; code blocks count as words, which roughly pays for reading them.
export const readingMinutes = (body = "") => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 230));

// pubDate is a UTC-midnight date; formatting in the local zone would show the day before.
export const formatDate = (d, month = "long") => d.toLocaleDateString("en-US", { year: "numeric", month, day: "numeric", timeZone: "UTC" });
