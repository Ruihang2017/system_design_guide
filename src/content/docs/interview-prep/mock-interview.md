---
title: "Mock Interview — URL Shortener (annotated)"
description: "A realistic annotated transcript of a system design interview for 'Design a URL shortener,' showing the 7-step framework performed live with commentary on what scores points."
---

This transcript shows the [7-step framework](/method/framework/) in motion. The annotations explain *why* each move lands — so you can replicate the pattern, not just the answer.

---

## The interview

**Interviewer:** Let's design a URL shortener — something like bit.ly. Take it wherever you think it needs to go.

**Candidate:** Great. Before I draw anything, I want to make sure I understand the scope. Can I ask a few questions?

**Interviewer:** Go ahead.

**Candidate:** First, scale — roughly how many new short URLs are we creating per day, and what's the read-to-write ratio? I'm asking because the numbers will determine whether a single database can handle this or whether we need horizontal scaling from the start.

**Interviewer:** Tens of millions of new URLs per day. Redirects are much more common than creates — think around a hundred-to-one.

**Candidate:** Got it. Second — do users need custom aliases, like `/my-brand`, or is a system-generated code fine?

**Interviewer:** Let's say system-generated is the core requirement. Custom aliases are a nice-to-have.

**Candidate:** Understood — I'll design for system-generated and flag where custom aliases would plug in. What about expiry? Do links need to expire?

**Interviewer:** Optional per-link expiry, yes.

**Candidate:** And analytics — click counts, referrers, geographic data?

**Interviewer:** Nice-to-have. Let's not block the core design on it.

**Candidate:** Perfect. So to summarise what I'm designing: create a short URL, redirect to the original, optional expiry. Custom aliases and analytics are deferred — I'll call them out if they touch the core path. Last thing: availability requirement?

**Interviewer:** High — 99.99%. A broken short link is immediately visible.

:::note[Why this works]
The candidate asked about scale, read/write ratio, custom aliases, expiry, analytics, and availability — all five of the questions that matter most for this problem — and then explicitly deferred analytics and custom aliases rather than just forgetting them. This is step 1 of the framework: pin the functional scope and extract the non-functional parameters you'll use to justify every architectural choice later. Interviewers are watching for this. Most candidates skip it.
:::

---

**Candidate:** Let me do a quick back-of-envelope to see what the numbers force on us.

100 million new URLs per day. Divide by 86,400 seconds — that's roughly 1,160 writes per second on average. At 100:1, that's about 116,000 redirects per second on average; assume a 3× peak, so around 350,000 reads per second at peak.

For storage: assume each record is around 500 bytes — short code, long URL, timestamps, expiry. 100 million records per day over five years is about 182 billion records. 182 billion × 500 bytes ≈ 91 terabytes.

**What those numbers force:** a single machine can't handle 350,000 reads per second, so we need horizontal scaling and distributed storage. 91 TB rules out anything that doesn't scale storage independently. And the 100:1 read skew makes caching the single highest-leverage decision — if we hit a 99% cache hit rate, the database sees 3,500 reads per second instead of 350,000.

**Interviewer:** That's a useful frame. Keep going.

:::note[Why this works]
The candidate stated the numbers *and then said what they mean* — that second sentence is what separates a strong candidate from a mediocre one. Anyone can multiply. The interviewer wants to hear "and therefore we need X," which is exactly what the 100:1 skew → caching chain does. These estimates will reappear to justify cache sizing and KV store choice later in the session.
:::

---

**Candidate:** API is simple. Two endpoints matter for the core design.

```
POST /api/shorten
  Body:  { "long_url": "https://...", "expiry_seconds": 86400 }
  200:   { "short_url": "https://sho.rt/aB3xY9z" }

GET /{short_code}
  301 or 302  Location: <long_url>
  404         not found
  410         expired
```

The redirect endpoint is the hot path — everything else is secondary. The data model flows directly from the access pattern: almost every read is a point lookup by `short_code`. No joins, no range scans. That's a key-value workload, which pushes me toward DynamoDB or Cassandra over a relational store — though a sharded PostgreSQL with hash-partitioning on `short_code` would also work if you're already running relational infrastructure.

The core record:
- `short_code` — partition key / lookup key
- `long_url` — the destination
- `created_at`, `expiry` — timestamps
- `owner_id` — nullable, for eventual user accounts

:::note[Why this works]
The candidate named the access pattern — "point lookup by short_code, no joins" — *before* choosing a database, and then justified the choice from that pattern. That's step 4 of the framework. Interviewers who ask "why not PostgreSQL?" are checking whether you understand the *reason* for the choice or just memorised that "URL shortener = NoSQL."
:::

---

**Candidate:** Here's my high-level design. I'll walk through both paths.

**Write path:** Client POSTs to a load balancer, which routes to an app server. The app server requests a unique short code from a Key Generation Service, writes the mapping to the KV store, and returns the short URL. Simple.

**Read path:** Client GETs the short code. First stop is a CDN edge node — if the redirect is cached there, the user gets their 301 or 302 immediately without touching our infrastructure. CDN miss goes to the load balancer → app server → Redis cache. Cache hit returns the redirect. Cache miss falls through to the KV store, populates Redis, returns the redirect. Asynchronously, the app server emits a click event to a message queue for analytics — that write is fire-and-forget, invisible to redirect latency.

So the full stack is: Client → CDN → Load Balancer → App Servers → Redis → KV Store, with a message queue branching off the app server for analytics.

**Interviewer:** Makes sense. How are you generating the short codes?

:::note[Why this works]
The candidate got the skeleton agreed before diving into any one component — step 5. Describing the *read path* and *write path* separately, ending at the store, is a clean way to walk a two-sided system. The async analytics branch is a quick aside that shows awareness without derailing the structural walkthrough.
:::

---

**Candidate:** My first instinct is to hash the long URL — take the first seven characters of the MD5 or SHA-256 output, encode in Base62. Seven Base62 characters gives 62⁷, roughly 3.5 trillion combinations, which is plenty.

**Interviewer:** What happens if two different long URLs hash to the same seven-character prefix?

**Candidate:** Right — that's the collision problem. In theory the probability is low, but at billions of records it becomes real. The fix is to detect the collision: check the KV store after hashing, and if the code is taken, rehash with a different salt or try the next N characters. But now the write path requires a read before every write. At 1,160 writes per second average that's manageable, but it adds latency and complexity. There's a better approach.

**Interviewer:** What would you do instead?

**Candidate:** Switch to a Key Generation Service — a dedicated service that pre-generates short codes offline and keeps a pool of unused keys ready to hand out. The app server requests a key from the KGS on each write, and that's a simple pop from the pool — no hashing, no collision check, no read-before-write. Key uniqueness is guaranteed because the KGS manages the pool exclusively.

The tradeoff is that the KGS is now a stateful service with its own availability story. To avoid it becoming a single point of failure: run multiple KGS instances, each pre-allocated to a non-overlapping key range; and have each app server claim a batch of around 10,000 keys at startup, refreshing when running low. The KGS can be down for seconds without any app server noticing.

If that feels like too many moving parts, another clean option is a distributed counter: a Redis `INCR` or a Snowflake-style ID, encoded to Base62. No collisions by construction. The risk is that sequential IDs are guessable — you can mitigate by mixing in timestamp and machine bits before encoding.

My recommendation is the KGS or distributed counter with range allocation — both avoid the read-before-write on the hot write path. The KGS is conceptually cleaner; the counter requires fewer services.

:::tip[Recovering well is itself a strong signal]
The candidate proposed hashing, the interviewer surfaced the collision problem, and the candidate course-corrected without getting defensive. This is one of the most important signals in a system design interview — not whether you get it right the first time, but whether you reason clearly when challenged. A candidate who holds their ground without engaging the critique is a red flag. A candidate who panics and abandons the whole design is also a red flag. The right move is exactly this: "here's why that's a real problem, here's a better approach, here are the tradeoffs."
:::

---

**Candidate:** I want to call out one tradeoff explicitly — 301 versus 302 for the redirect.

A 301 is a permanent redirect. The browser caches it; future clicks on the same link never reach our servers. Server load is very low after the first visit, and the CDN can cache it aggressively. The downside: cached redirects don't generate server-side click events, so analytics are lost for any click that hits a warm browser cache.

A 302 is temporary. The browser asks our server on every click, so we see every redirect and can count every click. Server load is higher because nothing is cached client-side.

**My recommendation depends on the product:** if link analytics are a core feature — a marketing platform, A/B testing — use 302. If minimising infrastructure load matters more — a link-in-bio tool, a static campaign — use 301. Some services compromise: they serve 302 while a new URL is still being scanned for safety, then switch to 301 once verified.

If you want both low load *and* analytics, the right pattern is a 302 plus an async click event emitted to the message queue on every server hit. You pay one server hop per click, but redirect latency is still fast because the queue write is fire-and-forget.

**Interviewer:** Reasonable. Let's talk about scale. What breaks first?

:::note[Why this works]
Naming the 301 vs 302 choice as a *product decision disguised as a technical one* demonstrates that the candidate understands that system design is not a purely technical exercise. Stating both options, their tradeoffs, and a recommendation with a rationale — rather than asking "which do you want?" — is exactly the seniority signal interviewers are looking for at the deep-dive stage.
:::

---

**Candidate:** Two things break first at scale, and they're related.

**Hot keys.** A viral short link — say, a celebrity posts it and ten million people click in five minutes — concentrates enormous traffic on a single Redis key or a single CDN node. The CDN is actually the best first line of defence: a viral link served from CDN edge never hits Redis or the KV store. For traffic that does reach the app tier, I'd add a small in-process LRU cache on each app server — a few thousand entries, one-to-five-second TTL — so hot keys are served from local memory with zero network round-trips. For Redis specifically, hot keys can be explicitly replicated across multiple Redis Cluster slots rather than pinning to one shard.

**KV store sharding.** At 91 TB and 350,000 reads per second, the KV store needs to be sharded. The right partition key is `short_code` — hashing it gives even distribution because short codes are effectively random, so there are no sequential hot spots. DynamoDB does this automatically; with Cassandra, using `short_code` as the partition key achieves the same result. The dangerous mistake is sharding by `created_at` or any time-based key — that creates write-hotspot shards.

**Interviewer:** What if the KGS goes down?

**Candidate:** That's the SPOF I called out earlier. The mitigation is layered: multiple KGS instances with non-overlapping key ranges, plus app servers holding a local buffer of ten thousand keys each. An app server refreshes its buffer from KGS before it runs out. If the KGS is down for seconds — or even minutes — the app servers exhaust their local buffers before the write path stalls. The KGS also needs to persist its current high-watermark to durable storage so a restarted instance resumes without issuing duplicate keys.

**Interviewer:** Good. I think we have what we need. Thank you.

:::note[Why this works]
The candidate didn't wait for the interviewer to identify the bottlenecks — they named "hot keys" and "KV sharding" proactively, which is step 7 of the framework. Calling out the wrong partition key (time-based) shows depth: you need to know the failure mode, not just the correct answer. And when the interviewer probed the KGS SPOF, the candidate had already anticipated it and gave a layered answer that addressed detection, mitigation, and recovery.
:::

---

## What the interviewer was scoring

- **Requirements first:** candidate asked five targeted questions before drawing a box, extracted read/write ratio and availability target, and explicitly deferred out-of-scope features.
- **Numbers that drive decisions:** the 100:1 ratio and 350K peak reads/s were stated *and used* — they justified the caching layer and horizontal scale, not just recited as facts.
- **API before architecture:** defining the two endpoints first made the KV access pattern obvious, which made the database choice defensible.
- **Correct but not defensive under challenge:** the hashing→KGS course-correction demonstrated reasoning ability, not memorised answers.
- **Explicit tradeoff with recommendation:** the 301/302 discussion showed a product-aware engineer, not a protocol-aware one.
- **Proactive bottleneck identification:** hot keys and sharding were named before being asked, and the SPOF answer was pre-structured with layered mitigations.

Work the full design in the [URL Shortener case study](/case-studies/url-shortener/), and drive your own with the [framework](/method/framework/).
