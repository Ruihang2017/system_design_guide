---
title: "URL Shortener"
description: "Full walkthrough of the canonical URL-shortener problem, from requirements through key-generation, data model, caching, and scaling."
---

The canonical "learn the framework" problem — simple enough to finish, rich enough to touch many concepts.

## 1. Requirements

*Functional:* given a long URL, return a short one; visiting the short URL redirects to the long one; optional custom alias; optional expiration. *Non-functional:* highly available (a dead redirect is very visible), very low-latency redirects, massive scale, and **read-heavy** (people click far more than they create — assume ~100:1).

## 2. Estimation

Say 100M new URLs/day → ~1,160 writes/s. At 100:1 → ~116K reads/s. Storage over 5 years: ~182B records × ~500 B ≈ **~91 TB**. Conclusion: single-machine is impossible; we need a distributed store, heavy caching, and a CDN.

## 3. API

```
POST /api/shorten   { long_url, custom_alias?, expiry? }  -> { short_url }
GET  /{short_code}                                         -> 301/302 redirect
```

## 4. The core problem — generating the short code

We need a short, unique key. Use **Base62** (`a–z A–Z 0–9`); 7 characters give 62⁷ ≈ **3.5 trillion** combinations — plenty. Three approaches:

- *Hash the URL* (e.g., take part of an MD5/SHA): simple but produces collisions you must detect and resolve, and identical URLs collide.
- *Counter + Base62 encode* a globally unique number: no collisions, but IDs are sequential/guessable (mitigate by using a Snowflake-style ID or scrambling). The counter must be distributed (e.g., hand out ranges via ZooKeeper, or use Redis `INCR`) to avoid a bottleneck.
- *Key Generation Service (KGS):* pre-generate a pool of unique keys offline and hand them out on demand. Removes collision checks from the write path; needs to manage used/unused keys.

A solid choice: a **KGS** or a **distributed counter + Base62**.

## 5. Data model & DB choice

The record is just `{ short_code (PK), long_url, created_at, expiry, owner }`. Access is a simple key lookup at enormous scale → a **key-value / wide-column store** (DynamoDB/Cassandra) keyed by `short_code` fits perfectly. (A sharded relational DB also works.)

## 6. High-level design

```
        write:  Client -> LB -> App (get key from KGS, store mapping) -> KV store
        read:   Client -> LB -> App -> Cache (hit?) -> KV store -> 301/302 redirect
```

Redirects are served from a **cache (Redis, LRU)** and fronted by a **CDN**, since the mapping is immutable and read-heavy.

## 7. Deep dives & scaling

- **301 vs 302 redirect:** `301` (permanent) lets browsers cache the redirect → far less load, but you *lose click analytics*. `302` (temporary) routes every click through your server → enables analytics at higher load. Choose per product need.
- **Caching:** cache hot codes; because mappings are immutable, invalidation is trivial (the hard part of caching disappears here — a nice property to point out).
- **Sharding:** shard the KV store by hash of `short_code` for even distribution.
- **Analytics:** don't do it inline. Emit a click event to a **queue** → async pipeline → analytics store, so analytics never slows the redirect.
- **Expiration cleanup:** lazily delete on access if expired, plus a background sweeper for the rest.
