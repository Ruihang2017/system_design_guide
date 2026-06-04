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
