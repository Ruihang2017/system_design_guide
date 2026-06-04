---
title: "Practice Problem Bank"
description: "Ten timed practice problems with crux, concepts, and direction — work each one actively using the Part 11 framework before reading any solution."
---

Work these yourself using the Part 11 framework. For each, I've given the crux, the concepts it exercises, and a one-line direction. *Do these actively* — sketch the design before reading any solution.

## Chat / Messaging (WhatsApp, Slack)

- *Crux:* real-time delivery, message ordering, online presence, delivery/read receipts, offline message storage.
- *Concepts:* WebSockets, message queues, sequencing, fan-out.
- *Direction:* persistent connections per user via a connection/gateway layer, a message store, push to recipients (and queue for offline).

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*

## Rate Limiter (Distributed)

- *Crux:* enforce a global limit across many servers with minimal latency.
- *Concepts:* token/leaky bucket, sliding window, shared counters.
- *Direction:* centralized counters in Redis with atomic operations; consider per-edge approximate limits.

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*

## Notification Service

- *Crux:* deliver across push/email/SMS reliably, dedup, retry, respect user preferences, fan out massively.
- *Concepts:* queues, idempotency, DLQ, rate limiting, template/preference service.
- *Direction:* event → queue → per-channel workers with retries and dedup keys.

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*

## Video Streaming (YouTube, Netflix)

- *Crux:* store and deliver huge video files globally with smooth playback.
- *Concepts:* object storage, CDN, transcoding pipeline, adaptive bitrate streaming.
- *Direction:* upload → async transcode into multiple resolutions → store + CDN → client adapts quality to bandwidth.

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*

## Ride-Sharing (Uber)

- *Crux:* match riders to nearby drivers in real time as locations stream in.
- *Concepts:* geospatial indexing (geohash/quadtree), high-frequency location updates, matching.
- *Direction:* drivers publish location to a geo-index; match by proximity; handle the dispatch race.

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*

## File Storage & Sync (Dropbox, Google Drive)

- *Crux:* sync files across devices efficiently, handle large files and conflicts.
- *Concepts:* chunking, deduplication, metadata vs blob separation, conflict resolution.
- *Direction:* split files into chunks (hash each), upload only changed chunks, store metadata in a DB and chunks in object storage.

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*

## Web Crawler

- *Crux:* crawl billions of pages politely without re-crawling or overloading sites.
- *Concepts:* URL frontier (priority queue), dedup (Bloom filter), politeness/rate limiting, distributed coordination.
- *Direction:* frontier feeds workers; dedup seen URLs; respect robots.txt and per-host limits.

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*

## Payment / Checkout

- *Crux:* charge exactly once, never double-charge, stay consistent across services.
- *Concepts:* idempotency keys, strong consistency, Saga/2PC, ledger design.
- *Direction:* idempotent payment intents, a transactional ledger, sagas for multi-service order flows. (Correctness-first, not scale-first.)

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*

## Distributed Key-Value Store (Dynamo-Style)

- *Crux:* a scalable, available, fault-tolerant store.
- *Concepts:* consistent hashing, replication, quorums (R+W>N), versioning/conflict resolution.
- *Direction:* partition via consistent hashing, replicate to N nodes, tunable quorum reads/writes.

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*

## Search Autocomplete / Typeahead

- *Crux:* suggest completions in milliseconds as the user types, ranked by popularity.
- *Concepts:* tries/prefix trees, caching, top-K, count-min sketch.
- *Direction:* a trie of popular prefixes with cached top suggestions per node, updated from query logs.

*Challenge sheet: do this one timed (~45 min) — write requirements + estimates first, name two tradeoffs, then go deep on the hardest part.*
