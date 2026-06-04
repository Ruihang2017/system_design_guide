# Spec — System Design Study Site

- **Date:** 2026-06-04
- **Status:** Approved (design approved by user; building autonomously)
- **Author:** Claude (via Superpowers brainstorming)

## 1. Summary

A static, no-backend study website that renders the "From POC to Production —
A System Design Catch-Up Guide" as a searchable, navigable docs site. The
sidebar is the "fan out" mechanism: a reader skims the overview for the map,
then dives into any module independently. Open source, no login, deployable on
Netlify.

## 2. Goals

- Present the full guide (Parts 0–15) as clean, readable, linkable pages.
- Make navigation effortless: persistent sidebar, full-text search, dark mode.
- Be trivially extendable by contributors editing **Markdown only** (no code).
- Add high-value interview-prep content: more worked case studies, a question
  bank, and self-test flashcards.
- Deploy as a 100% static site on Netlify with zero backend.

## 3. Non-goals (YAGNI)

No auth, user accounts, progress tracking, quiz state, comments, analytics,
ratings, or i18n. Anything requiring a server or per-user state is out of scope.
These can be layered on later without rework.

## 4. Target users

Working engineers who can already build things and want to learn to *design*
systems — for real work and for interviews. Secondary: contributors who want to
improve or extend the content.

## 5. Tech choice & rationale

**Astro + Starlight.** Starlight is a docs theme that provides sidebar nav,
static full-text search (Pagefind), dark/light mode, code highlighting,
callouts/asides, and mobile nav out of the box. Content lives as plain Markdown
in `src/content/docs/`, so contributors never touch framework code. The build
runs on Netlify; the *deployed* artifact is static HTML/CSS/JS — no backend.

Alternatives considered: VitePress (also good; Vue-based, more minimal default),
and plain HTML/CSS/JS (rejected — hand-maintaining nav/search across 25+ pages
is far less maintainable).

## 6. Information architecture (sidebar groups → pages)

- **Overview**
  - `index.mdx` — landing (splash hero + "how to use / fan out")
  - `introduction` — how to use the guide, the arc, honesty note
- **Core Mindset**
  - `mindset/non-functional-requirements` — Part 0
  - `mindset/estimation` — Part 1 (scaling, nines, latency/throughput, numbers, BOTE)
  - `mindset/consistency-cap` — Part 2 (CAP, PACELC, consistency models, ACID/BASE, isolation)
- **Building Blocks**
  - `building-blocks/networking` — Part 3
  - `building-blocks/databases` — Part 4
  - `building-blocks/caching` — Part 5
  - `building-blocks/messaging` — Part 6
  - `building-blocks/architecture-patterns` — Part 7
  - `building-blocks/reliability` — Part 8
  - `building-blocks/observability` — Part 9
  - `building-blocks/specialized-components` — Part 10
- **The Method**
  - `method/framework` — Part 11
  - `method/interview-checklist` — one-page checklist derived from Part 11 (NEW)
- **Case Studies**
  - `case-studies/url-shortener` — Part 12 (worked)
  - `case-studies/news-feed` — Part 13 (worked)
  - `case-studies/chat-whatsapp` — NEW worked case study
  - `case-studies/rate-limiter` — NEW worked case study
  - `case-studies/practice-problems` — Part 14 bank
- **Interview Prep**
  - `interview-prep/question-bank` — NEW (~18 prompts)
  - `interview-prep/flashcards` — NEW (concept → tradeoff, native `<details>`)
- **Study & Resources**
  - `resources/study-plan` — Part 15 plan
  - `resources/reading` — Part 15 canonical resources
  - `resources/fan-out-prompts` — Part 15 prompts

## 7. Content plan

**Ported (from the provided guide, reformatted to Starlight Markdown):** all of
Parts 0–15. Reformatting rules:
- Page H1 comes from frontmatter `title`; in-body headings start at `##`.
- Convert the guide's `>` emphasis blockquotes to Starlight asides
  (`:::tip`, `:::note`, `:::caution`) where they add emphasis.
- Preserve all tables and fenced code blocks verbatim.
- Add a one-line `description` to each page's frontmatter.

**New content:**
- Two fully-worked case studies (Chat/WhatsApp, Distributed Rate Limiter) that
  follow the Part 11 framework end-to-end, matching the depth of the two
  existing worked examples.
- A System Design Question Bank: ~18 classic prompts, each with *what it tests*,
  *requirements to clarify*, and *the crux*.
- Concept → Tradeoff flashcards rendered as native collapsible `<details>`
  (no JS), covering Parts 0–10.
- An Interview Checklist one-pager (the Part 11 framework as a checklist).

## 8. Project structure

```
package.json
astro.config.mjs          # Starlight integration, site title, sidebar, editLink
netlify.toml              # build command + publish dir + NODE_VERSION
tsconfig.json
.gitignore                # node_modules/, dist/, .astro/
src/
  content.config.ts       # Starlight docs collection
  content/docs/           # all Markdown pages (see IA)
PRD.md                    # product requirements (root)
CLAUDE.md                 # merged: Superpowers activation + project guidance + pipeline
docs/
  superpowers/specs/      # this spec
  superpowers/plans/      # implementation plan
HANDOVER.md               # written at the end
```

## 9. Build & deploy

- `npm run build` → static output in `dist/`.
- `netlify.toml`: `command = "npm run build"`, `publish = "dist"`,
  `NODE_VERSION = "20"`.
- Edit-on-GitHub links point at `ruihang2017/system_design_guide` (branch `main`).
- Develop on `claude/relaxed-bohr-WAPSm`; publish to `main` (user-approved) so
  Netlify auto-deploys.

## 10. Testing / verification

This is a content site; "tests" = a clean production build with resolvable
links. Before pushing: run `npm install` and `npm run build`, confirm exit 0 and
no broken-link warnings from Starlight. Spot-check the generated `dist/` for the
expected pages. (verification-before-completion.)

## 11. Success criteria

- `npm run build` succeeds with no errors and no broken internal links.
- Every Part 0–15 is present and readable; sidebar groups match the IA.
- Search, dark mode, and mobile nav work (Starlight defaults).
- The four case studies, question bank, flashcards, and checklist are present.
- `PRD.md` and a merged `CLAUDE.md` (documenting the automated pipeline) exist.
- Site deploys on Netlify from `main`.
```
