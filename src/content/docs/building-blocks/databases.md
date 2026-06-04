---
title: "4 · Databases & Storage"
description: The heart of system design — SQL vs NoSQL, indexing internals, replication, sharding, OLTP vs OLAP, and when to reach for object storage.
---

This is the heart of system design. Most hard problems are data problems.

## SQL (relational) vs NoSQL

**Relational (PostgreSQL, MySQL):** structured tables, fixed schema, **joins**, and strong **ACID** transactions. Choose when: data is highly structured and relational, you need complex queries and transactional integrity, and consistency matters (finance, orders, anything with invariants). Traditionally scaled vertically; scales horizontally with more effort (read replicas, then sharding).

**NoSQL** is an umbrella for four shapes:

- **Key-value (Redis, DynamoDB):** a giant hash map. Blazing fast lookups by key. For caching, sessions, simple high-throughput lookups.
- **Document (MongoDB):** stores JSON-like documents, flexible schema. For semi-structured data, content, catalogs, fast iteration.
- **Wide-column (Cassandra, HBase, Bigtable):** rows with dynamic columns, partitioned across many nodes. For massive write throughput and time-series/event data at scale.
- **Graph (Neo4j):** nodes and edges as first-class citizens. For relationship-heavy queries (social graphs, fraud rings, recommendations).

The honest rule of thumb: **default to relational** until you have a concrete reason not to (scale, schema flexibility, or a specific access pattern). "We'll need NoSQL someday" is not a reason. NoSQL trades joins/transactions for horizontal scale and flexibility — make sure that's the trade you actually need.

## Indexing

An index is a data structure that makes reads fast at the cost of slower writes and extra storage (the database maintains the index on every write). Two dominant internals:

- **B-tree / B+tree:** balanced, sorted, read-optimized. Great for range queries and point lookups. Used by most relational databases.
- **LSM-tree (Log-Structured Merge tree) + SSTables:** buffers writes in memory, flushes sorted files to disk, merges them in the background. **Write-optimized.** Used by Cassandra, RocksDB, LevelDB. The tradeoff: faster writes, but reads may touch multiple files (mitigated with Bloom filters).

Knowing "B-tree = read-optimized, LSM = write-optimized" lets you justify a database choice from the workload.

## Replication (copies for availability and read scaling)

- **Single-leader (leader-follower / primary-replica):** all writes go to the leader, which streams changes to followers. Reads can be served by followers → **read scaling**. If the leader dies, a follower is promoted (**failover**). The catch: **replication lag** means followers can be slightly stale (an eventual-consistency window).
- **Multi-leader:** multiple nodes accept writes (e.g., one per region). Better write availability and locality, but you must resolve **write conflicts**.
- **Leaderless (Dynamo-style, e.g., Cassandra):** any replica accepts reads/writes; use **quorums** — if you write to W replicas and read from R, and `R + W > N` (N = total replicas), reads are guaranteed to see the latest write. Tunable consistency.

## Partitioning / sharding (splitting data across machines)

When data or write load outgrows one machine, split it into **shards**, each on its own node. Strategies:

- **Range partitioning:** by key range (A–F on shard 1, etc.). Good for range scans; risks **hot spots** if traffic clusters in one range.
- **Hash partitioning:** hash the key to pick a shard. Even distribution; loses efficient range queries.
- **Directory/geo partitioning:** explicit lookup table, or by region.

**Consistent hashing** is the key technique: it maps both keys and nodes onto a ring so that adding or removing a node only reshuffles a small fraction of keys (instead of remapping everything). **Virtual nodes** smooth out the distribution. This is how distributed caches and databases add/remove capacity gracefully.

The recurring villain is the **hot shard / hot key** — one celebrity user, one viral item, or a bad partition key concentrating load. Mitigations: better key choice, splitting hot keys, adding a per-key cache, or salting.

Other tools: **denormalization** (duplicating data to avoid expensive joins — trade storage and write complexity for read speed), and **federation** (splitting databases by feature/function rather than by row).

## OLTP vs OLAP

- **OLTP (Online Transaction Processing):** many small, fast read/write transactions — your application's primary database. Row-oriented.
- **OLAP (Online Analytical Processing):** few huge analytical queries scanning lots of data — your **data warehouse** (Snowflake, BigQuery, Redshift). Column-oriented (reading a few columns over billions of rows is cheap).

Don't run heavy analytics on your production OLTP database; pipe data into a warehouse instead (via ETL/ELT or change-data-capture).

## Object/blob storage

For large unstructured files (images, video, backups, logs), use **object storage** (S3 and equivalents), not a database. It's cheap, effectively infinite, durable, and pairs naturally with a CDN. Store the *file* in object storage and just the *metadata + URL* in your database.
