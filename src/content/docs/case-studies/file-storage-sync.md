---
title: "File Storage & Sync (Dropbox / Google Drive)"
description: "Design a cloud file-sync service: content-addressed chunking, metadata vs blob separation, cursor-based change feeds, and conflict handling."
---

File storage and sync is the canonical problem for **bandwidth efficiency**. Uploading a whole file every time a user edits a single paragraph would be unacceptably wasteful. The central difficulty is not storage (object storage is cheap and effectively infinite) — it is figuring out the minimum bytes that need to move between client and server on every save.

## 1. Requirements

*Functional:*
- Upload and download files from any device via a desktop client, mobile app, or web browser.
- Sync a user's files automatically across all their devices — new or changed files appear without manual action.
- Shared folders: multiple users can collaborate on the same folder tree; changes by any member are visible to all.
- File versioning: restore a previous version of any file within a retention window (e.g., 30 days).
- Conflict handling: when two devices edit the same file concurrently, neither edit is silently lost.

*Non-functional:*
- **Bandwidth efficiency:** transferring only the changed parts of a file, not the whole file on every save.
- **Large-file support:** files up to ~50 GB; uploads must be resumable after a network interruption.
- **Durability:** uploaded data must survive hardware failure (no data loss).
- **Availability:** 99.99% for file access; sync may lag slightly, but files must always be readable.
- **Storage efficiency:** identical content should be stored only once, regardless of how many users store it.

## 2. Estimation

Assume **500 M registered users**, 100 M daily active users. Average user stores ~10 GB. Total managed data: 500 M × 10 GB = **5 EB**.

Average file size: ~2 MB. A user edits ~10 files per day. The critical observation is that a typical edit changes only a small fraction of the file — a 2 MB document where one paragraph was updated might have only ~20 KB of truly changed bytes. A naive design that re-uploads the full 2 MB wastes **100× bandwidth**.

*Metadata vs blob volume:*
Each file's metadata record (chunk list, version, name, timestamps, owner) is ~2 KB. Total metadata: 500 M users × 5,000 files each × 2 KB ≈ **5 TB** — a rounding error compared to the 5 EB of blob data. This asymmetry is key: serve metadata from a transactional database, blobs from object storage. Do not conflate them.

*Change-feed traffic:*
100 M DAU × 10 edits/day = 1 B file change events per day → ~11,600 events/second on average; peak at 3× ≈ 35 K/s. Each event is lightweight (file ID, version pointer, affected chunks) — metadata, not blob bytes.

**Core constraint:** bandwidth efficiency. Chunking + deduplication is not an optimization — it is the foundational design decision.

## 3. API

```
-- Upload a single chunk (content-addressed by its hash)
PUT /v1/chunks/{chunk_sha256}
Content-Type: application/octet-stream
Body: <raw chunk bytes>
→ 201 Created | 200 OK (already exists, no-op)

-- Query which chunks the server is missing for a planned commit
POST /v1/chunks/check
Body: { "hashes": ["sha256:abc...", "sha256:def...", ...] }
→ { "missing": ["sha256:def...", ...] }

-- Commit a file: record the ordered list of chunk hashes as a new version
POST /v1/files/{file_id}/versions
Body: {
  "path":       "/photos/trip.jpg",
  "chunks":     ["sha256:abc...", "sha256:def...", "sha256:ghi..."],
  "parent_version": "v42"   // optimistic concurrency: must match current server version
}
→ { "version": "v43", "file_id": "...", "committed_at": 1748995200 }

-- Poll for changes since a known cursor position
GET /v1/changes?cursor=<opaque_cursor>&limit=500
→ {
    "changes": [
      { "file_id": "...", "path": "...", "version": "v43", "chunks": [...] },
      ...
    ],
    "cursor": "<new_cursor>",   // advance this on the next poll
    "has_more": true
  }
```

The `cursor` is an opaque server-side token encoding the namespace + sequence position. Clients store it locally and send it on every poll; they never need to reason about what is inside it. The `parent_version` field in the commit call implements **optimistic concurrency control**: if another device committed a newer version between when this device last synced and now, the server rejects the commit and the client must reconcile before retrying.

## 4. Data model & storage choice

### Chunk store (blobs)

Chunks are stored in **object storage** (S3-compatible). The key is the chunk's content hash: `chunks/{sha256}`. Because the key *is* the content hash, storing the same bytes twice is a no-op — the second write lands on an already-existing key. This gives **global cross-user deduplication for free**, without any explicit dedup logic in the application layer.

Object storage is the right choice: it is cheap (roughly $0.02/GB/month), effectively infinite, durable (11 nines in AWS S3), and designed for large sequential reads and writes. It is not a database — do not query it with predicates; just `GET` and `PUT` by key.

### File metadata (relational)

The chunk list, file tree, and version history live in a **relational database** (PostgreSQL). The access patterns are small, structured, and transactional — exactly what a relational DB is for.

```sql
-- One row per file version
file_versions (
  file_id        UUID,
  version        BIGINT,           -- per-file monotonic counter
  path           TEXT,
  owner_user_id  UUID,
  namespace_id   UUID,             -- user or shared folder
  chunk_hashes   TEXT[],           -- ordered list: ["sha256:abc", ...]
  size_bytes     BIGINT,
  created_at     TIMESTAMPTZ,
  PRIMARY KEY (file_id, version)
);

-- Latest version pointer (denormalized for fast current-state reads)
files (
  file_id        UUID PRIMARY KEY,
  namespace_id   UUID,
  path           TEXT,
  current_version BIGINT,
  is_deleted     BOOLEAN DEFAULT false,
  updated_at     TIMESTAMPTZ
);

-- Per-device sync cursor
device_cursors (
  device_id      UUID PRIMARY KEY,
  user_id        UUID,
  namespace_id   UUID,
  last_seq       BIGINT    -- position in the namespace's change log
);
```

The `files` table tracks the current state; `file_versions` is the append-only history that powers versioning and restore.

### Namespace change log

A per-namespace append-only log (backed by a sequenced DB table or a dedicated log service) records every committed change in order. The `cursor` in the changes feed is a pointer into this log. Each device advances its cursor as it consumes changes, enabling incremental sync without re-scanning all files.

## 5. High-level design

```mermaid
flowchart TD
    C[Client<br/>splits file → chunks<br/>hashes each chunk]
    MS[Metadata Service]
    CS[Chunk Store<br/>Object Storage]
    DB[(Metadata DB<br/>PostgreSQL)]
    CL[Change Log]
    D2[Other Devices]

    C -->|POST /chunks/check<br/>which hashes are missing?| MS
    MS -->|query chunk index| DB
    MS -->|missing hashes| C
    C -->|PUT /chunks/{hash}<br/>upload missing chunks only| CS
    C -->|POST /files/{id}/versions<br/>commit chunk list| MS
    MS -->|write file_versions row<br/>update files row| DB
    MS -->|append change event| CL
    D2 -->|GET /changes?cursor=...<br/>poll for new events| MS
    MS -->|read change log| CL
    D2 -->|GET /chunks/{hash}<br/>download changed chunks| CS
```

**Upload path:** the client splits the file into fixed-size chunks, hashes each one, and asks the Metadata Service which hashes are already on the server. It uploads only the missing chunks directly to object storage, then commits the ordered chunk list as a new file version. If the commit is rejected (stale `parent_version`), it fetches the latest version and reconciles before retrying.

**Sync path:** other devices poll the changes feed with their stored cursor. The feed returns lightweight change events (file ID, new version, chunk list). The client compares the incoming chunk list against what it already has locally — chunks it already has (from a previous sync or a locally identical file) are skipped; only truly new chunks are downloaded from object storage.

This is the key insight: **data flows directly between the client and object storage for large blobs; the Metadata Service handles only small control-plane messages**.

## 6. Deep dives

### (a) Chunking and content-addressed deduplication

Files are split into chunks of roughly **4–8 MB** each (Dropbox uses variable-length chunking via a rolling hash to align chunk boundaries with content, so a small insertion does not shift every subsequent chunk — Rsync-style). Each chunk is identified by its SHA-256 hash.

The consequences are substantial:

- **Cross-file dedup:** a 200 MB ISO image uploaded by 10,000 users is stored once. The Metadata Service records 10,000 different `file_versions` rows pointing at the same set of chunk hashes. The chunk store holds one copy.
- **Delta sync:** when a user adds a chapter to a 50-page Word document, only the 1–2 chunks that changed are new. All other chunks already exist on the server and on the user's other devices. Only the changed chunks transit the network.
- **Resumable uploads:** if an upload is interrupted, the client re-checks which chunks are missing. Chunks already uploaded are acknowledged; only the remainder need to be re-sent.

Tradeoff: chunk size is a tension. Smaller chunks mean finer delta granularity and better dedup, but more metadata (more hashes per file, more round-trips for the missing-chunks check). Larger chunks mean less overhead but coarser deltas. 4–8 MB is a pragmatic midpoint.

### (b) Metadata vs blob separation

This is the most important structural decision. Blobs (chunk bytes) and metadata (chunk lists, file trees, version history) have completely different characteristics:

| | Chunks (blobs) | File metadata |
|---|---|---|
| Size | 4–8 MB each | ~2 KB per file version |
| Storage tier | Object storage | Relational DB |
| Access pattern | Large sequential reads/writes | Small transactional reads/writes |
| Total volume | ~5 EB | ~5 TB |
| Mutability | Immutable (content-addressed) | Append-only versions, mutable current pointer |

Mixing them would be expensive and wrong: storing gigabytes in a relational DB is slow and costly; running transactional queries against object storage is impossible. Keeping them separate lets each tier do what it was designed for.

:::note[In the real world]
Dropbox rebuilt its sync engine (dubbed **Nucleus**) around three explicit trees — the **remote tree** (latest state in the cloud), the **local tree** (last observed state on disk), and the **synced tree** (last known fully-synced state). The engine reconciles these three trees to compute what to upload, what to download, and what constitutes a genuine conflict. This three-tree model makes conflict detection precise: a conflict arises only when both the remote tree and the local tree have diverged from the synced tree in incompatible ways. See [Rewriting the heart of our sync engine](https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine) for the full writeup.
:::

### (c) Sync protocol: cursor-based change feed

Polling "what files have changed?" is a solved problem if you have a cursor. The change log is an append-only sequence of events, one per committed file change. Each event has a monotonically increasing sequence number within a namespace.

A device stores its `last_seq` locally. On sync:
1. `GET /changes?cursor={last_seq}` — returns up to 500 events newer than the cursor.
2. For each event, the client inspects the incoming chunk list. Chunks already cached locally are skipped; others are fetched from object storage.
3. The client advances `last_seq` to the new cursor returned by the server.

This is efficient: a device that was offline for a week fetches only the events that happened while it was offline, not a full re-scan. A device that is continuously connected polls every few seconds with minimal payload if nothing changed (`has_more: false`, empty `changes` array).

Tradeoff: long-polling or WebSocket push reduces latency for real-time sync (the client is notified of changes without waiting for the next poll interval). The change-feed cursor design supports both: the server can push events over a persistent connection using the same cursor semantics.

### (d) Conflict handling

A conflict occurs when two devices edit the same file concurrently — both have diverged from their last common synced version. The commit API's `parent_version` field surfaces this: when device B tries to commit its edit, the server rejects it because device A already advanced the version beyond `parent_version`.

The correct policy for a sync service: **never silently lose either edit**. Options:

1. **Last-write-wins (LWW):** the later commit overwrites the earlier one. Simple, but silently drops data. Unacceptable for documents; used only for append-only or idempotent data (e.g., a frequently-updated thumbnail).
2. **Conflicted copy:** keep both versions. The server accepts both commits under different version IDs and creates a sibling entry in the user's folder (e.g., `report (Conflicted copy - Alice's MacBook, 2026-06-04).docx`). The user sees both and decides. This is Dropbox's behavior.
3. **Three-way merge:** if the file format supports it (e.g., plain text), merge both edits automatically using the common ancestor as the base. Google Docs does this with its operational transform / CRDT engine, but it requires the server to understand the file format.

For a general-purpose file sync service, **conflicted copies are the safe default**. Data loss is a worse outcome than a messy folder. The application layer (a Google Docs-style editor) can add smarter merging on top.

## 7. Bottlenecks & scaling

### Metadata DB hot spots

The `files` table is written on every commit and read on every sync event. Shard by `namespace_id` (user or shared folder) so that a user's metadata always lands on one shard — this keeps file-tree queries local and avoids cross-shard joins. Hot namespaces (shared folders with many active collaborators) may need their own dedicated DB instance.

Read replicas absorb the read load from devices polling the change feed; the primary handles only writes.

### Chunk store scale

Object storage (S3, GCS) scales horizontally without design work — this is precisely what it was built for. The only concern is **upload/download throughput costs**. Mitigations: CDN in front of read-heavy chunks (profile photos, shared assets that many users download); presigned URLs so clients upload/download directly to object storage, bypassing the Metadata Service entirely on the data plane.

### Sync fan-out for large shared folders

A shared folder with 1,000 members is a **fan-out problem**: one file commit must propagate a change event to all 1,000 member devices. At 35 K global change events/second with an average fan-out of 10 collaborators, that is 350 K notification deliveries/second. A shared folder with 1,000 members and a busy collaborator could spike to millions of events/second for that namespace.

Mitigations:
- **Async fan-out via a message queue:** the Metadata Service writes the commit to the DB and enqueues a fan-out task; a worker service reads the member list and dispatches change notifications. The commit path is O(1); fan-out is decoupled.
- **Rate-limit notification delivery per device:** devices tolerate a few seconds of lag for large folders. Batch multiple events into one delivery.
- **Cursor-based pull (not push):** for very large shared folders, stop pushing and let devices poll — the change feed is cheap to read, and each device fetches only what it needs.

### Notification layer

For near-real-time sync, devices need to know when to poll. Options: long-polling (hold the HTTP connection open; server responds when an event arrives), WebSocket push (persistent connection, lowest latency), or platform push notifications (APNs/FCM for mobile background sync). Long-polling is simplest to operate; WebSocket is the production choice for desktop clients.

### SPOF and redundancy

| Component | Redundancy |
|---|---|
| Metadata Service | Stateless; N instances behind a load balancer |
| PostgreSQL (metadata DB) | Primary + read replicas; automated failover (e.g., RDS Multi-AZ) |
| Chunk store | Object storage replication across at least 3 availability zones (11-nines durability) |
| Change log | Replicated append-only log; consumers are stateless (cursor is stored per device) |
| Notification/long-poll layer | Stateless; any node can serve any device's poll |

**Fail-open on notification layer:** if the push/long-poll service is unavailable, clients fall back to periodic polling. Files are never lost — the change log is durable. Sync merely becomes slightly less real-time.

---

Cross-references: chunk storage is a specialization of the blob/object storage pattern in [Databases & Storage](/building-blocks/databases/); the change-feed cursor pattern appears in event-driven architectures covered in [Specialized Components](/building-blocks/specialized-components/); caching chunk metadata at the edge follows strategies in [Caching](/building-blocks/caching/). Practice applying this end-to-end in [Practice Problems](/case-studies/practice-problems/).
