import fs from "node:fs/promises";
import path from "node:path";
import { readSpecpack } from "../core/specpack.js";

export type DriftViolation = {
  field: "out_of_scope" | "constraints" | "decision";
  spec_item: string;
  evidence: string;
};

export type DriftCheckResult =
  | { drift: false; violations: []; severity: "low" }
  | { drift: true; violations: DriftViolation[]; severity: "low" | "medium" | "high"; recommended_action: string };

async function safeReadText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export async function runDriftCheck(opts: {
  repoRoot: string;
  changedPaths: string[];
}): Promise<DriftCheckResult> {
  const spec = await readSpecpack({ repoRoot: opts.repoRoot });

  const violations: DriftViolation[] = [];

  const changed = opts.changedPaths.map((p) => normalize(p));

  for (const item of spec.out_of_scope) {
    const needle = normalize(item);
    if (!needle) continue;

    if (changed.some((p) => p.includes(needle))) {
      violations.push({
        field: "out_of_scope",
        spec_item: item,
        evidence: `Changed path matched out_of_scope: ${item}`
      });
    }
  }

  // If deps changed, scan package.json for obvious forbidden keywords from out_of_scope/constraints.
  const pkgPath = path.join(opts.repoRoot, "package.json");
  if (changed.some((p) => p.endsWith("package.json") || p.endsWith("package-lock.json") || p.endsWith("pnpm-lock.yaml"))) {
    const pkgText = (await safeReadText(pkgPath)) ?? "";
    const hay = normalize(pkgText);
    for (const item of [...spec.out_of_scope, ...spec.constraints]) {
      const needle = normalize(item);
      if (!needle) continue;
      if (hay.includes(needle)) {
        violations.push({
          field: spec.out_of_scope.includes(item) ? "out_of_scope" : "constraints",
          spec_item: item,
          evidence: `package.json contains keyword: ${item}`
        });
      }
    }
  }

  if (violations.length === 0) return { drift: false, violations: [], severity: "low" };

  const severity: "low" | "medium" | "high" = violations.some((v) => v.field === "out_of_scope") ? "high" : "medium";

  return {
    drift: true,
    violations,
    severity,
    recommended_action: severity === "high" ? "revert" : "log_superseding_decision"
  };
}

