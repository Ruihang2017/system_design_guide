---
title: "Chat / WhatsApp"
description: "End-to-end design of a real-time messaging system: WebSocket gateway, session registry, Cassandra message store, fan-out, presence, and offline delivery."
---

Real-time 1:1 and group messaging is the canonical problem for persistent connections and message ordering. The central difficulty is routing a message from sender to recipient when both may be on different servers, and ensuring delivery even when the recipient is offline.

## 1. Requirements

*Functional:*
- Send and receive 1:1 messages in real time.
- Group messaging (up to ~500 members, like WhatsApp groups).
- Delivery receipts (sent, delivered) and read receipts.
- Online/offline presence.
- Offline delivery: messages queued and pushed when the recipient reconnects or via a device push notification.
- Media attachments (images, voice notes) — out of scope for depth, noted as an extension.
- End-to-end encryption — architecture extension, noted at the end.

*Non-functional:*
- **Scale:** 2B registered users, 500M daily active users; ~100B messages/day.
- **Latency:** message delivery p99 < 500ms for online recipients on a good connection.
- **Availability:** 99.99% — a messaging app that is down is immediately visible.
- **Ordering:** messages in a conversation must arrive in the order they were sent; **global** ordering across conversations is not required.
- **Consistency:** eventual consistency is acceptable — a message may appear a second late, but must never be lost.
- **Durability:** messages must survive server failure; acknowledged messages must not be lost.

## 2. Estimation

100B messages/day → ~1.16M messages/second on average. Peak at 3×: ~3.5M msg/s.

Each message record: ~1 KB (metadata + body, small texts). Media is stored separately in object storage.

Storage: 100B msg/day × 1 KB × 365 days = ~36.5 TB/day → ~36 PB/year (before replication at ×3 = ~110 PB/year). In practice WhatsApp stores messages server-side only until delivery, then transfers custody to the device — the server-side hot window is much smaller. For this design we assume **server-side persistence** with a 1-year retention.

**Read:write ratio** — messaging is unusual: every message written is read roughly once by the recipient (plus history loads). Call it ~2:1. History loads are bursty but infrequent compared to real-time delivery.

Gateway servers (WebSocket): each holds ~50K concurrent connections. 500M DAUs, peak concurrency ~20% = 100M concurrent connections → ~2,000 gateway nodes at peak.

## 3. API

```
-- Client-to-server (over WebSocket, JSON frames)
SEND  { to_user_id | to_group_id, client_msg_id, type, body, media_url? }
ACK   { msg_id, status: "delivered" | "read" }

-- REST (for history / pagination)
GET /v1/conversations/{chat_id}/messages?before={msg_id}&limit=50
GET /v1/conversations                  -- list conversations

-- Presence
GET /v1/users/{user_id}/presence       -- online, last_seen
```

`client_msg_id` is a client-generated UUID used for deduplication and idempotency — if the client retransmits because it did not receive a server ACK, the server dedupes by `(sender_id, client_msg_id)`.

## 4. Data model & storage choice

### Message store

Access patterns for messages: write once, read by conversation in reverse-chronological order, partitioned by chat.

This points squarely to a **wide-column store (Cassandra)**. Partition key `chat_id`, clustering key `(seq_id DESC)` or `(created_at DESC)`, with `seq_id` being a per-chat monotonically increasing sequence number (details below).

```
messages (
  chat_id      UUID,          -- partition key
  seq_id       BIGINT,        -- clustering key, DESC; per-chat sequence number
  msg_id       UUID,          -- globally unique (Snowflake)
  sender_id    UUID,
  type         TEXT,          -- text | image | voice | ...
  body         TEXT,
  media_url    TEXT,
  created_at   TIMESTAMP,
  PRIMARY KEY ((chat_id), seq_id)
) WITH CLUSTERING ORDER BY (seq_id DESC);
```

Why Cassandra: write throughput at millions/second is trivial for its LSM-tree internals; reads by `chat_id + seq_id` range are efficient; it distributes naturally across many nodes. The tradeoff is no joins and limited cross-partition queries — acceptable here because every access is by `chat_id`.

### Per-chat sequence numbers

A simple timestamp is not sufficient for ordering (clock skew, same millisecond). Instead maintain a per-chat counter in **Redis** (`INCR rl:chat:{chat_id}:seq`) that the message service increments atomically before writing to Cassandra. The returned integer becomes `seq_id`. Tradeoff: adds a Redis round-trip per message; acceptable at this latency budget, and can be batched or made async with some complexity.

### Session registry

Maps `user_id -> gateway_node_id` for online users. **Redis** (or a fast key-value store) with a TTL equal to the heartbeat interval (e.g., 30 s). Each gateway refreshes its users' presence keys on each heartbeat. On disconnect the key expires.

```
session:{user_id}  ->  { gateway_id, connected_at }   TTL 60s
```

### User & group metadata

Relational: users, group memberships. Small tables, read-heavy. PostgreSQL with read replicas. Group member lists (group_id → [user_id]) cached in Redis as a sorted set.

### Offline queue

Messages for offline users stored in a per-user inbox in Redis (a list, capped at ~1000 entries) and also persisted in Cassandra under the same `messages` table (they are already written there). On reconnect, the server delivers from the inbox and clears it.

## 5. High-level design

```
                          +-------------------+
                          |   DNS / L4 LB     |
                          +--------+----------+
                                   |
                  +----------------+----------------+
                  |                |                |
          +-------+------+ +-------+------+ +-------+------+
          | Gateway-1     | | Gateway-2     | | Gateway-N     |
          | (WebSocket)   | | (WebSocket)   | | (WebSocket)   |
          +-------+-------+ +-------+-------+ +-------+-------+
                  |                 |                  |
                  +--------+--------+                  |
                           |                           |
                    +------+------+            (same path)
                    |  Message    |
                    |  Service    |
                    +--+------+---+
                       |      |
           +-----------+      +------------+
           |                               |
    +------+------+               +--------+-------+
    |  Cassandra  |               |  Redis Cluster  |
    | (messages)  |               |  session reg.   |
    +-------------+               |  offline queue  |
                                  |  seq counters   |
                                  +-----------------+

  SEND path (sender online, recipient online):
  Sender --WS--> Gateway-A --> Message Service
    --> seq INCR (Redis) --> write to Cassandra
    --> lookup session:{recipient} (Redis) --> Gateway-B node id
    --> push frame to Gateway-B --> deliver to recipient WS
    --> return ACK to sender

  SEND path (recipient offline):
  ... (same up to session lookup, misses)
    --> write to offline inbox (Redis list)
    --> trigger push notification (APNs / FCM)

  Recipient reconnects --> Gateway-C
    --> register session:{recipient}=Gateway-C (Redis)
    --> drain offline inbox --> deliver in order
```

The key insight: the **message service** is a stateless service (scales horizontally). Only the **gateways** are stateful (they hold open WebSocket connections). The session registry in Redis decouples them: any message service instance can look up any user's gateway and push a delivery instruction to it over an internal gRPC channel.

## 6. Deep dives

### Routing a message across gateways

The message service, after writing to Cassandra, must push the message to the recipient's current gateway. Two viable patterns:

**Option A — Direct gRPC push:** the message service calls `Gateway-B:DeliverMessage(msg)` directly. The session registry provides `gateway_id`; the message service maintains a connection pool to all gateways. Simple and low latency. Risk: if Gateway-B is momentarily overloaded or restarting, the push fails → fall through to offline queue.

**Option B — Internal pub/sub:** each gateway subscribes to a Redis pub/sub channel keyed by gateway ID. The message service publishes to `gateway:{gateway_id}:inbox`. Simpler fan-out; a small latency cost. Works well when the gateway fleet is large enough that maintaining direct connections in the message service becomes expensive.

Both are valid. Production systems (WhatsApp, Slack) use variations of direct internal messaging. Name the tradeoff: direct gRPC gives lower latency; pub/sub gives simpler service mesh at the cost of one extra hop.

### Delivery receipts and read receipts

When Gateway-B delivers the frame to the recipient's WebSocket, it sends a `delivered` event back through the message service to the sender's gateway. When the recipient's client marks the message as read, it sends a `READ` frame over its WebSocket, which flows back as a `read` receipt to the sender. These are **lightweight events** — they go through the same gateway → message service → session lookup → sender gateway pipeline but do not write to Cassandra (only update a `delivery_status` column or a separate lightweight table).

Tradeoff: if the receipt is lost in transit, it is not automatically retried — this is acceptable; WhatsApp shows "delivered" only when it receives confirmation. The sender can re-query if they care.

### Presence

Each client sends a heartbeat every 30 s over the WebSocket. The gateway refreshes `session:{user_id}` with a 60 s TTL. When the key expires, the user is considered offline. `last_seen` is written to a Cassandra or Redis table on disconnect. Presence reads are served from Redis with a short local cache on the gateway to absorb fan-out (every friend fetching your presence).

Tradeoff: presence is **eventually consistent** by TTL. A crashed client looks "online" for up to 60 s. This is standard behavior in production and acceptable.

### Group fan-out: small vs large groups

For a **small group (< 100 members)**, the message service fetches the member list, looks up each member's session, and pushes in parallel — all within a single request, fast.

For a **large group (100–500 members)**, synchronous fan-out within the write path is too slow. Instead: write the message once to the group message store, enqueue a fan-out task to an **async worker** (via a job queue). The worker reads the member list in pages and pushes to each member's gateway. Members who are offline get queued entries. This decouples write latency from group size.

Tradeoff: large-group delivery has a small added latency (queue round-trip, ~100ms) vs 1:1 delivery. This is the same push-vs-pull tradeoff from the news feed problem, applied to messaging: write to each member's inbox (push/fan-out on write) versus pulling from a shared group log on read. WhatsApp uses fan-out on write to each device; iMessage group chat uses a shared thread with each client pulling.

### Offline delivery

When a message cannot be delivered (session miss), two things happen simultaneously:
1. The message is already persisted in Cassandra — it will be delivered when the client pulls history on reconnect.
2. An entry is appended to the offline inbox (`LPUSH offline:{user_id} msg_id`) capped at 1000 items, and a **push notification** (APNs for iOS, FCM for Android) is fired with the message preview.

On reconnect, the gateway drains the inbox in order (`LRANGE` then `DEL`) and streams the messages to the client before entering normal operation. Because Cassandra holds the full message, the inbox only needs to hold `msg_id` references — the client fetches the full body from history if needed.

### End-to-end encryption (extension)

E2EE (as WhatsApp implements with the Signal protocol) means the server stores only ciphertext — it can route but cannot read messages. The session registry, message store, and fan-out logic are identical; the difference is that message payloads are opaque byte blobs from the server's perspective. Key exchange uses a prekey bundle system: each client uploads a batch of one-time prekeys to the server; senders fetch a prekey to establish a session before sending. The server never holds the private keys.

## 7. Bottlenecks & scaling

### Gateway capacity

Each WebSocket gateway holds ~50K connections. At 100M peak concurrent connections, you need ~2,000 gateway nodes. They are stateless beyond their in-memory connection table, so horizontal scaling is straightforward — add nodes, update the load balancer. The session registry in Redis connects them.

### Redis session registry at scale

A single Redis cluster can handle millions of keys with sub-millisecond reads. Shard by `user_id` hash across a Redis cluster of ~10–20 nodes. The session registry is the hottest path in the system (every message delivery touches it). Mitigation: gateways cache session entries locally for ~5 s (small TTL given the 60 s heartbeat interval) to absorb the read fan-out on message delivery.

### Cassandra write throughput

At 1.16M writes/s, a well-configured Cassandra cluster of 50–100 nodes handles this comfortably — Cassandra is write-optimized (LSM-tree) and linearly scalable. Partition key `chat_id` distributes writes evenly unless a single chat is extremely high volume (unlikely for 1:1; for a massive broadcast group, `chat_id` becomes a hot partition — mitigated by capping group size or splitting a large group's messages across multiple shards).

### Redis sequence counters as a bottleneck

`INCR` on a per-chat Redis key is O(1) but goes through a single Redis shard per `chat_id`. Hot 1:1 chats (very fast typists) are bounded by one Redis key — but even a 1,000 msg/s chat is trivial for Redis. The bigger concern is a Redis shard holding many hot chats. A 10-node Redis cluster for seq counters should distribute load well. Alternative: use a database sequence (Postgres `SEQUENCE`) sharded by `chat_id` — lower throughput but avoids Redis dependency on the write path.

### SPOF analysis

| Component | Redundancy |
|---|---|
| Gateway nodes | Many instances; session registry detects crashes via TTL expiry |
| Message service | Stateless, N instances behind a load balancer |
| Redis (session, seq) | Redis Cluster with replicas; if a shard fails, routing falls back to offline delivery |
| Cassandra | Replication factor 3; quorum writes; survives node loss |
| Push notification | APNs/FCM are external; local queue retries on failure |

**Fail-open on Redis:** if the session registry is temporarily unavailable, the message service cannot route to the recipient's gateway. It writes to Cassandra (message is safe), enqueues to the offline inbox (or skips and relies on history pull), and fires a push notification. The message is not lost. This is the correct fail-open behavior — durability over real-time delivery.
