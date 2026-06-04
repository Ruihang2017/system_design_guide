# Study-Guide Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Content tasks specify the section
> skeleton + must-hit points + word target + the gold-standard reference file to match; the engineer
> writes prose to that bar. Code/config tasks show exact code.

**Goal:** Expand the static Astro + Starlight system-design study site into the preferred free study
destination — level depth, add worked answers, diagrams, deeper fundamentals, broader pattern coverage
with cited real-world grounding, and client-only practice/retention features. No backend.

**Architecture:** All content is Markdown/MDX in `src/content/docs/`; every page is registered in the
`sidebar` in `astro.config.mjs`. Interactivity is client-only, progressively enhanced (works with JS
off). Diagrams are ```mermaid fenced blocks (rendered if the integration installs; readable source if
not). The verification gate is `npm run build` (exit 0, zero broken links) + `npm run check`.

**Tech Stack:** Astro 5, Starlight 0.34, Pagefind (search), Mermaid (diagrams, optional), localStorage
(state), optional vitest (scheduler unit test).

**Quality bar (every content task):** match `src/content/docs/case-studies/chat-whatsapp.md` and
`rate-limiter.md`. Follow `CLAUDE.md` content conventions: frontmatter `title` + one-line
`description`; body headings start at `##`; Starlight asides `:::tip/:::note/:::caution`; **after
creating any page add it to the `sidebar` in `astro.config.mjs`.** Voice: crux-first, tradeoff-first.

**Standard verification (run after each task unless noted):**
```bash
npm run build   # expect exit 0; "Complete!"; no broken-link warnings
```
**Commit after each task** on branch `claude/gallant-euler-y2etr`.

---

## Phase 0 — Level the floor

### Task 0.1: Rewrite URL Shortener to full template
**Files:** Modify `src/content/docs/case-studies/url-shortener.md`
- [ ] Keep frontmatter. Rewrite to the 9-part template (~1,500–1,900 w), preserving existing insights:
  Base62 key length math; hash vs counter vs KGS; 301 vs 302; immutable-mapping caching; CDN.
  Sections: `## 1. Requirements` (functional/non-functional, ~100:1 read:write) · `## 2. Estimation`
  (100M writes/day → reads, 5-yr storage ~91 TB) · `## 3. API` · `## 4. Data model & storage choice`
  (KV/wide-column keyed by short_code) · `## 5. High-level design` (with a ```mermaid flowchart of
  write + read paths) · `## 6. Deep dives` (key generation deep dive incl. distributed counter/KGS
  collision handling; 301 vs 302 analytics tradeoff; cache strategy; analytics via async queue) ·
  `## 7. Bottlenecks & scaling` (hot keys, sharding by hash, KGS as SPOF + mitigation, SPOF table).
- [ ] Verify build green. Commit: `docs: deepen URL Shortener case study to full template`.

### Task 0.2: Rewrite News Feed / Twitter to full template
**Files:** Modify `src/content/docs/case-studies/news-feed.md`
- [ ] Rewrite to 9-part template (~1,700–2,100 w), preserving the push/pull/hybrid + celebrity-problem
  core (the page's strength). Add: `## 2. Estimation` (200M DAU, fan-out write amplification math) ·
  `## 3. API` (postTweet, getTimeline with cursor) · `## 4. Data model & storage` (posts, social graph,
  timeline cache in Redis) · `## 5. High-level design` (```mermaid flowchart: tweet svc → fan-out svc
  (queue) → timeline cache; read-time merge) · `## 6. Deep dives` (push vs pull vs hybrid in depth;
  celebrity handling; ranking chrono vs ML; pagination cursors; media via object storage+CDN) ·
  `## 7. Bottlenecks & scaling` (fan-out worker backpressure, hot timeline keys, SPOF table).
- [ ] Verify build green. Commit: `docs: deepen News Feed case study to full template`.

### Task 0.3: Case-study template doc + CLAUDE.md reference + HANDOVER fix
**Files:** Create `docs/case-study-template.md`; Modify `CLAUDE.md`; Modify `HANDOVER.md`
- [ ] Create `docs/case-study-template.md` documenting the 9-part spine (from the spec) as a copy-paste
  skeleton with one-line guidance per section and a pointer to chat-whatsapp as the exemplar.
- [ ] In `CLAUDE.md` under "Content conventions", add a bullet: new case study → follow
  `docs/case-study-template.md`.
- [ ] In `HANDOVER.md`, change "Flashcards — 46 cards" → "38 cards" (line in the inventory table).
- [ ] Commit: `docs: add case-study template, fix flashcard count`.

---

## Phase 1 — Worked answers

### Task 1.1–1.6: Model answers for the 18 question-bank prompts (batched by category)
**Files:** Modify `src/content/docs/interview-prep/question-bank.md`
For **every** `### <prompt>` block, append (after the existing "(see ...)" line, before the `---`):
```markdown

<details>
<summary>Show a model answer</summary>

**Requirements.** …(functional + the 2–3 non-functional that drive the design)…
**Estimation.** …(the one or two numbers that force the architecture)…
**API.** …(1–3 core endpoints)…
**Data model & storage.** …(entities → justified store)…
**High-level design.** …(component flow in one or two sentences)…
**Deep dive — the crux.** …(the central tradeoff, expanded with the chosen resolution)…
**Bottlenecks & scaling.** …(top SPOF/hot-key + mitigation)…

</details>
```
- [ ] **Task 1.1 Read-heavy** (URL Shortener, Pastebin, Twitter/News Feed, Instagram) — for the two that
  have full case studies, the model answer is a ~350 w condensation that links to the case study.
- [ ] **Task 1.2 Write/throughput-heavy** (Ad-Click Aggregator, Leaderboard, Distributed KV Store).
- [ ] **Task 1.3 Real-time** (WhatsApp, Uber Dispatch, Notification System, Google Docs).
- [ ] **Task 1.4 Storage & media** (YouTube/Netflix, Dropbox/Drive).
- [ ] **Task 1.5 Search & geo** (Web Crawler, Autocomplete, Maps Nearby).
- [ ] **Task 1.6 Correctness-critical** (Payment/Checkout, Distributed Cache).
- Each answer 350–550 w, framework-driven, tradeoff-first; keep the try-first intro line on the page.
- [ ] After each batch: verify build; confirm `<details>` count rose by the batch size. Commit per batch:
  `docs: add model answers — <category> prompts`.

### Task 1.7: Annotated mock-interview transcript
**Files:** Create `src/content/docs/interview-prep/mock-interview.md`; Modify `astro.config.mjs`
- [ ] Create page (~1,200–1,600 w): a realistic interviewer↔candidate transcript for **Design a URL
  Shortener** (links to its case study), formatted as dialogue with `:::note` margin annotations naming
  which framework step each move executes and what signal it sends. Show good clarifying questions,
  estimation out loud, a wrong turn corrected, and an explicit tradeoff.
- [ ] Add to sidebar under "Interview Prep" (after Question Bank):
```js
{ label: 'Mock Interview (annotated)', link: '/interview-prep/mock-interview/' },
```
- [ ] Verify build green. Commit: `docs: add annotated mock-interview walkthrough`.

---

## Phase 2 — Diagrams

### Task 2.1: Add Mermaid rendering (with graceful fallback)
**Files:** Modify `astro.config.mjs`, `package.json` (via npm); run install
- [ ] Install: `npm install astro-mermaid mermaid`. If install **fails** (network), skip the integration
  — diagrams authored as ```mermaid fences still render as readable source; mark this task done-with-fallback
  and note in handover.
- [ ] If installed, wire it in `astro.config.mjs`:
```js
import mermaid from 'astro-mermaid';
// integrations: [ mermaid({ theme: 'default' }), starlight({...}) ]
// (mermaid must come before starlight)
```
- [ ] Verify build green. Commit: `feat: add Mermaid diagram rendering (graceful fallback)`.

### Task 2.2–2.3: Author diagrams
**Files:** Modify case-study + building-block pages
- [ ] **2.2 Case studies:** ensure each of the 9 case studies has ≥1 ```mermaid diagram (flowchart for
  architecture; sequenceDiagram for request flows). chat-whatsapp & rate-limiter: convert their ASCII
  architecture to mermaid (keep ASCII request-flow if clearer). Others get a new architecture diagram.
- [ ] **2.3 Building blocks:** add a ```mermaid diagram to `databases.md` (replication topologies),
  `caching.md` (cache-aside flow), `messaging.md` (queue vs pub/sub), `networking.md` (client→LB→svc),
  `architecture-patterns.md` (monolith vs microservices).
- [ ] Verify build green after each page batch. Commit: `docs: add architecture diagrams to <area>`.

---

## Phase 3 — Deepen building blocks & fundamentals

### Task 3.1–3.8: Building-block depth pass
**Files:** Modify each `src/content/docs/building-blocks/*.md`
For each block add (matching existing voice, +200–400 w each): a **"When to use what" table**, a
**Numbers** note (latency/throughput/capacity relevant to the topic), a **Common pitfalls** list, and
one short worked mini-example. Pages: `networking.md`, `databases.md` (already deep — add decision
table + pitfalls only), `caching.md`, `messaging.md`, `architecture-patterns.md`, `reliability.md`,
`observability.md`, `specialized-components.md`.
- [ ] One task per page; verify build; commit `docs: deepen <block> (decision table, numbers, pitfalls)`.

### Task 3.9: Thicken foundational mindset pages
**Files:** Modify `src/content/docs/mindset/non-functional-requirements.md`, `consistency-cap.md`
- [ ] NFR page (→ ~600 w): define each of the 9 NFRs with a one-line "how you buy it / what it costs",
  add the conflict matrix idea, a worked "given product X, which NFRs dominate" example.
- [ ] CAP page (→ ~750 w): CAP → PACELC, CP vs AP with concrete datastores, a "during a partition"
  walkthrough, consistency models ladder (strong → eventual). Keep existing strengths.
- [ ] Verify build; commit `docs: deepen NFR and CAP/consistency fundamentals`.

### Task 3.10: "Numbers Everyone Should Know" page
**Files:** Create `src/content/docs/mindset/numbers.md`; Modify `astro.config.mjs`, study-plan, estimation
- [ ] Create page (~700 w): latency ladder table (L1/L2/RAM/SSD/HDD/same-DC RTT/cross-region), powers
  of two & data-size cheat sheet, QPS/storage capacity heuristics, availability nines table, "how to use
  these in estimation" worked example. Cross-link from `mindset/estimation.md` and `resources/study-plan.md`.
- [ ] Add to sidebar under "Core Mindset" (after Estimation):
```js
{ label: 'Numbers Everyone Should Know', link: '/mindset/numbers/' },
```
- [ ] Verify build; commit `docs: add 'Numbers Everyone Should Know' cheat sheet`.

---

## Phase 4 — Breadth + real-world grounding

### Task 4.0: Verify real-world citation URLs
**Files:** none (research)
- [ ] Use WebSearch/WebFetch to confirm exact, live URLs + titles for: Discord "How Discord Stores
  Trillions of Messages" (ScyllaDB) and the earlier Cassandra post; Uber H3 geospatial index; Stripe
  idempotency-keys blog/docs; Netflix Open Connect; Twitter/X timelines-at-scale. Record verified
  `[title](url)` pairs for use in Task 4.1–4.5 and chat/news-feed/rate-limiter callouts. Only verified
  URLs may be cited; otherwise omit the link and attribute by title+publisher.

### Task 4.1–4.5: New full case studies (one per task)
**Files:** Create page + add sidebar entry each; Modify `practice-problems.md` to link the worked ones
Each follows the 9-part template (~1,500–2,100 w), includes a ```mermaid architecture diagram and ≥1
cited `:::note[In the real world]` callout (verified URL from 4.0).
- [ ] **4.1** `case-studies/video-streaming.md` — upload → async transcode → object storage → CDN →
  adaptive bitrate (HLS/DASH). Real-world: Netflix Open Connect.
- [ ] **4.2** `case-studies/ride-sharing.md` — geospatial index (geohash/quadtree/H3), high-frequency
  location ingest, matching/dispatch race. Real-world: Uber H3.
- [ ] **4.3** `case-studies/payment-system.md` — idempotency keys, double-entry ledger, exactly-once,
  Saga + compensating transactions. Real-world: Stripe idempotency.
- [ ] **4.4** `case-studies/file-storage-sync.md` — content-addressed chunking, dedup, metadata vs blob
  split, delta sync, conflict handling.
- [ ] **4.5** `case-studies/web-crawler.md` — URL frontier (priority queue), Bloom-filter dedup,
  politeness/robots.txt, distributed coordination.
- [ ] For each: add sidebar entry under "Case Studies" (before "Practice Problem Bank"), e.g.:
```js
{ label: 'Video Streaming (YouTube/Netflix)', link: '/case-studies/video-streaming/' },
{ label: 'Ride-Sharing (Uber)', link: '/case-studies/ride-sharing/' },
{ label: 'Payment / Checkout', link: '/case-studies/payment-system/' },
{ label: 'File Storage & Sync (Dropbox)', link: '/case-studies/file-storage-sync/' },
{ label: 'Web Crawler', link: '/case-studies/web-crawler/' },
```
- [ ] In `practice-problems.md`, change the matching items to link to the now-worked case studies.
- [ ] Verify build after each; commit `docs: add <X> case study`.

### Task 4.6: Real-world callouts in existing case studies
**Files:** Modify chat-whatsapp.md, news-feed.md, rate-limiter.md
- [ ] Add one verified `:::note[In the real world]` callout each (e.g., Discord→ScyllaDB on chat;
  Twitter timelines on news-feed; Cloudflare/Stripe rate limiting on rate-limiter). Verified URLs only.
- [ ] Verify build; commit `docs: add cited real-world grounding to case studies`.

---

## Phase 5 — Client-only practice & retention (progressive enhancement)

### Task 5.1: Leitner scheduler module (+ test if runner available)
**Files:** Create `src/scripts/leitner.ts`; Test `src/scripts/leitner.test.ts` (if vitest installs)
- [ ] Pure module:
```ts
// box: 0..4 ; returns next box and whether due now given lastSeen + box
export type Card = { id: string; box: number; due: number };
export function promote(card: Card, now: number): Card { /* box+1 capped at 4; due = now + interval(box) */ }
export function demote(card: Card, now: number): Card { /* box back to 0; due = now */ }
export function interval(box: number): number { /* ms: [0, 1d, 3d, 7d, 16d] */ }
export function isDue(card: Card, now: number): boolean { return card.due <= now; }
```
- [ ] If `npm install -D vitest` succeeds, add `"test": "vitest run"` to package.json scripts and a test
  asserting: promote raises box & pushes due out; demote resets to box 0/due now; interval ladder; isDue.
  Run `npm test` → PASS. If vitest can't install, verify with a one-off `node` script and note fallback.
- [ ] Commit `feat: add Leitner spaced-repetition scheduler`.

### Task 5.2: Flashcard review mode
**Files:** Rename `flashcards.md`→`flashcards.mdx`; Create `src/components/FlashcardReview.astro`
- [ ] Component renders a "Review mode" toggle + Shuffle + per-card "Got it / Review again" controls
  that drive `leitner.ts`, persisting `{id:box,due}` to `localStorage` (key `sdg:flashcards`). It
  **enhances** the existing `<details>` cards (queries them in the DOM on the client); with JS off the
  page is the unchanged static deck. Import + place `<FlashcardReview />` at the top of the MDX.
- [ ] Verify build; manual: built preview shows controls; JS-off still shows plain `<details>`.
- [ ] Commit `feat: flashcard review mode (Leitner, localStorage, progressive enhancement)`.

### Task 5.3: Random-question button
**Files:** Rename `question-bank.md`→`question-bank.mdx`; Create `src/components/RandomQuestion.astro`
- [ ] Button that picks a random `### ` heading anchor on the page and scrolls to it (reads headings
  from the DOM). Place `<RandomQuestion />` under the intro line. JS-off: button absent, page unchanged.
- [ ] Verify build; commit `feat: add random-question button to the question bank`.

### Task 5.4: Progress dashboard
**Files:** Create `src/content/docs/resources/progress.mdx`; Create `src/components/ProgressTracker.astro`;
Modify `astro.config.mjs`
- [ ] Component lists every module (hard-coded list of {label, link} matching the sidebar) each with a
  localStorage checkbox (key `sdg:progress`) + an overall progress bar. JS-off: renders the list as
  plain links (no checkboxes).
- [ ] Add to sidebar under "Study & Resources" (after Study Plan):
```js
{ label: 'Progress Tracker', link: '/resources/progress/' },
```
- [ ] Verify build; commit `feat: add client-only progress tracker`.

---

## Phase 6 — Discoverability, contribution, polish

### Task 6.1: SEO/meta + robots
**Files:** Modify `astro.config.mjs`; Create `public/robots.txt`
- [ ] Add Starlight `head` defaults (Open Graph + Twitter card):
```js
head: [
  { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
  { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
],
```
- [ ] Create `public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://system-design-guide.netlify.app/sitemap-index.xml
```
- [ ] Verify build (sitemap still emitted); commit `feat: add SEO meta defaults and robots.txt`.

### Task 6.2: Contribution scaffolding + changelog
**Files:** Create `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/content-fix.md`,
`.github/ISSUE_TEMPLATE/new-page.md`, `.github/pull_request_template.md`, `CHANGELOG.md`
- [ ] `CONTRIBUTING.md`: how to add a page (frontmatter, `##` headings, sidebar edit, `npm run build`),
  link content conventions in CLAUDE.md + the case-study template.
- [ ] Issue/PR templates: short, content-focused. `CHANGELOG.md`: a "0.2.0 — study-guide expansion" entry.
- [ ] Commit `docs: add contribution scaffolding and changelog`.

### Task 6.3: README refresh
**Files:** Modify `README.md`
- [ ] Update the content map (9 case studies, model answers, mock interview, numbers page, progress
  tracker), features (diagrams, review mode), and add a Contributing pointer to `CONTRIBUTING.md`. Keep
  counts accurate (re-derive from files).
- [ ] Verify build; commit `docs: refresh README for expanded guide`.

---

## Finalization (after all phases)

- [ ] Full `npm run build` (exit 0, no broken links) + `npm run check`.
- [ ] `code-review` skill over the cumulative diff vs `main`; fix findings.
- [ ] Update `HANDOVER.md` (new inventory, verification evidence, fallbacks taken, next steps).
- [ ] Push `claude/gallant-euler-y2etr`; open PR (user explicitly requested a PR after tests pass).

## Self-review (run before executing)

1. **Spec coverage:** Phase 0→Task 0.1–0.3; Phase 1→1.1–1.7; Phase 2→2.1–2.3; Phase 3→3.1–3.10;
   Phase 4→4.0–4.6; Phase 5→5.1–5.4; Phase 6→6.1–6.3. Every spec acceptance criterion maps to a task. ✓
2. **Placeholders:** content tasks intentionally specify skeleton+requirements (engineer writes prose to
   the cited gold-standard bar) — this is the correct granularity for prose, not a placeholder. All
   code/config steps show exact code. ✓
3. **Consistency:** localStorage keys (`sdg:flashcards`, `sdg:progress`), component names
   (`FlashcardReview`, `RandomQuestion`, `ProgressTracker`), and `leitner.ts` signatures are consistent
   across tasks 5.1–5.4. Sidebar groups match `astro.config.mjs`. ✓
