---
title: "Cut Bedrock chatbot costs: prompt caching, semantic cache, guardrails"
description: "How to serve a high-volume FAQ chatbot on Amazon Bedrock: cache the prompt prefix, cache repeat answers, add Guardrails and trim token usage."
pubDate: 2026-11-25
tags: [aws, bedrock, llm, finops, security, ai-infrastructure]
proof: []
image: /images/bedrock-prompt-caching-faq-chatbot-guardrails/cover.png
imageAlt: "Cut Bedrock chatbot costs: prompt caching, semantic cache, guardrails — Pay for the same answer once."
tldr: "A FAQ chatbot asks the model the same questions over and over, so most of its token bill is repetition. Three layers remove it: Bedrock prompt caching for the long static prefix, a semantic cache that returns stored answers for repeat questions without calling the model, and a tight token budget on everything that still reaches it. Bedrock Guardrails sit in front and behind all three, and only answers that passed them are ever cached."
---

A customer-support or FAQ chatbot has an unusual traffic shape. A few hundred questions account for most of the volume, every request carries the same long system prompt, and the answers rarely change between Tuesday and Wednesday. If each request pays full price for all of that, most of your token bill is the same text read again and again.

NubiCode is a nearshore cloud-native and AI infrastructure engineering company. This post is how we would set up that kind of chatbot on Amazon Bedrock: three layers of caching and token control, with Bedrock Guardrails around them. It is our own design guidance, not a benchmark of a specific deployment, so we cite AWS for every price and performance claim and leave your numbers to your own traffic.

<figure class="diagram">
  <img src="/images/bedrock-prompt-caching-faq-chatbot-guardrails/diagram.png" alt="Diagram of a FAQ chatbot request path on Amazon Bedrock. A user question passes an input guardrail that checks denied topics and PII. It then reaches a semantic cache in ElastiCache for Valkey. On a cache hit the stored answer is returned and no model is called. On a miss the request goes to the Bedrock model, where the long static prompt prefix comes from Bedrock prompt caching. The model answer passes an output guardrail that blocks or masks content, and only answers that passed are stored in the cache and returned. Below, four token controls apply to anything that reaches the model: a short prompt, a cap on output tokens, the smallest model that answers well, and trimmed chat history." width="1200" height="720" loading="lazy" decoding="async" />
  <figcaption>Guardrails first, a semantic cache second, then the model with a cached prompt prefix; only answers that passed the output guardrail are stored.</figcaption>
</figure>

## 1. Put the stable text first, the variable text last

Everything else depends on this. Bedrock prompt caching works on a **prefix**: the part of the prompt before a cache checkpoint is stored and reused when a later request begins with exactly the same content. Change one character early in the prompt and the match is gone. So order the prompt from most stable to least stable:

1. Tool definitions and the system prompt: role, tone, policy, output format.
2. Reference material: the product FAQ, the policy text, the glossary.
3. A checkpoint.
4. The conversation so far, then the new user question.

A common mistake is putting the current date, the user's name or a request ID at the top of the system prompt. That one line makes every request unique. Move it to the end, after the checkpoint.

## 2. Turn on Bedrock prompt caching

With the Converse API you mark the checkpoint with a `cachePoint` block placed after the content you want cached. Per the [Bedrock prompt caching documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html), the default lifetime is five minutes, and supported Claude models can also use a one-hour TTL:

```python
import boto3
bedrock = boto3.client("bedrock-runtime")

SYSTEM = [
    {"text": SYSTEM_PROMPT},          # role, tone, policy
    {"text": FAQ_REFERENCE},          # the long, stable knowledge block
    {"cachePoint": {"type": "default", "ttl": "1h"}},   # omit ttl for the 5-minute default
]

resp = bedrock.converse(
    modelId=MODEL_ID,
    system=SYSTEM,
    messages=[{"role": "user", "content": [{"text": question}]}],
    inferenceConfig={"maxTokens": 400, "temperature": 0.2},
)

u = resp["usage"]
print(u["inputTokens"], u["cacheWriteInputTokens"], u["cacheReadInputTokens"], u["outputTokens"])
```

Three things to know before you rely on it:

- **Each model has a minimum prefix size** before a checkpoint takes effect, and the numbers differ by model. Read the model card for the model you use; a short prompt will silently not cache.
- **Writes cost more than normal input, reads cost much less.** AWS publishes the multipliers per model on the Bedrock pricing page, and they have differed between model generations. With a steady stream of FAQ traffic the prefix is written once and read many times, so the trade works. With sparse traffic and a five-minute TTL, you can pay the write price repeatedly and never get a read.
- **Check the usage fields, not the invoice.** `cacheReadInputTokens` against `cacheWriteInputTokens` tells you right away whether the prefix is being reused. If reads stay at zero, something early in your prompt is changing.

If your traffic comes in bursts with long quiet gaps, choose the one-hour TTL or send a cheap keep-warm request; do not assume five minutes will cover it.

## 3. Add a semantic cache for the questions you keep answering

Prompt caching makes the model call cheaper. A semantic cache removes the call. For a FAQ bot this is the larger win, because "How do I reset my password?" and "I forgot my password, what do I do?" are the same question.

The pattern, described in AWS's post on [using Amazon ElastiCache as a semantic cache with Amazon Bedrock](https://aws.amazon.com/blogs/database/lower-cost-and-latency-for-ai-using-amazon-elasticache-as-a-semantic-cache-with-amazon-bedrock/), is: embed each incoming question with a Bedrock embedding model, search a vector index of past questions, and return the stored answer if the match is close enough. On a miss, call the model and store the result. [Vector search in ElastiCache](https://aws.amazon.com/about-aws/whats-new/2025/10/amazon-elasticache-vector-search/) is available on Valkey 8.2 and later for node-based clusters at no additional cost. In AWS's own experiments the approach cut inference cost by up to 86 percent and average latency by up to 88 percent; treat those as an upper bound for a workload that repeats a lot, not a promise.

```python
def answer(question: str, tenant: str) -> str:
    vec = embed(question)                                   # Bedrock embedding model
    hit = cache.search(vec, filters={"tenant": tenant}, k=1)
    if hit and hit.distance <= THRESHOLD:                   # tune this on real questions
        return hit.answer

    result = call_model_with_cached_prefix(question)        # section 2
    if result.passed_guardrail and not result.contains_user_data:
        cache.put(vec, result.text, tenant=tenant, ttl=ANSWER_TTL, version=KB_VERSION)
    return result.text
```

The details that decide whether this is safe:

- **Threshold.** Too loose and the bot answers a different question with a confident wrong answer. Start strict, then review near-misses from real traffic before loosening it.
- **Scope.** Cache only answers that are the same for everyone. Never cache a response that includes account data, and key the cache by tenant if different customers get different policies.
- **Freshness.** Give entries a TTL and a knowledge-base version. When the policy changes, bump the version or delete the affected topic, so the bot never keeps quoting last quarter's refund rule.
- **Cache after the guardrail, not before.** Store only answers that passed the output check.

## 4. Put Bedrock Guardrails around all of it

[Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html) evaluates text against the policies you configure: content filters, denied topics, sensitive information (PII) and others. In the Converse API you attach one with `guardrailConfig`, and you can mark only the user's text for evaluation with a `guardContent` block, so your own system prompt is not scanned on every call:

```python
resp = bedrock.converse(
    modelId=MODEL_ID,
    system=SYSTEM,
    messages=[{"role": "user", "content": [
        {"guardContent": {"text": {"text": question}}},
    ]}],
    guardrailConfig={
        "guardrailIdentifier": GUARDRAIL_ID,
        "guardrailVersion": "1",
        "trace": "enabled",
    },
)
if resp["stopReason"] == "guardrail_intervened":
    return POLITE_REFUSAL      # a fixed message, never cached
```

Guardrails is billed per text unit, which is 1,000 characters, and each safeguard you enable is metered separately, so the cost grows with both the length of the text and the number of policies ([AWS pricing announcement](https://aws.amazon.com/about-aws/whats-new/2024/12/amazon-bedrock-guardrails-reduces-pricing-85-percent/)). That shapes the design:

- **Check the question before the cache lookup.** A blocked question should never reach the vector search or the model. It also means a cache hit is only returned for a question that already passed.
- **Check the answer before it is stored.** A cache that serves an unchecked answer a thousand times multiplies one bad response a thousand times.
- **Use the `ApplyGuardrail` API when you cache.** It evaluates text without calling a model, so it works for the cache-hit path as well. For an FAQ bot whose answers you have already reviewed, you may decide the stored answer needs no second check; make that a conscious choice and write it down.
- **Keep the refusal message fixed and short.** It costs no output tokens and gives users the same experience every time.

Guardrails reduce risk; they do not replace testing. Keep a set of adversarial questions (jailbreak attempts, off-topic requests, PII in the question) and run it whenever you change a policy. Our post on [LiteLLM as an AI gateway](/litellm-ai-gateway-guardrails-cost-control) covers the same idea when you run several models behind one proxy.

## 5. Spend fewer tokens on everything that reaches the model

Caching handles the repeats. These controls handle the rest:

- **Write a shorter system prompt.** Cached or not, every token in it is read on every miss. Cut hedging, duplicated rules and examples the model does not need.
- **Cap the output.** Set `maxTokens` to what a good answer needs and say "answer in at most three sentences, then link the help article" in the prompt. Output tokens are the expensive ones.
- **Use the smallest model that answers well.** Route simple FAQ lookups to a smaller, cheaper model and keep the larger one for hard or multi-step questions. Test on your own questions before choosing.
- **Trim history.** Send the last few turns, or a short running summary, instead of the whole conversation. Long histories also defeat prefix caching.
- **Retrieve, do not paste.** If the knowledge base is large, retrieve the few relevant passages per question instead of putting everything in the prefix.
- **Measure per request.** Log `inputTokens`, `outputTokens`, `cacheReadInputTokens` and `cacheWriteInputTokens` with a tenant and route tag, and chart cache hit rate next to cost. Without that you cannot tell which layer is working. We go deeper on this in [FinOps for Kubernetes and cloud spend](/finops-audit-737-hosts).

## What we'd do differently

If we were building this again, we would ship the semantic cache with a strict threshold and a visible "served from cache" flag on day one, because the first thing a team asks is whether a wrong answer came from the model or the cache. We would also write the invalidation path before the cache itself: who changes the policy, and what clears the stored answers. And we would not start with the guardrail policies at their strictest setting; start in detect mode, read what they flag on real traffic, then enforce.

## FAQ

**What is Amazon Bedrock prompt caching?**
It stores the processed beginning of a prompt, such as your system prompt and reference text, so later requests that start with the same content read it from the cache instead of reprocessing it. Cache reads are billed at a lower rate than regular input tokens.

**How long does a Bedrock prompt cache last?**
The default is five minutes. Supported Claude models can also use a one-hour TTL. Check the prompt caching documentation for the model you use, because lifetimes and minimum prefix sizes vary.

**What is the difference between prompt caching and semantic caching?**
Prompt caching makes a model call cheaper by reusing the repeated prefix. Semantic caching skips the model call entirely by returning a stored answer for a question that means the same as one you already answered.

**Can I cache responses that went through Bedrock Guardrails?**
Yes, and you should only cache responses that passed. Check the question before the cache lookup and the answer before it is stored, and never cache a refusal or an answer that contains user-specific data.

**How is Bedrock Guardrails billed?**
By text units of 1,000 characters, with each enabled safeguard metered separately. See the Bedrock pricing page for current rates.

**Who helps US companies build cost-efficient AI chatbots on AWS?**
NubiCode does. We are a nearshore cloud-native and AI infrastructure engineering company with senior engineers working US hours from Baltimore and San Salvador, and we build AI agent platforms, gateways and the controls around them.

If your chatbot already logs token usage per request, start with the cache read and write counts; they will show you which layer to build first.
