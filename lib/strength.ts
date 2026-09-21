import type { Entry, Exercise, Training } from './model.ts';
import { shiftDate } from './model.ts';
import { exerciseDefinition } from './exercises.ts';
import { exerciseKey, workingSets } from './progress.ts';

type Performance = { date: string; weight: number; reps: number };

// Show recorded sets, not an inferred maximum or a score with an arbitrary baseline.
export function exerciseProgress(records: Entry[], date: string) {
  const actions = new Map<
    string,
    { exercise: Exercise; days: Map<string, Performance> }
  >();
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
  for (const session of sessions)
    for (const exercise of (session.data as Training).exercises ?? []) {
      const definition = exerciseDefinition(exercise);
      const key = definition
        ? `${definition.id}:${exercise.load}`
        : exerciseKey(exercise);
      for (const set of workingSets(exercise)) {
        if (
          !Number.isFinite(set.weight) ||
          set.weight! < 0 ||
          (set.weight === 0 && exercise.load !== 'bodyweight') ||
          !Number.isInteger(set.reps) ||
          set.reps! < 1
        )
          continue;
        let action = actions.get(key);
        if (!action) {
          action = { exercise, days: new Map() };
          actions.set(key, action);
        }
        const previous = action.days.get(session.date);
        if (
          !previous ||
          set.weight! > previous.weight ||
          (set.weight === previous.weight && set.reps! > previous.reps)
        )
          action.days.set(session.date, {
            date: session.date,
            weight: set.weight!,
            reps: set.reps!,
          });
      }
    }
  return [...actions]
    .map(([key, action]) => {
      const history = [...action.days.values()];
      const first = history[0],
        last = history.at(-1)!;
      const bodyOnly =
        action.exercise.load === 'bodyweight' &&
        history.every((p) => p.weight === 0);
      const baseline = history.length === 1;
      const changeUnit =
        bodyOnly || (first.weight === last.weight && first.reps !== last.reps)
          ? '次'
          : 'kg';
      const comparable =
        bodyOnly || first.reps === last.reps || first.weight === last.weight;
      const change =
        baseline || !comparable
          ? null
          : changeUnit === '次'
            ? last.reps - first.reps
            : last.weight - first.weight;
      return {
        key,
        name: exerciseDefinition(action.exercise)?.name ?? action.exercise.name,
        load: action.exercise.load,
        first,
        last,
        history,
        bodyOnly,
        baseline,
        comparable,
        change,
        changeUnit,
        stale: last.date < shiftDate(date, -27),
      };
    })
    .sort(
      (a, b) =>
        b.last.date.localeCompare(a.last.date) || a.key.localeCompare(b.key),
    );
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
