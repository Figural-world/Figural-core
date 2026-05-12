import { z } from "zod";
import { readJsonFile } from "./files.js";

export type DecisionSource = "human" | "agent" | "extension";

export type DecisionEntry = {
  id: number;
  timestamp: string;
  decision: string;
  rationale: string;
  confidence: number;
  domain: string;
  source: DecisionSource;
  conflicts_with: number[];
  evidence_refs: string[];
};

export type FiguralLog = {
  schema_version: string;
  decisions: DecisionEntry[];
};

export const LogDecisionInputSchema = z.object({
  decision: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  domain: z.string().min(1),
  source: z.enum(["human", "agent", "extension"]).optional(),
  evidence_refs: z.array(z.string()).optional(),
  context: z.any().optional()
});

function isoNow(): string {
  return new Date().toISOString();
}

function nextId(decisions: DecisionEntry[]): number {
  let max = 0;
  for (const d of decisions) max = Math.max(max, d.id);
  return max + 1;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function isObviousNegationPair(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);

  const negations = ["do not ", "don't ", "not ", "no "];

  for (const neg of negations) {
    if (na.startsWith(neg) && na.slice(neg.length) === nb) return true;
    if (nb.startsWith(neg) && nb.slice(neg.length) === na) return true;
  }

  if (na.startsWith("use ") && nb.startsWith("do not use ") && nb.slice("do not ".length) === na) return true;
  if (nb.startsWith("use ") && na.startsWith("do not use ") && na.slice("do not ".length) === nb) return true;

  return false;
}

export async function appendDecision(opts: {
  logPath: string;
  input: unknown;
}): Promise<{ entry: DecisionEntry; updatedLog: FiguralLog }> {
  const parsed = LogDecisionInputSchema.parse(opts.input);

  let log: FiguralLog;
  try {
    log = await readJsonFile<FiguralLog>(opts.logPath);
  } catch (error) {
    const isMissingFile =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";

    if (isMissingFile) {
      log = { schema_version: "1.0", decisions: [] };
    } else {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse decision log at ${opts.logPath}. Refusing to overwrite existing history. ` +
          `Repair or remove the invalid file, then retry. Underlying error: ${message}`
      );
    }
  }

  const id = nextId(log.decisions);
  const entry: DecisionEntry = {
    id,
    timestamp: isoNow(),
    decision: parsed.decision,
    rationale: parsed.rationale,
    confidence: parsed.confidence,
    domain: parsed.domain,
    source: parsed.source ?? "human",
    conflicts_with: [],
    evidence_refs: parsed.evidence_refs ?? []
  };

  const updatedDecisions = [...log.decisions];

  const explicitIds: number[] =
    parsed.context && typeof parsed.context === "object" && parsed.context
      ? (parsed.context as any).contradicts_decision_ids ?? []
      : [];

  const explicitSet = new Set<number>(
    Array.isArray(explicitIds) ? explicitIds.filter((n) => Number.isInteger(n)) : []
  );

  for (const prior of updatedDecisions) {
    if (prior.domain !== entry.domain) continue;

    const conflicted = explicitSet.has(prior.id) || isObviousNegationPair(entry.decision, prior.decision);
    if (!conflicted) continue;

    entry.conflicts_with.push(prior.id);
    if (!prior.conflicts_with.includes(entry.id)) prior.conflicts_with.push(entry.id);
  }

  updatedDecisions.push(entry);

  return {
    entry,
    updatedLog: { ...log, decisions: updatedDecisions }
  };
}

