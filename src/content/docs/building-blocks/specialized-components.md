---
title: "10 · Specialized Components"
description: Reusable building blocks that recur across system designs, including inverted indexes, geospatial indexing, distributed ID generation, and probabilistic data structures.
---

These recur across designs. Recognizing when to reach for one is a senior signal.

- **Full-text search — the inverted index:** map each term → list of documents containing it (the inverse of a document → its words). This is how search engines answer "which docs contain X" instantly. **Elasticsearch** (built on Lucene) is the go-to. Use it alongside your primary DB, not instead of it.
- **Geospatial indexing:** to answer "what's near me," ordinary indexes don't work in 2D. **Geohash** encodes lat/long into a string where shared prefixes mean physical proximity. **Quadtrees** and **Google S2** recursively subdivide space. Powers Uber, Lyft, Yelp, "find nearby."
- **Unique ID generation at scale:** auto-increment IDs don't work across shards (and leak counts). Options: **UUID** (128-bit, random, no coordination, but big and unsortable), and **Snowflake** (a 64-bit ID = timestamp + machine ID + per-ms sequence number — roughly time-sortable, unique across machines, no central bottleneck). Snowflake-style is the common answer.
- **Probabilistic data structures** (trade a little accuracy for huge memory savings):
  - **Bloom filter:** "is X *possibly* in the set?" No false negatives, some false positives. "Definitely not present" or "maybe present." Used to avoid pointless DB/cache lookups.
  - **HyperLogLog:** estimate the count of *distinct* items (cardinality) in kilobytes instead of gigabytes. For "unique visitors" at scale.
  - **Count-min sketch:** estimate item *frequencies* in sublinear space. For "top-K" / heavy-hitter detection.
- **Notification systems & feed ranking:** fan-out delivery across channels (push/email/SMS) with retries and dedup; feeds may be **chronological** (simple) or **ranked** by a relevance model (complex, ML-driven).
