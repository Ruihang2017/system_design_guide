---
title: "Study Plan"
description: A sequenced week-by-week plan and active-practice technique to build system design fluency from foundations through case studies.
---

## A sequenced plan

You don't need to go in order through everything, but this sequence builds correctly:

1. **Week 1 — Foundations.** [Non-functional requirements](/mindset/non-functional-requirements/), [estimation](/mindset/estimation/), and [CAP/consistency](/mindset/consistency-cap/) until the NFRs, estimation, and CAP/consistency are second nature. These gate everything else.
2. **Week 2 — Data.** [Databases](/building-blocks/databases/) is the densest and most important building block; pair it with caching. Most real systems live or die here.
3. **Week 3 — Communication + async.** [Networking](/building-blocks/networking/) and messaging. Understand when to be synchronous vs event-driven.
4. **Week 4 — Architecture + reliability.** [Architecture patterns](/building-blocks/architecture-patterns/), [reliability](/building-blocks/reliability/), and [observability](/building-blocks/observability/). This is the "production, not POC" core: failure handling, resilience, observability.
5. **Week 5 — Building blocks + method.** [Specialized components](/building-blocks/specialized-components/) and the [design framework](/method/framework/). Then start case studies.
6. **Ongoing — Case studies.** Do one practice problem per sitting: sketch it yourself first (timed, ~45 min), *then* compare with a reference. Active recall beats re-reading.

## Practice technique that works

For each case study, force yourself to (a) write the requirements and estimates before designing, (b) name at least two places you're making a tradeoff and state both sides, and (c) identify the one hardest part and go deep on it. That's the exact loop interviews and design reviews reward.
