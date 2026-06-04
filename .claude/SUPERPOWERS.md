# Superpowers (vendored)

The skills under `.claude/skills/` are vendored from the **Superpowers** plugin by
Jesse Vincent (obra).

- Source: https://github.com/obra/superpowers
- Version: 5.1.0
- Commit: 6fd4507659784c351abbd2bc264c7162cfd386dc
- Vendored: 2026-06-04
- License: MIT (see `.claude/SUPERPOWERS-LICENSE`)

## Why vendored instead of installed as a plugin

Claude Code on the web (cloud sessions) can't use the interactive `/plugin` manager — it's
"only available in local sessions." But repo-committed `.claude/skills/` **are** loaded in cloud
sessions, so the skills are vendored directly into this repo. See
https://code.claude.com/docs/en/claude-code-on-the-web ("What's available in cloud sessions").

## What was vendored

- `.claude/skills/` — all 14 Superpowers skills (markdown + on-demand helper assets).
- **Activation** is via `CLAUDE.md` — a non-executable instruction telling the agent to load the
  `using-superpowers` skill before non-trivial work. The plugin's original `SessionStart` hook
  (which auto-runs a bash script every session) was intentionally **not** vendored, to avoid
  wiring auto-executing external code into agent config.

## Modifications from upstream

- Stripped the `superpowers:` namespace prefix from cross-skill references so they resolve to the
  bare skill names used by repo-committed skills (e.g. `test-driven-development`).
- Removed the executable bit from skill helper scripts (`*.sh`, `*.js`, `*.cjs`, `*.ts`). They are
  invoked on demand by their skills (e.g. `bash <script>` / `node <script>`), never auto-run. If
  you use a skill that runs one directly, re-add the bit with `chmod +x`.

## How to update

```bash
git clone --depth 1 https://github.com/obra/superpowers.git /tmp/superpowers-src
rm -rf .claude/skills && mkdir -p .claude/skills
cp -r /tmp/superpowers-src/skills/. .claude/skills/
find .claude/skills -name '*.md' -exec sed -i 's/superpowers://g' {} +
find .claude/skills -type f \( -name '*.sh' -o -name '*.js' -o -name '*.cjs' -o -name '*.ts' \) -exec chmod -x {} +
```

Then bump the version/commit recorded above.

## Alternative: install as a plugin (auto-updates)

Superpowers is on the official Claude plugin marketplace. In a **local** session:

```
/plugin install superpowers@claude-plugins-official
```

To auto-load it in **cloud** sessions instead of vendoring, you can declare it in
`.claude/settings.json` under `enabledPlugins` (this requires the cloud environment to have network
access to fetch the marketplace at session start). See the cloud docs linked above for details.
