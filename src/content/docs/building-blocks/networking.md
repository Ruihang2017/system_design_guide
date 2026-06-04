---
title: "3 · Communication & Networking"
description: How requests travel from client to server — DNS, load balancing, API paradigms, and the protocols that connect every distributed system.
---

## The path of a request

`DNS → Load Balancer → (API Gateway) → Application servers → datastores/caches`. Know each hop.

- **DNS** turns a domain into an IP address. It's also a coarse load-balancing and routing tool (geo-routing, failover). Cached aggressively (TTLs), so DNS changes propagate slowly.
- **Load balancer (LB)** distributes traffic across servers, removing dead ones via health checks. It's how horizontal scaling becomes invisible to clients.
- **API Gateway** (often in front of microservices) handles cross-cutting concerns in one place: auth, rate limiting, routing, request aggregation, TLS termination.

## Load balancing — L4 vs L7 and algorithms

- **L4 (transport layer):** routes by IP/port without looking at the payload. Fast, protocol-agnostic.
- **L7 (application layer):** understands HTTP — can route by URL path, headers, cookies; do TLS termination and content-based routing. More flexible, slightly more overhead. Most web LBs are L7.

Common distribution algorithms: **round robin** (rotate), **weighted round robin** (bigger servers get more), **least connections** (send to the least busy), **least response time**, and **consistent hashing / IP hash** (same client → same server, important for sticky sessions and cache locality).

## API paradigms — pick the right shape

- **REST** — resources addressed by URLs, manipulated with HTTP verbs (GET/POST/PUT/DELETE), stateless. Ubiquitous, cacheable, simple. Can over-fetch (you get the whole object) or under-fetch (need multiple round trips).
- **GraphQL** — one endpoint; the client specifies exactly which fields it wants. Kills over/under-fetching, great for mobile and complex UIs. Costs: harder caching, query complexity/N+1 risks on the server.
- **gRPC** — binary (Protocol Buffers) over HTTP/2. Fast, strongly typed, supports streaming. The default for **internal service-to-service** calls. Less browser-friendly.
- **WebSockets** — persistent, full-duplex connection. For real-time bidirectional comms: chat, live dashboards, multiplayer, collaborative editing.
- **Server-Sent Events (SSE)** — one-way server→client stream over plain HTTP. Simpler than WebSockets when you only need to push (notifications, live scores).
- **Long polling** — client request hangs until the server has data. A fallback for "near real-time" without persistent connections.
- **Webhooks** — the server calls *your* URL when an event happens. The pattern for third-party event delivery (Stripe, GitHub).

## Protocols worth knowing

- **TCP** — reliable, ordered, connection-based. The default for almost everything.
- **UDP** — fast, connectionless, no delivery/order guarantees. For where speed beats reliability: video/voice, gaming, DNS.
- **HTTP/1.1 → HTTP/2 → HTTP/3:** 1.1 has head-of-line blocking; 2 adds multiplexing (many requests over one connection) and binary framing; 3 runs over QUIC (UDP-based), removing TCP-level head-of-line blocking and speeding up connection setup.
