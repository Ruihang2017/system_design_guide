---
title: "Distributed Rate Limiter"
description: "Design a fleet-wide rate limiter using Redis atomic counters, the sliding-window-counter approximation, local edge limiting, and a Lua token-bucket sketch."
---

A rate limiter enforces a policy like "no more than N requests per window per API key" across a fleet of API servers. The design challenge is doing this with minimal latency added to every request and with correct counts even when hundreds of servers are all hitting the same counters.

## 1. Requirements

*Functional:*
- Limit requests by **API key** (or user ID, IP — the same logic). Primary use case: third-party API clients.
- Configurable limit per key: e.g., 1,000 req/min, 10,000 req/day.
- Return **HTTP 429** with a `Retry-After` header when a limit is exceeded.
- Limit applies globally across the entire fleet — one client cannot bypass the limit by hitting multiple servers.
- Support multiple limit tiers (free: 100/min, pro: 10,000/min).

*Non-functional:*
- **Low latency overhead:** the check must add < 5ms p99 to every request.
- **Fail-open:** if the rate-limit service is unavailable, let traffic through rather than blocking all requests (availability over perfect enforcement).
- **Accuracy:** approximate is acceptable; a client slightly over the limit by a few percent is fine. Exactly-once accounting across distributed state is expensive.
- **Scale:** 100K+ req/s across a fleet of 100+ API servers; tens of millions of unique API keys.
- **No data loss on crash:** if the limiter state is lost (Redis restart), windows reset — this is a brief enforcement gap, not a catastrophe.

## 2. Estimation

100K req/s across the fleet → each request requires one limiter check. Each Redis operation must complete in < 2ms round-trip (same-datacenter Redis). Redis can handle ~500K–1M simple ops/s on a single node → a small cluster handles this with headroom.

Storage per key: one counter entry per key per window. For a 1-minute window and 10M active API keys, that is ~10M keys × ~50 bytes ≈ **500 MB** — trivially fits in Redis. With TTL equal to window size, expired keys are cleaned up automatically.

## 3. API

The rate limiter is not a user-facing REST API; it is **middleware** (a library or gateway module) that intercepts every inbound request. The external-facing contract is the HTTP response when the limit is exceeded:

```
-- Request allowed
200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 743
X-RateLimit-Reset: 1717200060   (Unix epoch of window reset)

-- Request denied
429 Too Many Requests
Retry-After: 37                 (seconds until the window resets)
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
```

Internally, the limiter exposes a single call: `check_and_count(key, limit, window_seconds) -> (allowed: bool, remaining: int, reset_at: epoch)`.

## 4. Data model & storage choice

The limiter state is **ephemeral, integer counters**, frequently updated, with automatic TTL expiry. There is no relational structure and no need for complex queries. **Redis** is the natural fit:

- Atomic integer operations (`INCR`, `SET`, `EXPIRE`) without external locking.
- Sub-millisecond single-op latency at >100K ops/s per node.
- Cluster mode for horizontal scaling.
- TTL-based automatic key expiry eliminates cleanup jobs.

**Key schema:** `rl:{api_key}:{window_start_epoch}` where `window_start_epoch = floor(current_time / window_size) * window_size`. For a 60-second window:

```
rl:key_abc123:1717200000  ->  743   (INCR on each request, EXPIRE = window_size)
```

When the window rolls, a new key is created and the old one expires automatically. No cleanup needed.

## 5. High-level design

```
  Client
    |
    v
  DNS / L4 LB
    |
    +----------+-----------+----------+
    |          |           |          |
  API-1      API-2       API-3     API-N
  (each runs rate-limit middleware)
    |          |           |          |
    +----------+-----------+----------+
                    |
            +-------+-------+
            |  Redis Cluster |
            | (shared state) |
            +-------+-------+
               (3 shards, each replicated)

  Per-request flow on API-N:
    1. Extract api_key from Authorization header.
    2. Compute window key: rl:{api_key}:{floor(now/60)*60}
    3. Run Lua script (or INCR+EXPIRE) against the Redis shard
       owning that key.
    4. If counter > limit: return 429 with Retry-After.
    5. Else: forward request to upstream handler.
    6. Return response with X-RateLimit-* headers.
```

Because every API server hits the same Redis cluster, counts are **globally consistent** across the fleet. A client cannot bypass the limit by round-robining across API servers.

## 6. Deep dives

### The five algorithms: tradeoffs

Before committing to one algorithm, name them and their tradeoffs.

**Fixed window** — increment a counter each window period, reset on rollover.
- Pro: simple, one Redis key per window, O(1) space.
- Con: allows 2× burst at window boundaries. A client making 1,000 requests in the last second of one minute and 1,000 in the first second of the next gets 2,000 through two back-to-back windows, each appearing within-limit.

**Sliding window log** — store the timestamp of every request; count entries in the past `window` seconds.
- Pro: perfectly accurate.
- Con: O(requests) memory per key; expensive for high-rate clients; requires a sorted set in Redis and a range query per request.

**Sliding window counter (approximation)** — a weighted blend of the current and previous fixed-window counters to approximate a true sliding window.
```
  approximate_count =
    prev_window_count * (1 - elapsed_fraction_of_current_window)
    + current_window_count
```
Where `elapsed_fraction = (now - current_window_start) / window_size`.
- Pro: O(1) space (two counters), very accurate in practice (<1% error for smooth traffic), no stored timestamps.
- Con: slightly under-counts if traffic is bursty at boundaries — an acceptable tradeoff.

**Token bucket** — a bucket holds up to `capacity` tokens; tokens refill at a steady rate; each request consumes one.
- Pro: allows controlled bursts up to `capacity`; naturally handles variable request sizes (consume `n` tokens for a large request).
- Con: more state to maintain (token count + last-refill timestamp); requires an atomic read-modify-write.

**Leaky bucket** — requests queue and drain at a constant rate.
- Pro: perfectly smooth output; protects downstream from bursts.
- Con: adds latency (requests wait in the queue); not appropriate as an API-level gate because clients wait rather than receive an immediate 429.

**Chosen design:** the **sliding window counter** for most rate-limit policies (simple, O(1) space, accurate). **Token bucket** as an option when operators want to explicitly allow burst headroom. The fixed window's double-burst problem is a common interview trap — name it and reject it.

### Atomicity and race conditions

Naive approach:
```python
count = redis.GET(key)
if count >= limit: return 429
redis.INCR(key)
```
This is a **TOCTOU race**: between `GET` and `INCR`, another server may have incremented the counter. Multiple requests could all read `count = limit - 1` and all be allowed.

**Correct approach A — INCR then check:**
```python
count = redis.INCR(key)
if count == 1:
    redis.EXPIRE(key, window_seconds)  # set TTL on first write
if count > limit:
    return 429
```
`INCR` is atomic in Redis. The counter always ends up correct. Edge case: if the server crashes between `INCR` and `EXPIRE`, the key has no TTL and never expires. Mitigate by using `SET key 0 EX {window} NX` on first creation, or by using a Lua script.

**Correct approach B — Lua script for token bucket:**

A Lua script executes atomically on the Redis server, avoiding all race conditions.

```lua
-- Token bucket in Lua (called with KEYS[1] = key, ARGV[1] = capacity,
--   ARGV[2] = refill_rate_per_sec, ARGV[3] = now_ms, ARGV[4] = cost)
local key      = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate     = tonumber(ARGV[2])   -- tokens per second
local now      = tonumber(ARGV[3])   -- current time in ms
local cost     = tonumber(ARGV[4])   -- tokens this request costs

local data = redis.call("HMGET", key, "tokens", "last_ms")
local tokens  = tonumber(data[1]) or capacity
local last_ms = tonumber(data[2]) or now

-- Refill tokens based on elapsed time
local elapsed  = math.max(0, now - last_ms)
local refilled = elapsed * rate / 1000
tokens = math.min(capacity, tokens + refilled)

if tokens < cost then
    -- Not enough tokens; update last_ms but do not deduct
    redis.call("HMSET", key, "tokens", tokens, "last_ms", now)
    redis.call("EXPIRE", key, math.ceil(capacity / rate) + 1)
    return {0, math.ceil((cost - tokens) / rate * 1000)}  -- {allowed=0, retry_after_ms}
end

tokens = tokens - cost
redis.call("HMSET", key, "tokens", tokens, "last_ms", now)
redis.call("EXPIRE", key, math.ceil(capacity / rate) + 1)
return {1, math.floor(tokens)}  -- {allowed=1, remaining}
```

The entire read-modify-write is a single atomic operation — no race, no TOCTOU.

### Per-edge local approximate limiting

Calling Redis on every request adds ~1–2ms of network round-trip. At 100K req/s that is 100K Redis ops/s — fine for a small cluster, but at 1M req/s it becomes the bottleneck.

**Optimization: local counters on each API server, synced asynchronously.**

Each API server maintains an in-process counter for each API key it sees. Every `sync_interval` (e.g., 100ms) it:
1. Atomically reads and resets its local delta.
2. `INCRBY`s the Redis counter by the delta.
3. Reads back the new global total to check against the limit.

Between syncs, the local server allows up to `local_allowance = limit * sync_interval / window_size` requests without a Redis call. With 10 servers and a 1-minute window, a 1-second sync interval, each server locally allows up to `limit * 1/60 ≈ 1.7%` of the window budget per sync — a small local over-allowance that collapses to the correct global limit over the window.

Tradeoff: a client can momentarily exceed the limit by roughly `num_servers * local_allowance` before the global Redis counter catches up. For a non-adversarial client this is a rounding error; for adversarial clients it is a small, bounded over-allowance. **Accuracy vs latency**: this drops Redis calls by 10–100×, cutting Redis load proportionally and eliminating network overhead on every request.

### Clock and window-boundary issues

**Clock skew between servers** means two servers may disagree on which window is current by up to a few hundred milliseconds if their system clocks diverge. Mitigate with NTP (all servers synchronized) or by using Redis server time (`TIME` command) as the authoritative clock. The latter adds one round-trip but is strictly correct.

**Window boundary burst** (fixed-window double-burst) is the reason to prefer the sliding window counter: a client that exhausts its budget at the end of one window and again at the start of the next has effectively used 2× the limit in a short span. The sliding window counter formula smooths this without extra storage.

### Fail-open behavior

If Redis is unavailable, the middleware falls back to **allowing all traffic** rather than returning 429 for everyone. The rate limit is a best-effort protection; taking down the API because the limiter is unhealthy is the wrong tradeoff. Log and alert aggressively when failing open. A circuit breaker on the Redis client triggers the fail-open path cleanly.

## 7. Bottlenecks & scaling

### Hot key: one heavy client

A single API key making 10,000 req/s sends 10,000 INCR operations per second to **one Redis shard** (because all requests share the same key). This is a classic hot-key problem.

Mitigations:
1. **Per-edge local counters** (section above) batch those 10,000 ops into ~100 async INCRBY calls — a 100× reduction per sync interval.
2. **Key splitting:** shard the counter across `N` Redis keys (`rl:{key}:{window}:{server_id}`), each holding `limit/N` as the sub-limit. A server checks its shard and allows if `shard_count < limit/N`. This distributes load but requires a read-across-shards for the accurate global count — do this in a background reconciliation rather than on the hot path.
3. **Circuit breaker per client:** if one key is consistently over-limit, the gateway can short-circuit the Redis check entirely and return 429 immediately from local state for some window.

### Scaling Redis

Redis Cluster shards keys across nodes by hash slot. With `rl:{api_key}:{window}` as the key, the hash distributes evenly across ~16,384 slots. Adding shards scales read and write capacity linearly. Each shard is replicated (one primary, one or two replicas); if a shard primary fails, the replica is promoted. During the brief failover window (~30 s), the middleware fails open.

At 1M req/s with local approximate limiting reducing Redis calls 10×, the cluster sees ~100K ops/s — handled by a 3-node Redis cluster with CPU headroom.

### Sliding-window-counter accuracy under bursts

The approximation formula assumes traffic in the previous window was uniformly distributed. If a client sent all its requests in the last second of the previous window, the formula over-weights that window's count. In the worst case (all traffic at window boundary) the formula is maximally pessimistic — it denies requests that would technically be allowed. This is the safe direction of error (false positives for throttling), not the dangerous one (letting traffic through). Name this explicitly: the sliding window counter is **conservative** at boundaries, not permissive.
