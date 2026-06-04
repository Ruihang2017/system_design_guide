# Contributing

Thanks for helping make this a better free system-design resource! The whole site is **Markdown**
in `src/content/docs/` — you don't need to know Astro to contribute content.

## Run it locally

```bash
npm install      # Node 20+
npm run dev      # http://localhost:4321 with hot reload
npm run build    # production build — must pass with no broken links
```

## Add or edit a page

1. Create `src/content/docs/<group>/<slug>.md` (groups: `mindset/`, `building-blocks/`, `method/`,
   `case-studies/`, `interview-prep/`, `resources/`).
2. Start with frontmatter — a `title:` (the page H1) and a one-line `description:`. **Body headings
   start at `##`** (never a single `#`).
3. **Add the page to the `sidebar` in `astro.config.mjs`** — otherwise nothing links to it.
4. Run `npm run build` and confirm it exits 0 with no broken-link warnings.
5. Open a pull request.

## Conventions

- **Voice:** crux-first and tradeoff-focused — "learn the trades, not the trivia." Be concrete.
- **Asides:** use Starlight callouts `:::tip` / `:::note` / `:::caution` for emphasis.
- **Diagrams:** write them as ` ```mermaid ` fenced blocks (rendered by the `astro-mermaid`
  integration). Use `<br/>` for line breaks in node labels, and quote labels containing special
  characters.
- **Case studies** follow the 9-part spine in [`docs/case-study-template.md`](docs/case-study-template.md)
  (exemplars: `case-studies/chat-whatsapp.md`, `rate-limiter.md`).
- **Flashcards:** add a `<details>` block in `interview-prep/flashcards.md` (keep the blank lines so the
  answer renders as Markdown).
- **Real-world claims must be cited** to a real, public source (link the engineering blog/paper).
- Full conventions live in [`CLAUDE.md`](CLAUDE.md).

## What makes a great contribution

- Fixing an inaccuracy (with a source).
- Deepening a thin section with a concrete number, decision table, or worked example.
- A new worked case study that covers a *distinct* pattern not already represented.
- Clearer diagrams.

Keep changes focused and verify the build before opening a PR.
