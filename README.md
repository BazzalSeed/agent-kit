# agent-kit

A Claude-first agent skill/plugin marketplace, with a future path to Codex, Pi, and other agent runtimes.

## What's here

A Claude Code **plugin marketplace** distributing reusable skills. The first plugin:

### `agent-team` — build a high-leverage agent team
Two skills that help you design and launch a Claude Code [agent team](https://code.claude.com/docs/en/agent-teams) (the experimental lead-spawns-teammates feature) without the usual guesswork or wasted spend:

- **`plan-team`** — analyzes the repo (`CLAUDE.md` / `AGENTS.md` / layout), asks a couple of focused questions, and writes a **lean team plan**: the right roles, one owner per file-set, a deliverable each. Principle: *lean by default, escalate on trigger.*
- **`launch-team`** — checks the feature is enabled, reads the plan, spawns one named teammate per role, **waits** (instead of working solo), and synthesizes one deliverable.

The split is deliberate: `plan-team` gives you a **reviewable, editable plan before you pay ~7× tokens** to run the team; `launch-team` just executes it.

## Install

```text
/plugin marketplace add BazzalSeed/agent-kit
/plugin install agent-team@agent-kit
```

Then in any repo:

```text
/agent-team:plan-team     # design the team → writes .claude/team-plans/<slug>.md
/agent-team:launch-team   # spawn it from the plan
```

Agent teams are experimental and **off by default** — enable them once (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings `env`, then restart). `launch-team` checks this and tells you exactly what to do if it's missing. See [docs/install.md](docs/install.md).

## Repo structure

```text
agent-kit/
  .claude-plugin/marketplace.json  # lists plugins (name, owner, plugins[])
  plugins/
    agent-team/
      .claude-plugin/plugin.json   # plugin manifest (MUST live in .claude-plugin/)
      skills/
        plan-team/SKILL.md
        launch-team/SKILL.md
  docs/
    design.md                      # design + the corrected agent-team template
    install.md                     # install + local-testing + enabling teams
    roadmap.md                     # what's intentionally not built yet
```

## Roadmap

Start as a Claude Code plugin marketplace; grow into a multi-agent toolkit whose core skill logic is reusable across Claude, Codex, Pi, and future agents. See [docs/roadmap.md](docs/roadmap.md).
