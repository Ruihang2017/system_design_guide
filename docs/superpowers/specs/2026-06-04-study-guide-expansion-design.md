# Spec — "From POC to Production" Study-Guide Expansion

- **Date:** 2026-06-04
- **Status:** Approved (user approved the phased roadmap; full autonomous run authorized, PR at the end)
- **Branch:** `claude/gallant-euler-y2etr`
- **Goal:** Turn an excellent *skeleton* into the *preferred free study destination* for engineers who
  lack system-design knowledge — by leveling depth, adding the missing "worked answer" layer, adding
  diagrams, deepening fundamentals, broadening pattern coverage with real-world grounding, and adding
  client-only practice/retention features. No backend, ever.

## Current state (evidence)

- 25 content pages, ~18,400 words. Strong IA + voice. `npm run build` is the verification gate.
- **Quality bar already in repo:** `case-studies/chat-whatsapp.md` (2,147 w) and `rate-limiter.md`
  (2,028 w) are full 7-step treatments (requirements → estimation → API → data model → HLD diagram →
  deep dives → bottlenecks/SPOF). These define the template.
- **Uneven depth:** `url-shortener.md` (~504 w) and `news-feed.md` (~425 w) are tight summaries, not
  worked solutions. Building blocks are reference-card depth (mostly 280–450 w; `databases` 748 w).
- **Practice surface has no answers:** `interview-prep/question-bank.md` gives *What it tests / Clarify
  first / The crux* for 18 prompts but **no model answers**; `case-studies/practice-problems.md` is
  crux + concepts + one-line direction only.
- **No diagrams** beyond ASCII. **No interactive practice.** Flashcards are 38 static `<details>`.

## Non-goals (unchanged from PRD)

No backend, no accounts, no server-side state, no analytics server, no i18n. All interactivity is
**client-only (localStorage), progressively enhanced** — every page must remain fully usable with
JavaScript disabled. The build gate (`npm run build`, exit 0, **zero broken links**) is sacred: any
feature that threatens it is descoped, not forced.

## The canonical case-study template (derived from chat-whatsapp / rate-limiter)

Every worked case study and every question-bank model answer uses this spine:

1. **Framing** — one paragraph naming the central difficulty/crux.
2. **Requirements** — *Functional* + *Non-functional* (scale, latency, availability, consistency).
3. **Estimation** — back-of-envelope: traffic (read/write split, peak), storage, the number that
   forces the design.
4. **API** — a handful of endpoints / the core contract.
5. **Data model & storage choice** — entities + access patterns → justified DB choice.
6. **High-level design** — components + request flow, with a **diagram**.
7. **Deep dives** — the 2–4 hardest parts (the senior-level signal).
8. **Bottlenecks & scaling** — SPOFs/hot keys + a redundancy/SPOF table.
9. **Extensions** (optional) — noted, not fully designed.

Voice: crux-first, tradeoff-obsessed, honest, "learn the trades not the trivia." Use Starlight asides
(`:::tip/:::note/:::caution`). Frontmatter `title` + one-line `description`; body headings start at `##`.

## Phases & acceptance criteria

### Phase 0 — Level the floor
- Rewrite `case-studies/url-shortener.md` and `case-studies/news-feed.md` to the full 9-part template
  (target ~1,500–2,200 words each, matching chat/rate-limiter depth). Preserve their existing strong
  insights (push/pull hybrid; 301/302; KGS vs counter).
- Add `docs/case-study-template.md` (contributor aid) and reference it from `CLAUDE.md`.
- Fix doc drift: `HANDOVER.md` says 46 flashcards; actual is **38**.
- **Accept:** both pages follow the template; build green, no broken links.

### Phase 1 — Worked answers (headline)
- For each of the 18 prompts in `question-bank.md`, append a collapsible **`<details><summary>Show a
  model answer</summary>`** block containing a condensed 9-part walkthrough (~350–550 w). Try-first
  pedagogy preserved (answer is hidden by default, mirrors the flashcards pattern).
- Add `interview-prep/mock-interview.md`: one fully **annotated interview transcript** (interviewer ↔
  candidate dialogue with margin notes) demonstrating the framework live end-to-end. Add to sidebar.
- **Accept:** 18 `<details>` model answers present and well-formed; mock-interview page builds; the 4
  worked case studies are cross-linked from their matching prompts.

### Phase 2 — Diagrams
- Introduce Mermaid rendering. Primary approach: the `astro-mermaid` integration (client-rendered).
  **Graceful degradation:** all diagrams authored as ```mermaid fenced blocks, so if the integration
  cannot be installed/rendered in this environment they still display as readable diagram source and
  the build stays green. Keep existing ASCII where it is already clear; convert architecture diagrams
  to Mermaid `flowchart`/`sequenceDiagram`.
- Add at least one diagram to each of the (now 9) case studies and to the heaviest building blocks
  (databases, caching, messaging, networking, architecture-patterns).
- **Accept:** diagrams present; build green either way (rendered or source-fallback); no broken links.

### Phase 3 — Deepen building blocks & fundamentals
- Expand each building block with: a **"when to use what" decision table**, concrete **numbers**
  (latency/throughput/capacity), **common pitfalls**, and a short worked mini-example. Thicken the
  foundational `mindset/non-functional-requirements.md` and `mindset/consistency-cap.md` most (they
  serve the least-experienced readers).
- Add `mindset/numbers.md` — "Numbers Everyone Should Know" (latency ladder, powers of two, capacity
  heuristics, availability nines). Add to sidebar + study plan + cross-link from estimation.
- **Accept:** every building block has a decision table + numbers + pitfalls; new numbers page builds.

### Phase 4 — Breadth + real-world grounding
- Promote 5 practice problems to full case studies (distinct patterns):
  `video-streaming.md` (CDN/transcode/ABR), `ride-sharing.md` (geo-index), `payment-system.md`
  (idempotency/saga/ledger), `file-storage-sync.md` (chunking/dedup/sync), `web-crawler.md`
  (frontier/dedup/politeness). Each follows the template; add sidebar entries; update
  `practice-problems.md` to link the now-worked ones.
- Add cited **`:::note[In the real world]`** callouts grounding designs in *real, public* engineering
  sources (verified URLs only — e.g., Discord→ScyllaDB, Uber H3, Stripe idempotency, Netflix Open
  Connect, Twitter timelines). No invented internal details; cite title + publisher + link.
- **Accept:** 9 worked case studies total; every real-world claim is cited to a real source; build green.

### Phase 5 — Client-only practice & retention (progressive enhancement)
- **Flashcard review mode:** convert `flashcards.md` → `.mdx`, add a `<FlashcardReview>` component that
  (without breaking the plain `<details>`) adds shuffle + self-grade ("Got it / Review again") with a
  **Leitner-box scheduler persisted in localStorage**. The scheduler is a pure, unit-testable module.
- **Random question:** a `<RandomQuestion>` button on the question bank (convert to `.mdx`).
- **Progress dashboard:** a new `resources/progress.mdx` listing every module with a localStorage
  "complete" checkbox + a progress bar (no need to edit every page).
- Testing: the Leitner scheduler is pure logic — add a minimal unit test **if a runner can be installed**
  (vitest); otherwise verify via a small Node script. Everything degrades to plain HTML without JS.
- **Accept:** features work in a built preview; **with JS disabled, all pages still fully usable**;
  build green; scheduler logic verified.

### Phase 6 — Discoverability, contribution, polish
- SEO/meta: add Starlight `head` defaults (Open Graph + Twitter card meta), `robots.txt`. Keep the
  `site:` placeholder but document it (do **not** invent a real URL).
- Community: `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/` (content-fix + new-page), PR template,
  `CHANGELOG.md`. Update the root `README.md` to reflect new sections.
- **Accept:** templates present; build green; README accurate.

## Risks & mitigations

- **Build stability with new integrations (Mermaid, MDX components):** author for graceful degradation;
  if an integration can't be installed in this environment, fall back to source/ASCII and keep the
  build green. The gate wins over feature completeness.
- **Hallucinated citations (Phase 4):** verify every external URL before committing; cite only real,
  well-known public posts; keep claims general and attributable.
- **Network for `npm install`:** required for the build gate and `astro-mermaid`/vitest. If outbound
  install is blocked, descope install-dependent items (Mermaid rendering, vitest) to their fallbacks
  and proceed; surface this in the handover.
- **Scope/quality:** reuse the template + voice; dispatch independent units to parallel subagents, each
  given the gold-standard files as the bar; verify build after every phase; commit + push per phase
  (ephemeral container).
- **Quality drift across subagents:** every subagent prompt cites `chat-whatsapp.md` as the bar, the
  content conventions from `CLAUDE.md`, and the exact sidebar edit required.

## Verification

`npm run build` (exit 0, **0 broken links**) + `npm run check` after every phase and at the end.
Rendered-HTML spot checks for `<details>` well-formedness, diagram presence, and component hydration.
Full `code-review` skill pass over the cumulative diff before the PR. Evidence before claims.
