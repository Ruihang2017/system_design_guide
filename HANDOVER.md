# Handover — System Design Study Site

- **Date:** 2026-06-04
- **Branch:** `claude/relaxed-bohr-WAPSm` (also published to `main` for Netlify)
- **Spec / Plan:** `docs/superpowers/specs/2026-06-04-system-design-study-site-design.md`,
  `docs/superpowers/plans/2026-06-04-system-design-study-site.md`

## What shipped

A static **Astro + Starlight** study site that renders the *"From POC to Production"* system
design guide (Parts 0–15) plus new interview-prep content. 25 content pages, built-in full-text
search, dark/light mode, mobile nav, "Edit on GitHub" links. No backend — deploys as static files.

## Content inventory (25 pages)

| Group | Pages |
|---|---|
| Overview | Landing (splash) · Introduction |
| Core Mindset | Non-Functional Requirements · Estimation & Numbers · Consistency, CAP & Correctness |
| Building Blocks | Networking · Databases · Caching · Messaging · Architecture Patterns · Reliability · Observability · Specialized Components |
| The Method | Design Framework · Interview Checklist *(new)* |
| Case Studies | URL Shortener · News Feed/Twitter · **Chat/WhatsApp** *(new)* · **Distributed Rate Limiter** *(new)* · Practice Problem Bank |
| Interview Prep | Question Bank — 18 prompts *(new)* · Flashcards — 46 cards *(new)* |
| Study & Resources | Study Plan · Canonical Resources · Prompts to Fan Out |

## How to run

```bash
npm install      # install Astro + Starlight (Node 20+)
npm run dev      # local dev server with hot reload
npm run build    # production build to dist/  (the verification gate)
npm run preview  # serve the built dist/
```

## Verification evidence

- `npm run build` → **exit 0**; 26 pages built; Pagefind indexed 25 pages / 2759 words.
- Internal links: **20/20 resolve, 0 broken**.
- Rendered HTML spot-checks: 46 flashcard `<details>` (well-formed), 18 question headings (no
  template leak), the nines table, Starlight asides, and all code blocks (ASCII / Lua / Python).
- Port fidelity: ported pages match their source sections by word count (within ~15 words).

## Deploy

- `netlify.toml`: build `npm run build`, publish `dist/`, `NODE_VERSION = 20`.
- Pushed to `main` so Netlify auto-deploys. **Action:** if your Netlify production branch isn't
  `main`, point it at `main` (or tell me which branch).
- `astro.config.mjs` `site:` is a placeholder (`system-design-guide.netlify.app`). Update it to
  your real Netlify URL — it only affects the sitemap/canonical tags, not the build or navigation.

## How to extend (see `CLAUDE.md` → Content conventions)

Add a Markdown file under `src/content/docs/<group>/`, give it `title` + `description` frontmatter,
then add it to the `sidebar` in `astro.config.mjs`. Run `npm run build` to verify.

## Suggested next steps

1. **Confirm the live deploy** on Netlify; set the real `site:` URL.
2. **Add architecture diagrams** to the case studies (the ASCII diagrams can become images/Mermaid).
3. **Promote more practice problems to fully-worked case studies** (Uber, Dropbox, video streaming,
   web crawler, payments) using the same framework structure.
4. **Per-module deep dives** (the `resources/fan-out-prompts` page lists good candidates).
5. Optional: a client-only **quiz/spaced-repetition** mode for the flashcards (still no backend).
