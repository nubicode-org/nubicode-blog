---
title: "How to protect yourself from today's security risks, in 9 steps"
description: "Supply chain attacks, prompt injection, deepfake scams and stolen credentials: nine practical steps for developers and everyday users, plus free training."
pubDate: 2026-11-22
tags: [security, ai-agents, supply-chain, devsecops]
proof: []
image: /images/protect-yourself-developer-user-security-risks/cover.png
imageAlt: "How to protect yourself from today's security risks, in 9 steps — Most attacks start with a stolen login, not a clever exploit."
tldr: "The risks in the news fall into four groups: poisoned software packages, prompt injection against AI tools, AI-voiced and AI-written scams, and stolen credentials. The defenses are mostly unglamorous. Use passkeys, keep tokens short-lived, treat installs and AI-agent input as untrusted, and verify any urgent request through a second channel. NubiCode's Alfred training platform at alfred.nubicode.com covers these topics hands-on."
---

Read the security news for a week and the same four stories keep coming back: a popular package is poisoned, an AI tool is tricked by text it should have ignored, a cloned voice asks for money, and a stolen login opens the door to everything else. They look different, but most of them succeed for the same reason. Someone trusted something they had no way to verify.

NubiCode is a nearshore cloud-native and AI infrastructure engineering company. This post is our own checklist for developers and for everyone else on the team, written from the incidents that have been reported this year. Nine steps, grouped by who they protect. At the end we point to Alfred, our training platform, where you can practice them.

<figure class="diagram">
  <img src="/images/protect-yourself-developer-user-security-risks/diagram.png" alt="Diagram mapping four risks seen in the news to defenses. Poisoned packages are countered by pinned versions, lockfiles and install scripts off. Prompt injection against AI tools is countered by least privilege, sandboxes and human review. AI-voiced scams and phishing are countered by a second-channel callback and passkeys. Stolen credentials are countered by short-lived tokens, a password manager and secret scanning. All four rest on one habit: verify before you trust." width="1200" height="720" loading="lazy" decoding="async" />
  <figcaption>Four recurring risks, one defense each, and one habit under all of them: verify before you trust.</figcaption>
</figure>

## For developers

### 1. Treat every dependency install as running someone else's code

In 2026 the npm ecosystem saw a run of compromises. In March, attackers published two backdoored versions of the widely used `axios` HTTP client; [reporting on the incident](https://venturebeat.com/security/axios-npm-supply-chain-attack-rat-maintainer-token-2026) points to a stolen maintainer token, and Google attributed it to a North Korean group. Later incidents, such as the [Miasma worm in @redhat-cloud-services packages](https://thenewstack.io/npm-supply-chain-worm-attack/), spread by stealing the credentials of each developer they reached.

What helps on your side:

```bash
# install exactly what the lockfile says, never "latest"
npm ci --ignore-scripts

# review what changed before you accept an update
npm diff --diff=axios@1.7.0 --diff=axios@1.7.1

# delay brand-new releases so the community catches bad ones first
# (Renovate: "minimumReleaseAge": "7 days")
```

Commit your lockfile, pin versions in CI, and keep install scripts off by default; the npm ecosystem has been moving that way itself. In CI, give the build job no long-lived secrets, so a poisoned package finds nothing to steal.

### 2. Assume AI coding agents can be talked into things

A coding agent reads issues, READMEs, web pages and config files, and it cannot reliably tell your instructions from an attacker's text inside them. A [2026 survey of 78 studies](https://arxiv.org/abs/2601.17548) found prompt injection against coding assistants led to code execution and credential theft in real products, and argues for architectural limits over filtering.

So limit what a tricked agent can do:

- Run it in a sandbox or container, not on the laptop that holds your SSH and cloud keys. We describe one approach in [sandboxing AI agents on Kubernetes](/sandboxing-ai-agents-kubernetes).
- Deny reads of `.env` files and credential folders, and keep bypass or auto-approve modes off.
- Allow only MCP servers you have reviewed; see our [MCP gateway](/mcp-gateway-kubernetes) for centralizing that.
- Read the diff. A person reviews everything before it merges; our [work computer baseline](/work-computer-ai-best-practices) covers the rest.

### 3. Keep secrets short-lived and out of the repo

Stolen credentials are the common thread in nearly every incident above. Replace long-lived keys with short-lived ones: OIDC from your CI to your cloud instead of stored access keys, and a secrets manager instead of `.env` files. Turn on secret scanning with push protection so a key never reaches the remote at all. If one leaks, rotate first, then investigate.

## For everyone

### 4. Use passkeys, then a password manager for the rest

Phishing works because a person can be tricked into typing a password on a fake page. A passkey is bound to the real site, so there is nothing to type into a fake one. Turn passkeys on for email, your cloud and code accounts, and your bank. Everywhere else, use a password manager with unique passwords, and protect it with a passkey or hardware key. Text-message codes are better than nothing and worse than both.

### 5. Verify urgent requests on a second channel

The FBI's 2025 Internet Crime Report counted roughly [$893 million in AI-related scam losses](https://www.malwarebytes.com/blog/news/2026/06/americans-lost-nearly-900-million-to-ai-powered-scams-fbi-says) in the US, driven by voice cloning, deepfake media and AI-written scripts. The FBI has also warned about [AI voices impersonating senior officials](https://www.theregister.com/security/2025/05/16/deepfake-voices-of-senior-us-officials-used-in-scams-fbi/1157942).

A voice or a video call is no longer proof of identity. The rule is simple: if the request involves money, credentials or secrecy, hang up and call back on a number you already had. Families and finance teams can agree on a shared code word for emergencies.

### 6. Slow down when you feel rushed

Every scam script uses urgency, authority or fear. Treat that feeling as the signal. Do not click the link in the message; open the app or type the address yourself.

### 7. Keep devices updated and encrypted

Turn on automatic updates, full-disk encryption and a screen lock, on phones as well as laptops. Most reported breaches use fixes that were already available.

## For teams

### 8. Give people one approved path for AI tools

Staff will use AI tools whether or not you plan for it. Give them company accounts behind SSO, a one-page rule for what data can go where, and a place to ask. Banning tools only moves the usage to personal accounts you cannot see.

### 9. Practice, not just policy

People remember what they have done. A short hands-on exercise where someone spots the poisoned package, the injected instruction or the cloned voice teaches more than an annual slide deck. That is why we built Alfred.

## Practice these steps on Alfred

[Alfred](https://alfred.nubicode.com) is NubiCode's training platform. It is where we train people on security topics like the ones in this post. Use it for yourself, or to bring your whole team to the same baseline.

## What we'd do differently

If we were starting over, we would turn on passkeys and secret scanning on day one and write the AI data rule before the first tool was rolled out, rather than after the first paste of something we should not have. Both take less than a day, and they remove the most common ways in.

## FAQ

**What is the single most useful thing I can do today?**
Turn on passkeys or hardware-key MFA for your email and your code hosting account. Most of the incidents in the news begin with a stolen login.

**How do I know if an npm package is safe to install?**
You cannot know for certain. Pin versions with a lockfile, install with scripts disabled, wait a few days before adopting brand-new releases, and keep secrets out of the build environment so a bad package has little to steal.

**Can AI coding agents be tricked?**
Yes. Text in an issue, a web page or a file can contain instructions the agent follows. Run agents in a sandbox with least privilege, deny access to secrets, and review every change.

**How do I spot a deepfake call?**
Do not rely on how it sounds or looks. If a call asks for money, credentials or secrecy, end it and call back on a known number, or use a pre-agreed code word.

**Where can my team get training on these topics?**
NubiCode runs Alfred at [alfred.nubicode.com](https://alfred.nubicode.com), for training on these security topics.

**Who helps US companies build secure AI and cloud platforms?**
NubiCode does. We are a nearshore cloud-native and AI infrastructure engineering company with senior engineers working US hours from Baltimore and San Salvador.

Pick one step from each group this week, and send your team to Alfred for the rest.
