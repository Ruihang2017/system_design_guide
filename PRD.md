# PRD — From POC to Production (System Design Study Site)

## 1. Vision

A free, open-source, static study site that turns the *"From POC to Production"*
system design guide into a searchable, navigable reference engineers actually
use — to level up from "can build things" to "can design things that survive
scale, failure, and time," and to prepare for system design interviews.

## 2. Problem

The guide content is excellent but lives as one long document. Long-form text is
hard to navigate, search, resume, and extend. Engineers want to **fan out**: get
the map, then go deep on one topic at a time, and drill into worked examples and
practice questions.

## 3. Target users

- **Primary:** working engineers (mid → senior) studying system design for real
  work or interviews.
- **Secondary:** contributors who want to improve or extend the content via PRs.

## 4. Goals

- Render the full guide (Parts 0–15) as clean, linkable, searchable pages.
- Effortless navigation: persistent sidebar ("fan out"), full-text search, dark mode.
- Extendable by editing **Markdown only** — no framework knowledge required.
- Strong interview-prep surface: worked case studies, a question bank, self-test
  flashcards, and a one-page framework checklist.
- 100% static, no backend, no login; deploys on Netlify.

## 5. Non-goals (YAGNI)

No authentication, user accounts, saved progress, quiz scoring/state, comments,
ratings, server-side analytics, or internationalization. Anything needing a
server or per-user state is explicitly out of scope. These can be added later
without rework.

## 6. Content scope & information architecture

Sidebar groups → pages (each page is one self-contained Markdown file):

- **Overview** — landing, Introduction (how to use / fan out)
- **Core Mindset** — Functional vs Non-Functional · Estimation & Numbers ·
  Consistency, CAP & Correctness
- **Building Blocks** — Networking · Databases & Storage · Caching · Messaging ·
  Architecture Patterns · Reliability · Observability · Specialized Components
- **The Method** — Design Framework · Interview Checklist
- **Case Studies** — URL Shortener · News Feed/Twitter · Chat/WhatsApp ·
  Distributed Rate Limiter · Practice Problem Bank
- **Interview Prep** — Question Bank · Concept → Tradeoff Flashcards
- **Study & Resources** — Study Plan · Canonical Resources · Prompts to Fan Out

## 7. Features

- Full-text search (Starlight/Pagefind, static — no backend).
- Dark/light theme, responsive mobile nav, code highlighting, callout asides.
- "Edit on GitHub" on every page → low-friction contributions.
- Collapsible flashcards using native `<details>` (no JavaScript).
- Cross-links between modules, case studies, and the question bank.

## 8. Tech & architecture

- **Astro + Starlight.** Content as Markdown in `src/content/docs/`. Sidebar/nav/
  search/theme provided by Starlight. Build emits static HTML to `dist/`.
- No backend, no database, no runtime server. The deployed site is static files.

## 9. Deployment

- **Netlify**, configured by `netlify.toml` (`npm run build` → publish `dist/`,
  Node 20). Production branch: `main` (auto-deploys on push).

## 10. Success criteria

- `npm run build` succeeds: exit 0, no broken internal links.
- All Parts 0–15 present and readable; sidebar matches the IA.
- Search, dark mode, mobile nav work.
- Four case studies + question bank + flashcards + checklist present.
- Site is live on Netlify from `main`.

## 11. Roadmap (future fan-out)

- Per-module **deep dives** (e.g., a database decision tree; consistency &
  replication with diagrams; cache-stampede code).
- More worked case studies from the practice bank (video streaming, Uber,
  Dropbox, web crawler, payments, key-value store, autocomplete).
- Diagrams (architecture diagrams per case study).
- Optional: client-only quiz mode, spaced-repetition flashcards (still no backend).

## 12. Contributing

The site is open source, no login. To add or fix content, edit the Markdown in
`src/content/docs/` (see `CLAUDE.md` → "Content conventions"), add the page to the
sidebar in `astro.config.mjs`, run `npm run build`, and open a PR.
