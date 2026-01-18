import type { violation } from "@planforge/plugin-sdk";

export type refine_explanation = {
  group: "utilities" | "constraints" | "ergonomics" | "rules";
  title: string;
  detail?: string;
};

export function summarize_violations(list: violation[]): Array<{ code: string; severity: string; count: number }> {
  const map = new Map<string, { code: string; severity: string; count: number }>();
  for (const v of list) {
    const key = `${v.code}:${v.severity}`;
    const entry = map.get(key) ?? { code: v.code, severity: v.severity, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  }
  return Array.from(map.values());
}

export function build_explanations(command: string): refine_explanation[] {
  const explanations: refine_explanation[] = [];
  if (/sink/i.test(command) || /мойк/i.test(command)) {
    explanations.push({
      group: "utilities",
      title: "Sink prioritized near water/window",
      detail: "Placed sink to align with nearby utility or opening."
    });
  }
  if (/hob/i.test(command) || /варочн/i.test(command)) {
    explanations.push({
      group: "utilities",
      title: "Hob moved toward ventilation",
      detail: "Placed hob closer to vent utility where possible."
    });
  }
  if (/passage/i.test(command) || /проход/i.test(command)) {
    explanations.push({
      group: "constraints",
      title: "Increased passage clearance",
      detail: "Shifted base objects away from wall to widen passage."
    });
  }
  if (/upper/i.test(command) || /верхн/i.test(command)) {
    explanations.push({
      group: "ergonomics",
      title: "Upper cabinets removed",
      detail: "Removed upper cabinets to keep the space open."
    });
  }
  if (explanations.length === 0) {
    explanations.push({
      group: "rules",
      title: "Applied requested change",
      detail: "Change applied deterministically by planner rules."
    });
  }
  return explanations;
}
