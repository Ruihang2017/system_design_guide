---
title: "News Feed / Twitter"
description: "Deep walkthrough of the fan-out problem at the heart of social feeds — push vs pull vs hybrid, and why the hybrid is the senior-level answer."
---

The most instructive system design problem, because it forces the single most important tradeoff in the field: **push vs pull (fan-out on write vs read).** If you internalize one case study deeply, make it this one.

## 1. Requirements

*Functional:* post a tweet, follow users, and view a **home timeline** (recent posts from everyone you follow), reverse-chronological or ranked. *Non-functional:* read-heavy, low-latency feed loads, high availability; **eventual consistency is acceptable** (it's fine if a tweet shows up a second late).

## 2. Estimation

Say 200M daily active users, ~2 posts/day → ~400M posts/day, and reads vastly exceed writes. Feed reads are the dominant cost.

## 3. The core challenge: how do you build each user's home timeline?

- **Pull model (fan-out on read):** build the timeline *when the user opens the app* — fetch recent posts from everyone they follow, merge, and sort. *Pros:* cheap writes (just store the post), no wasted work for inactive users. *Cons:* expensive, slow reads, especially for users who follow thousands of accounts; the merge happens on every load.
- **Push model (fan-out on write):** when you post, immediately write that post into the **precomputed timeline** (a Redis list) of every follower. *Pros:* feed reads are instant — just read your prebuilt list. *Cons:* writes are expensive and bursty, and you do work for users who never log in. Worst of all, the **celebrity problem**: a user with 100M followers triggers 100M timeline writes per post.
- **Hybrid (the real answer):** use **push for normal users** (most accounts), and **pull for celebrities** (don't fan out their posts). A user's feed = their pushed timeline **merged at read time** with the latest posts from the few celebrities they follow. This captures the benefits of both and sidesteps the celebrity write explosion. This synthesis — recognizing that *one strategy doesn't fit all users* — is exactly the senior-level insight the problem is designed to surface.

## 4. Components

A *tweet service* (write + store posts), a *fan-out service* (push to follower timelines via a queue), a *timeline cache* (Redis) holding precomputed feeds, a *social graph service* (who follows whom), and the *read-time merge*.

## 5. Other concerns

**Ranking** (chronological vs an ML relevance model), **pagination** (use cursors, not offsets, at this scale), **media** (store in object storage + CDN, keep only URLs in the feed), and **consistency** (eventual is fine — favor availability and latency).
