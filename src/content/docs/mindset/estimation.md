---
title: "1 · Estimation & Numbers"
description: "Back-of-the-envelope estimation: scaling, availability nines, latency numbers, powers of two, and how to size a system."
---

## Scaling: vertical vs horizontal

- **Vertical scaling (scale up):** bigger machine — more CPU, RAM, faster disk. Simple, no code changes, but there's a hard ceiling and a single point of failure. Great early; runs out fast.
- **Horizontal scaling (scale out):** more machines behind a load balancer. Near-unlimited ceiling, built-in redundancy, but forces you to solve hard problems: distributing state, coordination, consistency. **Almost all large systems scale horizontally.**

The enabler of horizontal scaling is **statelessness**. A *stateless* service keeps no per-client data in local memory between requests, so any server can handle any request and you can add/remove servers freely. Push state out to a shared store (database, cache, object storage). *Stateful* services (that hold sessions, in-memory data) are harder to scale and fail over — minimize them, and when you can't, isolate them.

## Availability — the "nines"

Availability is usually quoted as a percentage of uptime. The intuition that matters is how much *downtime per year* each level allows:

| Availability | Downtime / year | Downtime / day |
|---|---|---|
| 99% (two nines) | ~3.65 days | ~14.4 min |
| 99.9% (three nines) | ~8.77 hours | ~1.44 min |
| 99.99% (four nines) | ~52.6 min | ~8.6 sec |
| 99.999% (five nines) | ~5.26 min | ~0.86 sec |

Two facts to carry: (1) each extra nine is roughly 10× harder and more expensive; (2) availability of a chain of dependencies *multiplies* — if your request needs 4 services each at 99.9%, your effective availability is 0.999⁴ ≈ 99.6%. This is why reducing dependencies and adding redundancy matters.

## Latency vs throughput

- **Latency** = time for one operation (e.g., 50ms per request).
- **Throughput** = operations per unit time (e.g., 10,000 req/s).

They're related but distinct. A system can have low latency and low throughput (fast but can't handle many at once), or high latency and high throughput (slow per request but massively parallel, like a batch pipeline). Optimize for whichever the product needs. And always think in **percentiles**: average latency hides pain. p99 = "the slowest 1% of requests take at least this long," and at scale that 1% is a lot of unhappy users.

## Numbers every engineer should know (orders of magnitude)

These are approximate but invaluable for sanity-checking a design. The relationships matter more than exact values:

```
L1 cache reference ......................... ~1 ns
Branch mispredict .......................... ~3 ns
Main memory (RAM) reference ................ ~100 ns      (memory is ~100x slower than L1)
Read 1 MB sequentially from RAM ............ ~10–100 µs
Round trip within same datacenter .......... ~0.5 ms
Read 4 KB randomly from SSD ................ ~150 µs
Read 1 MB sequentially from SSD ............ ~1 ms
Disk (HDD) seek ............................ ~10 ms       (~10,000x slower than RAM)
Round trip across continents (CA<->EU) ..... ~150 ms
```

The takeaways you'll use constantly: **memory is ~100× faster than disk; staying in the same datacenter is ~100× faster than crossing the planet; SSD is far faster than HDD but far slower than RAM.** This is *why* caching, locality, and avoiding cross-region round trips dominate performance work.

## Powers of two for storage math

```
2^10  ≈ 1 thousand  → 1 KB
2^20  ≈ 1 million    → 1 MB
2^30  ≈ 1 billion    → 1 GB
2^40  ≈ 1 trillion   → 1 TB
2^50                 → 1 PB
```

## How to do an estimate

When asked "design X for N users," estimate in this order. Round aggressively — you want order of magnitude, not precision.

1. **Traffic:** daily active users → requests/day → requests/second (÷ ~86,400 s/day, round to ~100K). Separate **reads from writes** (read:write ratio is often 10:1 or 100:1, and it changes the whole design). Account for **peak** (often 2–5× average).
2. **Storage:** bytes per record × records per day × retention period. Don't forget replication factor (×3 is common) and indexes/overhead.
3. **Bandwidth:** requests/second × bytes per response.
4. **Memory (cache):** apply the 80/20 rule — caching the hot 20% of data often serves 80% of requests. Size the cache to that hot set.

*Worked mini-example:* 100M new writes/day → ~1,160 writes/s. At a 100:1 read ratio → ~116,000 reads/s. If each record is ~500 bytes and you keep 5 years: 100M × 365 × 5 ≈ 182B records × 500 B ≈ **~91 TB** (before replication). That instantly tells you "single machine is impossible — this needs sharding and caching." That's the whole point of the exercise.
