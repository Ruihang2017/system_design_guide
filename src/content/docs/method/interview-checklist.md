---
title: "Interview Checklist"
description: "A one-page skimmable checklist for driving a system design interview or design review, distilled from the 7-step framework."
---

Use this checklist to stay on track during any system design interview or design review. See the [full framework](/method/framework/) for the reasoning behind each step.

## The 7-step checklist

- [ ] **Clarify requirements**
  - Pin down functional requirements; explicitly defer out-of-scope features
  - Ask about scale: users, QPS, data size
  - Ask about read/write ratio, latency targets, availability, consistency needs

- [ ] **Estimate (back-of-envelope)**
  - Traffic: reads vs writes, peak multiplier
  - Storage: bytes per record × records × retention × replication factor
  - Bandwidth: requests/second × response size

- [ ] **Define the API**
  - List the key endpoints with inputs and outputs
  - Confirm the contract matches the agreed functional requirements

- [ ] **Data model**
  - Identify key entities and their relationships
  - Map out access patterns before choosing a database
  - Justify SQL vs NoSQL from those access patterns

- [ ] **High-level design**
  - Draw the major components: client → LB → services → datastores/cache/queue
  - Walk through a request end-to-end to verify the skeleton is complete
  - Get agreement on the shape before diving deep

- [ ] **Deep dive**
  - Choose the hardest or most interesting part and go deep
  - Cover the sharding scheme, caching strategy, fan-out approach, or consistency handling as relevant
  - Show tradeoffs explicitly — do not present one option as simply "correct"

- [ ] **Bottlenecks & scale**
  - Identify single points of failure (SPOFs) and hot spots
  - Address each: replicas, caches, queues, sharding
  - Discuss failure handling; name what you would sacrifice and why

## Common mistakes to avoid

- [ ] Jumping to a solution before clarifying requirements
- [ ] Over-engineering for a scale that isn't required
- [ ] Staying entirely high-level with no deep dive
- [ ] Drowning in detail with no overall structure
- [ ] Presenting one design as "correct" instead of discussing tradeoffs
- [ ] Forgetting the non-functional requirements entirely

:::tip[Pin it]
Always clarify requirements and run your estimates **before** drawing a single box. And whenever you make a design choice, name the tradeoff — say what you gain and what you give up.
:::
