# Handover — System Design Study Site (v0.2 expansion)

- **Date:** 2026-06-04
- **Branch:** `claude/gallant-euler-y2etr`
- **Spec / Plan:** `docs/superpowers/specs/2026-06-04-study-guide-expansion-design.md`,
  `docs/superpowers/plans/2026-06-04-study-guide-expansion.md`

## What shipped

A major expansion turning the skeleton into a comprehensive, self-study-ready guide. Content grew
from ~18K to **~58K words across 33 pages**, delivered in six phases:

0. **Levelled case-study depth** — rewrote URL Shortener and News Feed to the full 9-part template;
   added the `astro-mermaid` integration; added `docs/case-study-template.md`.
1. **Worked answers** — a try-then-reveal model answer under all **18** question-bank prompts, plus an
   annotated **mock-interview** transcript.
2. **Diagrams** — a Mermaid architecture diagram on every new case study and all eight building blocks.
3. **Depth pass** — each building block gained a decision table, concrete numbers, common pitfalls, and
   a worked mini-example; deepened NFR and CAP/consistency; added a **"Numbers Everyone Should Know"** page.
4. **Breadth** — five new worked case studies (Video Streaming, Ride-Sharing, Payment/Checkout, File
   Storage & Sync, Web Crawler), each with a cited `:::note[In the real world]` (verified sources).
5. **Practice features** — client-only, progressive-enhancement (works with JS off): flashcard review
   mode (Leitner spaced repetition), random-question button, per-module progress tracker.
6. **Discoverability** — Open Graph/Twitter meta, `robots.txt`, `CONTRIBUTING.md`, GitHub issue/PR
   templates, `CHANGELOG.md`, refreshed `README.md`.

## Content inventory (33 pages)

| Group | Pages |
|---|---|
| Overview | Landing · Introduction |
| Core Mindset | NFR · Estimation · **Numbers Everyone Should Know** *(new)* · Consistency/CAP |
| Building Blocks | Networking · Databases · Caching · Messaging · Architecture · Reliability · Observability · Specialized — *each now with a decision table, numbers, pitfalls & a diagram* |
| The Method | Design Framework · Interview Checklist |
| Case Studies | URL Shortener · News Feed · Chat/WhatsApp · Rate Limiter · **Video Streaming · Ride-Sharing · Payment · File Storage & Sync · Web Crawler** *(5 new)* · Practice Bank |
| Interview Prep | Question Bank — 18 prompts **+ 18 model answers** *(new)* · **Mock Interview** *(new)* · Flashcards — 38 cards **+ review mode** |
| Study & Resources | Study Plan · **Progress Tracker** *(new)* · Canonical Resources · Prompts to Fan Out |

## Verification evidence

- `npm run build` → **exit 0**, 34 pages built, Pagefind index built, sitemap generated.
- **Internal links: 0 broken** (every root-relative content link resolves to a built page).
- Mermaid: 16 files emit client-rendered `class="mermaid"` blocks; all diagram source validated
  (line breaks use `<br/>`, special-char labels quoted).
- **Code review** (3 parallel reviewers — JS/config, Mermaid syntax, content accuracy): **13 findings,
  all fixed** — 3 unquoted `{…}` Mermaid edge labels, 4 enhancement-script robustness issues, and 6
  back-of-envelope arithmetic errors (Bloom sizing, ledger/metadata/total-storage magnitudes).

## Notable decisions & known limitations

- **Interactive features** are delivered by one static script (`public/sdg-enhance.js`) injected
  site-wide via Starlight `head`, keyed by URL path — chosen over MDX conversion to avoid `{…}` JSX
  parsing hazards and keep the build robust. The Leitner logic is inlined there (the earlier
  `src/scripts/leitner.ts` was removed to avoid duplication). **These behaviors should be eyeballed in
  a browser preview** (`npm run preview`) — the build cannot exercise client JS.
- **chat-whatsapp** and **rate-limiter** keep their detailed ASCII diagrams (they encode full
  request-flow sequences). The other 7 case studies use Mermaid. Converting these two is a tracked
  follow-up.
- **No unit-test runner** was added: the repo's gate is `npm run build` (+ `astro check`). The Leitner
  algorithm is simple and was reasoned through during review rather than unit-tested.
- **Commits are unsigned** — this environment has no SSH signing key (`gpg.ssh.allowedSignersFile` is
  unset), so GitHub will show them "Unverified." Identity is correct (`Claude <noreply@anthropic.com>`).
- The `astro.config.mjs` `site:` URL is still the placeholder `system-design-guide.netlify.app`.

## How to run

```bash
npm install      # Node 20+
npm run dev      # local dev server
npm run build    # production build to dist/ (the gate)
npm run preview  # serve dist/ — use this to confirm the interactive features
```

## Suggested next steps

1. **Preview the interactive features** in a browser (flashcard review mode, random question, progress
   tracker) and tweak styling to taste.
2. **Set the real Netlify `site:` URL** and confirm the live deploy from `main`.
3. Convert the chat/rate-limiter ASCII diagrams to Mermaid for visual consistency.
4. Promote more practice problems to full case studies (key-value store, ad-click aggregator,
   autocomplete, Google Docs, notification system).
5. Optionally add a tiny test runner (vitest) if the client logic grows.
