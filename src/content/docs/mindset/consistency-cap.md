---
title: "2 · Consistency, CAP & Correctness"
description: "CAP theorem, PACELC, consistency models, ACID vs BASE, and isolation levels — the vocabulary of data correctness in distributed systems."
---

## CAP theorem

In a distributed system you can have at most two of: **Consistency** (every read sees the latest write), **Availability** (every request gets a non-error response), **Partition tolerance** (the system keeps working despite network failures between nodes).

The honest framing: networks *will* partition, so **P is not optional** for any real distributed system. The real choice during a partition is **C vs A**:

- **CP** — refuse to serve (or block) rather than return possibly-stale/wrong data. Choose this when correctness is non-negotiable: banking ledgers, inventory, anything where being wrong is worse than being down. (e.g., traditional RDBMS, ZooKeeper, etcd, MongoDB by default.)
- **AP** — always answer, accept that some answers may be stale and reconcile later. Choose this when availability beats perfect freshness: social feeds, product catalogs, DNS, shopping carts. (e.g., Cassandra, DynamoDB, Riak.)

## PACELC — the more useful version

CAP only describes behavior *during a partition*. **PACELC** extends it: *if Partitioned, choose A or C; **E**lse (normal operation), choose **L**atency or **C**onsistency.* This matters because most of the time there's no partition, and you're still trading consistency for speed every time you add a replica or a cache. This is the tradeoff you actually face daily.

## Consistency models (from strong to weak)

- **Strong / linearizable:** every read returns the most recent write, as if there were a single copy. Easiest to reason about, most expensive (needs coordination, hurts latency/availability).
- **Causal:** operations that are causally related are seen in order by everyone; unrelated ones may differ. A good middle ground.
- **Eventual:** if writes stop, all replicas eventually converge. Cheapest and most available; readers may see stale data for a while. Fine for likes, view counts, feeds.

Client-centric guarantees worth knowing by name: **read-your-own-writes** (you always see your own updates — critical for UX after a user edits something), **monotonic reads** (you never see time go backwards), **monotonic writes** (your writes apply in order).

## ACID vs BASE

- **ACID** (classic relational transactions): **A**tomicity (all-or-nothing), **C**onsistency (constraints upheld), **I**solation (concurrent txns don't corrupt each other), **D**urability (committed data survives crashes).
- **BASE** (the NoSQL philosophy): **B**asically **A**vailable, **S**oft state, **E**ventual consistency. Trades strict guarantees for scale and availability.

## Isolation levels (the I in ACID, in practice)

From weakest to strongest, each prevents more anomalies at more cost:

- **Read Uncommitted** — can see uncommitted changes (*dirty reads*). Rarely used.
- **Read Committed** — only see committed data; default in many databases.
- **Repeatable Read** — re-reading a row in a transaction returns the same value (prevents *non-repeatable reads*).
- **Serializable** — transactions behave as if run one at a time. Strongest, slowest; prevents *phantom reads*.

You don't need to memorize the anomaly matrix, but you should know that "the database has a transaction" does not automatically mean "fully isolated" — the default is usually a weaker level, and choosing the level is a real decision.
