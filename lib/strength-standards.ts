import catalog from '../data/strength-standards.json' with { type: 'json' };

export const strengthPatterns = [
  { id: 'push', name: '上肢推' },
  { id: 'pull', name: '上肢拉' },
  { id: 'squat', name: '下肢蹲' },
  { id: 'hinge', name: '髋部伸展' },
] as const;
export type StrengthPattern = (typeof strengthPatterns)[number]['id'];
export type StrengthSettings = {
  enabled: boolean;
  references: Partial<Record<StrengthPattern, string>>;
};
type Standard = {
  id: string;
  pattern: string | null;
  load: string;
  source: string;
  tables: Record<string, Record<string, number[][]>>;
};
export const strengthStandards = catalog.exercises as Standard[];
export const strengthStandardVersion = catalog.version;
export const standardFor = (id?: string) =>
  strengthStandards.find((s) => s.id === id);

function bracket(values: number[], value: number) {
  if (!Number.isFinite(value) || value < values[0] || value > values.at(-1)!)
    return null;
  const upper = values.findIndex((v) => v >= value);
  return [Math.max(0, upper - 1), upper];
}
function blend(a: number[], b: number[], fraction: number) {
  return a.map((v, i) => v + (b[i] - v) * fraction);
}

// Interpolate the source's JOINT tables, never multiply separate age/weight tables.
export function strengthThresholds(
  id: string,
  sex: string,
  age: number,
  bodyweight: number,
) {
  const tables = standardFor(id)?.tables[sex];
  if (!tables) return null;
  const ages = Object.keys(tables)
    .map(Number)
    .sort((a, b) => a - b);
  const agePair = bracket(ages, age);
  if (!agePair) return null;
  const interpolateWeight = (a: number) => {
    const rows = tables[a];
    const pair = bracket(
      rows.map((r) => r[0]),
      bodyweight,
    );
    if (!pair) return null;
    const [low, high] = pair.map((index) => rows[index]);
    return blend(
      low.slice(1),
      high.slice(1),
      low[0] === high[0] ? 0 : (bodyweight - low[0]) / (high[0] - low[0]),
    );
  };
  const [lowAge, highAge] = agePair.map((index) => ages[index]);
  const low = interpolateWeight(lowAge),
    high = interpolateWeight(highAge);
  return low && high
    ? blend(
        low,
        high,
        lowAge === highAge ? 0 : (age - lowAge) / (highAge - lowAge),
      )
    : null;
}

export function strengthLevel(value: number, thresholds: number[]) {
  const weights = [0, ...thresholds],
    levels = [1, 5, 10, 15, 20];
  if (value >= weights[4]) return 20;
  const upper = weights.findIndex((w) => w > value);
  if (upper < 1) return 1;
  const fraction =
    (value - weights[upper - 1]) / (weights[upper] - weights[upper - 1]);
  return Math.max(
    1,
    levels[upper - 1] + fraction * (levels[upper] - levels[upper - 1]),
  );
}
