import type { Entry, Exercise, Training } from './model.ts';
import { shiftDate } from './model.ts';
import { exerciseDefinition } from './exercises.ts';
import { exerciseKey, workingSets } from './progress.ts';

export const strengthGroups = ['胸', '背', '肩', '臀腿', '手臂', '核心'];
export function strengthGroup(exercise: Exercise): string {
  const group = exerciseDefinition(exercise)?.group ?? '其他';
  return group === '腿' || group === '臀' ? '臀腿' : group;
}

// Brzycki estimate, limited to 1–10 recorded reps and comparable external loads.
// This is a personal performance proxy: RIR, effort and form were not measured.
export function estimatedStrength(exercise: Exercise): number | null {
  const definition = exerciseDefinition(exercise);
  if (!definition || definition.bodyOnly || exercise.load === 'bodyweight')
    return null;
  const values = workingSets(exercise)
    .filter((s) => s.weight! > 0 && s.reps! >= 1 && s.reps! <= 10)
    .map((s) =>
      s.reps === 1 ? s.weight! : s.weight! / (1.0278 - 0.0278 * s.reps!),
    );
  return values.length ? Math.max(...values) : null;
}
export function strengthOverview(records: Entry[], date: string) {
  const sessions = records
    .filter(
      (r) =>
        r.kind === 'training' &&
        r.date <= date &&
        (r.data as Training).status === 'completed',
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  return strengthGroups.map((group) => {
    const qualifying = sessions.flatMap((entry) =>
      ((entry.data as Training).exercises ?? []).flatMap((exercise) => {
        if (strengthGroup(exercise) !== group) return [];
        const estimate = estimatedStrength(exercise);
        return estimate === null
          ? []
          : [{ date: entry.date, exercise, estimate }];
      }),
    );
    // Keep the earliest eligible exercise as the reference; adding exercises cannot add points.
    const reference = qualifying[0]?.exercise ?? null;
    const daily = new Map<string, number>();
    for (const item of qualifying)
      if (reference && exerciseKey(item.exercise) === exerciseKey(reference))
        daily.set(
          item.date,
          Math.max(daily.get(item.date) ?? 0, item.estimate),
        );
    const history = [...daily].map(([date, estimate]) => ({ date, estimate }));
    const first = history[0],
      last = history.at(-1);
    const stale = !!last && last.date < shiftDate(date, -28);
    const score =
      first && last ? Math.round((last.estimate / first.estimate) * 100) : null;
    return {
      group,
      reference,
      history,
      first,
      last,
      score: stale ? null : score,
      previousScore: score,
      stale,
      baseline: history.length === 1,
    };
  });
}

export function strengthGrowth(parts: ReturnType<typeof strengthOverview>) {
  const progress = parts.reduce((sum, part) => {
    if (!part.first) return sum;
    const best = Math.max(...part.history.map((point) => point.estimate));
    return sum + Math.max(0, (best / part.first.estimate - 1) * 100);
  }, 0);
  const points = Math.floor(progress + 1e-7);
  const level = Math.min(20, 1 + Math.floor(points / 10));
  return {
    points,
    level,
    next: level === 20 ? 0 : level * 10 - points,
    fraction: level === 20 ? 1 : (points % 10) / 10,
    baselines: parts.filter((part) => part.first).length,
  };
}

export function trainingDayLabel(rows: Entry[], planned: string): string {
  const actual = new Set(
    rows.flatMap((row) => {
      const data = row.data as Training;
      if (row.kind !== 'training') return [];
      if (data.status === 'rest' || data.type === 'rest') return ['休息恢复'];
      if (data.status === 'missed') return ['已记未完成'];
      return [data.type === 'resistance' ? '抗阻训练' : '有氧训练'];
    }),
  );
  return actual.size ? [...actual].join(' · ') : `计划 · ${planned}`;
}
