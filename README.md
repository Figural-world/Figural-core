Figural is the PM for your AI agents.

AI agents forget what you decided. Figural gives them a persistent decision log that survives context windows, catches drift, and keeps every agent on the same page.

## Using `figural-core` (npm package)

**You use Figural through the npm package named `figural-core`.** You do not need to clone this repo to adopt it—only if you want to contribute or fork.

| What you want | Exact command |
| --- | --- |
| Bootstrap a repo (creates `.figural/` and `.specpack.json`) | `npx figural-core init` |
| Optional: watch the repo for drift locally | `npx figural-core watch` |
| MCP server (usually you do **not** run this by hand; Cursor/Claude spawn it) | `npx figural-core mcp` |

**Why `figural-core` and not `figural`?** This package is published on npm as **`figural-core`**. The executable name is **`figural`**, but **`npx`** resolves it from the package name, so the command line is always **`npx figural-core …`**. Any doc that says `npx figural init` refers to a different/wrapper package name—here the correct install line is **`npx figural-core init`**.

**Optional global install** (so you can type `figural init` without `npx`):

```bash
npm install -g figural-core
figural init
```

After `init`, paste the printed MCP config into Cursor or Claude Code so the agent can call `figural_get_spec` and `figural_log_decision`.

## 60-second quickstart

From your repo root:

```bash
npx figural-core init
```

Then:

1. Paste the **3 lines** into `CLAUDE.md` (they tell the agent how to use Figural).
2. Paste the **MCP config JSON** into Cursor or Claude Code settings (same command: `npx -y figural-core mcp`).
3. In Claude Code, run `/figural-scope` (prompts live under `./prompts/`).

That writes your first scope decision to `.figural/log.json`. Next session, agents read `.specpack.json` and `.figural/log.json` before coding.

`npx figural-core init` also creates the two files above and prints the `CLAUDE.md` lines plus both MCP config blocks (you already used those in steps 1–2).

### What the first decision looks like

After you run `/figural-scope` once, your `.figural/log.json` will include a first entry like:

```json
{
  "id": 1,
  "timestamp": "2026-04-22T00:00:00.000Z",
  "decision": "V1 scope: ... (explicitly out of scope: ...)",
  "rationale": "Constraints: ... Success: ... Reconsider if: ...",
  "confidence": 0.7,
  "domain": "scope",
  "source": "human",
  "conflicts_with": [],
  "evidence_refs": []
}
```

## Slash commands

This package ships prompt templates in `./prompts/`:

- `/figural-scope`: ask five forcing questions and log a structured scope decision
- `/figural-decide`: log an explicit product/architecture decision at a fork
- `/figural-watch`: check recent work against the spec and warn on drift

### `./prompts/figural-scope.md`

Asks five forcing questions and logs a single structured scope decision (domain: `scope`).

Example usage (in Claude Code):

```text
/figural-scope
```

### `./prompts/figural-decide.md`

Captures a fork decision with tradeoffs, a forced choice, rationale, and confidence (domain is provided by the developer).

Example usage:

```text
/figural-decide
Decision: choose database
Domain: data model
Options: Postgres, SQLite
Constraints: must run locally, easy backups
```

### `./prompts/figural-watch.md`

Checks recent work against `out_of_scope`, `constraints`, and the core product decision. If drift is meaningful, it logs a drift event (domain: `drift`) with severity + recommended action.

Example usage:

```text
/figural-watch
```

## Passive drift watcher (optional)

You can also run a local watcher:

```bash
npx figural-core watch
```

If it can’t start on your system, use the manual `/figural-watch` prompt after significant work.

## Schemas

### `.figural/log.json`

- `schema_version` (string): currently `"1.0"`
- `decisions` (array): list of decision entries

Each decision entry:

- `id` (number): auto-incrementing integer
- `timestamp` (string): ISO-8601
- `decision` (string)
- `rationale` (string)
- `confidence` (number): 0..1
- `domain` (string): e.g. `"auth"`, `"data model"`, `"UX"`, `"infrastructure"`
- `source` (string): `"human"` | `"agent"` | `"extension"`
- `conflicts_with` (number[]): decision ids this entry contradicts
- `evidence_refs` (string[]): links or references

### `.specpack.json`

Fields:

- `schema_version` (string): e.g. `"1.0"`
- `product_name` (string)
- `decision` (string)
- `rationale` (string)
- `confidence` (number)
- `in_scope` (string[])
- `out_of_scope` (string[])
- `constraints` (string[])
- `edge_cases` (string[])
- `acceptance_tests` (string[])
- `evidence_refs` (string[])

**JSON Schema (for editors and validation):**

| File | Use when |
| --- | --- |
| [schemas/specpack.local.v1.schema.json](schemas/specpack.local.v1.schema.json) | You use `npx figural-core init` and edit `.specpack.json` locally (`in_scope`, `out_of_scope`, …). |
| [schemas/specpack.webapp.v1.schema.json](schemas/specpack.webapp.v1.schema.json) | Your spec comes from the **Figural web app** export (`scope_in`, `scope_out`, structured `tests`, `success`, …). |

The webapp format matches the richer shape (given/when/then tests, success metrics, structured edge cases and evidence). Local format uses simpler string arrays for the same ideas.

**Pasting a spec from the Figural web app:** You can replace `.specpack.json` with a JSON export from the Figural web app as-is. `figural_get_spec` returns that file verbatim to your agent. **`figural watch`** and other tooling normalize webapp fields internally (`scope_in` / `scope_out` map to the same roles as `in_scope` / `out_of_scope`). Your agent should treat `scope_out` and `out_of_scope` as the same concept when reading raw JSON via MCP.

## Contributing

- **Slack**: add your team Slack/Discord link here.

