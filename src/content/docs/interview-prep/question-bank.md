---
title: "System Design Question Bank"
description: "A curated bank of classic system-design interview prompts, grouped by category, with clarifying questions and the central tradeoff for each."
---

Work through each prompt using the [framework](/method/framework/) and [interview checklist](/method/interview-checklist/). Set a timer for ~45 minutes, write your own design first, then look up references. The goal is to internalize the tradeoff at the core of each problem — not to memorize a canonical answer.

## Read-heavy

### Design a URL Shortener (TinyURL)

- **What it tests:** key generation at scale, cache-heavy read path, redirect semantics
- **Clarify first:**
  - What is the expected read:write ratio? (Typically ~100:1)
  - Do you need analytics on clicks, and how fresh must they be?
  - Are custom aliases and expiration required?
  - What availability is expected for redirect failures?
- **The crux:** choosing a key-generation strategy (counter + Base62, hash, or a key-generation service) without creating a single-point-of-failure bottleneck, then deciding between 301 (browser-cached, no analytics) and 302 (server-routed, analytics-friendly) redirects.

(see [URL Shortener case study](/case-studies/url-shortener/) and [databases](/building-blocks/databases/), [caching](/building-blocks/caching/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Create short codes from long URLs; redirect short codes to the original URL. Non-functional drivers: 100:1 read-to-write ratio (optimise the read path ruthlessly), 99.99% availability (a broken redirect is immediately visible), redirect p99 under 10 ms from cache.

**Estimation.** 100 M new URLs/day ≈ 1,200 writes/s; at 100:1 that is ~120,000 reads/s average, ~350,000 at peak. Five years of records at 500 B each ≈ 91 TB — rules out anything that cannot scale storage independently. A 99% cache hit rate cuts KV-store load from 350 K/s to 3,500/s, making caching the single highest-leverage decision.

**API.** `POST /api/shorten` → `{ short_url }` (201); `GET /{short_code}` → 301/302 redirect or 410 if expired; `GET /api/links/{short_code}/stats` → click analytics (optional).

**Data model & storage.** One record: `(short_code PK, long_url, created_at, expiry, owner_id)`. The access pattern is an exclusive point lookup on `short_code` — no joins, no ordering. A key-value / wide-column store (DynamoDB or Cassandra keyed by `short_code`) is the natural fit; a sharded relational DB works if the team already operates one. Analytics events are append-only time-series and must live in a separate store (ClickHouse / Cassandra time-series schema), never in the redirect table.

**High-level design.** Write path: client → load balancer → app server → Key Generation Service (KGS) → KV store. Read path: client → CDN edge (hit → immediate redirect) → load balancer → app server → Redis cache (hit → redirect) → KV store (miss) → populate cache → redirect; app server also fires a click event onto a message queue asynchronously, invisible to redirect latency.

**Deep dive — key generation.** Three options: (1) hash the long URL to Base62 — deterministic but requires a read-before-write collision check; (2) distributed counter + Base62 with range allocation — each app server claims 10,000 IDs from a coordinator and hands them out locally, eliminating per-write coordination; (3) Key Generation Service — pre-generates a pool of unique codes, hands them out on request, cleanest on the write path but adds a stateful service. Recommended: KGS or range-allocated counter. On redirect semantics: 302 is analytics-friendly (every click hits the server); 301 lets browsers cache and never return, minimising load but losing analytics. The hybrid — serve 302 and push the click event to a queue — gives both low latency and full analytics.

**Bottlenecks & scaling.** Hot keys (a viral link generates millions of req/s to one Redis slot): mitigate with CDN caching as the first line of defence, then a small in-process LRU cache on each app server. KGS is a potential SPOF: run multiple instances with non-overlapping key ranges and have app servers hold a local buffer of ~10,000 pre-fetched codes so a KGS outage is invisible for seconds. KV store sharded by hash of `short_code` for even distribution.

See the [full URL Shortener case study](/case-studies/url-shortener/) for the deep dive.

</details>

---

### Design Pastebin

- **What it tests:** blob storage separation, read-heavy caching, expiry and cleanup
- **Clarify first:**
  - Maximum paste size? (affects whether you store inline in DB or in object storage)
  - Are pastes private, unlisted, or public?
  - Is full-text search over pastes required?
  - What retention policy — auto-expire or permanent?
- **The crux:** deciding where the content lives (database column vs. object storage) and how to serve it cheaply at scale — a CDN with aggressive caching works only if content is immutable, which drives the expiry-and-no-edit design.

(see [databases](/building-blocks/databases/), [caching](/building-blocks/caching/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Create a paste (text blob up to ~10 MB) identified by a short key; retrieve it by key; support expiry after a configurable duration; support public, unlisted, and private visibility. Non-functional drivers: read-heavy (popular pastes get many views after creation), immutable content after creation (drives CDN caching), cheap storage at scale (millions of pastes per day).

**Estimation.** Assume 5 M new pastes/day ≈ 58 writes/s; read:write ratio ~10:1 → ~580 reads/s average. Average paste size 10 KB → 5 M × 10 KB = ~50 GB/day raw storage, ~18 TB/year. The 10 MB maximum size means content cannot live comfortably in a relational row — object storage is mandatory for large pastes, but small pastes (median is a few KB) could be stored inline for simplicity; the rule of thumb is "inline up to 1 KB, otherwise object storage."

**API.** `POST /pastes` body `{ content, expiry_seconds, visibility }` → `{ paste_id, url }` (201); `GET /pastes/{paste_id}` → raw content (200) or 404/410; `DELETE /pastes/{paste_id}` (owner only).

**Data model & storage.** Two-tier: a metadata record `(paste_id PK, owner_id, created_at, expiry, visibility, content_url, content_size)` in a relational or key-value store, and the actual blob in object storage (S3/GCS) at a path derived from `paste_id`. Serving a paste: look up metadata, then redirect to a signed CDN URL (for private) or a public CDN URL (for public/unlisted). The content is immutable — once written, the blob never changes — which eliminates cache invalidation entirely.

**High-level design.** Write path: client → app server → generate `paste_id` (UUID or counter-based Base62) → upload blob to object storage → write metadata record → return URL. Read path: client → CDN (hit → serve blob directly) → app server → verify visibility/expiry from metadata DB → fetch from object storage → stream to client. For public pastes the CDN handles the vast majority of traffic after initial population.

**Deep dive — immutability as a caching superpower.** The core insight is that pastes are immutable after creation. This means: (1) CDN cache TTL can be set to the paste's expiry time — no invalidation is ever needed; (2) Redis can cache `paste_id → content` with TTL equal to expiry, with no stale-read risk; (3) content-addressed storage (storing blobs keyed by hash of content) enables cross-user deduplication — if two users paste the same source file, only one copy is stored. The no-edit constraint is not a limitation to apologise for — it is the design decision that makes the system cheap to run at scale. Full-text search, if required, is a separate problem: index extracted text in Elasticsearch off the write path via a queue consumer, never on the read path.

**Bottlenecks & scaling.** Expiry and cleanup: use lazy delete (check `expiry < now` on every read, return 410 and delete asynchronously if expired) plus a background sweeper that bulk-deletes expired records in off-peak windows. Object storage that supports native TTLs (S3 lifecycle rules) makes the sweeper nearly free. Hot pastes (viral links): CDN absorbs the spike — a popular paste served from edge nodes never touches the app servers. The metadata DB is the main SPOF; replicate with read replicas and cache metadata aggressively (immutable, so TTL-based caching is safe).

</details>

---

### Design Twitter / News Feed

- **What it tests:** fan-out strategies, feed precomputation, the celebrity problem
- **Clarify first:**
  - Chronological or ranked/algorithmic feed?
  - What is the follower count distribution — are there celebrities with millions of followers?
  - How stale can the feed be? (eventual consistency is usually fine)
  - What media types are in tweets?
- **The crux:** fan-out on write (push posts into every follower's prebuilt timeline cache — fast reads, explodes on celebrities) vs. fan-out on read (merge at query time — cheap writes, slow reads at scale); the mature answer is a hybrid that pushes for normal users and pulls from celebrities at read time.

(see [News Feed case study](/case-studies/news-feed/), [messaging](/building-blocks/messaging/), [caching](/building-blocks/caching/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Users post tweets (text + media); followers see a timeline of posts from accounts they follow. Non-functional drivers: massive fan-out (a single celebrity tweet must reach millions of followers), timeline read latency under 200 ms, eventual consistency on feed freshness is acceptable, 99.9% availability.

**Estimation.** 300 M daily active users; average user follows 300 accounts; peak timeline reads ~600 K/s. A celebrity with 50 M followers posting once generates 50 M timeline write operations — at 10 such celebrities posting per second, pure fan-out-on-write requires ~500 M writes/s to timeline caches, which is unsustainable for high-follower accounts. This single number forces the hybrid fan-out design.

**API.** `POST /tweets` body `{ text, media_ids }` → `{ tweet_id }` (201); `GET /timeline` query `?user_id&cursor&limit` → `{ tweets: [...], next_cursor }`; `POST /follows` body `{ followee_id }` → 200.

**Data model & storage.** Key tables: `tweets (tweet_id PK, author_id, content, created_at)` and `follows (follower_id, followee_id, created_at)` — both in a sharded relational DB or a distributed KV store. The timeline cache is a per-user sorted set in Redis (tweet_ids ordered by timestamp), not a persistent store. Media lives in object storage behind a CDN; only URLs are stored in the tweet record.

**High-level design.** Write path: client → app server → write tweet to DB → fan-out service reads follower list → for normal users, push `tweet_id` into each follower's Redis timeline cache. Read path: client → app server → fetch tweet_ids from Redis timeline cache → batch-fetch tweet content from tweet cache / DB → hydrate and return.

**Deep dive — hybrid fan-out.** Fan-out on write (push) delivers pre-built timelines: reads are O(1) but writing a celebrity tweet requires touching millions of Redis keys — write amplification is catastrophic at scale. Fan-out on read (pull) merges timelines at query time: cheap writes, but reading requires N database queries for N followees and cannot serve a 600 K/s read load. The mature solution is a hybrid: push for users with fewer than ~10,000 followers (the fast read path for 99.9% of users); for celebrities, store only their tweet in the DB and pull-merge their tweets in at read time. The read path checks "does any followee exceed the celebrity threshold?" and if so, fetches their recent tweets separately and merges into the pre-built timeline before returning. This keeps write amplification bounded while maintaining fast reads for normal accounts.

**Bottlenecks & scaling.** Celebrity problem on read: the merge step must be fast — cache the celebrity's last N tweets in a separate Redis key with a short TTL, so the merge is a cache lookup, not a DB query. Timeline cache hot keys: a user with 100 M followers loading their own timeline hits one Redis key; replicate hot keys across Redis slots. Follower list fan-out is a background job — use a message queue (Kafka topic per user-id partition) so a burst of popular posts does not block the write path. See the [full News Feed case study](/case-studies/news-feed/) for the deep dive.

</details>

---

### Design Instagram

- **What it tests:** media storage and delivery, social graph, feed generation
- **Clarify first:**
  - Are we focusing on photo/video upload, the feed, or both?
  - What are the target latencies for feed load vs. upload acknowledgment?
  - Is the feed chronological or ranked?
  - How large is the expected media payload (photo vs. video)?
- **The crux:** media must live in object storage behind a CDN, not in the database — the DB stores only metadata and URLs; feed generation then faces the same fan-out tradeoff as Twitter, compounded by the need to handle media asynchronously (transcoding, thumbnail generation).

(see [specialized components](/building-blocks/specialized-components/), [databases](/building-blocks/databases/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Users upload photos and short videos; followers see a feed of posts from followed accounts; users can like and comment. Non-functional drivers: media upload must be durable and processed asynchronously; feed read latency under 300 ms; CDN delivery for media is non-negotiable at global scale; eventual consistency on feed freshness is acceptable.

**Estimation.** 500 M daily active users; 100 M photos uploaded per day ≈ 1,160 uploads/s. Average photo 3 MB → 100 M × 3 MB = 300 TB/day raw media storage. Feed reads dwarf uploads — assume 10:1 read-to-write ratio → ~11,600 feed refreshes/s. Media cannot live in a database; 300 TB/day makes object storage + CDN mandatory from the start.

**API.** `POST /media/upload` → `{ upload_url }` (pre-signed S3 URL, client uploads directly); `POST /posts` body `{ media_ids, caption }` → `{ post_id }` (201); `GET /feed` query `?user_id&cursor` → `{ posts: [...], next_cursor }`; `POST /posts/{post_id}/likes` → 200.

**Data model & storage.** `posts (post_id PK, author_id, media_urls[], caption, created_at)` and `follows (follower_id, followee_id)` in a sharded relational DB. Media blobs in object storage (S3/GCS); only URLs stored in the post record. Feed is a per-user Redis sorted set of `post_ids` (score = timestamp). Likes can be an append-only counter in Redis or a `likes (user_id, post_id)` table for per-user dedup.

**High-level design.** Upload path: client gets a pre-signed URL from the app server → uploads directly to object storage (bypasses app servers entirely) → object storage triggers an async transcoding/thumbnail job → job writes processed media URLs back to DB → client polls or receives a webhook. Feed path: post created → fan-out service pushes `post_id` into each follower's Redis timeline (hybrid fan-out, same as Twitter/News Feed); read path fetches IDs from Redis, batch-fetches post metadata, and returns CDN URLs for media — the client fetches media directly from CDN.

**Deep dive — media pipeline and the database/object-storage split.** The central design decision is that media never lives in the database. The DB stores only metadata and CDN URLs; the actual bytes live in object storage. This split is essential: (1) object storage scales to petabytes cheaply; (2) CDN edge nodes can serve media with sub-50 ms latency globally; (3) the DB remains a fast metadata index, not a blob store. The async transcoding pipeline (resize originals to multiple resolutions, generate thumbnails, convert video to HLS segments) runs as a background job queue — users receive acknowledgment immediately on upload; processed media appears within seconds. The feed generation then faces the same fan-out tradeoff as Twitter: push for normal users, pull-merge for high-follower accounts at read time.

**Bottlenecks & scaling.** Media upload bottleneck: direct-to-S3 with pre-signed URLs bypasses app servers entirely, removing them from the upload hot path. CDN origin pull: cold media fetched from origin on first access — mitigate with eager warming of newly viral posts by pre-fetching to edge PoPs after upload. Social graph fan-out: same celebrity hybrid as News Feed — see [messaging](/building-blocks/messaging/) for queue-based fan-out patterns. Like counts: use Redis atomic increments for real-time display; periodically flush to the DB for durability.

</details>

---

## Write- / throughput-heavy

### Design an Ad-Click Aggregator

- **What it tests:** high-ingest event pipelines, approximate counting, deduplication
- **Clarify first:**
  - What is the click volume per second at peak?
  - Is exact counting required, or are approximate counts acceptable?
  - What is the query latency requirement for aggregated reports?
  - How long is click data retained, and do you need per-user dedup?
- **The crux:** raw click events arrive at millions per second and must be deduplicated and aggregated — writing every click transactionally to a relational DB is a bottleneck; the real answer is a streaming pipeline (Kafka ingestion → stream processor → approximate counters such as Count-Min Sketch for real-time, compacted to a warehouse for exact historical queries).

(see [messaging](/building-blocks/messaging/), [specialized components](/building-blocks/specialized-components/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Ingest ad-click events (ad_id, user_id, timestamp, IP) at high throughput; produce aggregated click counts queryable by ad and time window (last 1 min, 1 hr, 1 day); deduplicate repeated clicks from the same user on the same ad within a window. Non-functional drivers: very high ingest rate (millions of clicks/s at peak), query latency under 1 s for dashboards, eventual consistency on counts is acceptable, exact vs. approximate counts must be decided upfront.

**Estimation.** Assume 10 M clicks/s at peak across all ads. At 200 B per event → 2 GB/s raw ingest — writing each click transactionally to a relational DB is immediately ruled out. One year of raw click events at 10 M/s × 86,400 s × 365 = ~315 T events — storing every raw event long-term requires a columnar warehouse, not a row store. The key insight: real-time aggregation must happen in a streaming layer, not in the persistent store.

**API.** `POST /clicks` body `{ ad_id, user_id, timestamp, ip }` → 202 Accepted (fire-and-forget, no synchronous ack of persistence); `GET /ads/{ad_id}/clicks` query `?window=1h&granularity=1m` → `{ counts: [{ ts, count }, ...] }`; `GET /ads/{ad_id}/clicks/summary` → `{ total_1m, total_1h, total_24h }`.

**Data model & storage.** Three tiers: (1) message queue (Kafka): raw click events, partitioned by `ad_id` for ordered processing per ad; (2) stream processor (Flink or Kafka Streams): maintains in-memory sliding-window counters, emits per-window aggregates, handles deduplication; (3) results store: a time-series DB (ClickHouse, Apache Druid, or Redis sorted sets for small cardinality) for serving dashboard queries. Raw events are also forwarded to a data warehouse (BigQuery/Redshift) for exact historical queries and billing reconciliation.

**High-level design.** Click events arrive at a click collector service (lightweight HTTP → Kafka producer). Kafka partitions events by `ad_id`. Flink consumers read from Kafka, aggregate counts per `(ad_id, window)` using sliding windows, and write results to ClickHouse. Dashboard API reads from ClickHouse. Separately, a batch pipeline replays raw events nightly for exact reconciliation. The click collector is stateless; Kafka is the durability layer; the stream processor is where the intelligence lives.

**Deep dive — deduplication and approximate counting.** Exact deduplication at 10 M clicks/s requires tracking every `(user_id, ad_id)` pair seen in the current window — storing all pairs in memory is infeasible. Two approaches: (1) Bloom filter per `(ad_id, window)` slot — probabilistic, low memory (a Bloom filter for 1 M users is ~1.2 MB at 1% false-positive rate), accepts occasional phantom dedup failures, appropriate for impression metrics; (2) Count-Min Sketch for frequency estimation — gives an upper-bound count with bounded error, O(1) update and query, memory-efficient. For billing-grade exact counts, replay raw Kafka events through a batch job with a large dedup table nightly. The key tradeoff: real-time approximate counts serve dashboards; batch exact counts serve invoices. Never conflate the two SLAs in a single pipeline.

**Bottlenecks & scaling.** Hot ads (a viral campaign generates disproportionate clicks): Kafka partitioning by `ad_id` means a single hot ad lands on one partition → one Flink task. Mitigate with sub-partitioning (partition by `ad_id + random_salt`, aggregate locally, then re-aggregate) — the two-level aggregation pattern. Kafka retention: set retention to 7 days so the batch pipeline can replay without a separate archival step. ClickHouse horizontal scaling: shard by `ad_id` hash; replicate each shard for read availability. See [messaging](/building-blocks/messaging/) for Kafka partitioning patterns and [specialized components](/building-blocks/specialized-components/) for stream processing.

</details>

---

### Design a Leaderboard / Ranking System

- **What it tests:** sorted data structures, real-time vs. batch ranking, hot-key pressure
- **Clarify first:**
  - How many entities are ranked, and how frequently do scores change?
  - Is a global leaderboard, a friends leaderboard, or both required?
  - What latency is acceptable for a score update to appear in rankings?
  - Is exact rank needed, or is approximate rank acceptable?
- **The crux:** Redis sorted sets offer O(log N) rank updates and O(log N + range) queries and are the natural fit for real-time global leaderboards — but a single hot sorted set under very high write throughput becomes a bottleneck, requiring sharding or periodic batch recomputation for the long tail.

(see [caching](/building-blocks/caching/), [databases](/building-blocks/databases/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Maintain a ranked list of entities (players, posts, products) by score; support score updates, rank lookups, and top-N queries; optionally support a friends leaderboard (personalised subset). Non-functional drivers: low read latency for top-N queries (under 50 ms), score updates reflected in rankings within seconds, global leaderboard for millions of entities, hot-key pressure on a single high-traffic leaderboard.

**Estimation.** Assume 10 M ranked entities (players) and 100 K score updates/s at peak (e.g., a live game event). A Redis sorted set with 10 M members uses approximately 600 MB of memory — comfortably fits in a single Redis node. O(log N) for ZADD and ZRANK means 10 M members adds only ~23 comparisons per update, well within Redis throughput limits. The pressure is not algorithmic complexity — it is concurrency on a single hot sorted set.

**API.** `POST /scores` body `{ entity_id, score }` → 200 (upsert rank); `GET /leaderboard/top` query `?limit=100` → `{ rankings: [{ rank, entity_id, score }, ...] }`; `GET /leaderboard/rank/{entity_id}` → `{ rank, score }`; `GET /leaderboard/around/{entity_id}` query `?window=10` → surrounding N entities (for showing "you are ranked 4,312, here are your neighbours").

**Data model & storage.** Primary store: Redis sorted set (key = leaderboard name, member = entity_id, score = numeric score). Redis `ZADD` for upsert, `ZRANK`/`ZREVRANK` for rank lookup, `ZRANGE`/`ZREVRANGE` for top-N. Persistent backing store: a relational DB or DynamoDB table `(entity_id PK, score, updated_at)` — the source of truth for durability. Redis is the serving layer; the DB is the recovery source. On Redis restart, replay the DB to rebuild the sorted set.

**High-level design.** Score update: client → app server → write new score to DB (durable) → `ZADD` to Redis sorted set (serving layer). Top-N query: client → app server → `ZREVRANGE leaderboard 0 99 WITHSCORES` from Redis → return. Rank query: `ZREVRANK leaderboard entity_id` → O(log N). For a friends leaderboard: maintain a separate sorted set per user containing only their friends' scores, updated on each friend's score change — viable for small friend lists, expensive for large social graphs (use pull-merge at read time for large graphs).

**Deep dive — hot sorted set and scaling under high write throughput.** A single Redis sorted set is a single-threaded data structure. At 100 K updates/s all hitting one Redis key, you risk saturating a single CPU core. Two scaling strategies: (1) Sharded leaderboards — partition entity_id space across N sorted sets (e.g., by entity_id mod N), run a periodic merge job to compute the global top-K by taking the top-K from each shard and merging them; exact global rank requires the merge step but is not needed on every write. (2) Batched writes — collect score updates in a local buffer for 100 ms and flush as a single `ZADD` pipeline call, reducing round-trips from 100 K to ~1 K/s. For near-real-time use cases (live gaming events), approximate rank is acceptable: publish the top-100 list every 5 seconds to a broadcast cache, serve all clients from that snapshot rather than querying Redis on every request.

**Bottlenecks & scaling.** Redis as SPOF: run Redis with a replica (`REPLICAOF`) and automatic failover via Redis Sentinel or Redis Cluster; a 30-second failover means rankings are temporarily stale, which is usually acceptable. Memory limits: 10 M entries at ~60 B each = 600 MB per sorted set — a large active-player base with multiple leaderboards (daily, weekly, all-time) multiplies this; use TTL-based expiry for time-windowed leaderboards to reclaim memory automatically. Exact rank for large N: `ZREVRANK` is O(log N) and fast; computing exact percentile across 100 M entities requires a re-rank job or approximate data structures (skip lists with sampling). See [caching](/building-blocks/caching/) for Redis patterns and [databases](/building-blocks/databases/) for the backing-store options.

</details>

---

### Design a Distributed Key-Value Store (Dynamo-style)

- **What it tests:** consistent hashing, replication, quorum reads/writes, conflict resolution
- **Clarify first:**
  - What consistency level is required — strong, eventual, or tunable?
  - What are the target SLAs for read and write latency?
  - How large are values, and what is the expected key cardinality?
  - Is ordered key iteration required?
- **The crux:** partitioning via consistent hashing allows nodes to be added or removed with minimal reshuffling, while tunable quorums (R + W > N guarantees overlap) let you trade consistency for latency — the hard follow-on is conflict resolution when concurrent writes reach different replicas (vector clocks or last-write-wins).

(see [databases](/building-blocks/databases/), [specialized components](/building-blocks/specialized-components/))

<details>
<summary>Show a model answer</summary>

**Requirements.** A persistent, distributed key-value store supporting `put(key, value)`, `get(key)`, and `delete(key)`; tunable consistency; horizontal scalability by adding nodes; fault tolerance across node failures. Non-functional drivers: tunable read/write consistency (from eventual to strong), low read and write latency (sub-10 ms p99), high availability even during network partitions, linear storage scalability by adding nodes.

**Estimation.** Assume 1 M keys with values averaging 1 KB → 1 TB total data. At 100 K writes/s and 500 K reads/s, a single node is a bottleneck on both CPU and disk — horizontal sharding is mandatory. With N=3 replicas per key, total storage is 3 TB. Write amplification: each write goes to W replicas, each read checks R replicas; the constraint R + W > N guarantees at least one replica overlap, ensuring reads see the latest write.

**API.** `PUT /keys/{key}` body `{ value, ttl? }` → 200; `GET /keys/{key}` query `?consistency=eventual|strong` → `{ value, version }`; `DELETE /keys/{key}` → 200. The consistency parameter is the tunable knob — callers opt in to strong consistency and pay the latency cost.

**Data model & storage.** Each node stores key-value pairs in an LSM-tree (Log-Structured Merge-tree) — RocksDB is the standard implementation. LSM-trees optimise writes (sequential appends to a memtable, periodic compaction) at the cost of slightly slower reads (may need to check multiple levels). Each value is versioned with a vector clock or a logical timestamp. Consistent hashing maps keys to nodes: each node is responsible for a token range on a ring, so adding or removing a node only reshuffles ~1/N of the keys.

**High-level design.** A coordinator node (or the client library) uses consistent hashing to identify the N replica nodes responsible for a given key. For a write: the coordinator sends the write to all N replicas; returns success when W acknowledgments are received. For a read: the coordinator reads from R replicas; returns the value with the highest version; returns success when R acknowledgments are received. Gossip protocol keeps all nodes informed of ring membership and node liveness — no single coordinator is needed for topology, avoiding a SPOF.

**Deep dive — consistent hashing, quorum, and conflict resolution.** Consistent hashing places both nodes and keys on a hash ring. A key is owned by the first N nodes clockwise from its hash position (the preference list). Adding a node inserts it into the ring and transfers only the keys in its token range from its neighbours — no global reshuffling. Virtual nodes (vnodes) give each physical node multiple positions on the ring, evening out load distribution and making rebalancing incremental. Quorum: with N=3, W=2, R=2, R+W=4 > N=3, so every read overlaps with at least one write — eventual consistency with bounded staleness. Setting W=1, R=1 maximises throughput but risks reading a stale replica. Setting W=3, R=3 gives strong consistency but requires all replicas to be available. The hardest follow-on is concurrent writes reaching different replicas — two options: (1) last-write-wins (LWW) using a wall-clock timestamp — simple but can lose a write if clocks skew; (2) vector clocks — each write carries a version vector; divergent versions are returned to the client as a conflict for application-level resolution (Dynamo's original approach). LWW is the pragmatic default; vector clocks are necessary when write-loss is unacceptable.

**Bottlenecks & scaling.** Hot keys: consistent hashing distributes keys evenly, but a single viral key (e.g., a feature flag read by every service) creates hot-node pressure. Mitigate with read replicas or a client-side cache with a short TTL. Node failures: with W=2 and N=3, a single-node failure still allows writes — hinted handoff temporarily stores the write on a stand-in node, which forwards it to the recovered replica when it rejoins. Network partition: under CAP, choosing AP (availability + partition tolerance) means accepting stale reads; choosing CP means refusing writes to a partition that cannot confirm quorum. Tunable consistency lets different callers make the right tradeoff for their use case. See [databases](/building-blocks/databases/) for LSM-tree, consistent hashing, and CAP tradeoffs, and [mindset: consistency and CAP](/mindset/consistency-cap/) for the theoretical grounding.

</details>

---

## Real-time

### Design WhatsApp / Facebook Messenger

- **What it tests:** persistent connections, message ordering, delivery receipts, offline queuing
- **Clarify first:**
  - 1-to-1 messaging only, or also group chats? What is the max group size?
  - Are delivery and read receipts required?
  - End-to-end encryption: yes or no?
  - How long are messages retained on the server?
- **The crux:** each connected client needs a persistent WebSocket connection to a gateway server — the hard part is routing a message from sender's gateway to recipient's gateway when recipients are scattered across machines, and durably queuing messages for offline users without delivering duplicates on reconnect.

(see [messaging](/building-blocks/messaging/), [specialized components](/building-blocks/specialized-components/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Send and receive 1:1 and group messages (up to ~500 members) in real time; delivery and read receipts; online/offline presence; offline message queuing with push-notification wakeup. Non-functional drivers: 500 M daily active users, ~100 B messages/day averaging 1.16 M msg/s (peak ~3.5 M/s); p99 delivery latency < 500 ms for online recipients; 99.99% availability; eventual consistency on ordering is acceptable but no message loss after server acknowledgment.

**Estimation.** 100 M peak concurrent connections at ~50 K per gateway node requires ~2,000 WebSocket gateway nodes. At 1 KB per message record, 100 B messages/day = ~100 TB/day raw writes; Cassandra partitioned by `chat_id` handles this linearly. The two numbers that force the design are 100 M concurrent connections (stateful WebSocket tier is unavoidable) and 1.16 M writes/s (a relational DB on the write path is ruled out).

**API.** Over WebSocket: `SEND { to_user_id | to_group_id, client_msg_id, type, body }` → server ACK; `ACK { msg_id, status: delivered | read }`. Over REST: `GET /v1/conversations/{chat_id}/messages?before={msg_id}&limit=50` for history pagination.

**Data model & storage.** Messages in Cassandra partitioned by `chat_id`, clustered by `seq_id DESC` — write-optimized LSM-tree, naturally distributed, no joins required. Per-chat sequence numbers via Redis `INCR` to avoid clock-skew ordering bugs. Session registry (`user_id → gateway_node_id`) in Redis with 60-second TTL, refreshed by heartbeat. Offline inbox: a Redis list of `msg_id` references per user, capped at 1,000 entries; full message bodies already in Cassandra. Group membership in PostgreSQL with read replicas; hot group member lists cached as Redis sorted sets.

**High-level design.** Sender's WebSocket frame arrives at Gateway-A → stateless Message Service writes to Cassandra (durability first), increments the per-chat seq counter in Redis, then looks up `session:{recipient}` in Redis. If the recipient is online: push a delivery instruction to Gateway-B via direct gRPC; Gateway-B writes the frame to the recipient's WebSocket and returns a `delivered` event that flows back to the sender. If offline: append `msg_id` to the Redis offline inbox and fire APNs/FCM push notification. On recipient reconnect, the gateway drains the inbox in order before entering normal operation.

**Deep dive — routing across gateways.** The crux is decoupling the stateful gateway tier from the stateless message-routing tier. Two options: (a) direct gRPC push — Message Service calls `Gateway-B:DeliverMessage(msg)` using a connection pool; lowest latency but requires the service to track all gateway addresses; (b) internal pub/sub — each gateway subscribes to a Redis channel keyed by its own ID; Message Service publishes there; simpler topology, one extra hop. Production systems (WhatsApp, Slack) prefer direct gRPC for the latency advantage. Either way, if delivery to the gateway fails (node restart, timeout), the message is already in Cassandra and the offline inbox — the system fails open to offline delivery, never loses the message. For group fan-out: groups under 100 members use synchronous parallel pushes within the write path; groups of 100–500 members enqueue an async fan-out task to decouple write latency from group size, adding ~100 ms per member delivery but keeping the sender's ACK fast.

**Bottlenecks & scaling.** Hot gateway: WebSocket connections are sticky; losing a gateway node moves ~50 K users to offline delivery briefly; session TTL expiry handles cleanup automatically. Redis session registry is the hottest read path — gateways cache session entries locally for 5 s to absorb fan-out. Cassandra hot partition: a single extremely active chat concentrates writes on one partition; cap group size or sub-partition by `(chat_id, bucket)` where `bucket = seq_id / N`. Redis sequence counters: `INCR` on one key per chat is O(1) and trivially fast even at 1,000 msg/s per chat; sharding the Redis cluster by `chat_id` hash distributes load evenly.

See the [full Chat / WhatsApp case study](/case-studies/chat-whatsapp/).

</details>

---

### Design Uber / Lyft Dispatch

- **What it tests:** geospatial indexing, high-frequency location updates, real-time matching
- **Clarify first:**
  - What is the driver location update frequency? (Typically every 4–5 seconds)
  - What is the acceptable matching latency for a rider requesting a trip?
  - What geographic regions must be supported initially?
  - Do you need surge pricing or ETA estimation?
- **The crux:** the system must answer "which drivers are within N km of this rider right now" across millions of continuously moving drivers — ordinary B-tree indexes cannot answer 2D proximity queries efficiently; the answer is a geospatial index (geohash or quadtree) that lets drivers self-report into cells and riders query by cell.

(see [specialized components](/building-blocks/specialized-components/), [messaging](/building-blocks/messaging/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Match riders to nearby available drivers in real time; track driver locations at high frequency; compute ETAs; support surge pricing as an optional extension. Non-functional drivers: driver location updates every 4–5 seconds from millions of drivers; match latency under 5 seconds from rider request; 99.9% availability (a failed match is immediately user-visible); geospatial proximity queries across a continuously moving dataset.

**Estimation.** 5 M active drivers updating location every 5 s = 1 M location writes/s. 10 M ride requests/day ≈ 116 match requests/s — low volume but each requires a geospatial proximity query. The dominant load is location ingestion, not match throughput. Standard B-tree indexes cannot answer "all drivers within 2 km of (lat, lng)" without a full table scan across 5 M rows — a geospatial index is mandatory.

**API.** Driver: `POST /driver/location` body `{ driver_id, lat, lng, status: available|busy }` → 200 (high-frequency, fire-and-forget). Rider: `POST /rides/request` body `{ rider_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng }` → `{ ride_id, matched_driver_id, eta_seconds }` (201); `GET /rides/{ride_id}` → ride status. Driver: `PUT /rides/{ride_id}/accept` → 200.

**Data model & storage.** Two separate concerns: (1) current driver location — a geospatial index updated at 1 M writes/s; in-memory Redis with the `GEO` commands (`GEOADD drivers:{city} lng lat driver_id`; `GEORADIUS` for proximity query). Redis GEO uses geohash encoding internally, giving O(N+log M) proximity queries where N is the result set size. (2) Persistent trip data — `rides (ride_id PK, rider_id, driver_id, status, pickup, dropoff, created_at)` in PostgreSQL sharded by city. Driver metadata and ratings in PostgreSQL.

**High-level design.** Location update path: driver app → Location Service → update `drivers:{city}` GEO key in Redis (current position) → write to a Kafka topic for analytics and ETA model training (async, does not block the response). Match path: rider → Dispatch Service → `GEORADIUS drivers:{city} pickup_lng pickup_lat 2 km` in Redis → ranked list of candidate drivers → filter by availability → select best match (proximity + rating heuristic) → send match offer to driver app via WebSocket or long-poll → driver accepts → update `rides` table and driver status to `busy`.

**Deep dive — geospatial index: geohash vs. quadtree.** The crux is answering 2D proximity queries efficiently on a live-moving dataset. Geohash encodes a (lat, lng) coordinate pair into a fixed-length string where nearby locations share a common prefix — proximity becomes a prefix query, and standard key-value stores can answer it. Redis GEO uses geohash internally with ~0.6 m precision at 52-bit resolution. The radius query `GEORADIUS` is O(N + log M) where M is the GEO set size. For a city with 50,000 active drivers, this is fast. Quadtrees recursively subdivide geographic space into four quadrants; they are better for non-uniform density (urban vs. rural) and dynamic resizing but require a dedicated tree data structure. The practical choice: Redis GEO (geohash-backed) is the default — low operational complexity, fits in memory, handles millions of drivers. A custom quadtree is justified only when per-city driver density is highly non-uniform and you need adaptive precision. Partitioning by city (one Redis key per city) bounds each GEO set size and simplifies horizontal scaling: each city's active drivers fit comfortably in one Redis shard.

**Bottlenecks & scaling.** Location write thundering herd: 1 M writes/s to Redis; partition by city and shard Redis across regions so no single node handles all writes. Match SPOF: Dispatch Service is stateless and horizontally scalable; Redis holds the shared state. Driver location staleness: a driver who crashes or loses connectivity stops sending updates; use a TTL on driver availability status — if no update in 30 s, mark unavailable. Hot city (e.g., NYC rush hour): sub-partition by geohash prefix (borough-level shards) if one city's driver set exceeds single-node Redis capacity. ETA computation is CPU-heavy — run off the match critical path as an async call to a routing service; return an estimated ETA from a pre-computed model immediately, then update with the precise value.

See the [full Ride-Sharing case study](/case-studies/ride-sharing/).

</details>

---

### Design a Notification / Push System

- **What it tests:** fan-out across channels, idempotency, retry with backoff, user preferences
- **Clarify first:**
  - Which channels must be supported: mobile push (APNs/FCM), email, SMS?
  - What volume of notifications per second at peak?
  - Are notifications user-preference-filtered (do-not-disturb, channel opt-outs)?
  - What delivery guarantee is required — at-least-once is typical; is deduplication needed?
- **The crux:** notifications must be delivered reliably without duplicates — the idiomatic design is event → durable queue → per-channel worker pool with retry and a dead-letter queue, with an idempotency key on each notification so re-delivery after a crash does not double-notify the user.

(see [messaging](/building-blocks/messaging/), [specialized components](/building-blocks/specialized-components/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Send notifications across mobile push (APNs/FCM), email, and SMS; support user preference filtering (channel opt-outs, do-not-disturb schedules); at-least-once delivery with deduplication to prevent double-notifying. Non-functional drivers: high peak throughput (millions of notifications/s for broadcast events like breaking news or flash sales); reliable delivery with retry and dead-letter handling; low latency for critical alerts (payment confirmations < 5 s); user preferences must gate delivery before any external API call is made.

**Estimation.** 1 B users; a broadcast event (major sports score, product launch) fans out to 100 M devices. At 10 K APNs requests/s per sender connection, a single sender thread takes 10,000 s for 100 M — you need a pool of ~1,000 concurrent sender workers. Email volume is lower but slower (SMTP round-trips); SMS is lowest volume but highest cost per message. The fan-out size forces a queue-backed worker architecture; synchronous delivery on the triggering service's request thread is impossible at this scale.

**API.** Inbound (internal callers): `POST /notifications/send` body `{ user_id | segment_id, template_id, channel_preferences: [push, email, sms], payload: { title, body, deep_link }, idempotency_key }` → `{ notification_id }` (202 Accepted — enqueued, not yet delivered). Status: `GET /notifications/{notification_id}` → `{ status: queued | sending | delivered | failed, channel_results: [...] }`. Preference management: `PUT /users/{user_id}/notification-preferences` body `{ channels: {...}, dnd_start, dnd_end }`.

**Data model & storage.** `notifications (notification_id PK, user_id, template_id, payload_json, idempotency_key UNIQUE, status, created_at, sent_at)` in a relational DB (PostgreSQL). `user_preferences (user_id PK, push_enabled, email_enabled, sms_enabled, dnd_start, dnd_end)` — read on every notification dispatch, cached aggressively in Redis with a short TTL. Per-channel delivery logs in an append-only table for audit. Idempotency key: unique constraint on `(idempotency_key)` — inserting a duplicate silently returns the existing `notification_id`, preventing double-enqueue from retrying callers.

**High-level design.** Notification API service receives the request, validates, checks the idempotency key, writes the record to the DB, and publishes a job to a durable queue (Kafka or SQS) partitioned by `user_id`. Per-channel worker pools consume from the queue: (1) check user preferences and DND schedule — if suppressed, mark delivered-suppressed and ack; (2) render the template with user-specific data; (3) call the external provider (APNs, FCM, SendGrid, Twilio); (4) on success, update delivery status; on failure, re-enqueue with exponential backoff (up to 3 retries); after max retries, route to a dead-letter queue for alerting. A preference cache layer (Redis, TTL 60 s) ensures preference lookups add < 1 ms to the critical path.

**Deep dive — idempotency and exactly-once delivery.** The core challenge: a notification must reach the user exactly once even if the triggering service retries (network timeout) or the worker crashes mid-delivery. Two idempotency boundaries: (1) enqueue-side — the idempotency key unique constraint in the DB ensures the same event is enqueued only once regardless of how many times the caller retries `POST /notifications/send`; (2) delivery-side — at-least-once delivery from the queue means a worker may process the same job twice after a crash-before-ack. To guard against double-delivery: before calling APNs/FCM, check if `notifications.status = delivered` — if yes, ack and skip. This makes the delivery check the idempotency guard at the worker level. APNs and FCM both accept a `apns-collapse-id` / `collapse_key` that deduplicates on the device side for notifications with the same content — a second line of defence. The dead-letter queue captures undeliverable notifications (invalid device tokens, hard-bounced emails) and triggers a cleanup job that unregisters stale tokens.

**Bottlenecks & scaling.** Fan-out for broadcast events: segment the user set and publish N jobs, one per user, to Kafka partitioned by `user_id` — worker pool scales horizontally. APNs/FCM rate limits: each app has a per-second token limit; use a token-bucket rate limiter in the worker pool to stay under provider limits and back-pressure the queue rather than getting throttled externally. DND window: accumulate suppressed notifications in a "deferred" store (Redis sorted set, score = scheduled delivery time) and re-enqueue at DND end time via a scheduler. See [messaging](/building-blocks/messaging/) for queue patterns and [specialized components](/building-blocks/specialized-components/) for external provider integration.

</details>

---

### Design Google Docs (Collaborative Editing)

- **What it tests:** real-time conflict resolution, operational transformation or CRDTs, presence
- **Clarify first:**
  - How many concurrent editors on a single document?
  - Is offline editing with later sync required?
  - Are rich-text and embedded media in scope, or plain text only?
  - What is the history / version control expectation?
- **The crux:** when two users edit the same position simultaneously, edits must be merged without data loss or divergence — Operational Transformation (transform each operation against concurrent operations before applying) or CRDTs (data structures that merge by design) are the two families of solution, and the choice drives the entire concurrency model; real-time presence adds a separate low-latency broadcast problem.

(see [messaging](/building-blocks/messaging/), [databases](/building-blocks/databases/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Multiple users concurrently edit a shared document; changes appear in near-real time across all editors; document history / version control; cursor presence (see where other editors are). Non-functional drivers: correctness — concurrent edits must converge to the same document state on all clients; latency — local keystrokes must appear instantly (optimistic local apply before server confirmation); eventually consistent across all connected clients within ~200 ms; availability of the collaboration service matters more than strict consistency (offline editing with later sync is an extension).

**Estimation.** Assume 10 M documents with ~10 concurrent editors each at peak = 100 M active editing sessions. Each keystroke generates one operation (~50 B); at 10 keystrokes/s per editor = 500 M operations/s peak — clearly these cannot round-trip to the server before rendering locally. The latency requirement forces optimistic local application; the convergence requirement forces an explicit conflict-resolution algorithm. Storage for operations: at 50 B each and 1,000 ops per document-session, daily storage is manageable; compaction (snapshotting) is still necessary to avoid replaying the full operation log on every load.

**API.** WebSocket (per document session): `OP { doc_id, client_id, revision, operation }` → server broadcasts transformed op to all other editors; `ACK { revision }` confirms the server applied the operation. REST: `GET /docs/{doc_id}` → `{ snapshot, revision }` (latest snapshot + revision number for joining editors); `GET /docs/{doc_id}/history?from=rev&to=rev` → operation log; `POST /docs` → `{ doc_id }` (create).

**Data model & storage.** `documents (doc_id PK, title, owner_id, latest_revision, created_at)` and `doc_snapshots (doc_id, revision, snapshot_json, created_at)` in PostgreSQL. `doc_operations (doc_id, revision, client_id, operation_json, created_at)` in an append-only table — the canonical history log. Snapshots are taken every N operations to bound replay time on load. Active editing sessions (connected clients, cursor positions) are ephemeral state in Redis or in-process on the collab server.

**High-level design.** When a client connects, it fetches the latest snapshot and revision from the REST API, applies it locally, and opens a WebSocket to the Collaboration Service (one stateful process per document, to serialize operations). On keystroke: the client applies the operation locally (optimistic), then sends it over WebSocket with its current revision. The server applies Operational Transformation (OT), appends the transformed op to `doc_operations`, broadcasts it to all other connected clients, and returns an ACK with the new revision. Each client applies incoming ops from the server using the same OT rules to converge state.

**Deep dive — Operational Transformation vs. CRDTs.** The crux is that two users editing the same position concurrently produce incompatible operations — each must be transformed against the other before applying. OT defines a `transform(op_a, op_b) → op_a'` function such that applying `op_a'` after `op_b` produces the same result as applying `op_b'` after `op_a` (the convergence property). For plain text, OT is well understood: `insert(pos, char)` against a concurrent `insert(earlier_pos, char)` increments `pos` by 1; against a `delete(earlier_pos)` it decrements `pos`. The server is the arbiter: it receives all ops, assigns a global revision, transforms each op against all concurrent ops (those with the same base revision), and broadcasts the transformed version. Clients transform incoming server ops against their pending local ops before applying. OT requires a central server (to assign revision order) — this is a deliberate tradeoff; it simplifies the transform function significantly. CRDTs (Conflict-free Replicated Data Types) are an alternative that works without a central server: each character is assigned a globally unique position (e.g., using a fractional index or a tree structure), so concurrent inserts never conflict by construction. CRDTs enable true peer-to-peer and offline editing but add implementation complexity and higher memory overhead per character. Google Docs uses OT; Figma and Linear use CRDTs. For an interview, choose OT for simplicity and explain the CRDT tradeoff.

**Bottlenecks & scaling.** Single collab server per document is a SPOF and a bottleneck for very large documents with many concurrent editors. Mitigation: shard documents across collab servers by `doc_id` hash; on server failure, surviving replicas replay the operation log from the DB and clients reconnect (brief gap covered by the operation history). Presence fan-out: 10 editors each broadcasting cursor position at 10 Hz = 100 events/s/doc — trivial for a single server; use WebSocket broadcast within the process, not a distributed queue. Operation log growth: snapshot every 500 operations; old operations beyond the retention window can be archived. See [messaging](/building-blocks/messaging/) for WebSocket patterns and [databases](/building-blocks/databases/) for append-only log design.

</details>

---

## Storage & media

### Design YouTube / Netflix Video Streaming

- **What it tests:** upload pipeline, transcoding, CDN delivery, adaptive bitrate
- **Clarify first:**
  - Upload-focused, playback-focused, or both?
  - What are the target bitrates and resolutions to support?
  - Is live streaming in scope, or only on-demand?
  - What is the global geographic reach?
- **The crux:** raw video cannot be streamed directly — it must be transcoded into multiple resolutions and formats asynchronously after upload; playback is then served from a CDN using adaptive bitrate streaming (HLS/DASH) so the client picks the quality tier its bandwidth can sustain, which means the transcoding pipeline and CDN edge network are the real engineering challenges, not the upload endpoint.

(see [specialized components](/building-blocks/specialized-components/), [caching](/building-blocks/caching/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Users upload videos; other users stream them on demand; support multiple resolutions and global delivery. Non-functional drivers: upload must be durable before processing begins; playback must start within 2 s (time-to-first-frame); adaptive bitrate streaming adjusts quality to available bandwidth; CDN is mandatory for global reach; transcoding is CPU-intensive and must not block the upload response.

**Estimation.** Assume 500 K video uploads/day, average video 500 MB → 250 TB/day raw ingest. Each video transcoded to 5 resolutions (360p, 480p, 720p, 1080p, 4K) → stored volume ~5× raw = 1.25 PB/day. Video is ~95% of internet traffic — object storage + CDN is not a choice but an axiom. Transcoding 500 K videos/day at ~5 CPU-minutes per video = ~2.5 M CPU-minutes/day; a farm of 1,000 cores each running 24×60 minutes = 1.44 M CPU-minutes — you need a horizontally scalable transcoding pool.

**API.** `POST /videos/init` → `{ upload_id, upload_url }` (pre-signed multipart S3 URL); `POST /videos/{video_id}/publish` body `{ title, description }` → `{ video_id }` (201, triggers transcoding); `GET /videos/{video_id}/manifest` → HLS `.m3u8` or DASH `.mpd` manifest (the playlist of segment URLs); `GET /videos/{video_id}/stream/{quality}/{segment}` → video segment (served from CDN, not app servers).

**Data model & storage.** `videos (video_id PK, uploader_id, title, status: [processing|ready|failed], created_at)` and `video_renditions (video_id, quality, segment_count, manifest_url, size_bytes)` in a relational DB. Raw and transcoded video segments in object storage (S3/GCS). Metadata cached in Redis. The DB stores only metadata and URLs; bytes live in object storage exclusively.

**High-level design.** Upload path: client gets a pre-signed multipart URL → uploads directly to object storage (bypasses app servers) → upload complete event triggers a transcoding job via a message queue → transcoding workers (auto-scaling pool) pull jobs, transcode each video into multiple resolutions using FFmpeg, split output into ~2 s segments, upload segments to object storage → write `video_renditions` records → update `videos.status` to `ready`. Streaming path: player fetches the HLS manifest from CDN → manifest lists segment URLs → player fetches segments from CDN, selecting quality tier based on bandwidth measurement → CDN origin-pulls from object storage on first request, caches segments at edge.

**Deep dive — transcoding pipeline and adaptive bitrate streaming.** Raw video cannot be streamed directly: it may be in any codec/container, full resolution, and is a single monolithic file. The transcoding pipeline does three things: (1) transcode to H.264/H.265 at multiple resolution-bitrate ladders (e.g., 360p@500 kbps, 720p@2 Mbps, 1080p@5 Mbps); (2) segment each output into fixed-duration chunks (typically 2–6 s), numbered sequentially; (3) generate an HLS `.m3u8` or DASH `.mpd` manifest listing all available quality tiers and their segment URLs. The player selects the appropriate quality tier by measuring download speed: if segments arrive faster than playback, upgrade quality; if the buffer drains, downgrade. This is adaptive bitrate streaming (ABR). The manifest is the control plane; the segments are the data plane. Each segment is independently cacheable by CDN — a 2-s segment cached at a CDN PoP can serve thousands of concurrent viewers without touching the origin. Live streaming requires a different pipeline (segments published in near-real-time, manifest updated every few seconds) but the same ABR delivery mechanism.

**Bottlenecks & scaling.** Transcoding bottleneck: use a job queue (SQS/Kafka) with auto-scaling transcoding workers (spot/preemptible instances); a failed transcode job is retried from the raw video in object storage. CDN origin overload on new viral video: pre-warm CDN PoPs by pushing the manifest and first segments immediately after transcoding completes. Storage cost: implement tiered storage — segments for videos older than 90 days move to cold object storage (S3 Glacier); manifests remain hot. Hot videos (top 1% account for 80% of views) are served entirely from CDN; the app servers never see streaming traffic. See [specialized components](/building-blocks/specialized-components/) for CDN and transcoding pipeline patterns.

</details>

---

### Design Dropbox / Google Drive

- **What it tests:** chunked upload, deduplication, sync protocol, conflict handling
- **Clarify first:**
  - Single-user multi-device sync, or collaborative shared folders?
  - What is the maximum file size to support?
  - Is versioning (restore deleted or overwritten files) required?
  - How are simultaneous edits on the same file resolved?
- **The crux:** transferring whole files on every change is expensive — the key insight is to split files into content-addressed chunks (hash each), upload only changed chunks, and store chunk metadata separately from chunk blobs (chunks in object storage, metadata in a relational DB), which also enables cross-user deduplication and efficient delta sync.

(see [databases](/building-blocks/databases/), [specialized components](/building-blocks/specialized-components/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Users sync files across multiple devices; support upload, download, delete, and rename; optional versioning; conflict resolution on simultaneous edits. Non-functional drivers: large file support (up to 10 GB); efficient delta sync (only upload changed bytes, not whole files); cross-user deduplication for storage efficiency; multi-device consistency within seconds; durability — a committed file must never be lost.

**Estimation.** Assume 500 M users, average 2 GB stored each → 1 EB total. Daily active users uploading 1 file each → 500 M files/day, average 1 MB = 500 TB/day raw bandwidth. Transferring whole files on every save would require 500 TB/day upstream — infeasible. Chunking files into 4 MB blocks and uploading only changed chunks reduces this by ~90% for typical edit-save workflows (most edits touch a fraction of a file's chunks). Storage deduplication: if 10% of chunks are identical across users (e.g., common libraries, shared folders), dedup saves 10% of storage — meaningful at exabyte scale.

**API.** `POST /files/init-upload` body `{ file_name, total_size, chunk_hashes[] }` → `{ upload_id, missing_chunks[] }` (server returns which chunks it does not already have — dedup check); `PUT /files/chunks/{chunk_hash}` body `<chunk_bytes>` → 200; `POST /files/commit` body `{ upload_id, file_name, parent_folder_id }` → `{ file_id, version }` (201); `GET /files/{file_id}` → `{ file_name, chunk_hashes[], download_urls[] }`; `GET /sync/delta` query `?since_version=N` → `{ changes: [{ file_id, event: created|modified|deleted, version }] }`.

**Data model & storage.** Three stores: (1) metadata DB (relational, sharded) with `files (file_id PK, owner_id, folder_id, name, latest_version, created_at, deleted_at)` and `file_versions (file_id, version, chunk_hashes[], size, updated_at)`; (2) chunk store — object storage (S3/GCS) keyed by `sha256(chunk_bytes)`, content-addressed so identical chunks from different files share one object; (3) sync log — append-only table or Kafka topic of file change events per user, used by the delta sync API.

**High-level design.** Upload: client splits the file into 4 MB chunks, hashes each (SHA-256), sends `init-upload` with all hashes → server returns only missing hashes (those not in the chunk store) → client uploads only missing chunks → client commits; server records the new version. Download: client fetches `file_id` metadata → retrieves `chunk_hashes[]` → downloads each chunk from object storage via CDN-backed signed URLs, reassembles locally. Sync: a long-polling or WebSocket connection to the sync service receives change events; the client fetches only the changed chunks for modified files.

**Deep dive — chunking, content-addressing, and the deduplication dividend.** The central design decision is to split files into fixed-size (or variable-size using Rabin fingerprinting) content-addressed chunks and store chunks separately from metadata. This enables three things simultaneously: (1) delta sync — after an edit, only the changed chunks (typically 1–2 of N) need uploading; a 1 GB file with a 100 KB edit uploads 100 KB, not 1 GB; (2) cross-user deduplication — two users storing the same file reference the same set of chunk hashes in the metadata DB but share one copy of each chunk in object storage; (3) efficient versioning — each version stores only the list of chunk hashes; diff between versions is a set subtraction of hash lists; deleted chunks are reference-counted and garbage-collected when count reaches zero. The metadata DB is the source of truth for which chunks make up a file at each version. Object storage is an immutable blob store. These responsibilities must never be conflated. Conflict resolution: when two clients modify the same file concurrently, the server detects the version mismatch on `commit` and returns a 409 with both versions; the client creates a conflict copy (the "John's conflicted copy" pattern) and surfaces it to the user.

**Bottlenecks & scaling.** Metadata DB hot spots: shard by `owner_id` so all files for one user land on one shard (avoids cross-shard joins for directory listings). Sync service fan-out: a user with 10 devices receives 10 copies of every change event — cap concurrent connections per user and use server-sent events over HTTP/2 to multiplex. Large file uploads: support resumable uploads (store chunk upload progress on the server so a reconnection does not restart from zero). Chunk store cold reads: CDN caches downloaded chunks at edge nodes — popular shared files hit the CDN, not object storage. See [databases](/building-blocks/databases/) for sharding strategies and [specialized components](/building-blocks/specialized-components/) for object storage and CDN integration.

</details>

---

## Search & geo

### Design a Web Crawler

- **What it tests:** distributed BFS/priority frontier, deduplication at scale, politeness
- **Clarify first:**
  - Is this a general-purpose crawler or domain-restricted?
  - How deep should the crawl go, and what is the recrawl frequency?
  - Must it respect robots.txt and per-host rate limits?
  - How are extracted pages consumed — search index, archival, structured extraction?
- **The crux:** a naive BFS will recrawl the same URLs billions of times — deduplication of the URL frontier via a Bloom filter (memory-efficient "have we seen this?") is essential; politeness (rate-limiting per host) requires a per-domain queue with delayed scheduling, not a single global queue.

(see [specialized components](/building-blocks/specialized-components/), [messaging](/building-blocks/messaging/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Crawl the web continuously, discover new URLs from crawled pages, store page content for downstream indexing or archiving; respect robots.txt and per-host crawl-delay; recrawl changed pages on a schedule. Non-functional drivers: massive scale (billions of URLs); politeness — no host should be hammered with too many concurrent requests; deduplication — never crawl the same URL twice in the same crawl cycle; distributed and fault-tolerant — a single crawler death should not stall the entire job.

**Estimation.** Assume 10 B URLs total; crawling all at 1,000 fetches/s takes ~115 days — you need ~1,000 crawler workers each doing ~1 fetch/s per host (to stay polite). Average page 100 KB HTML → 10 B × 100 KB = 1 PB raw content per full crawl. URL frontier size: at 10 B URLs, a hash set for seen-URL dedup requires ~100 B/URL × 10 B = ~1 TB — too large for in-memory but fits in a Bloom filter. A Bloom filter for 10 B URLs at 1% false-positive rate requires ~9.6 bits/entry ≈ ~12 GB — fits in memory on a single large node or distributed across a cluster.

**API.** Internal (no external user-facing API): `POST /frontier/seed` body `{ urls[] }` (seed the initial URL set); worker protocol: worker polls `GET /frontier/next?worker_id={id}` → `{ url, fetch_after_epoch }` (the frontier dequeues and assigns); on completion: `POST /frontier/complete` body `{ url, status_code, extracted_urls[], content_hash }`.

**Data model & storage.** Three stores: (1) URL frontier — a priority queue of (URL, scheduled_fetch_time, priority_score) implemented as a Kafka topic per host domain or a Redis sorted set (score = next_fetch_epoch); (2) seen-URL store — Bloom filter in Redis for fast probabilistic dedup, with a backing persistent hash table (DynamoDB or RocksDB) for exact dedup on Bloom false positives; (3) content store — raw crawled page bytes in object storage (S3), metadata (url, crawled_at, content_hash, http_status, canonical_url) in a wide-column store (Cassandra). `content_hash` enables cross-URL dedup (two URLs with the same hash are duplicate content — index only once).

**High-level design.** Seed URLs enter the frontier. Crawler workers (stateless, horizontally scalable) fetch a URL assignment from the frontier dispatcher, download the page respecting the host's crawl delay and robots.txt, parse out hyperlinks, check each new URL against the seen-URL Bloom filter, enqueue unseen URLs into the frontier, and persist the page content + metadata. The frontier dispatcher groups URLs by host domain so that each host's queue can be rate-limited independently.

**Deep dive — frontier, deduplication, and politeness.** The naive approach — a single global FIFO queue — fails on two dimensions: it does not enforce per-host rate limits (hammering a single server), and it allows the same URL to be enqueued multiple times. The idiomatic solution uses a two-level queue: a front-end selector queue partitioned by host, and a back-end per-host delay queue. When a worker finishes crawling `host-A.com`, the dispatcher checks the host's last-crawl timestamp and schedules the next fetch at `now + crawl_delay` (from robots.txt `Crawl-delay` or a default 1 s). This is implemented as a Redis sorted set per host with score = next_fetch_epoch; the dispatcher polls sorted sets whose minimum score has passed and assigns URLs to idle workers. Deduplication: before enqueuing any extracted URL, check the Bloom filter (`GETBIT bloom:{shard} hash(url)`). A Bloom filter never produces false negatives — if it says "not seen," definitely enqueue. If it says "seen" (rare false positive), optionally check the exact hash table. After enqueuing, set the bit. The Bloom filter eliminates ~99% of redundant URLs with 15 GB of memory, making dedup practical at 10 B scale. Recrawl scheduling: high-value pages (homepage, news sites) get short recrawl intervals (hours); deep static pages get long intervals (weeks). Priority score = recency signal + inbound link count (PageRank-proxy); the frontier sorts by priority so workers always crawl the highest-value URLs first.

**Bottlenecks & scaling.** Frontier hot domain: a popular news site generates thousands of extracted URLs per crawl — per-host queues prevent starving other hosts. DNS resolution: cache DNS results aggressively (TTL-respecting local cache per worker) — repeated DNS lookups for the same host add latency and load DNS resolvers. Content dedup: after storing a page, compute its SimHash (locality-sensitive hash) and compare against recently crawled hashes to detect near-duplicate content — avoids indexing minor variations of the same page. Crawler traps: pages that generate infinite URLs via parameters (e.g., calendar pages) — mitigate with a max-depth limit and URL normalization (canonicalize query parameters). See the [full Web Crawler case study](/case-studies/web-crawler/).

</details>

---

### Design Search Autocomplete / Typeahead

- **What it tests:** prefix data structures, top-K retrieval, low-latency serving, index updates
- **Clarify first:**
  - Personalized suggestions per user, or global popularity ranking?
  - What is the maximum acceptable latency for suggestions? (Typically under 100 ms)
  - How frequently is the suggestion index updated from query logs?
  - Multi-language and Unicode support required?
- **The crux:** a trie over popular query prefixes with the top-K completions cached at each node answers prefix lookups in O(prefix length) time — the hard part is keeping the trie fresh without rebuilding it constantly; the standard approach is periodic offline rebuilds from query-log aggregations combined with a write-through update path for newly popular terms.

(see [specialized components](/building-blocks/specialized-components/), [caching](/building-blocks/caching/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Return top-K query completions as the user types each character; globally ranked by query popularity (or personalized as an extension); suggestions must update within 100 ms of each keystroke; index must refresh periodically as query trends shift. Non-functional drivers: extremely read-heavy (every keystroke on every search field); sub-100 ms latency end-to-end including network; suggestion index updates lag real queries by hours (near-real-time freshness is acceptable); multi-language support if in scope.

**Estimation.** Google Search processes ~8,500 queries/s; each query generates ~5 keystrokes = ~42,500 autocomplete requests/s. At peak (10×) = ~425,000 requests/s. Each trie node lookup is O(prefix length) ≈ O(10) character comparisons — trivially fast per query; the bottleneck is serving 425 K/s with sub-100 ms latency, which requires in-memory serving from a distributed cache, not a database query on every keystroke.

**API.** `GET /autocomplete?q={prefix}&limit=10&lang=en` → `{ suggestions: [{ query, score }, ...] }`. Optionally: `POST /queries/log` body `{ query, user_id }` for the query-log ingestion pipeline (internal, not user-facing).

**Data model & storage.** Two components: (1) serving tier — a prefix trie where each node stores the top-K completions for that prefix, serialized and served from Redis (`GET trie:{lang}:{prefix}` → top-K JSON). Not the full trie — just the top-K results per prefix stored as Redis hash entries or sorted sets. (2) index builder — offline batch job that aggregates the query log (Kafka → Spark/Flink), computes query frequency per prefix over a rolling 7-day window, and writes the updated top-K for every prefix back to Redis. A second Redis cluster serves production traffic; the offline job writes to a staging cluster; an atomic swap (rename or pointer flip) makes the new index live with zero downtime.

**High-level design.** User types "piz" → client fires `GET /autocomplete?q=piz` → Autocomplete API service reads `GET trie:en:piz` from Redis → returns top-K (`["pizza", "pizza near me", "pizza delivery", ...]`) in < 5 ms Redis lookup + network. Background: every completed query is published to Kafka → hourly Spark aggregation job computes new top-K per prefix → writes to staging Redis → atomic swap to production. Client-side: debounce keystrokes by 100–150 ms so a fast typist fires fewer requests; cache recent prefix results in the browser for instant back-navigation.

**Deep dive — trie vs. pre-computed prefix table and the index update problem.** A classic trie in memory stores the full tree and is O(L) for lookup (L = prefix length), but building a live trie across distributed nodes adds coordination complexity. The practical production approach stores the top-K completions per prefix as flat Redis keys — essentially a pre-materialized trie leaf at every node. With 10 M distinct prefixes at 200 B per entry (top-10 queries as a JSON string), the full table is ~2 GB — fits on a single Redis node with room to spare, or distributed across a small cluster. The hard part is not serving — it is keeping the index fresh without rebuilding the entire table constantly. Two patterns: (a) full periodic rebuild — Spark aggregates the 7-day query log nightly, writes a complete new prefix table, swaps atomically. Simple, reliable, slightly stale (lag up to 24 hours). (b) incremental streaming update — a Flink job maintains a streaming top-K per prefix using a Count-Min Sketch + sliding window; emits updates only for prefixes whose top-K changed; writes only those delta keys to Redis. Much fresher (< 1 hour lag) but complex: Count-Min Sketch approximate counts, merge logic, and careful key expiry. Start with full rebuild; add streaming updates for the top-1% most-queried prefixes where freshness matters most (trending searches, breaking news).

**Bottlenecks & scaling.** Redis hot prefix: popular prefixes (single letters like "a", "the") are queried millions of times per second — replicate the Redis cluster and distribute reads across replicas for hot keys, or cache the top-1% most-common prefixes in the application server's in-process LRU cache with a 1-second TTL. Trie index size explosion: the number of distinct prefixes grows as O(sum of query lengths); prune low-frequency prefixes below a minimum threshold to keep the index bounded. Language fan-out: maintain separate prefix tables per language (`trie:{lang}:{prefix}`); index builder parallelizes by language. See [specialized components](/building-blocks/specialized-components/) for trie and prefix index patterns and [caching](/building-blocks/caching/) for Redis serving strategies.

</details>

---

### Design Google Maps "Nearby Places"

- **What it tests:** geospatial indexing, read-heavy POI queries, radius and bounding-box search
- **Clarify first:**
  - Is this "search for a category near me" (Yelp-style) or turn-by-turn routing?
  - What is the expected QPS and geographic coverage?
  - How frequently does the POI dataset update?
  - Is the result set ranked by distance, rating, or relevance?
- **The crux:** querying "all restaurants within 5 km of lat/lng X" on a standard relational index requires a full table scan — the answer is a geospatial index (geohash encodes coordinates into a string so proximity queries become prefix queries; quadtrees recursively subdivide space) combined with a read-heavy cache since POI data changes slowly relative to query volume.

(see [specialized components](/building-blocks/specialized-components/), [caching](/building-blocks/caching/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Given a user's location, return nearby points of interest (POIs) filtered by category (restaurants, hotels, ATMs) within a radius, ranked by distance or rating. Non-functional drivers: read-heavy (billions of location searches/day vs. a slowly changing POI dataset updated by business owners); sub-200 ms query latency; geospatial proximity queries on a dataset of hundreds of millions of POIs; high availability (maps is a core product, downtime is highly visible).

**Estimation.** 500 M daily active users each performing 10 searches/day = 5 B searches/day ≈ 58,000 searches/s average; peak ~175,000 searches/s. POI dataset: 200 M businesses worldwide, 1 KB metadata each = 200 GB — fits in a well-partitioned DB with in-memory caching. POI data changes rarely relative to query volume (a restaurant's address updates perhaps once a year) — aggressive caching with long TTLs is safe. A standard B-tree index on latitude alone cannot satisfy "restaurants within 5 km of (lat, lng)" without a full table scan across 200 M rows.

**API.** `GET /places/nearby?lat={lat}&lng={lng}&radius_km={r}&category={cat}&limit=20&sort=distance|rating` → `{ places: [{ place_id, name, category, lat, lng, rating, distance_m }, ...], next_cursor }`. `GET /places/{place_id}` → full POI detail. `POST /places` (business owner writes, low volume) → `{ place_id }`.

**Data model & storage.** Primary store: PostgreSQL with the PostGIS extension, or MySQL with spatial indexes. Schema: `places (place_id PK, name, category, lat DOUBLE, lng DOUBLE, geohash VARCHAR(12), rating FLOAT, address, updated_at)` with a spatial index on `(lat, lng)` and a B-tree index on `(geohash, category)`. Geohash is stored as a computed column (first 6–8 characters, ~0.6–2 km cell precision) to enable prefix-range queries. For the search serving layer: Redis with GEO commands or a search service (Elasticsearch with geo_distance query) as a read-through cache.

**High-level design.** Search request: client → Search API service → check Redis GEO index for the relevant geohash cells (`GEORADIUS places:{geohash_prefix} lng lat radius_km km WITHCOORD`) → if miss, query PostGIS (`ST_DWithin(geom, ST_MakePoint(lng, lat)::geography, radius_m)`) → populate Redis GEO → return sorted results. For ranking: distance is computed in-memory after fetching candidates; rating ranking requires fetching a larger candidate set and re-sorting. POI writes go to PostgreSQL; a write-through cache updater invalidates or updates the Redis GEO key for the affected geohash cell.

**Deep dive — geohash prefix queries as a proxy for radius search.** The crux is that standard B-tree indexes are one-dimensional — they can index latitude or longitude but not both simultaneously for a radius query. Two approaches: (1) Geohash — encode (lat, lng) into a string where common prefix length correlates with proximity. A 6-character geohash cell covers ~1.2 km × 0.6 km. "All places within 5 km" translates to "all places whose geohash starts with any of the ~9 adjacent cells at the appropriate precision level." This reduces a radius scan across 200 M rows to a prefix range query across the ~1,000 POIs in adjacent cells. Stored as a regular B-tree index on `(geohash, category)`, it is fast. The edge case: a target location near a cell boundary may have relevant POIs in adjacent cells — always query the target cell and its 8 neighbours (the standard "9-cell search"). (2) Quadtree or R-tree — spatial index structures that recursively subdivide space; PostGIS's `ST_DWithin` uses an R-tree internally and handles this correctly. For a purpose-built read serving layer, Redis GEO (`GEORADIUS`) is the operational simplicity winner; for a full RDBMS, PostGIS is authoritative. The design combines both: PostGIS as the source of truth and write path, Redis GEO as the read-through cache serving the high-QPS query path.

**Bottlenecks & scaling.** Cache warm-up: on cold start, all 175 K searches/s hit PostGIS until Redis is populated; pre-warm the cache for top-1,000 cities at startup. Cache invalidation: a POI update must evict the Redis GEO key for its geohash cell. Use a write-through invalidation pattern: on `POST /places`, write to DB → publish an event to a Kafka topic → cache-invalidator consumer removes the stale Redis key. Hot geohash cell (Times Square, Shibuya): one cell can contain hundreds of POIs and receive millions of queries; replicate Redis and distribute reads. DB sharding: shard `places` by geohash prefix (first 2 characters = ~156 geographic regions) so proximity queries always land on the same shard. See [specialized components](/building-blocks/specialized-components/) for geospatial indexing patterns and [caching](/building-blocks/caching/) for cache invalidation strategies.

</details>

---

## Correctness-critical

### Design a Payment / Checkout System

- **What it tests:** idempotency, exactly-once semantics, distributed transaction patterns, ledger design
- **Clarify first:**
  - Is this a payment gateway integration, an internal ledger, or both?
  - What is the acceptable latency for a charge to complete?
  - Must the system support refunds, partial captures, and chargebacks?
  - What is the consistency requirement — can a balance be transiently wrong?
- **The crux:** a charge must happen exactly once even if the client retries and the network times out — idempotency keys on every payment intent (idempotent on re-submission) plus a transactional ledger (append-only, double-entry) are the foundation; multi-service order flows (reserve inventory, charge card, fulfill) need a Saga pattern with compensating transactions because distributed ACID is unavailable.

(see [databases](/building-blocks/databases/), [messaging](/building-blocks/messaging/))

<details>
<summary>Show a model answer</summary>

**Requirements.** Accept a payment for an order: reserve and charge a payment method, update the order status, and trigger fulfillment; support refunds and at minimum partial idempotency on retries. Non-functional drivers: exactly-once charge semantics — double-charging a customer is catastrophic; durability — a confirmed charge must survive any single failure; consistency — balance and order status must agree; latency — checkout completion under 3 s perceived by the user; compliance — PCI-DSS governs what card data can be stored (none in plaintext after tokenization).

**Estimation.** Peak checkout volume: 10,000 charges/s (e.g., Black Friday flash sale). At ~500 B per payment record, 10 K/s = 5 MB/s writes — trivial for a relational DB. The bottleneck is not throughput but correctness: distributed state changes across inventory, payment gateway, and order systems must succeed or cleanly roll back without double-charging.

**API.** `POST /checkout/initiate` body `{ order_id, payment_method_token, amount_cents, currency, idempotency_key }` → `{ payment_intent_id, status: pending }` (201). `GET /payments/{payment_intent_id}` → `{ status: pending|succeeded|failed|refunded, amount_charged, gateway_txn_id }`. `POST /payments/{payment_intent_id}/refund` body `{ amount_cents, reason }` → `{ refund_id, status }`.

**Data model & storage.** `payment_intents (payment_intent_id PK, order_id, idempotency_key UNIQUE, amount_cents, currency, status, gateway_txn_id, created_at, updated_at)` — PostgreSQL, single source of truth. `ledger_entries (entry_id PK, payment_intent_id, entry_type: charge|refund|reversal, amount_cents, created_at)` — append-only double-entry ledger; never update, only insert. `idempotency_keys (idempotency_key PK, payment_intent_id, response_json, created_at)` — lookup table for deduplicating retries without re-processing. All three tables in the same PostgreSQL transaction on the charge path to guarantee atomicity.

**High-level design.** `POST /checkout/initiate`: (1) check `idempotency_keys` — if found, return the stored response immediately; (2) in a DB transaction: insert `payment_intents` with status `pending`, insert `idempotency_keys`; (3) call external payment gateway (Stripe/Adyen) synchronously with a timeout; (4) in a DB transaction: update `payment_intents.status` to `succeeded|failed`, insert a `ledger_entry` for the charge, store gateway response; (5) return result. On success, publish a `PaymentSucceeded` event to Kafka; Fulfillment Service consumes and ships the order. Refund path mirrors this: create a refund record at the gateway, append a `refund` ledger entry, never mutate the original charge row.

**Deep dive — idempotency keys and the Saga pattern.** The crux is that a charge must happen exactly once even if the network times out between step (3) and step (4). If the gateway call succeeds but the response is lost, a naive retry charges the customer again. Idempotency key discipline solves both sides: on the inbound API, the unique constraint on `idempotency_key` means a retrying client gets back the original response after the first attempt is stored. On the gateway call, pass the `payment_intent_id` as the gateway's idempotency key — Stripe and Adyen both honour this and deduplicate gateway-side. The design must also handle the multi-service order flow: reserve inventory → charge payment → confirm order → trigger fulfillment. These cross four services; distributed ACID is unavailable. The Saga pattern models this as a sequence of local transactions with compensating actions: if payment succeeds but fulfillment fails, a compensation transaction fires a refund and releases inventory. The Saga can be orchestrated (a central Saga Orchestrator drives each step via commands and listens for results) or choreographed (each service emits events and the next service reacts). Orchestration is easier to reason about for correctness; choreography is looser coupling. For a payment flow where correctness is paramount, orchestration is the safer choice. The append-only ledger is the audit trail: every state change (charge, refund, reversal) is a new row, never an update — the ledger balance can be recomputed from entries at any time, providing a durable audit log for reconciliation.

**Bottlenecks & scaling.** Gateway timeout handling: if the gateway call exceeds 3 s with no response, the Saga must decide: treat as failed (risk of charging without recording) or treat as pending (risk of not charging). The correct answer is to save status as `pending`, schedule a background reconciliation poller that queries the gateway by `payment_intent_id` after 30 s, and update status from the gateway's authoritative response. Database hotspot: `payment_intents` partitioned by `order_id` or `user_id` hash to distribute writes. Idempotency key table: TTL-expire entries after 24 h (Stripe's convention) to bound table growth. Compliance: card PAN and CVV are never stored; only opaque tokens from the gateway's tokenization vault. See the [full Payment / Checkout case study](/case-studies/payment-system/).

</details>

---

### Design a Distributed Cache

- **What it tests:** cache topology, eviction, invalidation, consistency with the source of truth
- **Clarify first:**
  - Is the cache a side-cache (cache-aside) or a write-through primary path?
  - What is the acceptable staleness window?
  - What eviction policy fits the workload: LRU, LFU, TTL-based?
  - How should the cache handle a cold start or a thundering herd after a restart?
- **The crux:** cache invalidation is the hardest part — keeping the cache consistent with the database without either serving stale data too long or invalidating so aggressively that the cache provides no benefit; the secondary challenge is the thundering herd on a cold key (many simultaneous misses all hitting the DB), mitigated by request coalescing or a short probabilistic early expiry.

(see [caching](/building-blocks/caching/), [databases](/building-blocks/databases/))

<details>
<summary>Show a model answer</summary>

**Requirements.** A distributed in-memory cache supporting `get(key)`, `set(key, value, ttl)`, and `delete(key)`; horizontally scalable; tolerates node failures without losing all data; consistent enough to not serve catastrophically stale data. Non-functional drivers: sub-millisecond read latency (p99 < 1 ms from the application server's perspective); high read throughput (hundreds of thousands of requests/s); cache hit rate as the primary success metric; tunable eviction policy (LRU is the default); thundering herd protection on cold keys.

**Estimation.** Assume 500 K reads/s and 50 K writes/s (10:1 ratio). A single Redis node handles ~100 K ops/s; you need ~5 nodes for read capacity — consistent hashing across a small cluster is the right topology. At 100 B average value size, 10 M cached items = 1 GB; at 1 KB average, 10 M items = 10 GB — manageable with a few nodes. The dominant design driver is not storage but the cache invalidation and thundering herd problems.

**API.** `GET /cache/{key}` → `{ value, ttl_remaining }` or 404 (miss); `PUT /cache/{key}` body `{ value, ttl_seconds }` → 200; `DELETE /cache/{key}` → 200. The client library implements cache-aside: on miss, read from DB, call `PUT /cache/{key}` to populate. Write-through: on DB write, the application also calls `PUT /cache/{key}`.

**Data model & storage.** Each cache node stores key-value pairs in a hash table with an associated LRU doubly-linked list to track eviction order. TTL is stored as an absolute expiry timestamp; a background sweeper removes expired keys lazily on access and proactively via periodic scan. Consistent hashing maps keys to nodes: each node owns a range of the hash ring; adding or removing a node migrates only ~1/N of the keys. Virtual nodes (vnodes) per physical node smooth out uneven key distribution.

**High-level design.** A client library co-located with each application server holds a consistent hash ring of cache node addresses. On `get(key)`: hash the key → locate the owning node → send the request directly over a connection pool (no intermediate proxy to minimise latency). On `set(key, value)`: same routing; the node stores the entry and sets the TTL. Cache nodes are independent — no replication by default in a pure cache (values are re-fetched from the DB on miss). For higher availability, optionally replicate each primary node to one standby (Redis primary-replica); on primary failure, the standby is promoted and the affected keys absorb misses gracefully from the DB.

**Deep dive — cache invalidation and the thundering herd.** Cache invalidation is the hard part. Three strategies: (1) TTL-only — every entry expires after a fixed duration; simplest, always serves data up to TTL-old. Acceptable when a few seconds of staleness is tolerable. (2) Write-through — on DB write, update the cache in the same application-level operation; keeps the cache fresh but if the cache write fails after a DB success, the cache is transiently stale until TTL expiry. (3) Cache-aside with explicit invalidation — on DB write, `DELETE /cache/{key}` rather than writing the new value; the next read repopulates via a miss, but creates a window where concurrent readers all miss simultaneously — the thundering herd. The thundering herd occurs when a popular key expires or is deleted and many concurrent readers stampede the DB at once, then all try to populate the cache. Three mitigations: (a) probabilistic early expiration (PER) — each request checks whether `remaining_ttl < β × –log(random())`; if so it proactively re-fetches before expiry, smoothing the spike; (b) request coalescing / stampede lock — the first miss acquires a short distributed lock on `lock:{key}`; subsequent concurrent misses wait and read the value after the lock releases, never touching the DB more than once; (c) background refresh — an async job re-populates the key before it expires so readers never see a miss. In practice: TTL-only for most keys; write-through for high-read hot keys; stampede lock for keys where DB amplification would be catastrophic. The chosen eviction policy matters: LRU is correct for temporal locality; LFU is better for stable hot keys regardless of recency; TTL-based expiry is the minimum for data correctness.

**Bottlenecks & scaling.** Hot key (a feature flag or celebrity profile queried millions of times/s): a single cache node becomes a CPU bottleneck. Mitigate by replicating the hot key to N read-replica nodes and having the client library distribute reads across all copies, or by maintaining a small in-process LRU on each application server with a 1-second TTL. Cold start after deployment or node failure: all reads fall through to the DB; pre-warm by replaying recent read traffic logs or proactively populating the top-K keys at startup. Node failure: consistent hashing means only the failed node's key range is lost; the miss rate spikes briefly then recovers as the DB serves misses and the cache repopulates naturally. See [caching](/building-blocks/caching/) for eviction policies and invalidation patterns, and [databases](/building-blocks/databases/) for backing-store interaction.

</details>
