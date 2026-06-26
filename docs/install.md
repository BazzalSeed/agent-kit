# Install & local testing

## Install from the marketplace
```text
/plugin marketplace add BazzalSeed/agent-kit
/plugin install agent-team@agent-kit
```

## Local development install (before pushing)
From a clone of this repo, add the marketplace by local path, then install:
```text
/plugin marketplace add /absolute/path/to/agent-kit
/plugin install agent-team@agent-kit
```
Verify it loaded:
```bash
claude plugin list
claude plugin details agent-team
```
The skills appear as `/agent-team:plan-team` and `/agent-team:launch-team`.

## Enable agent teams (one-time)
Agent teams are experimental and **off by default**. Add to `~/.claude/settings.json` (or a project `.claude/settings.local.json`) and **restart the session**:
```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```
Optional: set a **Default teammate model** in `/config` (teammates don't inherit the lead's model). Sonnet is the cost-fit default for coordination work.

`launch-team` checks this and tells you exactly what to do if it's missing.

## Use
```text
/agent-team:plan-team     # design the team → writes a plan file you can review/edit
/agent-team:launch-team   # spawn the team from that plan
```
