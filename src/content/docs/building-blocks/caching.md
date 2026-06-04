---
title: "5 · Caching"
description: The highest-leverage performance tool in your kit — caching strategies, eviction policies, failure modes, and CDNs.
---

Caching is the highest-leverage performance tool you have. The principle: keep frequently accessed data closer/faster than its source of truth.

## Where caches live (multiple layers)

Browser/client cache → CDN (edge) → API/application cache → in-memory distributed cache (Redis/Memcached) → database's own cache. Each layer absorbs load from the next.

## Caching strategies (read + write patterns)

- **Cache-aside (lazy loading):** application checks the cache; on a miss, reads the DB and populates the cache. The most common pattern. Only requested data is cached; the cost is a slower first request and a brief staleness window after updates.
- **Read-through:** the cache itself fetches from the DB on a miss (the app only talks to the cache). Cleaner app code; the cache library handles loading.
- **Write-through:** write to cache and DB together, synchronously. Cache is always fresh; writes are slower.
- **Write-back (write-behind):** write to cache immediately, flush to DB asynchronously. Very fast writes, but risk of data loss if the cache dies before flushing.
- **Write-around:** write straight to the DB, skip the cache; the cache fills on later reads. Good when written data isn't read soon.

## Eviction policies

When the cache is full, what gets thrown out? **LRU** (least recently used — the default and usually right), **LFU** (least frequently used), **FIFO**, **TTL** (expire after a time), or random.

## The hard parts of caching

- **Cache invalidation** — "there are only two hard things in computer science…" Keeping the cache consistent with the source of truth is genuinely difficult. Tools: TTLs (accept bounded staleness), write-through, explicit invalidation on update, and versioned keys.
- **Cache stampede / thundering herd** — a popular key expires and thousands of requests miss simultaneously, all hammering the DB. Fixes: request coalescing (let one request rebuild while others wait), staggered/jittered TTLs, and serving stale-while-revalidate.
- **Cache penetration** — repeated queries for keys that don't exist bypass the cache and hit the DB. Fixes: cache the "not found" result, or front the cache with a **Bloom filter**.
- **Hot key** — a single key gets disproportionate traffic. Fixes: replicate that key across nodes, or add a local in-process cache in front.

## CDN (Content Delivery Network)

A geographically distributed cache for static (and increasingly dynamic) content — images, video, JS/CSS, even API responses. Serves users from a nearby **edge** location, slashing latency and offloading your origin. Essential for any global, media-heavy product.
