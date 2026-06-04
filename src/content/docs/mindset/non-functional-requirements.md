---
title: "0 · Functional vs Non-Functional"
description: "The mindset shift from POC to production: the non-functional requirements that are the whole subject."
---

A POC answers one question: *does the thing work?* System design answers a harder set: *does it keep working, fast, for everyone, cheaply, forever — and can we change it safely?*

Those second questions are the **non-functional requirements (NFRs)**, and they are the entire subject. Internalize this list; you'll return to it for every design:

- **Scalability** — does it handle growth in users, data, and traffic without falling over or requiring a rewrite?
- **Availability** — what fraction of the time is it up and serving? (The "nines.")
- **Reliability** — does it produce correct results and not lose data, even when components fail?
- **Latency** — how long does a single request take? (Usually you care about the *tail*: p99, p999, not the average.)
- **Throughput** — how many requests/second can it sustain?
- **Consistency** — do all readers see the same data, and how quickly after a write?
- **Durability** — once you've acknowledged a write, will the data survive disk failures, reboots, and disasters?
- **Maintainability** — can the team understand, change, and operate it without fear?
- **Cost** — what does it cost to run, and does the cost scale sanely with usage?

Most real design is **trading these against each other**. You cannot maximize all of them at once. Lower latency often costs money (more caching, more replicas). Stronger consistency often costs availability or latency. The skill is choosing *which* to sacrifice for a given product, and being able to say why.

:::tip[The single most important habit]
Before you draw a single box, ask "what are the requirements?" — both functional (what it does) and non-functional (how well, at what scale). A design is only "good" or "bad" relative to its requirements.
:::

## The NFR reference table

Each NFR has a primary "lever" (how you buy it) and a cost (what it takes away from you):

| NFR | How you "buy" it | What it costs / trades against |
|---|---|---|
| **Scalability** | Horizontal sharding, stateless services, auto-scaling groups | Complexity, eventual consistency, higher operational overhead |
| **Availability** | Redundancy, multi-AZ/multi-region replication, health checks + failover | Cost (more hardware), consistency (replicas may lag), complexity |
| **Reliability** | Retries with idempotency, circuit breakers, graceful degradation, chaos testing | Engineering time, added latency on retries |
| **Latency** | Caching (Redis, CDN), co-location, read replicas, connection pooling | Cost, stale data risk, consistency weakened at cache layer |
| **Throughput** | Async queues (Kafka), batching, write-ahead logs, horizontal write sharding | Latency increases for individual writes, delivery complexity |
| **Consistency** | Synchronous replication, consensus protocols (Raft/Paxos), distributed transactions | Availability (must block or reject during partitions), latency |
| **Durability** | Write-ahead logging, fsync, replication factor ≥ 3, cross-region backups | Write latency (waiting for fsync/acks), storage cost |
| **Maintainability** | Clear service boundaries, observability (metrics/traces/logs), runbooks, CI/CD | Up-front engineering time, slower initial delivery |
| **Cost** | Right-sizing, spot instances, tiered storage, caching to avoid DB hits | Risk of under-provisioning, engineering complexity to optimise |

:::note[Reading the table]
The "costs" column is not a list of things to avoid — it is a list of *explicit decisions*. A senior engineer can say "I am weakening consistency here in order to hit latency targets, and here is why that is acceptable for this feature." A junior engineer weakens consistency accidentally and finds out in production.
:::

## NFRs conflict — every design is a deliberate tradeoff

You cannot tune all nine NFRs to their maximum simultaneously. Some of the most common tensions:

- **Consistency vs Availability** — To guarantee every read returns the latest write, you must refuse requests when a network partition occurs (CP). To always answer, you must accept that some answers may be stale (AP). You choose one.
- **Durability vs Latency** — Calling `fsync` before acknowledging a write is safe but slow. Acknowledging before flushing is fast but risks losing the write if the machine crashes before the flush. Many databases let you configure this trade-off per workload.
- **Scalability vs Consistency** — Sharding data across nodes makes writes faster but makes it harder to do cross-shard transactions or enforce global constraints.
- **Cost vs Everything else** — Every extra nine of availability, every cache layer, every standby replica costs money. Cost is the budget that all other NFRs spend from.

The takeaway: there is no universally "good" design. There is only "appropriate for these requirements."

## Worked example: bank ledger vs social feed

Consider two very different products built on similar infrastructure. Which NFRs dominate?

**Bank ledger** (e.g., your account balance and transaction history)

- *Must have:* **Consistency** (two reads of your balance must agree), **Durability** (an acknowledged transfer must never disappear), **Reliability** (incorrect results are worse than an outage).
- *Can relax:* **Availability** slightly (a few seconds of downtime to avoid a wrong balance is acceptable), **Latency** (100–200 ms for a transfer confirmation is fine).
- *Design consequence:* synchronous replication, ACID transactions, CP datastores (PostgreSQL, Spanner). You pay with latency and availability, and that is the right trade.

**Social feed** (e.g., a Twitter/X home timeline)

- *Must have:* **Availability** (the feed must always load, even if slightly stale), **Throughput** (millions of users reading simultaneously), **Scalability** (global reach).
- *Can relax:* **Consistency** (seeing a post 2 seconds late is fine), **Durability** at the edge (a like count being off by one is acceptable).
- *Design consequence:* eventual consistency, AP datastores (Cassandra, DynamoDB), pre-computed fan-out caches. You pay with stale reads, and that is the right trade.

The same engineering team, using the same databases, makes opposite choices — because the products have opposite requirements.
