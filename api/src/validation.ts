export type DescriptionValidation = {
  ok: boolean;
  missing: string[];
};

// Simple heuristic validator: require labeled lines/patterns.
// Required keys: Duration, Targets, Intervals, Notes, TSS, kcal
export function validateWorkoutDescription(description: string): DescriptionValidation {
  const text = description || '';
  const checks: Array<[string, RegExp]> = [
    ['duration', /(duration\s*:\s*\d+\s*(min|minutes|m))/i],
    ['targets', /(targets\s*:\s*.+)/i],
    ['intervals', /(intervals\s*:\s*.+)/i],
    ['notes', /(notes\s*:\s*.+)/i],
    ['tss', /(tss\s*:\s*\d+)/i],
    ['kcal', /(kcal\s*:\s*\d+)/i]
  ];
  const missing: string[] = [];
  for (const [key, re] of checks) {
    if (!re.test(text)) missing.push(key);
  }
  return { ok: missing.length === 0, missing };
}


