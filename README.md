## figural-core

AI agents forget what you decided yesterday.

They rebuild things you already rejected. They contradict each other across sessions. They start blind every time. There's nowhere for product intent to live in an agentic codebase — so it evaporates from the context window, silently, every single session.

Figural fixes that. A persistent decision log and structured spec that your agents read before they act and write back to after they decide.

Join our Discord here: https://discord.gg/E2ThS3wvtS

## What it looks like

After one `npx figural-core init` and one `/figural-scope`, your repo has this:

### `.figural/log.json` — every product decision, logged and versioned

```json
{
  "id": 1,
  "timestamp": "2026-04-22T00:00:00.000Z",
  "decision": "V1 scope: auth via magic link only. Explicitly out of scope: OAuth, SSO, password reset.",
  "rationale": "Constraints: ship in 2 weeks. Success: user can sign in and reach dashboard. Reconsider if: >3 enterprise requests for SSO.",
  "confidence": 0.85,
  "domain": "auth",
  "source": "human",
  "conflicts_with": [],
  "evidence_refs": []
}
```

### `.specpack.json` — a typed, machine-readable spec your agents execute against

```json
{
  "schema_version": "1.0",
  "product_name": "my-app",
  "decision": "Magic link auth only for V1",
  "rationale": "Ship in 2 weeks, no OAuth complexity",
  "confidence": 0.85,
  "in_scope": ["magic link sign-in", "session management", "dashboard access"],
  "out_of_scope": ["OAuth", "SSO", "password reset", "social login"],
  "constraints": ["no external auth providers", "must work offline-first"],
  "acceptance_tests": ["user receives magic link within 10s", "session persists across refresh"]
}
```

Your agent reads both before it writes a single line of code. It writes decisions back after every meaningful choice. The loop is closed.

## 60-second quickstart

```bash
npx figural-core init
```

This creates `.figural/log.json`, `.specpack.json`, and prints your MCP config.

Then:

- Paste the printed lines into `CLAUDE.md` — tells your agent how to use Figural
- Paste the MCP config JSON into Cursor or Claude Code settings
- Run `/figural-scope` in Claude Code — answers five forcing questions, logs your first scope decision

Next session, every agent reads `.specpack.json` and `.figural/log.json` before it acts. Context survives. Decisions persist.

## Cursor setup (step-by-step)

The most common Cursor setup issue is **working directory**: the MCP server must run with `cwd` set to the repo that contains your `.specpack.json`. If it doesn’t, `figural_get_spec` will read a different file (often the blank template).

### 1) Open the correct folder

Open Cursor with your **project root folder** (the folder that contains `.specpack.json`).

### 2) Add a project-level MCP config (recommended)

Create a file at `.cursor/mcp.json` (inside your project root) with:

```json
{
  "mcpServers": {
    "figural": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "figural-core", "mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

Notes:
- `type: "stdio"` matters (Cursor uses it to treat this as a local process server).
- `cwd: "${workspaceFolder}"` ensures the server reads **this repo’s** `.specpack.json`.

### 3) Restart Cursor and verify tools

Fully restart Cursor, then run:
- `figural_get_spec` → should return your current `.specpack.json`
- `figural_log_decision` → should return a numeric id and append to `.figural/log.json`

### Troubleshooting: `figural_get_spec` returns a blank/default spec

If you see a default object like `{"schema_version":"1.0","decision":"","in_scope":[]...}`:
- You are almost always pointing the MCP server at the wrong folder.
- Fix by using project-level `.cursor/mcp.json` and ensuring `cwd` is `${workspaceFolder}`.
- Avoid copying `.specpack.json` into parent folders; duplicates cause silent confusion.

Optional global install:

```bash
npm install -g figural-core
figural init
```

## Claude Code setup (step-by-step)

### 1) Run init

From your repo root:

```bash
npx figural-core init
```

### 2) Add the agent instructions

Paste the printed 3 lines into `CLAUDE.md`. That tells Claude Code to:
- read the spec before acting
- log decisions via `figural_log_decision`
- flag contradictions

### 3) Configure MCP for Claude Code

Paste the printed **Claude Code MCP config JSON** into Claude Code’s MCP/server settings.

If Claude Code supports a working directory field, set it to your repo root (same reason as Cursor): the MCP server must start with `cwd` pointing at the folder containing `.specpack.json`.

### 4) Use the prompts

Run:
- `/figural-scope` once to log initial scope
- `/figural-decide` at forks
- `/figural-watch` after significant changes (or run `npx figural-core watch` in a terminal)

## Codex setup (step-by-step)

Codex works if your Codex environment supports **MCP tool servers** (stdio) and lets the model call tools.

### 1) Run init

```bash
npx figural-core init
```

### 2) Configure MCP (critical: working directory)

Configure an MCP server that runs:

- `command`: `npx`
- `args`: `["-y", "figural-core", "mcp"]`
- `cwd`: set to your repo root (the folder containing `.specpack.json`)

If Codex doesn’t let you set `cwd`, you need to run the server from the repo root (or use a project-scoped config if available). If `cwd` is wrong, `figural_get_spec` will read a different file and may look blank.

### 3) Give Codex the workflow

Since Codex may not support Claude Code-style slash commands, use the prompt templates under `prompts/` by pasting them into your Codex “project instructions” or into the chat when needed:
- `prompts/figural-scope.md`
- `prompts/figural-decide.md`
- `prompts/figural-watch.md`

## MCP tools

Two tools, automatically available to any agent once configured:

| Tool | What it does |
| --- | --- |
| `figural_get_spec` | Agent reads the spec before acting |
| `figural_log_decision` | Agent writes decisions back after acting |

No setup beyond pasting the MCP config. Works with Cursor, Claude Code, and any MCP-compatible agent.

## Slash commands

Prompt templates that ship in `./prompts/`:

- `/figural-scope`: Asks five forcing questions. Logs a structured scope decision to `.figural/log.json`. Run this at the start of any new feature or session.
- `/figural-decide`: Captures a fork decision with tradeoffs, a forced choice, rationale, and confidence. Run this whenever you hit a meaningful architectural or product decision.

Example:

```text
/figural-decide
Decision: choose database
Domain: data model
Options: Postgres, SQLite
Constraints: must run locally, easy backups
```

## Schema reference

### `.figural/log.json`

| Field | Type | Description |
| --- | --- | --- |
| `id` | number | Auto-incrementing |
| `timestamp` | string | ISO-8601 |
| `decision` | string | What was decided |
| `rationale` | string | Why, constraints, success criteria |
| `confidence` | number | 0–1 |
| `domain` | string | e.g. `"auth"`, `"data model"`, `"UX"` |
| `source` | string | `"human"` \| `"agent"` \| `"extension"` |
| `conflicts_with` | number[] | IDs of contradicted decisions |
| `evidence_refs` | string[] | Links or references |

### `.specpack.json`

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Currently `"1.0"` |
| `product_name` | string |  |
| `decision` | string | The core product decision |
| `rationale` | string |  |
| `confidence` | number | 0–1 |
| `in_scope` | string[] | Explicitly in scope |
| `out_of_scope` | string[] | Explicitly rejected |
| `constraints` | string[] | Hard constraints |
| `acceptance_tests` | string[] | How you know it's done |
| `evidence_refs` | string[] | Supporting evidence |

JSON schemas for editor validation: `schemas/specpack.local.v1.schema.json`

## Using with the Figural web app

If you export a spec from `figural.app`, drop the exported JSON directly into `.specpack.json`. The MCP tools normalise web app fields (`scope_in` / `scope_out`) to match the local schema automatically.

## Why open source

The `.specpack.json` format only works as a standard if it belongs to no one.

Every vendor-built spec tool — AWS Kiro, GitHub Spec Kit, Cursor Plan Mode — locks your intent to their platform. Switch agents and your context disappears. We think that's wrong. Intent should travel with the team, not the tool.

`figural-core` is MIT licenced. The schema is open and versioned. We want `.specpack.json` in every repo that ships with AI agents — the way `.gitignore` is in every repo that ships with git.

The web app (`figural.app`) is where teams share the log, detect drift across sessions, and ingest evidence from Notion and Slack. The open source core is where the format lives. Forever.

## Note on package naming

This package is published on npm as `figural-core`. The executable is `figural`, but `npx` resolves from the package name — so always use `npx figural-core init`, not `npx figural init`.

## Contributing

Issues and PRs welcome. If you're adopting `.specpack.json` in your repo or building tooling around it, open an issue and tell us what the format needs to handle.

### Local development

```bash
npm install
npm run build
```

Typecheck:

```bash
npm run lint
```

Run the CLI locally:

```bash
node dist/cli/index.js init
node dist/cli/index.js mcp
node dist/cli/index.js watch
```

### Making a PR

1) Fork the repo and create a branch.
2) Keep changes small and scoped (one behavior change per PR).
3) Run `npm run build` before pushing.
4) Open a PR with:
- what you changed
- why you changed it
- how to test it (exact commands)

### High-impact contribution areas

- Cursor/Claude MCP config ergonomics (making setup foolproof)
- SpecPack schema compatibility (webapp ⇄ local) and migration helpers
- Drift detection heuristics (deterministic and low-noise)
- Docs + examples (real repos, real spec packs)

Built by Neeha and Shaurya at https://figural.world.

MIT licence.

