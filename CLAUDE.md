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
