---
title: "11 · The System Design Framework"
description: "A numbered 7-step method for driving any system design problem or interview, with common mistakes to avoid."
---

Whether in an interview or a real design doc, drive the problem in this order. The framework is as important as the knowledge — it shows you think structurally instead of jumping to a solution.

1. **Clarify requirements (don't skip — this is where most people lose points).**
   - *Functional:* what must it do? Pin down the core features; explicitly defer the rest ("let's focus on posting and the timeline; analytics is out of scope for now").
   - *Non-functional:* scale (users, QPS, data size), read/write ratio, latency targets, availability, consistency needs. **Ask, don't assume.**
2. **Estimate (back-of-envelope).** Traffic (reads vs writes, peak), storage, bandwidth. The numbers justify your later choices ("116K reads/s and 91 TB → we need caching and sharding").
3. **Define the API.** A handful of endpoints with their inputs/outputs. This clarifies exactly what the system does and forms the contract for the design.
4. **Design the data model.** Key entities, relationships, and access patterns. *Let access patterns drive the database choice*, then justify SQL vs NoSQL.
5. **High-level design.** Draw the major components and how a request flows through them: client → LB → services → datastores/cache/queue. Get the skeleton agreed before diving deep.
6. **Deep dive.** Pick the interesting/hardest parts and go deep: the sharding scheme, the caching strategy, the fan-out approach, the consistency handling. This is where seniority shows.
7. **Identify bottlenecks & scale it.** Find the SPOFs and hot spots, then address them: add replicas, caches, queues, sharding; discuss failure handling and tradeoffs. Be explicit about what you'd sacrifice and why.

**Common mistakes to avoid:** jumping to a solution before clarifying requirements; over-engineering for a scale that isn't required; staying entirely high-level with no deep dive (or drowning in detail with no structure); presenting one design as "correct" instead of discussing tradeoffs; forgetting the non-functional requirements entirely.
