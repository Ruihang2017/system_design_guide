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

**Estimation.** Assume 500 M users, average 2 GB stored each → 1 PB total. Daily active users uploading 1 file each → 500 M files/day, average 1 MB = 500 TB/day raw bandwidth. Transferring whole files on every save would require 500 TB/day upstream — infeasible. Chunking files into 4 MB blocks and uploading only changed chunks reduces this by ~90% for typical edit-save workflows (most edits touch a fraction of a file's chunks). Storage deduplication: if 10% of chunks are identical across users (e.g., common libraries, shared folders), dedup saves 10% of storage — meaningful at PB scale.

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
