---
title: "8 · Reliability & Resilience"
description: Patterns for designing systems that tolerate failure gracefully, including circuit breakers, bulkheads, rate limiting, and disaster recovery planning.
---

Failure isn't an edge case at scale; it's constant. Design assuming components *will* fail.

## Eliminate single points of failure (SPOF)

Any component whose failure takes down the system is a SPOF. Remove them with **redundancy**: run multiple instances of everything, across multiple availability zones/regions.

- **Failover models:** **active-passive** (a standby takes over when the primary fails — simpler, some failover delay) vs **active-active** (all instances serve traffic — better utilization and instant failover, but needs careful state coordination).

## Resilience patterns (stop failures from cascading)

- **Timeout:** never wait forever on a dependency; fail fast.
- **Retry with exponential backoff + jitter:** retry transient failures, but back off increasingly and add randomness so all clients don't retry in sync (a "retry storm").
- **Circuit breaker:** if a dependency keeps failing, "open the circuit" and fail fast for a while instead of hammering it; periodically test (half-open) before closing again. Prevents one sick service from dragging everything down.
- **Bulkhead:** isolate resources (thread pools, connection pools) per dependency so one overloaded dependency can't starve the rest — like watertight compartments in a ship.
- **Load shedding & graceful degradation:** under extreme load, drop or reject lower-priority work, and serve a reduced experience (stale data, fewer features) rather than failing entirely. A search box that falls back to "no autocomplete" still works.

## Rate limiting (protect yourself and ensure fairness)

Five algorithms, roughly increasing in sophistication:

- **Fixed window:** count requests per fixed time window. Simple, but allows 2× bursts at window boundaries.
- **Sliding window log:** store timestamps of each request; perfectly accurate but memory-heavy.
- **Sliding window counter:** approximate the sliding window using weighted adjacent fixed windows. Efficient and good enough — common in practice.
- **Token bucket:** tokens refill at a steady rate up to a cap; each request consumes one. **Allows controlled bursts.** Widely used.
- **Leaky bucket:** requests queue and drain at a constant rate. **Smooths** bursts into a steady stream.

## Disaster recovery

- **RPO (Recovery Point Objective):** how much data you can afford to lose (drives backup frequency / replication).
- **RTO (Recovery Time Objective):** how fast you must be back up (drives standby/failover strategy).
- Tactics: regular **backups** (and *tested* restores), cross-region replication, and **chaos engineering** (deliberately injecting failures — à la Netflix's Chaos Monkey — to prove the system survives them).
