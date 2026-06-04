---
title: "6 · Messaging & Async"
description: Decoupling services with queues and pub/sub — delivery semantics, idempotency, backpressure, and the stream vs batch divide.
---

Synchronous calls are simple but couple services tightly and propagate failure. **Asynchronous messaging** decouples producers from consumers, smooths out load spikes, and lets parts fail independently. This is one of the biggest leaps from POC thinking ("call the function and wait") to production thinking ("emit an event, let the system handle it").

## Queues vs pub/sub

- **Message queue (point-to-point):** a producer puts a message on a queue; one consumer takes it. For distributing work (task queues). Buffers bursts so a slow downstream doesn't drop requests.
- **Publish/subscribe (pub/sub):** a producer publishes to a topic; *many* subscribers each get a copy. For broadcasting events ("order placed" → email service, analytics, inventory, all react).

Common systems: **Kafka** (a distributed, partitioned, durable commit log — extremely high throughput, retains messages, consumer groups, ordering *within a partition* — the backbone of event-driven and streaming architectures); **RabbitMQ** (a flexible traditional broker with rich routing); **SQS** (a managed cloud queue).

## Delivery semantics (and why idempotency matters)

- **At-most-once:** may be lost, never duplicated. (Fire and forget.)
- **At-least-once:** never lost, may be duplicated. **The common, practical choice.**
- **Exactly-once:** never lost, never duplicated. Genuinely hard and often a partial illusion; usually achieved as "at-least-once delivery + idempotent processing."

Because at-least-once is normal, **idempotency** is essential: design operations so that processing the same message twice has the same effect as once (e.g., "set balance to X" is idempotent; "add $10" is not — make it idempotent with an idempotency key that dedupes retries). This is a core production skill that POC code usually ignores.

## Other essentials

- **Dead-letter queue (DLQ):** messages that keep failing get moved aside for inspection instead of blocking the queue forever.
- **Backpressure:** when consumers can't keep up, the system must push back — buffer, shed load, or signal producers to slow down — rather than melt down.
- **Stream vs batch processing:** **batch** processes large bounded datasets periodically (Spark, the old MapReduce model) — high throughput, high latency. **Stream** processes events continuously as they arrive (Kafka Streams, Flink) — low latency. Many systems use both (the "Lambda"/"Kappa" architectures).
