# Project guidance for Claude

## Superpowers skills

This repo vendors the [Superpowers](https://github.com/obra/superpowers) skill library under
`.claude/skills/` (see `.claude/SUPERPOWERS.md` for provenance and how to update).

**At the start of any non-trivial task, invoke the `using-superpowers` skill first** (via the
Skill tool). It establishes how to discover and apply the rest of the skills — brainstorming,
test-driven development, systematic debugging, writing/executing plans, code review, git
worktrees, and more. If there's even a ~1% chance a skill applies to what you're doing, use it.

Skills are invoked by their **bare names** (e.g. `test-driven-development`, `systematic-debugging`),
not a `superpowers:` prefix.

### Priority of instructions

1. The user's explicit instructions (this file, direct requests) — highest priority
2. Superpowers skills — override default behavior where they conflict
3. Default behavior — lowest priority

If guidance here conflicts with a skill, follow this file. The user is in control.

## The project

A static, no-backend study site — **"From POC to Production"** — built with **Astro + Starlight**.
All content is Markdown in `src/content/docs/`. See `PRD.md` for product scope, and
`docs/superpowers/` for the spec and implementation plan. It deploys on Netlify as static files.

## Project structure

- `src/content/docs/**` — all pages (Markdown / MDX). Folders map to sidebar groups
  (`mindset/`, `building-blocks/`, `method/`, `case-studies/`, `interview-prep/`, `resources/`).
- `astro.config.mjs` — site config **and the sidebar** (the "fan out" nav). Add every new page here.
- `src/content.config.ts` — Starlight docs content collection.
- `netlify.toml` — Netlify build/deploy config.
- `PRD.md` — product requirements. `HANDOVER.md` — last delivery summary.

## Local development

- `npm install` — install dependencies.
- `npm run dev` — dev server with hot reload.
- `npm run build` — production build to `dist/` (**the verification gate**).
- `npm run preview` — serve the built `dist/` locally.

Node 20+. Netlify runs `npm run build` and serves `dist/`.

## Content conventions (how to add content)

- Every page starts with frontmatter `title:` (the page H1) and a one-line `description:`.
  Body headings start at `##` (never `#`).
- Use Starlight asides for emphasis: `:::tip` / `:::note` / `:::caution`.
- **After creating any page, add it to the `sidebar` in `astro.config.mjs`** or it won't be linked.
- New module / case study → `src/content/docs/<group>/<slug>.md` + a sidebar entry. New case studies
  follow the 9-part spine in `docs/case-study-template.md` (exemplars: `case-studies/chat-whatsapp.md`,
  `rate-limiter.md`).
- New flashcard → a `<details>` block in `interview-prep/flashcards.md` (keep the blank lines so the
  answer renders as Markdown):
  ```html
  <details>
  <summary>Question?</summary>

  Answer in **markdown**.

  </details>
  ```
- New interview question → an entry under a category in `interview-prep/question-bank.md`.
- Always verify with `npm run build` (exit 0, no broken links) before pushing.

## Automated delivery pipeline

This project runs a **superset of the Superpowers flow**. It does **not** replace Superpowers — it
*sequences* its skills and consolidates the intermediate human checkpoints into a single gate:
**design approval**.

**The only human-in-the-loop gate is design approval** (the end of `brainstorming`). The user
approves the design once; after that, run the rest **non-stop**, in order:

1. **Spec** — the design/spec doc (output of `brainstorming`) → **self-review** (placeholders,
   internal consistency, scope, ambiguity). Save under `docs/superpowers/specs/`.
2. **Plan** — `writing-plans` → **self-review** (spec coverage, placeholders, type/path consistency).
   Save under `docs/superpowers/plans/`.
3. **Build** — `subagent-driven-development` (dispatch independent tasks to subagents in parallel),
   with `test-driven-development` where code is genuinely testable.
4. **Test** — `verification-before-completion`: run `npm run build`; it MUST exit 0 with no
   broken-link warnings. Evidence before claims.
5. **Review** — `requesting-code-review` / the `code-review` skill over the diff; fix findings.
6. **Handover doc** — write/update `HANDOVER.md`.
7. **Suggest next steps** — concrete follow-ups for the user.
8. **Finish & publish** — `finishing-a-development-branch`: commit, push the feature branch, and
   **auto-push to `main` on every completed run** (Netlify deploys from `main`).

Rules that keep this from conflicting with Superpowers:

- Skip the per-skill HITL prompts that the consolidated gate already covers: brainstorming's "user
  reviews spec", writing-plans' execution-choice prompt, executing-plans' review checkpoints.
- It is still a Superpowers process — the spec, plan, and build steps use the Superpowers skills.
- If a genuine blocker or a design-level ambiguity appears mid-run that the approved design did not
  settle, **stop and ask**. Autonomy does not mean guessing on irreversible or design decisions.
- Subagents dispatched to execute a specific task skip `using-superpowers` (per that skill's own
  subagent rule).
