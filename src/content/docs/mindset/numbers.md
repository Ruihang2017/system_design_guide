---
title: "Numbers Everyone Should Know"
description: "A concise reference of latency, data sizes, QPS conversions, and availability figures for back-of-envelope estimation."
---

Keep these numbers at the back of your mind during any design conversation. The exact values matter less than the **ratios** — knowing that RAM is a hundred thousand times faster than HDD is more useful than memorizing "100 ns." See [Estimation & Numbers](/mindset/estimation/) for the full estimation workflow and [Consistency & CAP](/mindset/consistency-cap/) for how these constraints shape data-layer choices.

## The latency ladder

How long does each storage or network hop actually take?

| Operation | Time | Notes |
|---|---|---|
| L1 cache reference | ~1 ns | On-chip, nearly free |
| L2 cache reference | ~4 ns | Still on-chip |
| Main memory (RAM) reference | ~100 ns | ~100× slower than L1 |
| SSD random read (4 KB) | ~150 µs | ~1,500× slower than RAM |
| Same-datacenter round trip | ~0.5 ms | Network RTT within one AZ |
| HDD seek (rotational disk) | ~10 ms | ~100× slower than SSD |
| Cross-continent round trip (CA ↔ EU) | ~150 ms | Speed of light + routing |

**Key ratios to internalize:**

- RAM is **~100× faster** than SSD and **~100,000× faster** than HDD.
- Cross-region is **~300× slower** than same-datacenter.
- HDD seek is **~100,000× slower** than RAM — spinning rust is an entirely different tier.

:::tip Why this matters
These ratios are the root cause behind every caching decision you'll make. Hot data must live in memory. Avoid synchronous cross-region calls on the critical path. If your design requires a disk seek per request, it cannot serve more than a few hundred QPS per node.
:::

## Powers of two & data sizes

Storage math works cleanly in powers of two.

| Power | Approx value | Unit |
|---|---|---|
| 2^10 | ~1 Thousand | 1 KB |
| 2^20 | ~1 Million | 1 MB |
| 2^30 | ~1 Billion | 1 GB |
| 2^40 | ~1 Trillion | 1 TB |
| 2^50 | ~1 Quadrillion | 1 PB |

**Typical record sizes** (for storage estimation):

| Data type | Size |
|---|---|
| ASCII character | 1 B |
| Unicode character (UTF-16) | 2 B |
| 32-bit integer | 4 B |
| 64-bit integer / Unix timestamp | 8 B |
| UUID / GUID | 16 B |
| Small metadata row | ~100 B – 1 KB |
| Typical web page | ~100 KB – a few MB |

:::note
For quick estimates, assume a "record" in a social app (user row, post metadata, event) is **~100–500 bytes**. Scale that up by user count and retention period; the answer tells you whether a single machine suffices or you need sharding.
:::

## Traffic / QPS heuristics

There are 86,400 seconds in a day. Use the table below to convert request counts to per-second rates without mental arithmetic.

| Requests per day | Requests per second (avg) | Typical peak (2–5×) |
|---|---|---|
| 1 million / day | ~12 / s | 25–60 / s |
| 10 million / day | ~115 / s | 230–575 / s |
| 100 million / day | ~1,160 / s | 2,300–5,800 / s |
| 1 billion / day | ~11,600 / s | 23,000–58,000 / s |

**Peak is typically 2–5× average.** Always size infrastructure for peak, not average. If your traffic has a pronounced daily cycle (a consumer app peaks in evenings, a B2B tool peaks mid-day), use 3× as a practical default.

:::tip Quick shortcut
Divide daily requests by **100,000** to get approximate req/s. (86,400 ≈ 10^5.) 100 M / day ÷ 10^5 ≈ 1,000 req/s. Close enough for an estimate.
:::

## Availability nines

Each additional nine buys you roughly 10× less downtime — and costs roughly 10× more to achieve.

| Availability | Downtime / year | Downtime / day |
|---|---|---|
| 99% (two nines) | ~3.65 days | ~14.4 min |
| 99.9% (three nines) | ~8.77 hours | ~1.44 min |
| 99.99% (four nines) | ~52.6 min | ~8.6 sec |
| 99.999% (five nines) | ~5.26 min | ~0.86 sec |

**Chained dependencies multiply downtime.** If a single user request touches four independent services each at 99.9%, the effective availability is 0.999⁴ ≈ **99.6%** — that is three nines degraded to two and a half. Every dependency you add subtracts from your uptime budget. This is the quantitative case for minimizing synchronous service calls and adding redundancy.

:::caution
Five nines (~5 minutes downtime per year) requires active–active redundancy, automated failover, and continuous chaos-testing. It is expensive. Most products live at 99.9%–99.99% and spend engineering time on the 20% of code that actually fails.
:::

## The estimation recipe

When an interviewer says "design X for Y users," work through the numbers in this order:

1. **Traffic** — DAU → requests/day → req/s. Split **reads from writes** (ratio is often 10:1 to 100:1). Apply a **peak factor** (2–5×). The read:write split determines your whole architecture: read-heavy systems need caches and read replicas; write-heavy systems need efficient write paths and sharding.

2. **Storage** — `bytes/record × records/day × retention (days) × replication factor`. Three replicas (×3) is a common default. Add ~20–30% overhead for indexes and metadata.

3. **Bandwidth** — `req/s × avg response size`. Separate inbound (writes) from outbound (reads served). A content-heavy service may be bandwidth-bound before it is CPU-bound.

4. **Cache size** — apply the **80/20 rule**: caching the hot 20% of records typically serves 80% of reads. Size your cache to the hot set, not the total dataset.

**Worked example — a write-heavy event logging service at 100 M writes/day:**

- Traffic: 100 M / 86,400 ≈ **1,160 writes/s** average; peak ~3,500 writes/s.
- Assume 10:1 read:write → ~11,600 reads/s at peak.
- Storage: each event ≈ 500 B; retain 1 year; ×3 replication.
  `500 B × 100 M × 365 × 3 ≈ 55 TB/year`.
- Cache: 20% of a day's data ≈ `100 M × 500 B × 0.2 ≈ 10 GB` — fits comfortably in a single Redis node.

Conclusion: 55 TB/year rules out a single database node and points toward sharding or a columnar time-series store. The cache is small. The write rate (3,500/s at peak) is achievable on a moderate cluster but needs a write buffer (e.g., Kafka) to absorb spikes. That's the design insight — and it took under two minutes to reach it.

:::tip
Return to [Estimation & Numbers](/mindset/estimation/) for the full framing on vertical vs horizontal scaling and when these estimates change the design direction. Numbers are only useful when they inform a decision.
:::
