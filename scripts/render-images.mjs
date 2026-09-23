#!/usr/bin/env node
// Renders every post's LinkedIn/OG cover (1200×627) and in-article diagram (PNG, 2x)
// into public/images/<slug>/. Hand-drawn vector diagrams in DESIGN.md tokens — no generated imagery.
// PNG, not SVG: LinkedIn, RSS readers and email clients don't render SVG.
//
// Usage: node scripts/render-images.mjs [slug ...]   (needs Google Chrome + network for Inter)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(root, "node_modules", ".cache", "render-images");
mkdirSync(tmp, { recursive: true });
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LOGO = `file://${join(root, "public/logos/NubiCode responsive-03.png")}`;

// DESIGN.md tokens
const T = {
  bg: "#F0F2F7", ink: "#1A1A2E", ink2: "#3A3A5E", ink3: "#9CA3AF",
  accent: "#4768F2", accent2: "#6B8EFF", accent3: "#7B5CF5",
  accentLight: "rgba(71,104,242,.12)", surface2: "#E8ECF8", line: "#D5D9E8",
};

const head = `<meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=block" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}html,body{background:${T.bg};font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:${T.ink};overflow:hidden}
svg text{font-family:Inter,-apple-system,sans-serif}</style>`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- diagram primitives (SVG) ----------
function node(x, y, w, h, title, sub = [], v = "default") {
  const styles = {
    default: { fill: "rgba(255,255,255,.78)", stroke: T.line, dash: "", t: T.ink, s: T.ink2 },
    accent: { fill: "#E4E9FD", stroke: T.accent, dash: "", t: T.accent, s: T.ink2 },
    code: { fill: T.ink, stroke: T.ink, dash: "", t: "#FFFFFF", s: "#C9CEE3" },
    muted: { fill: "rgba(255,255,255,.35)", stroke: T.ink3, dash: "6 5", t: T.ink2, s: T.ink3 },
  }[v];
  const lines = Array.isArray(sub) ? sub : [sub];
  const lh = 18, total = 22 + lines.length * lh;
  let ty = y + h / 2 - total / 2 + 16;
  const mono = v === "code" ? ` font-family="ui-monospace,SFMono-Regular,Menlo,monospace"` : "";
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${styles.fill}" stroke="${styles.stroke}" stroke-width="${v === "accent" ? 2 : 1.25}" ${styles.dash ? `stroke-dasharray="${styles.dash}"` : ""} filter="${v === "muted" ? "" : "url(#sh)"}"/>`;
  out += `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="17" font-weight="700" fill="${styles.t}"${mono}>${esc(title)}</text>`;
  lines.forEach((l, i) => (out += `<text x="${x + w / 2}" y="${ty + 22 + i * lh}" text-anchor="middle" font-size="13.5" fill="${styles.s}"${mono}>${esc(l)}</text>`));
  return out;
}
function group(x, y, w, h, label, dashed = true) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="rgba(255,255,255,.28)" stroke="${T.accent2}" stroke-opacity=".55" stroke-width="1.25" ${dashed ? 'stroke-dasharray="7 6"' : ""}/>
  <text x="${x + 18}" y="${y + 24}" font-size="11.5" font-weight="700" letter-spacing=".08em" fill="${T.accent}">${esc(label.toUpperCase())}</text>`;
}
function tag(cx, cy, text, color = T.accent) {
  const w = text.length * 6.9 + 22;
  return `<rect x="${cx - w / 2}" y="${cy - 12}" width="${w}" height="24" rx="12" fill="${T.bg}" stroke="${color === T.accent ? "rgba(71,104,242,.35)" : T.line}"/>
  <text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-size="12" font-weight="600" fill="${color}">${esc(text)}</text>`;
}
function arrow(pts, { label, at = 0.5, dashed = false, color = T.accent, blocked = false, lx, ly } = {}) {
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  let out = `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${dashed ? 'stroke-dasharray="6 5"' : ""} stroke-linejoin="round" marker-end="url(#${blocked ? "none" : color === T.accent ? "ah" : "ahm"})"/>`;
  if (blocked) {
    const [ex, ey] = pts[pts.length - 1];
    out += `<g stroke="${T.ink2}" stroke-width="3" stroke-linecap="round"><path d="M${ex - 8} ${ey - 8}L${ex + 8} ${ey + 8}M${ex + 8} ${ey - 8}L${ex - 8} ${ey + 8}"/></g>`;
  }
  if (label) {
    // label at fraction `at` along the longest segment unless lx/ly given
    let [a, b] = [pts[0], pts[1]];
    for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > Math.hypot(b[0] - a[0], b[1] - a[1])) [a, b] = [pts[i - 1], pts[i]];
    const cx = lx ?? a[0] + (b[0] - a[0]) * at, cy = ly ?? a[1] + (b[1] - a[1]) * at;
    out += tag(cx, cy, label, blocked ? T.ink2 : T.accent);
  }
  return out;
}
function text(x, y, s, { size = 14, weight = 400, fill = T.ink2, anchor = "start", ls = 0 } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}em">${esc(s)}</text>`;
}
function pill(x, y, w, n, label, sub) {
  return `<rect x="${x}" y="${y}" width="${w}" height="52" rx="26" fill="rgba(255,255,255,.78)" stroke="${T.line}" filter="url(#sh)"/>
  <circle cx="${x + 28}" cy="${y + 26}" r="15" fill="${T.accent}"/><text x="${x + 28}" y="${y + 31}" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">${n}</text>
  <text x="${x + 52}" y="${y + 23}" font-size="15" font-weight="700" fill="${T.ink}">${esc(label)}</text>
  <text x="${x + 52}" y="${y + 41}" font-size="12.5" fill="${T.ink2}">${esc(sub)}</text>`;
}

function diagramPage(W, H, eyebrow, title, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${T.accent}"/></marker>
    <marker id="ahm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${T.ink3}"/></marker>
    <filter id="sh" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="${T.accent}" flood-opacity=".09"/></filter>
    <radialGradient id="g1" cx="12%" cy="0%" r="60%"><stop offset="0" stop-color="${T.accent}" stop-opacity=".13"/><stop offset="1" stop-color="${T.accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="95%" cy="100%" r="55%"><stop offset="0" stop-color="${T.accent2}" stop-opacity=".12"/><stop offset="1" stop-color="${T.accent2}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${T.bg}"/><rect width="${W}" height="${H}" fill="url(#g1)"/><rect width="${W}" height="${H}" fill="url(#g2)"/>
  ${text(60, 60, eyebrow.toUpperCase(), { size: 13, weight: 700, fill: T.accent, ls: 0.08 })}
  ${text(60, 96, title, { size: 28, weight: 800, fill: T.ink, ls: -0.02 })}
  ${body}
  <image href="${LOGO}" x="60" y="${H - 58}" height="26" width="129"/>
  ${text(W - 60, H - 38, "blog.nubicode.com", { size: 13, weight: 600, fill: T.ink3, anchor: "end" })}
</svg>`;
  return `<!doctype html><html><head>${head}</head><body>${svg}</body></html>`;
}

function coverPage({ label, title, accent, sub }) {
  return `<!doctype html><html><head>${head}<style>
  body{width:1200px;height:627px;position:relative;
    background:radial-gradient(700px 480px at 8% 0%,rgba(71,104,242,.20),transparent 62%),
      radial-gradient(640px 460px at 100% 100%,rgba(107,142,255,.20),transparent 60%),
      radial-gradient(420px 320px at 88% 6%,rgba(123,92,245,.10),transparent 60%),${T.bg}}
  .panel{position:absolute;inset:32px;border-radius:24px;background:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.5);
    box-shadow:0 8px 32px rgba(71,104,242,.08),0 2px 8px rgba(0,0,0,.04),inset 0 1px 0 rgba(255,255,255,.7),inset 0 -1px 0 rgba(255,255,255,.1);
    padding:48px 56px 44px;display:flex;flex-direction:column;overflow:hidden}
  .panel::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(135deg,rgba(255,255,255,.4) 0%,transparent 50%,rgba(255,255,255,.1) 100%)}
  .panel>*{position:relative;z-index:1}
  .label{align-self:flex-start;font-size:15px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.accent};background:${T.accentLight};border-radius:50px;padding:7px 18px}
  h1{margin-top:28px;font-size:${title.length > 60 ? 60 : 66}px;line-height:1.1;font-weight:900;letter-spacing:-.02em;color:${T.ink};max-width:1000px}
  .accent{margin-top:28px;font-size:32px;font-weight:800;letter-spacing:-.02em;color:${T.accent};display:flex;align-items:center;gap:16px}
  .accent::before{content:"";width:48px;height:5px;border-radius:5px;background:linear-gradient(135deg,${T.accent},${T.accent2})}
  .foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end}
  .foot img{height:44px;display:block}.foot span{font-size:17px;font-weight:600;color:${T.ink2}}
  </style></head><body><div class="panel">
  <div class="label">${esc(label)}</div><h1>${esc(title)}</h1><div class="accent">${esc(accent)}</div>
  <div class="foot"><img src="${LOGO}" alt=""><span>${esc(sub)}</span></div></div></body></html>`;
}

// ---------- per-post content ----------
const posts = {
  "opentelemetry-collector-azure-monitor-google-cloud": {
    cover: { label: "Observability", title: "One OpenTelemetry Collector, two clouds: Azure Monitor + Google Cloud", accent: "Instrument once. Export to both.", sub: "blog.nubicode.com" },
    diagram: [1200, 720, "One OpenTelemetry Collector, two clouds", "Instrument once with OTLP; one gateway fans out to both clouds",
      [
        group(60, 140, 340, 400, "Every node (DaemonSet)"),
        node(85, 180, 137, 84, "app pod", ["OTel SDK", "OTLP :4317"]),
        node(238, 180, 137, 84, "app pod", ["auto-instr.", "OTLP :4317"]),
        node(85, 330, 290, 150, "OTel agent", ["kubeletstats · filelog", "k8sattributes", "resourcedetection (gcp, azure)", "no credentials, no cloud export"], "accent"),
        arrow([[153, 264], [153, 330]]),
        arrow([[306, 264], [306, 330]]),
        node(460, 200, 300, 250, "", [], "accent"),
        text(610, 228, "OTel gateway", { size: 17, weight: 700, fill: T.accent, anchor: "middle" }),
        text(610, 246, "Deployment · 2+ replicas", { size: 13.5, anchor: "middle" }),
        pill(478, 266, 264, 1, "memory_limiter", "refuse load, don't OOM"),
        pill(478, 326, 264, 2, "filter/noise", "drop healthz + debug once"),
        pill(478, 386, 264, 3, "batch", "same batches to both"),
        arrow([[375, 405], [418, 405], [418, 325], [460, 325]]),
        text(230, 575, "agents forward OTLP gRPC to the gateway", { size: 13, weight: 600, fill: T.ink2, anchor: "middle" }),
        node(830, 170, 310, 100, "Azure Monitor", ["azuremonitor exporter · own queue", "conn. string: Key Vault → Secret"]),
        node(830, 380, 310, 100, "Google Cloud", ["googlecloud exporter · own queue", "Workload Identity, no JSON key"]),
        arrow([[760, 280], [795, 280], [795, 220], [830, 220]]),
        arrow([[760, 380], [795, 380], [795, 430], [830, 430]]),
        text(985, 318, "separate queues:", { size: 13, weight: 600, fill: T.ink, anchor: "middle" }),
        text(985, 338, "a slow backend can't stall the other", { size: 13, fill: T.ink2, anchor: "middle" }),
        node(460, 530, 300, 76, "Collector self-metrics", "send_failed · queue size · refused"),
        arrow([[610, 450], [610, 530]], { color: T.ink3 }),
        node(830, 530, 310, 76, "Alerts per exporter", "which cloud is struggling", "muted"),
        arrow([[760, 568], [830, 568]], { color: T.ink3 }),
      ].join("")],
    alt: "Architecture diagram: on every Kubernetes node, application pods send OTLP to a node-local OpenTelemetry Collector agent (DaemonSet) that adds kubelet stats, container logs and Kubernetes and cloud metadata but holds no credentials. Agents forward over OTLP gRPC to a gateway Deployment that applies memory_limiter, filters health checks and debug logs once, batches, and fans out through two exporters with separate queues: azuremonitor to Application Insights, authenticated with a connection string from Key Vault, and googlecloud to Cloud Monitoring, Trace and Logging via Workload Identity. The Collector's own export-failure, queue and refusal metrics drive per-exporter alerts.",
    caption: "Agents collect and enrich; the gateway filters once and fans out to both clouds through independent queues.",
  },
  "mcp-gateway-kubernetes": {
    cover: { label: "AI infrastructure", title: "Running an MCP gateway on Kubernetes for AI agents", accent: "One front door. Every tool call authorized + audited.", sub: "blog.nubicode.com" },
    diagram: [1200, 720, "MCP gateway on Kubernetes", "Agents talk to one gateway; MCP servers are reachable only through it",
      [
        text(60, 150, "AI AGENTS", { size: 11.5, weight: 700, fill: T.accent, ls: 0.08 }),
        node(60, 170, 200, 64, "Support agent", "read-only role"),
        node(60, 262, 200, 64, "Release agent", "github.* minus delete_*"),
        node(60, 354, 200, 64, "IDE / chat app", "short-lived IdP token"),
        group(300, 130, 840, 510, "Kubernetes cluster"),
        node(330, 262, 150, 64, "Ingress", "HTTPS · OAuth 2.1"),
        arrow([[260, 202], [295, 202], [295, 294], [330, 294]]),
        arrow([[260, 294], [330, 294]]),
        arrow([[260, 386], [295, 386], [295, 294], [330, 294]]),
        node(530, 170, 260, 250, "", [], "accent"),
        text(660, 198, "mcp-gateway", { size: 17, weight: 700, fill: T.accent, anchor: "middle" }),
        text(660, 216, "Deployment · 2+ replicas", { size: 13.5, anchor: "middle" }),
        pill(548, 236, 224, 1, "Aggregate", "one namespaced catalog"),
        pill(548, 294, 224, 2, "Authorize", "per tool, every call"),
        pill(548, 352, 224, 3, "Audit", "one event per tools/call"),
        arrow([[480, 294], [530, 294]], { label: "sticky session", lx: 405, ly: 240 }),
        group(840, 150, 280, 330, "NetworkPolicy: gateway only"),
        node(865, 188, 230, 72, "mcp-jira", "ClusterIP · egress → Jira"),
        node(865, 288, 230, 72, "mcp-github", "ClusterIP · egress → GitHub"),
        node(865, 388, 230, 72, "mcp-postgres", "ClusterIP · read-only DB user"),
        arrow([[790, 250], [825, 250], [825, 224], [865, 224]]),
        arrow([[790, 324], [865, 324]]),
        arrow([[790, 390], [825, 390], [825, 424], [865, 424]]),
        node(530, 530, 260, 76, "Audit log + OTel spans", "agent · tool · decision · latency"),
        arrow([[660, 420], [660, 530]], { label: "no raw args by default" }),
        node(865, 530, 230, 76, "External Secrets", "downstream creds, per server"),
        arrow([[980, 530], [980, 460]], { color: T.ink3 }),
      ].join("")],
    alt: "Architecture diagram: AI agents connect over HTTPS to a Kubernetes Ingress, then to an mcp-gateway Deployment that aggregates the tool catalog, authorizes every tool call and audits it. Behind it, mcp-jira, mcp-github and mcp-postgres run as ClusterIP services fenced by a NetworkPolicy that only admits the gateway. Downstream credentials come from External Secrets; every call is written to an audit log with OpenTelemetry spans.",
    caption: "One ingress, one gateway, ClusterIP-only MCP servers behind a NetworkPolicy.",
  },

  "gitops-argocd-zero-drift": {
    cover: { label: "GitOps · ArgoCD", title: "GitOps with ArgoCD: zero config drift across multi-cloud Kubernetes", accent: "0 drift incidents in 9 months", sub: "blog.nubicode.com" },
    diagram: [1200, 720, "GitOps with ArgoCD", "Two repos, versioned charts, and no path to prod except Git",
      [
        node(60, 150, 240, 76, "platform-charts", "Helm charts · semver git tags"),
        node(360, 150, 230, 76, "GitHub Actions", "helm lint · package · push"),
        node(650, 150, 230, 76, "OCI registry", ["ghcr.io · versioned charts", "appVersion = Git SHA"]),
        arrow([[300, 188], [360, 188]]),
        arrow([[590, 188], [650, 188]]),
        node(60, 330, 240, 90, "platform-envs", ["Application manifests", "values.yaml per env"]),
        node(650, 330, 230, 90, "ArgoCD", ["per cluster · app-of-apps", "selfHeal · prune · SSA"], "accent"),
        arrow([[765, 226], [765, 330]], { label: "pull chart 1.4.2" }),
        arrow([[300, 375], [650, 375]], { label: "watch envs/<cluster>/" }),
        group(930, 150, 210, 380, "Clusters"),
        node(950, 190, 170, 70, "prod-aws", "EKS"),
        node(950, 300, 170, 70, "prod-gcp", "GKE"),
        node(950, 410, 170, 70, "staging", "same bootstrap"),
        arrow([[880, 360], [915, 360], [915, 225], [950, 225]]),
        arrow([[880, 375], [950, 335]]),
        arrow([[880, 390], [915, 390], [915, 445], [950, 445]]),
        text(1035, 512, "reconciled within seconds", { size: 12.5, weight: 600, fill: T.ink2, anchor: "middle" }),
        node(60, 545, 240, 76, "Engineer", "kubectl apply in prod", "muted"),
        arrow([[300, 583], [560, 583]], { label: "no write access", blocked: true, color: T.ink3 }),
        node(650, 545, 490, 76, "OTel Collector → Azure Monitor + Cloud Monitoring", "argocd_app_info · alert: any app OutOfSync > 10 min"),
        arrow([[765, 420], [765, 545]], { label: "metrics", color: T.ink3 }),
      ].join("")],
    alt: "GitOps flow diagram: the platform-charts repo is published by GitHub Actions to an OCI registry as semver Helm charts. ArgoCD in each cluster pulls the pinned chart version and watches its folder in the platform-envs repo, then reconciles the prod-aws, prod-gcp and staging clusters with selfHeal and prune. Human kubectl apply to production is blocked; an OpenTelemetry Collector ships ArgoCD sync metrics and alerts on any app out of sync for more than 10 minutes.",
    caption: "Charts are versioned artifacts; envs hold only Applications and values. ArgoCD is the only writer.",
    replaceAscii: true,
  },

  "immutable-image-tags-git-sha": {
    cover: { label: "Containers · Supply chain", title: "Stop deploying :latest — immutable image tags with Git SHAs", accent: "1 commit = 1 tag, forever", sub: "blog.nubicode.com" },
    diagram: [1200, 700, "Immutable image tags", "Build once, tag with the SHA, promote the same image, roll back with git revert",
      [
        node(60, 150, 210, 84, "git commit", "3f9c2e1a7b…", "code"),
        node(330, 150, 240, 84, "GitHub Actions", ["OIDC role · build once", "tag = github.sha"]),
        node(630, 150, 250, 84, "Amazon ECR", ["api:3f9c2e1a7b…", "IMMUTABLE · scan on push"], "accent"),
        node(950, 150, 190, 84, "Re-push same tag", "hand-edited CI re-run", "muted"),
        arrow([[270, 192], [330, 192]]),
        arrow([[570, 192], [630, 192]]),
        arrow([[950, 192], [890, 192]], { blocked: true, color: T.ink3 }),
        text(1045, 262, "rejected: tag exists", { size: 12.5, weight: 600, fill: T.ink2, anchor: "middle" }),
        group(40, 320, 1120, 160, "GitOps repo · promotion is a PR, not a rebuild"),
        node(60, 360, 250, 90, "envs/staging/values.yaml", "tag: 3f9c2e1a7b…", "code"),
        node(400, 360, 250, 90, "envs/prod/values.yaml", "tag: 3f9c2e1a7b…", "code"),
        arrow([[310, 405], [400, 405]], { label: "same tag", ly: 380 }),
        node(740, 360, 170, 90, "ArgoCD", ["syncs each env", "from its folder"], "accent"),
        node(970, 360, 170, 90, "prod pods", ["byte-for-byte", "what staging ran"]),
        arrow([[650, 405], [740, 405]]),
        arrow([[910, 405], [970, 405]]),
        arrow([[755, 234], [755, 290], [825, 290], [825, 360]], { label: "pull by SHA", lx: 790, ly: 290 }),
        node(400, 540, 250, 76, "git revert <promotion>", "rollback: no rebuild, no re-tag", "code"),
        arrow([[525, 540], [525, 450]], { label: "values point back", ly: 505 }),
        node(740, 540, 400, 76, "Admission policy (next step)", "Kyverno / Gatekeeper: reject :latest, require SHA or digest", "muted"),
      ].join("")],
    alt: "Pipeline diagram: a git commit is built once by GitHub Actions using an OIDC role and pushed to Amazon ECR tagged with the commit SHA; ECR tag immutability rejects any re-push to the same tag. Promotion copies the same SHA tag from envs/staging/values.yaml to envs/prod/values.yaml in the GitOps repo, ArgoCD syncs each environment and pulls the image by SHA, and rollback is a git revert of the promotion commit.",
    caption: "The tag is the provenance. Promotion and rollback are Git commits.",
  },

  "finops-audit-737-hosts": {
    cover: { label: "FinOps", title: "FinOps audit of 737 hosts: the script, the buckets, the savings", accent: "737 hosts · 3 clouds · 4 buckets", sub: "blog.nubicode.com" },
    diagram: [1200, 740, "FinOps audit, step by step", "Inventory by script, bucket by evidence, price the buckets, commit last",
      [
        node(60, 170, 196, 110, "1 · Inventory", ["one CSV, one row/host", "737 hosts · ~20 min"], "accent"),
        node(281, 170, 196, 110, "2 · Bucket", ["4 verdicts by rule", "humans review 'ask'"]),
        node(502, 170, 196, 110, "3 · Price", ["billing export", "joined on resource ID"]),
        node(723, 170, 196, 110, "4 · Commit last", ["Savings Plans / CUDs", "on surviving fleet"]),
        node(944, 170, 196, 110, "5 · Cron + diff", ["monthly re-run", "diff → Slack"], "accent"),
        arrow([[256, 225], [281, 225]]), arrow([[477, 225], [502, 225]]), arrow([[698, 225], [723, 225]]), arrow([[919, 225], [944, 225]]),
        arrow([[1042, 170], [1042, 138], [158, 138], [158, 170]], { label: "monthly: new untagged hosts, p95 drops, orphaned volumes", dashed: true }),
        group(60, 320, 520, 330, "Bucket rules (step 2)", false),
        ...[["decommission", "no owner · no deploy in 90 d · no LB / traffic"], ["rightsize", "cpu p95 < 20% · mem p95 < 40% · not K8s"], ["ask", "owner empty, metrics unknown, or contradictory"], ["keep", "everything else, this pass"]].flatMap(([k, r], i) => [
          `<rect x="84" y="${362 + i * 66}" width="136" height="44" rx="22" fill="${i === 2 ? T.accent : T.accentLight}"/>`,
          text(152, 389 + i * 66, k, { size: 15, weight: 700, fill: i === 2 ? "#fff" : T.accent, anchor: "middle" }),
          text(236, 389 + i * 66, r, { size: 14, fill: T.ink2 }),
        ]),
        text(84, 632, "'ask': ~⅓ of the fleet on day one → under 5% two weeks later", { size: 13, weight: 600, fill: T.ink }),
        group(620, 320, 520, 330, "Where the savings came from", false),
        ...[["Decommission", "no owner, no traffic — largest"], ["Rightsizing", "smallest type ≥ 1.5 × p95"], ["Orphans", "volumes, snapshots, NAT, idle LBs, IPs"], ["Commitments", "last, on the post-cleanup baseline"]].map(([k, r], i) => pill(644, 356 + i * 66, 472, i + 1, k, r)),
        text(644, 632, "Cleanup beats commitments. Commit after the fleet stabilizes.", { size: 13, weight: 600, fill: T.ink }),
      ].join("")],
    alt: "Process diagram of a five-step FinOps audit: 1 inventory 737 hosts across three clouds into one CSV by script in about 20 minutes, 2 bucket each host as decommission, rightsize, ask or keep by rule, 3 price the buckets from the billing export, 4 buy commitments last on the surviving fleet, 5 re-run monthly and post the diff to Slack. Savings ranked: decommission largest, then rightsizing, orphaned resources, and commitments last.",
    caption: "The order is the point: cleanup first, commitments last, and the job keeps running.",
  },

  "zero-downtime-datacenter-to-aws-migration": {
    cover: { label: "AWS migration", title: "Zero-downtime datacenter to AWS: golden AMIs, DMS, Direct Connect", accent: "~40 instances moved · 0 downtime", sub: "blog.nubicode.com" },
    diagram: [1200, 780, "Datacenter → AWS, zero downtime", "Compute first, data second, cutover third, decompose fourth",
      [
        node(440, 132, 320, 70, "Route 53 weighted records", "TTL 60 s · DC 100 → 0 · AWS 0 → 100", "accent"),
        group(60, 240, 330, 350, "Datacenter · Ireland"),
        node(85, 285, 280, 80, "Web fleet", ["~40 hand-built Windows", ".NET monolith · IIS"]),
        node(85, 400, 280, 80, "SQL Server", "transactional + reporting load"),
        text(225, 540, "read-only for 48 h after cutover", { size: 13, weight: 600, fill: T.ink2, anchor: "middle" }),
        text(225, 560, "(rollback path, unused)", { size: 12.5, fill: T.ink3, anchor: "middle" }),
        group(620, 240, 520, 350, "AWS Organizations · multi-account"),
        node(645, 285, 220, 80, "Golden AMIs", ["Packer · tagged GitSha", "built on every merge"]),
        node(895, 285, 220, 80, "Auto Scaling Groups", ["behind ALB", "instance refresh deploys"]),
        node(645, 400, 220, 80, "AWS DMS", ["full load + CDC", "nightly row + checksum"]),
        node(895, 400, 220, 80, "RDS SQL Server", "production account"),
        node(895, 505, 220, 70, "Amazon Redshift", "analytics account"),
        arrow([[865, 325], [895, 325]]),
        arrow([[865, 440], [895, 440]]),
        arrow([[1005, 480], [1005, 505]]),
        arrow([[365, 440], [645, 440]], { label: "Direct Connect · private" }),
        arrow([[520, 202], [520, 222], [310, 222], [310, 285]], { color: T.ink3, label: "100 → 0", lx: 415, ly: 222 }),
        arrow([[680, 202], [680, 222], [1005, 222], [1005, 285]], { label: "0 → 100", lx: 860, ly: 222 }),
        pill(60, 630, 250, 1, "Compute", "golden AMIs, disposable fleet"),
        pill(338, 630, 250, 2, "Data", "DMS + CDC over Direct Connect"),
        pill(616, 630, 250, 3, "Cutover", "freeze, zero lag, flip weights"),
        pill(894, 630, 246, 4, "Decompose", "services onto EKS, after"),
        arrow([[310, 656], [338, 656]]), arrow([[588, 656], [616, 656]]), arrow([[866, 656], [894, 656]]),
      ].join("")],
    alt: "Migration architecture diagram: Route 53 weighted records with a 60-second TTL shift traffic from an Ireland datacenter (about 40 hand-built Windows .NET instances and SQL Server) to an AWS multi-account setup. Packer golden AMIs feed Auto Scaling Groups behind an ALB; AWS DMS replicates SQL Server over Direct Connect with full load plus CDC into RDS SQL Server, which feeds Amazon Redshift in the analytics account. Phases: compute, data, cutover, then decompose onto EKS.",
    caption: "Weighted DNS moved users; DMS over Direct Connect kept the data in sync until the flip.",
  },
};

// ---------- render ----------
function shot(html, out, w, h, scale) {
  const file = join(tmp, out.replace(/[\/]/g, "_") + ".html");
  writeFileSync(file, html);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    `--force-device-scale-factor=${scale}`, `--window-size=${w},${h}`, "--virtual-time-budget=8000",
    `--screenshot=${join(root, out)}`, `file://${file}`], { stdio: "ignore" });
  if (!existsSync(join(root, out))) throw new Error(`render failed: ${out}`);
  console.log("✓", out);
}

export { posts };
const only = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [slug, p] of Object.entries(posts)) {
    if (only.length && !only.includes(slug)) continue;
    mkdirSync(join(root, "public/images", slug), { recursive: true });
    shot(coverPage(p.cover), `public/images/${slug}/cover.png`, 1200, 627, 1);
    const [W, H, eyebrow, title, body] = p.diagram;
    shot(diagramPage(W, H, eyebrow, title, body), `public/images/${slug}/diagram.png`, W, H, 2);
  }
}
