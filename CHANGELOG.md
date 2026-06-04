# Changelog

Notable changes to this project. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.2.0] — 2026-06-04 — Study-guide expansion

A major content and feature expansion turning the initial skeleton into a comprehensive,
self-study-ready guide. Content grew from ~18K to ~58K words.

### Added
- **Five new worked case studies** — Video Streaming, Ride-Sharing, Payment / Checkout, File
  Storage & Sync, and Web Crawler — each following the 9-part design template, with a Mermaid
  architecture diagram and a cited "In the real world" note (verified primary sources).
- **Model answers** for all 18 question-bank prompts (try-then-reveal `<details>` blocks).
- **Annotated mock-interview** transcript demonstrating the 7-step framework performed live.
- **"Numbers Everyone Should Know"** estimation cheat sheet (latency ladder, powers of two, QPS and
  availability tables).
- **Mermaid diagrams** across case studies and building blocks (via the `astro-mermaid` integration).
- **Building-block depth pass** — a decision table, concrete numbers, common pitfalls, and a worked
  mini-example added to all eight building blocks; deepened NFR and CAP/consistency fundamentals.
- **Optional client-only practice** (localStorage, progressive enhancement, works with JS off):
  flashcard review mode with Leitner spaced repetition, a random-question button, and a per-module
  progress tracker.
- **Contribution scaffolding** — `CONTRIBUTING.md`, GitHub issue/PR templates, and
  `docs/case-study-template.md`.
- **SEO** — Open Graph / Twitter card metadata and `robots.txt`.

### Changed
- Deepened the URL Shortener and News Feed / Twitter case studies to the full 9-part template.
- Refreshed `README.md`; corrected a stale flashcard count in `HANDOVER.md` (46 → 38).

## [0.1.0] — initial release

- Static Astro + Starlight study site rendering the "From POC to Production" guide (Parts 0–15),
  four worked case studies, an interview question bank, flashcards, and study resources. Deploys on
  Netlify as static files; no backend.
