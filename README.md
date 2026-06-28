# agent-kit

A Claude-first agent skill/plugin marketplace, with a future path to Codex, Pi, and other agent runtimes.

## What's here

A Claude Code **plugin marketplace** distributing reusable skills. The first plugin:

### `agent-team` — build a high-leverage agent team
Three skills for running a Claude Code [agent team](https://code.claude.com/docs/en/agent-teams) (the experimental lead-spawns-teammates feature) without the usual guesswork or wasted spend. **`launch-team` is the entry point** — the others are phases it drives:

- **`launch-team`** — the single command to run a team. It **plans fresh** (invokes `plan-team`), checks the feature is enabled, spawns one named teammate per role, **opens the monitor UI**, then **waits** (instead of working solo) and synthesizes one deliverable. Team plans are **ephemeral** — each launch plans anew; a prior plan is reused only if you hand `launch-team` an explicit path.
- **`plan-team`** — the planning phase: analyzes the repo (`CLAUDE.md` / `AGENTS.md` / layout), asks a couple of focused questions, and produces a **lean team plan** (the right roles, one owner per file-set, a deliverable each) behind a mandates + roles-table review gate **before you pay ~7× tokens**. Usually invoked by `launch-team`; run it directly to design a team without launching. Principle: *lean by default, escalate on trigger.*
- **`watch-team`** — opens a local, read-only, zero-dependency monitor (`node plugins/agent-team/monitor/watch.mjs --open`) showing the team's mandates, lead↔teammate messages, and build progress in the browser. `launch-team` opens it automatically; run `watch-team` to **re-open** it. It reads the files Claude Code already writes (transcripts, task lists) plus a breadcrumb `launch-team` records, and changes no settings.

## Personas

The plugin ships **eight reusable roles** as Claude Code subagents (in `plugins/agent-team/agents/`, resolving as `agent-team:<name>`). `plan-team` casts **one persona per ownership lane**; `launch-team` spawns it via `subagent_type`, so each teammate carries its standing discipline automatically — no re-pasting role text into the plan. The persona *is* the role: you cast one per lane, you don't pick a base and then a flavor.

| Persona | Cast it for a lane that is… |
|---|---|
| `architect` | the shared **code seam** — contracts / schema / skeleton — frozen before lanes fork; implements no feature behavior, then guards the seam as it evolves |
| `builder` | generic or mixed feature work with no clear domain flavor (the fallback lane owner) |
| `backend` | server-side: APIs, services, data, migrations |
| `frontend` | client-side: UI components, state, routing, accessibility |
| `designer` | the visual layer: design system, tokens, typography, visual correctness |
| `qa` | the cross-cutting test harness + the **drivable test seam** (distinct from builders' own unit tests) |
| `devops` | the **ops layer**: CI/CD, provisioning, deploy, env/secrets, hosting |
| `reviewer` | the independent judge + the hands-on **end-to-end gate** that drives the running product |

`backend` / `frontend` / `designer` are **specializations of `builder`** — the same lane-owner stance (one owner per area, test-first, "done" = tests green) plus a domain quality bar. Use the specific one when a lane is clearly domain-shaped; fall back to `builder` when it isn't. `architect` and `devops` split the shared setup — code seam vs. ops layer — and `qa` builds the test seam the `reviewer` then drives.

## Install

```text
/plugin marketplace add BazzalSeed/agent-kit
/plugin install agent-team@agent-kit
```

Then in any repo:

```text
/agent-team:launch-team   # plan fresh → spawn the team → open the monitor (the one command you need)
/agent-team:plan-team     # optional: design a team without launching it
/agent-team:watch-team    # re-open the monitor for a running team
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
      agents/                      # 8 reusable role personas (agent-team:<name>)
        architect.md  builder.md  reviewer.md
        backend.md  frontend.md  designer.md  qa.md  devops.md
  docs/
    design.md                      # design + the corrected agent-team template
    install.md                     # install + local-testing + enabling teams
    roadmap.md                     # what's intentionally not built yet
```

## Roadmap

Start as a Claude Code plugin marketplace; grow into a multi-agent toolkit whose core skill logic is reusable across Claude, Codex, Pi, and future agents. See [docs/roadmap.md](docs/roadmap.md).
