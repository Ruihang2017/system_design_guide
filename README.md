# From POC to Production

> A free, static, no-backend study site that turns a full **system design** guide into a
> searchable, navigable reference — for engineers leveling up from *"can build things"* to
> *"can design things that survive scale, failure, and time."*

[![Built with Astro](https://img.shields.io/badge/Built%20with-Astro%205-BC52EE?logo=astro&logoColor=white)](https://astro.build)
[![Starlight](https://img.shields.io/badge/Docs-Starlight-FFC447)](https://starlight.astro.build)
[![Deploys on Netlify](https://img.shields.io/badge/Deploys%20on-Netlify-00C7B7?logo=netlify&logoColor=white)](https://www.netlify.com/)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

You already know how to make things *work* — wiring up services, shipping POCs, proving ideas
fast. System design is a different muscle: making things **keep** working when traffic goes up
100×, when a server dies at 3am, when the table has 4 billion rows, and when three teams need to
change the same system without breaking each other.

This repo is the source for that study site. The entire guide — Parts 0–15, nine fully worked case
studies, an interview question bank with model answers, and optional interactive practice — is
**plain Markdown** in `src/content/docs/`, rendered by [Astro](https://astro.build) +
[Starlight](https://starlight.astro.build) into a fast static site with full-text search, Mermaid
diagrams, dark mode, and mobile navigation. No backend, no database, no login.

> The throughline: every technique here buys you scale, resilience, or maintainability — usually by
> trading away another. **Learn the trades, not the trivia.**

## What's inside

The content is organized so you can **"fan out"**: skim the map, then go deep on one self-contained
page at a time. 33 pages across seven groups (the left sidebar mirrors this):

| Group | Pages |
|---|---|
| **Overview** | Landing · Introduction (how to use / fan out) |
| **Core Mindset** | `0` Functional vs Non-Functional · `1` Estimation & Numbers · Numbers Everyone Should Know · `2` Consistency, CAP & Correctness |
| **Building Blocks** | `3` Communication & Networking · `4` Databases & Storage · `5` Caching · `6` Messaging & Async · `7` Architecture Patterns · `8` Reliability & Resilience · `9` Observability & Delivery · `10` Specialized Components *(each with a decision table, numbers, pitfalls & a diagram)* |
| **The Method** | `11` Design Framework · Interview Checklist |
| **Case Studies** | **9 fully worked designs** — URL Shortener · News Feed / Twitter · Chat / WhatsApp · Distributed Rate Limiter · Video Streaming · Ride-Sharing · Payment / Checkout · File Storage & Sync · Web Crawler — plus a Practice Problem Bank |
| **Interview Prep** | Question Bank (18 prompts, each with a try-then-reveal **model answer**) · Annotated **Mock Interview** · Concept → Tradeoff Flashcards (38 cards, with a **review mode**) |
| **Study & Resources** | Study Plan · Progress Tracker · Canonical Resources · Prompts to Fan Out |

**The arc:** modules `0–2` are the mindset and vocabulary everything else assumes; `3–10` are the
building blocks you assemble in any design; `11` is the method for driving a problem or interview;
then worked case studies and a practice bank put it into reps.

## Features

- **Worked answers everywhere** — 9 case studies follow one 9-part design template; all 18
  question-bank prompts have a try-then-reveal model answer; an annotated mock-interview transcript
  shows the method performed live.
- **Mermaid diagrams** — architecture diagrams rendered client-side (and they degrade to readable
  source if the integration is ever removed).
- **Full-text search** — static, client-side via [Pagefind](https://pagefind.app/) (no backend).
- **Optional practice, still no backend** — flashcard *review mode* (Leitner spaced repetition), a
  per-module *progress tracker*, and a *random question* button — all `localStorage`-only and fully
  optional (every page works with JavaScript disabled).
- **Dark / light theme**, responsive mobile nav, syntax-highlighted code, and callout asides.
- **"Edit on GitHub"** on every page → low-friction contributions.
- **Cross-links** between modules, case studies, and the question bank.

## Tech stack

| | |
|---|---|
| Framework | [Astro](https://astro.build) `^5.6` |
| Docs theme | [@astrojs/starlight](https://starlight.astro.build) `^0.34` (nav, search, theme) |
| Images | [sharp](https://sharp.pixelplumbing.com/) |
| Content | Markdown / MDX in `src/content/docs/` |
| Output | 100% static HTML/CSS/JS in `dist/` — no server, no database |
| Hosting | [Netlify](https://www.netlify.com/) (`netlify.toml`) |
| Runtime | Node 20+ |

## Quick start

```bash
npm install      # install Astro + Starlight (Node 20+)
npm run dev      # local dev server with hot reload  → http://localhost:4321
npm run build    # production build to dist/  (the verification gate)
npm run preview  # serve the built dist/ locally
npm run check    # type-check content & config (astro check)
```

`npm run build` is the gate: it must exit `0` with **no broken-link warnings** before anything is
merged or deployed.

## Project structure

```
.
├── astro.config.mjs        # site config AND the sidebar (the "fan out" nav) — add every new page here
├── netlify.toml            # Netlify build/deploy config (npm run build → publish dist/, Node 20)
├── src/
│   ├── content.config.ts   # Starlight docs content collection
│   └── content/docs/       # ALL pages live here; folders map to sidebar groups
│       ├── index.mdx       #   Overview · landing (splash)
│       ├── introduction.md
│       ├── mindset/        #   Core Mindset
│       ├── building-blocks/
│       ├── method/         #   The Method
│       ├── case-studies/
│       ├── interview-prep/
│       └── resources/      #   Study & Resources
├── docs/superpowers/       # design spec + implementation plan for this site
├── PRD.md                  # product requirements (scope, goals, non-goals)
├── HANDOVER.md             # last delivery summary + verification evidence
└── CLAUDE.md               # contributor/agent guidance + content conventions
```

## Adding & editing content

The whole point is that you extend this by editing **Markdown only** — no framework knowledge
required. To add a page:

1. Create `src/content/docs/<group>/<slug>.md`.
2. Give it frontmatter — a `title:` (the page H1) and a one-line `description:`. Body headings start
   at `##` (never `#`).
3. **Add it to the `sidebar` in `astro.config.mjs`** — otherwise it won't be linked anywhere.
4. Run `npm run build` and confirm it exits `0` with no broken links.

Smaller additions:

- **Flashcard** → a `<details>` block in `interview-prep/flashcards.md` (keep the blank lines so the
  answer renders as Markdown).
- **Interview question** → an entry under a category in `interview-prep/question-bank.md`.
- **Emphasis** → Starlight asides: `:::tip` / `:::note` / `:::caution`.

The full content conventions live in **[`CLAUDE.md`](./CLAUDE.md)**; product scope and non-goals are
in **[`PRD.md`](./PRD.md)**.

## Deployment

Netlify builds with `npm run build` and publishes `dist/` on Node 20 (see
[`netlify.toml`](./netlify.toml)). The production branch is **`main`** — pushing to it triggers an
auto-deploy.

The `site:` URL in `astro.config.mjs` is currently set to
`https://system-design-guide.netlify.app`; update it to your real Netlify URL (it only affects the
generated sitemap and canonical tags, not the build or navigation).

## Roadmap

Future "fan-outs" tracked in [`PRD.md`](./PRD.md) and [`HANDOVER.md`](./HANDOVER.md):

- More worked case studies from the practice bank (key-value store, ad-click aggregator,
  autocomplete, Google Docs, notification system).
- Convert the remaining ASCII diagrams (chat, rate limiter) to Mermaid for visual consistency.
- Per-module deep dives (see `resources/fan-out-prompts`).
- Richer annotated mock-interview transcripts for more problems.

## Contributing

The site is open source and login-free. To improve or extend it: edit the Markdown in
`src/content/docs/`, add the page to the sidebar in `astro.config.mjs`, run `npm run build` to
verify, and open a PR. See **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** for the step-by-step guide,
[`CLAUDE.md`](./CLAUDE.md) for content conventions, and
[`docs/case-study-template.md`](./docs/case-study-template.md) for the case-study template.

## Acknowledgements

Built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build). Repo
tooling vendors the [Superpowers](https://github.com/obra/superpowers) skill library under
`.claude/` (see `.claude/SUPERPOWERS.md`).
