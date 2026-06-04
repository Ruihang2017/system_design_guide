---
title: "7 · Architecture Patterns"
description: Key architectural patterns for structuring distributed systems, from monoliths and microservices to sagas, CQRS, and service meshes.
---

## Monolith vs microservices

- **Monolith:** one deployable application. Simple to build, test, deploy, and reason about; fast in-process calls; easy transactions. The right starting point for most products. Pain shows up at scale: the whole thing redeploys for any change, teams step on each other, and you can't scale parts independently.
- **Microservices:** many small services, each owning its domain and data, deployed independently. Independent scaling and deployment, team autonomy, fault isolation. The costs are heavy: network latency and failure between services, distributed data (no easy joins or transactions), operational complexity (observability, deployment, service discovery), and eventual consistency everywhere.

The mature take: **start with a (well-structured) monolith; extract microservices when you feel concrete pain** (a part needs independent scaling, a team needs autonomy, a component needs isolation). Don't adopt microservices for a system or org that isn't yet feeling those pains — you'll pay all the cost for little benefit.

## Supporting patterns

- **Service discovery** (Consul, etcd, DNS-based): how services find each other's changing addresses in a dynamic environment.
- **API Gateway / Backend-for-Frontend (BFF):** a single entry point that routes, authenticates, rate-limits, and aggregates calls to backend services; a BFF tailors one gateway per client type (web, mobile).
- **Distributed transactions:** when an operation spans services, you can't use one ACID transaction.
  - **Two-Phase Commit (2PC):** a coordinator asks all participants to prepare, then commit. Strong consistency, but **blocking** and the coordinator is a single point of failure. Avoided at scale.
  - **Saga pattern:** model the transaction as a sequence of local transactions, each with a **compensating action** to undo it if a later step fails. Two flavors: **choreography** (services react to each other's events) and **orchestration** (a central coordinator drives the steps). The standard approach for microservice transactions; gives you eventual consistency, not atomicity.
- **CQRS (Command Query Responsibility Segregation):** separate the write model from the read model so each can be optimized (and scaled) independently. Powerful but adds complexity; use when read and write needs genuinely diverge.
- **Event sourcing:** store the sequence of *events* (state changes) as the source of truth rather than current state; rebuild state by replaying events. Gives a full audit log and time travel, at the cost of complexity. Often paired with CQRS.
- **Service mesh (Istio, Linkerd):** offload networking concerns (retries, mTLS, observability, traffic shaping) from application code into a **sidecar** proxy (Envoy) next to each service.
- **Strangler fig:** migrate off a legacy system incrementally — route some traffic to new components, grow them until they "strangle" the old system — instead of a risky big-bang rewrite.
