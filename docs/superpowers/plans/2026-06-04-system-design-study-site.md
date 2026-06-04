# System Design Study Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static Astro + Starlight site that renders the "From POC to Production" system design guide (Parts 0–15) plus new interview-prep content, deployable on Netlify.

**Architecture:** Astro + Starlight docs theme. Content is plain Markdown in `src/content/docs/`. Sidebar/nav/search/dark-mode come from Starlight. The build emits static HTML to `dist/`; Netlify serves it. No backend.

**Tech Stack:** Astro 5, @astrojs/starlight 0.34, Node 20, Netlify.

**Verification model:** This is a content site — the "test" for every task is `npm run build` exiting 0 with no broken-link warnings. Content tasks port the provided guide (saved to `/tmp/source-guide.md` for executors) or author new pages per the briefs below. Frequent commits.

---

## File structure (decomposition)

```
package.json · astro.config.mjs · src/content.config.ts · tsconfig.json
netlify.toml · .gitignore
src/content/docs/
  index.mdx                                   # landing (splash)
  introduction.md
  mindset/{non-functional-requirements,estimation,consistency-cap}.md
  building-blocks/{networking,databases,caching,messaging,
                   architecture-patterns,reliability,observability,
                   specialized-components}.md
  method/{framework,interview-checklist}.md
  case-studies/{url-shortener,news-feed,chat-whatsapp,
                rate-limiter,practice-problems}.md
  interview-prep/{question-bank,flashcards}.md
  resources/{study-plan,reading,fan-out-prompts}.md
PRD.md · CLAUDE.md (merged) · HANDOVER.md
```

Each content page is an **independent file** → safe to author in parallel subagents. Shared files (`astro.config.mjs`, `package.json`) are owned by the orchestrator only.

**Markdown conventions (apply to every page):**
- Frontmatter: `title` (page H1) and a one-line `description`.
- In-body headings start at `##` (never `#`).
- Convert the guide's `>` emphasis blockquotes to Starlight asides
  (`:::tip` / `:::note` / `:::caution`) when they carry emphasis.
- Preserve all tables and fenced code blocks verbatim.

---

## Task 1: Scaffold the project (orchestrator)

**Files:** Create `package.json`, `astro.config.mjs`, `src/content.config.ts`, `tsconfig.json`, `netlify.toml`, `.gitignore`.

- [ ] **Step 1: `package.json`**
```json
{
  "name": "system-design-guide",
  "type": "module",
  "version": "0.1.0",
  "scripts": { "dev": "astro dev", "build": "astro build", "preview": "astro preview" },
  "dependencies": { "astro": "^5.6.0", "@astrojs/starlight": "^0.34.0", "sharp": "^0.33.5" }
}
```

- [ ] **Step 2: `src/content.config.ts`**
```ts
import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
```

- [ ] **Step 3: `tsconfig.json`**
```json
{ "extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist"] }
```

- [ ] **Step 4: `netlify.toml`**
```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
```

- [ ] **Step 5: `.gitignore`** — ignore `dist/`, `.astro/`, `node_modules/`, `.env*`, `.DS_Store`, `npm-debug.log*`.

- [ ] **Step 6: `astro.config.mjs`** — Starlight integration with `title: 'From POC to Production'`, GitHub social + editLink to `ruihang2017/system_design_guide` `main`, and the full sidebar matching the file structure above (groups: Overview, Core Mindset, Building Blocks, The Method, Case Studies, Interview Prep, Study & Resources).

- [ ] **Step 7: Test** — `npm install` then (after Task 2 adds index) `npm run build`. Expected: exit 0.
- [ ] **Step 8: Commit** — `chore: scaffold Astro + Starlight project`.

## Task 2: Landing + Introduction (orchestrator)

**Files:** Create `src/content/docs/index.mdx` (frontmatter `template: splash` + `hero` with tagline and 3 actions; a "How to use / fan out" section; a `<CardGrid>` of the section groups), `src/content/docs/introduction.md` (port the guide's "How to use this guide" + "the arc" + honesty note).

- [ ] Build (`npm run build`, exit 0), then commit `feat: landing page and introduction`.

## Task 3: Core Mindset (subagent) — Parts 0,1,2

Port to `src/content/docs/mindset/non-functional-requirements.md` (Part 0),
`.../estimation.md` (Part 1), `.../consistency-cap.md` (Part 2) from
`/tmp/source-guide.md`, applying the Markdown conventions. Preserve the nines
table, the latency-numbers code block, powers-of-two block, and the worked
estimate. Build + commit.

## Task 4: Building Blocks A & B (two subagents) — Parts 3–10

- Subagent A → `networking.md` (3), `databases.md` (4), `caching.md` (5), `messaging.md` (6).
- Subagent B → `architecture-patterns.md` (7), `reliability.md` (8), `observability.md` (9), `specialized-components.md` (10).
Port from `/tmp/source-guide.md`, conventions applied, tables/code preserved. Build + commit.

## Task 5: The Method (subagent) — Part 11 + new checklist

- `method/framework.md` — port Part 11.
- `method/interview-checklist.md` — NEW. A one-page, skimmable checklist derived
  from Part 11's 7-step flow + the "common mistakes" list, formatted as nested
  checkboxes the reader can mentally tick during an interview. Build + commit.

## Task 6: Case Studies — ported (subagent) — Parts 12,13,14

- `case-studies/url-shortener.md` (Part 12), `news-feed.md` (Part 13),
  `practice-problems.md` (Part 14). Port from source, preserve all code blocks
  (API, schema, diagrams). Build + commit.

## Task 7: Case Studies — NEW worked examples (subagent)

Author two case studies that follow the **Part 11 framework** end-to-end
(Requirements → Estimation → API → Data model → High-level design → Deep dives →
Bottlenecks/scaling), matching the depth/structure of `url-shortener.md` and
`news-feed.md`:

- `case-studies/chat-whatsapp.md` — real-time chat. Cover: WebSocket/connection-
  gateway layer, presence, message store + sequencing/ordering, 1:1 vs group
  fan-out, delivery/read receipts, offline queue + push, end-to-end flow.
- `case-studies/rate-limiter.md` — distributed rate limiter. Cover: requirements
  (global limit, low latency), the five algorithms (recap token/leaky/sliding),
  centralized Redis counters with atomic ops (Lua), sliding-window-counter,
  per-edge approximate limiting, headers (429/Retry-After), failure modes.

Build + commit.

## Task 8: Interview Question Bank (subagent) — NEW

`interview-prep/question-bank.md`. ~18 classic prompts grouped (Read-heavy /
Write-heavy / Real-time / Storage / Correctness-critical). For each: **Prompt**,
**What it tests**, **Clarify first** (2–4 bullets), **The crux** (1–2 sentences).
Include at least: TinyURL, Pastebin, Twitter/News Feed, Instagram, Facebook
Messenger/WhatsApp, Uber, Google Maps nearby, Netflix/YouTube, Dropbox/Drive,
Web Crawler, Notification system, Search autocomplete, Distributed cache,
Key-value store, Payment/checkout, Google Docs (collaborative), Leaderboard,
Ad-click aggregator. Cross-link to relevant modules. Build + commit.

## Task 9: Flashcards (subagent) — NEW

`interview-prep/flashcards.md`. Concept → tradeoff self-test using native
collapsible HTML so no JS is needed:
```html
<details>
<summary>Vertical vs horizontal scaling — the tradeoff?</summary>

Vertical = simpler, no code changes, but a hard ceiling and a SPOF. Horizontal
= near-unlimited + redundant, but forces statelessness, coordination, and
consistency work. Almost all large systems scale horizontally.
</details>
```
Cover ~30 cards across Parts 0–10 (NFRs, nines, latency numbers, CAP/PACELC,
consistency models, ACID/BASE, SQL vs NoSQL, B-tree vs LSM, replication,
sharding/consistent hashing, caching strategies, invalidation/stampede,
queue vs pub/sub, delivery semantics/idempotency, monolith vs microservices,
saga vs 2PC, CQRS/event sourcing, resilience patterns, rate-limiting algos,
bloom/HLL/count-min, push vs pull). Build + commit.

## Task 10: Study & Resources (subagent) — Part 15

Port Part 15 into `resources/study-plan.md` (the sequenced plan + practice
technique), `resources/reading.md` (canonical resources list), and
`resources/fan-out-prompts.md` (the "prompts to fan out" — framed as prompts the
reader can bring back). Build + commit.

## Task 11: PRD.md + CLAUDE.md merge (orchestrator)

- [ ] **`PRD.md`** (root): vision, target users, goals/non-goals, content scope &
  IA, features, tech rationale, success criteria, roadmap.
- [ ] **`CLAUDE.md`** (root): **merge** — keep the existing Superpowers activation
  section verbatim; append project guidance (what this is, structure, how to add
  a module/case study/flashcard, content conventions, build/preview/deploy
  commands) and the **Automated Delivery Pipeline** section (below). Do NOT
  remove the Superpowers section.
- [ ] Commit `docs: PRD and project CLAUDE.md`.

**Automated Delivery Pipeline to document in CLAUDE.md:**
> A superset of the Superpowers flow. The only HITL gate is **design approval**
> (end of brainstorming). After the user approves a design, run non-stop:
> 1. **Spec** (brainstorming output) → self-review
> 2. **Plan** (writing-plans) → self-review
> 3. **Build** (subagent-driven-development + test-driven-development)
> 4. **Test** (verification-before-completion: `npm run build` green)
> 5. **Review** (requesting-code-review / code-review skill)
> 6. **Handover doc**
> 7. **Suggest next steps**
> 8. **Finish** (finishing-a-development-branch): commit, push feature branch,
>    **and auto-push to `main`** every completed run.
> This does not replace Superpowers — it sequences its skills and consolidates
> the per-step human gates into the single design-approval gate.

## Task 12: Test / build hardening (orchestrator)

`npm run build`; fix any version/config/link errors until exit 0 with no broken-
link warnings. Adjust `astro.config.mjs` social/editLink syntax to match the
installed Starlight version if needed. Commit any fixes.

## Task 13: Code review (orchestrator)

Run the code-review skill over the diff (config correctness, broken links,
frontmatter consistency, sidebar↔file parity). Fix findings. Commit.

## Task 14: Handover + publish (orchestrator)

- Write `HANDOVER.md` (what was built, structure, run/extend instructions, deploy
  status, follow-ups).
- Commit. Push `claude/relaxed-bohr-WAPSm`. Then create/push `main` so Netlify
  deploys. Report status + suggested next steps.

---

## Self-review

**Spec coverage:** Parts 0–15 → Tasks 2–6,10; new case studies → 7; question
bank → 8; flashcards → 9; checklist → 5; PRD/CLAUDE → 11; build/deploy → 1,12,14;
verification → every task + 12. All spec sections mapped. ✓

**Placeholder scan:** Porting tasks reference the concrete source (`/tmp/source-
guide.md`) + explicit conventions; new-content tasks carry concrete briefs/outlines,
not "TBD". ✓

**Consistency:** File paths here match the spec IA and the `astro.config.mjs`
sidebar built in Task 1. ✓
