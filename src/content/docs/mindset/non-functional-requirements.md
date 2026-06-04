---
title: "0 · Functional vs Non-Functional"
description: "The mindset shift from POC to production: the non-functional requirements that are the whole subject."
---

A POC answers one question: *does the thing work?* System design answers a harder set: *does it keep working, fast, for everyone, cheaply, forever — and can we change it safely?*

Those second questions are the **non-functional requirements (NFRs)**, and they are the entire subject. Internalize this list; you'll return to it for every design:

- **Scalability** — does it handle growth in users, data, and traffic without falling over or requiring a rewrite?
- **Availability** — what fraction of the time is it up and serving? (The "nines.")
- **Reliability** — does it produce correct results and not lose data, even when components fail?
- **Latency** — how long does a single request take? (Usually you care about the *tail*: p99, p999, not the average.)
- **Throughput** — how many requests/second can it sustain?
- **Consistency** — do all readers see the same data, and how quickly after a write?
- **Durability** — once you've acknowledged a write, will the data survive disk failures, reboots, and disasters?
- **Maintainability** — can the team understand, change, and operate it without fear?
- **Cost** — what does it cost to run, and does the cost scale sanely with usage?

Most real design is **trading these against each other**. You cannot maximize all of them at once. Lower latency often costs money (more caching, more replicas). Stronger consistency often costs availability or latency. The skill is choosing *which* to sacrifice for a given product, and being able to say why.

:::tip[The single most important habit]
Before you draw a single box, ask "what are the requirements?" — both functional (what it does) and non-functional (how well, at what scale). A design is only "good" or "bad" relative to its requirements.
:::
