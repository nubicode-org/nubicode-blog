import { getCollection } from "astro:content";

export async function GET() {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort((a, b) => b.data.pubDate - a.data.pubDate);
  const body = `# NubiCode Blog

> Engineering notes from NubiCode, a nearshore cloud-native and AI infrastructure consultancy (San Salvador, El Salvador and Baltimore, MD) serving US companies. AWS Partner, Vanta Partner. Topics: Kubernetes (EKS/AKS/GKE), GitOps with ArgoCD, Terraform, observability (OpenTelemetry, Grafana, Prometheus), FinOps, cloud migrations, MCP gateways and LLM infrastructure.

Main site: https://www.nubicode.com/ (services, team, contact)
Contact: info@nubicode.com

## Posts

${posts.map((p) => `- [${p.data.title}](https://blog.nubicode.com/${p.id}): ${p.data.description}`).join("\n")}

## Optional

- [Full text of all posts](https://blog.nubicode.com/llms-full.txt)
- [RSS](https://blog.nubicode.com/rss.xml)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
