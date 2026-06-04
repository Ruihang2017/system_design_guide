---
title: "Concept → Tradeoff Flashcards"
description: Self-test cards covering the key system design concepts and their tradeoffs, organized by area.
---

Read the question, answer in your head, then expand to check. Aim to re-derive the tradeoff, not memorize it.

## Foundations & NFRs

<details>
<summary>What are the core non-functional requirements (NFRs) and why can't you maximize all of them?</summary>

The nine NFRs are: scalability, availability, reliability, latency, throughput, consistency, durability, maintainability, and cost. They conflict: lower latency costs money (more caching, more replicas); stronger consistency costs availability or latency; higher throughput may require relaxing durability. Every design is a set of deliberate tradeoffs relative to what the product actually needs — there is no universally "good" design.

</details>

<details>
<summary>Vertical vs horizontal scaling — what's the tradeoff?</summary>

Vertical (scale up) = bigger machine, simpler, no code changes, but a hard ceiling and a single point of failure. Horizontal (scale out) = more machines behind a load balancer, near-unlimited ceiling and built-in redundancy, but forces statelessness, distribution of state, coordination, and consistency work. Almost all large systems scale horizontally. The enabler is making services stateless — push all per-client state to a shared store.

</details>

<details>
<summary>Availability "nines" — what does each level mean in practice and why does chaining services matter?</summary>

99% ≈ 3.65 days of downtime per year; 99.9% ≈ 8.77 hours; 99.99% ≈ 52.6 minutes; 99.999% ≈ 5.26 minutes. Each extra nine is roughly 10× harder and more expensive. Critically, availability of a chain of dependencies multiplies: four services at 99.9% gives 0.999⁴ ≈ 99.6% effective availability. This is why minimizing dependencies and adding redundancy matter so much.

</details>

<details>
<summary>Latency numbers intuition — memory vs SSD vs disk vs cross-region, and why does it matter?</summary>

RAM access ≈ 100 ns; SSD random read ≈ 150 µs; HDD seek ≈ 10 ms; same-datacenter round trip ≈ 0.5 ms; cross-continent (CA↔EU) ≈ 150 ms. Memory is ~100× faster than SSD and ~100,000× faster than HDD. Cross-region is ~300× slower than cross-datacenter. These ratios are why caching, keeping data in memory, and avoiding cross-region synchronous calls dominate performance work.

</details>

<details>
<summary>Back-of-envelope estimation — what order do you estimate in and why separate reads from writes?</summary>

Estimate in this order: (1) traffic — DAU → requests/day → req/s, separating reads from writes and accounting for peak (often 2–5× average); (2) storage — bytes/record × records/day × retention × replication factor; (3) bandwidth; (4) cache size (the hot 20% that serves 80% of reads). Read:write ratio (often 10:1 or 100:1) fundamentally changes the design: read-heavy systems need caching and read replicas; write-heavy systems need efficient write paths and sharding.

</details>

## Consistency & CAP

<details>
<summary>CAP theorem — what's the real choice, and when do you pick CP vs AP?</summary>

Networks will partition, so P is not optional — the real choice during a partition is C vs A. CP: refuse to serve (or block) rather than return stale/wrong data. Choose when correctness is non-negotiable: banking ledgers, inventory, distributed locks (ZooKeeper, etcd). AP: always answer, accept some answers may be stale and reconcile later. Choose when availability beats perfect freshness: social feeds, DNS, product catalogs, shopping carts (Cassandra, DynamoDB, Riak).

</details>

<details>
<summary>PACELC — why is it more useful than CAP?</summary>

CAP only describes behavior during a partition. PACELC extends it: if Partitioned, choose A or C; Else (normal operation), choose Latency or Consistency. This matters because most of the time there is no partition — and you are still trading consistency for speed every time you add a replica or a cache. PACELC is the tradeoff you actually face daily in normal operation.

</details>

<details>
<summary>Strong vs causal vs eventual consistency — when is each appropriate?</summary>

Strong/linearizable: every read returns the most recent write, as if one copy exists. Easiest to reason about, most expensive (needs coordination, hurts latency and availability). Causal: causally related operations are seen in order by everyone; a good middle ground. Eventual: if writes stop, all replicas converge; cheapest and most available, readers may see stale data. Use strong for financial transactions and distributed locks; causal for collaborative editing and messaging threads; eventual for likes, view counts, feeds.

</details>

<details>
<summary>Read-your-own-writes and monotonic reads — why do they matter for UX?</summary>

Read-your-own-writes guarantees you always see your own updates — critical for UX after a user edits their profile or posts a comment and immediately views it. Monotonic reads guarantees you never see time go backwards (once you've seen a value, a later read won't return an older one). Both are client-centric guarantees that can be violated in systems with replication lag, and the violations produce disorienting user experiences.

</details>

<details>
<summary>ACID vs BASE, and isolation levels — what do they each give up?</summary>

ACID (relational transactions): Atomicity (all-or-nothing), Consistency (constraints upheld), Isolation (concurrent transactions don't corrupt each other), Durability (committed data survives crashes). BASE (NoSQL philosophy): Basically Available, Soft state, Eventual consistency — trades strict guarantees for scale and availability. Isolation levels from weakest to strongest: Read Uncommitted (dirty reads) → Read Committed (default in many DBs) → Repeatable Read (no non-repeatable reads) → Serializable (behaves as if sequential, slowest). "The DB has transactions" does not mean fully isolated — the default is usually a weaker level.

</details>

## Databases

<details>
<summary>SQL vs NoSQL — what's the honest default and when do you actually switch?</summary>

Default to relational (PostgreSQL, MySQL) until you have a concrete reason not to: it gives structured tables, joins, ACID transactions, and complex queries. Switch to NoSQL when you have a specific mismatch: key-value (Redis, DynamoDB) for blazing fast lookups by key; document (MongoDB) for flexible schemas and semi-structured data; wide-column (Cassandra) for massive write throughput and time-series data; graph (Neo4j) for relationship-heavy queries. "We'll need NoSQL someday" is not a reason — NoSQL trades joins and transactions for horizontal scale and flexibility; make sure that's the trade you need.

</details>

<details>
<summary>B-tree vs LSM-tree — when does each win?</summary>

B-tree (B+tree): balanced, sorted, read-optimized; great for range queries and point lookups; used by most relational databases (PostgreSQL, MySQL). LSM-tree (Log-Structured Merge): buffers writes in memory, flushes sorted SSTables to disk, merges in the background; write-optimized; used by Cassandra, RocksDB, LevelDB. The tradeoff: faster writes with LSM, but reads may touch multiple files (mitigated with Bloom filters). Choose the index engine that matches your dominant workload.

</details>

<details>
<summary>Single-leader vs multi-leader vs leaderless replication — tradeoffs and replication lag?</summary>

Single-leader: all writes to the leader, reads from followers (read scaling); simple, but followers lag behind the leader creating an eventual-consistency window, and leader failure requires failover. Multi-leader: multiple nodes accept writes (e.g., one per region); better write locality, but you must resolve write conflicts. Leaderless (Dynamo-style, Cassandra): any replica accepts reads/writes; use quorums — if R + W > N, reads are guaranteed to see the latest write; tunable consistency at the cost of complexity. Replication lag is the core risk in all async replication; the appropriate model depends on conflict tolerance and latency requirements.

</details>

<details>
<summary>Range vs hash partitioning and consistent hashing with virtual nodes — tradeoffs?</summary>

Range partitioning: by key range (A–F on shard 1, etc.); good for range scans but risks hot spots if traffic clusters in one range. Hash partitioning: hash the key to pick a shard; even distribution but loses efficient range queries. Consistent hashing maps both keys and nodes onto a ring so adding or removing a node reshuffles only a small fraction of keys instead of remapping everything. Virtual nodes smooth out distribution and handle heterogeneous hardware. This is how distributed caches and databases add or remove capacity gracefully.

</details>

<details>
<summary>Hot key / hot shard problem — what causes it and how do you mitigate it?</summary>

A single celebrity user, a viral item, or a bad partition key concentrates load on one shard, overwhelming it while others sit idle. Mitigations: choose a better partition key (add a random salt prefix to spread load, strip it at read time); split the hot key across multiple logical keys and aggregate; add a per-key in-process or distributed cache layer in front; use local caches in application servers for the top-N hot keys.

</details>

<details>
<summary>Denormalization, OLTP vs OLAP — when do you move data and why?</summary>

Denormalization duplicates data to avoid expensive joins — trades storage and write complexity for read speed; appropriate when reads vastly outnumber writes and join latency is the bottleneck. OLTP (Online Transaction Processing): many small fast read/write transactions, your application's primary database, row-oriented. OLAP (Online Analytical Processing): few huge analytical queries scanning billions of rows, your data warehouse (Snowflake, BigQuery, Redshift), column-oriented. Never run heavy analytics on your production OLTP database; pipe data into a warehouse via ETL or change-data-capture instead.

</details>

<details>
<summary>Object storage — when do you use it instead of a database?</summary>

For large unstructured files (images, video, backups, logs) use object storage (S3 and equivalents), not a database. It is cheap, effectively infinite, durable, and pairs naturally with a CDN. The pattern: store the file in object storage and store only the metadata and URL in your primary database. Trying to store blobs in a relational database bloats the DB, kills performance, and makes replication expensive.

</details>

## Caching

<details>
<summary>Cache-aside vs read-through vs write-through vs write-back vs write-around — when is each right?</summary>

Cache-aside (lazy loading): app checks cache, on miss reads DB and populates cache — most common, only requested data cached, brief staleness window after updates. Read-through: cache fetches from DB on miss, cleaner app code. Write-through: write to cache and DB together synchronously, cache always fresh but writes are slower. Write-back (write-behind): write to cache immediately, flush to DB async — very fast writes but risk data loss if cache dies before flush. Write-around: write straight to DB, skip cache — good when written data is not read soon. Match the strategy to your read/write pattern and acceptable data loss.

</details>

<details>
<summary>Cache eviction (LRU vs LFU) and cache invalidation — why is invalidation hard?</summary>

LRU (least recently used): evict what was accessed least recently — the default and usually right for temporal locality. LFU (least frequently used): evict what is accessed least often — better for stable working sets. Cache invalidation is hard because the cache must stay consistent with the source of truth across distributed nodes without a synchronization primitive. Tools: TTLs (accept bounded staleness), write-through (invalidate or update on write), explicit invalidation on update, versioned/namespaced keys. There is no perfect solution — you choose the staleness window you can tolerate.

</details>

<details>
<summary>Cache stampede, cache penetration, and hot key in caches — what are they and how do you fix them?</summary>

Cache stampede (thundering herd): a popular key expires and thousands of simultaneous misses all hammer the DB. Fixes: request coalescing (one request rebuilds while others wait), staggered/jittered TTLs, serve stale-while-revalidate. Cache penetration: repeated queries for keys that don't exist bypass the cache and hit the DB on every request. Fixes: cache the "not found" result, or front the cache with a Bloom filter to short-circuit definitely-absent keys. Hot key: a single key gets disproportionate traffic. Fixes: replicate that key across cache nodes, or add a local in-process cache in application servers.

</details>

## Messaging

<details>
<summary>Queue vs pub/sub — when do you use each?</summary>

Message queue (point-to-point): one producer, one consumer takes the message; for distributing work (task queues) and buffering bursts so a slow downstream doesn't drop requests. Pub/sub: one producer publishes to a topic, many subscribers each get a copy; for broadcasting events so multiple services can react independently ("order placed" → email service, analytics, inventory). Kafka is a durable, partitioned commit log — extremely high throughput, retains messages, supports consumer groups, ordering within a partition, and is the backbone of event-driven and streaming architectures.

</details>

<details>
<summary>At-least-once delivery + idempotency — why is this the common practical choice?</summary>

At-most-once: may lose messages, never duplicates (fire and forget). At-least-once: never loses messages, may duplicate — the common practical choice. Exactly-once: never loses, never duplicates — genuinely hard and often achieved as "at-least-once delivery + idempotent processing." Because at-least-once is normal, idempotency is essential: design operations so processing the same message twice has the same effect as once (e.g., "set balance to X" is idempotent; "add $10" is not — make it idempotent with a dedup key).

</details>

<details>
<summary>Dead-letter queue, backpressure, and batch vs stream processing — what problem does each solve?</summary>

DLQ (dead-letter queue): messages that keep failing are moved aside for inspection instead of blocking the queue forever — prevents one bad message from poisoning the pipeline. Backpressure: when consumers can't keep up, push back rather than melt down — buffer, shed load, or signal producers to slow down. Batch processing (Spark): large bounded datasets processed periodically — high throughput, high latency. Stream processing (Kafka Streams, Flink): events processed continuously as they arrive — low latency, lower throughput. Many systems use both (Lambda/Kappa architectures).

</details>

## Architecture

<details>
<summary>Monolith vs microservices — when do you actually make the switch?</summary>

Monolith: one deployable application — simple to build, test, deploy, and reason about; fast in-process calls; easy transactions. The right starting point for most products. Pain shows when a team needs to redeploy the whole application for any change, teams step on each other, or parts cannot scale independently. Microservices: each service owns its domain and data, deployed independently — enables independent scaling, team autonomy, fault isolation. The costs are heavy: network latency and failure between services, no easy joins or transactions, operational complexity. The mature take: start with a well-structured monolith; extract microservices when you feel concrete pain, not before.

</details>

<details>
<summary>2PC vs Saga for distributed transactions — what does each sacrifice?</summary>

Two-Phase Commit (2PC): a coordinator asks all participants to prepare then commit — strong consistency, but blocking (if the coordinator dies mid-flight, participants are stuck), and the coordinator is a SPOF. Avoided at scale. Saga: a sequence of local transactions each with a compensating action to undo it if a later step fails. Two flavors: choreography (services react to each other's events) and orchestration (a central coordinator drives steps). Sagas give eventual consistency, not atomicity — you must design compensating actions for every step and accept temporary inconsistency.

</details>

<details>
<summary>CQRS and event sourcing — what do they buy and what do they cost?</summary>

CQRS (Command Query Responsibility Segregation): separate the write model from the read model so each can be optimized and scaled independently — powerful when read and write needs genuinely diverge (different data shapes, different scale requirements), but adds complexity by requiring synchronization between the two models. Event sourcing: store the sequence of events (state changes) as the source of truth rather than current state; rebuild state by replaying events — gives a full audit log and time travel at the cost of complexity and potential replay performance issues. Often paired together; use when the audit/history or divergent scaling requirements genuinely justify the overhead.

</details>

## Reliability

<details>
<summary>SPOF and redundancy — active-passive vs active-active?</summary>

A single point of failure (SPOF) is any component whose failure takes down the system. Remove SPOFs with redundancy: run multiple instances across multiple availability zones or regions. Active-passive: a standby takes over when the primary fails — simpler to implement, some failover delay, primary sits idle. Active-active: all instances serve traffic simultaneously — better utilization and instant failover, but needs careful state coordination and conflict resolution. Active-active is harder but eliminates the failover delay and idle capacity.

</details>

<details>
<summary>Circuit breaker and bulkhead — how do they stop failures from cascading?</summary>

Circuit breaker: if a dependency keeps failing, open the circuit and fail fast for a while instead of hammering it; periodically test (half-open state) before closing again. Prevents one sick service from dragging everything else down via a pile-up of slow, blocked threads. Bulkhead: isolate resources (thread pools, connection pools) per dependency so one overloaded dependency cannot starve the rest — like watertight compartments in a ship. Together they bound the blast radius of any single failing dependency.

</details>

<details>
<summary>Retry with exponential backoff and jitter — why does jitter matter?</summary>

Retry transient failures, but back off with increasing delays (exponential backoff) so you don't hammer a struggling service. Add randomness (jitter) so all clients don't synchronize their retries at the same moment — a "retry storm" from synchronized retries can be as damaging as the original failure. Without jitter, every client backs off to the same interval and fires at the same time; with jitter, retries spread out and the recovering service gets a gentler ramp-up.

</details>

<details>
<summary>Token bucket vs leaky bucket rate limiting — what's the key difference?</summary>

Token bucket: tokens refill at a steady rate up to a cap; each request consumes one token. Allows controlled bursts up to the bucket capacity while enforcing an average rate. Leaky bucket: requests queue and drain at a constant rate regardless of arrival pattern. Smooths bursts into a perfectly steady output stream. Token bucket is better when you want to permit short bursts (API clients making a batch of requests); leaky bucket is better when the downstream service needs a perfectly smooth input rate (e.g., hardware interfaces, billing).

</details>

<details>
<summary>RPO vs RTO — how do they drive disaster recovery design?</summary>

RPO (Recovery Point Objective): how much data you can afford to lose — drives backup frequency and replication strategy. If RPO is zero you need synchronous replication; if RPO is one hour you can use hourly backups. RTO (Recovery Time Objective): how fast you must be back up after a failure — drives standby and failover strategy. A low RTO requires hot standbys and automated failover; a high RTO tolerates restoring from backup. These two numbers should be agreed with the business before designing the recovery architecture, because achieving low RPO and RTO simultaneously is expensive.

</details>

<details>
<summary>The three observability pillars and SLI/SLO/SLA + error budget — how do they connect?</summary>

Logs: discrete timestamped events, great for debugging individual requests, expensive at volume. Metrics: numeric time-series aggregates (request rate, error rate, latency percentiles), cheap and ideal for dashboards and alerts. Traces: the path of a single request across all services with per-hop timing — essential for diagnosing latency in microservices. SLI is a measured signal ("% of requests under 200 ms"). SLO is your internal target ("99.9% under 200 ms"). SLA is the external contract with consequences. Error budget (100% − SLO) turns reliability into a currency: budget left means ship features faster; budget burned means slow down and stabilize first.

</details>

<details>
<summary>Blue-green vs canary deployment — what does each protect against?</summary>

Blue-green: run two identical environments; switch all traffic from old (blue) to new (green) instantly — enables instant rollback by switching back, but requires double the infrastructure and a sharp cutover. Canary: release to a small percentage of users first, watch metrics, then ramp up — catches issues before they affect all users and enables a gradual rollout, but the rollout is slower and you must have good metrics to know when to proceed. Feature flags decouple deploy from release — ship code dark, turn it on gradually, and kill it instantly without a redeploy.

</details>

## Specialized Components

<details>
<summary>Inverted index — what is it and why is it the key to full-text search?</summary>

An inverted index maps each term to the list of documents containing it — the inverse of a document-to-words mapping. This lets a search engine answer "which documents contain X" in O(1) by looking up X in the index, instead of scanning every document. Elasticsearch (built on Lucene) is the standard implementation. Use it alongside your primary database as a read-optimized secondary index for text search, not as your primary store.

</details>

<details>
<summary>Geospatial indexing (geohash / quadtree) — why can't a regular index handle "find nearby"?</summary>

Ordinary indexes work on one dimension; proximity search is inherently two-dimensional (latitude + longitude). Geohash encodes lat/long into a string where shared prefixes mean physical proximity — you can find nearby points by looking up a prefix. Quadtrees recursively subdivide 2D space into four quadrants, storing points in leaf nodes — efficient for "all points within radius R." Both trade some precision for query speed. This is what powers "find nearby drivers," "nearby restaurants," and ride-sharing matching.

</details>

<details>
<summary>UUID vs Snowflake IDs — what's the tradeoff for distributed unique ID generation?</summary>

Auto-increment IDs don't work across shards and leak counts. UUID: 128-bit random, no coordination required, globally unique, but large (16 bytes), unsortable, and causes index fragmentation in B-tree databases. Snowflake (Twitter): a 64-bit ID composed of timestamp + machine ID + per-millisecond sequence number — roughly time-sortable, unique across machines with no central bottleneck, compact (8 bytes). Snowflake-style IDs are the standard answer for distributed systems because they are sortable, compact, and require no coordination beyond machine ID assignment.

</details>

<details>
<summary>Bloom filter, HyperLogLog, and count-min sketch — what does each estimate and what's the error model?</summary>

All three trade a little accuracy for huge memory savings. Bloom filter: "is X possibly in the set?" — no false negatives (if it says absent, X is definitely absent), some false positives (if it says present, X might not be). Used to avoid pointless DB/cache lookups for definitely-absent keys. HyperLogLog: estimates the count of distinct items (cardinality) in kilobytes instead of gigabytes — for "unique visitors" at scale, with ~2% error. Count-min sketch: estimates item frequencies in sublinear space — for "top-K" / heavy-hitter detection. Choose by what you're measuring: membership, cardinality, or frequency.

</details>

<details>
<summary>Push vs pull fan-out — what's the celebrity problem and how does the hybrid solve it?</summary>

Pull (fan-out on read): build the timeline when the user opens the app — cheap writes, but expensive reads especially for users following thousands of accounts. Push (fan-out on write): when you post, immediately write to every follower's precomputed timeline — instant feed reads, but a user with 100M followers triggers 100M writes per post (the celebrity problem). Hybrid: push for normal users, pull for celebrities — at read time merge the pushed timeline with the latest posts from the few celebrities followed. This captures both benefits and sidesteps the write explosion; recognizing that one strategy does not fit all users is the key senior-level insight.

</details>
