import type { Body, Entry, Exercise, Profile, Training } from './model.ts';
import { average, morningEntries, shiftDate, today } from './model.ts';
import { workingSets } from './progress.ts';
import { exerciseDefinition } from './exercises.ts';
import {
  standardFor,
  strengthLevel,
  strengthPatterns,
  strengthThresholds,
  strengthStandardVersion,
} from './strength-standards.ts';

export function ratingEstimate(exercise: Exercise) {
  const definition = exerciseDefinition(exercise);
  const standard = standardFor(definition?.id);
  if (!standard || standard.load !== exercise.load) return null;
  const values = workingSets(exercise)
    .filter(
      (s) =>
        Number.isFinite(s.weight) &&
        s.weight! > 0 &&
        Number.isInteger(s.reps) &&
        s.reps! >= 1 &&
        s.reps! <= 15,
    )
    .map((s) => {
      const weight = s.weight!,
        reps = s.reps!;
      if (reps === 1) return weight;
      const brzycki = weight / (1.0278 - 0.0278 * reps);
      const epley = weight * (1 + reps / 30);
      return reps < 8
        ? brzycki
        : reps > 10
          ? epley
          : brzycki + (epley - brzycki) * ((reps - 8) / 2);
    });
  return values.length ? Math.max(...values) : null;
}

export function ratingBodyweight(records: Entry[], date: string) {
  const mean = average(records, date);
  if (mean.value !== null)
    return { value: mean.value, date, basis: '7天晨重均值' };
  const last = morningEntries(records, date)
    .filter((r) => r.date >= shiftDate(date, -27))
    .at(-1);
  return last
    ? { value: (last.data as Body).weight!, date: last.date, basis: '最近晨重' }
    : null;
}

export function strengthRating(
  records: Entry[],
  profile: Profile | null | undefined,
  date: string,
) {
  const settings = profile?.strength;
  const enabled = settings?.enabled !== false;
  const profileIssue = !enabled
    ? '已关闭群体对标'
    : !profile || !['male', 'female'].includes(profile.sex)
      ? '请补充参照性别'
      : profile.age === null
        ? '请补充年龄'
        : null;
  const sessions = records
    .filter(
      (r) =>
        r.kind === 'training' &&
        r.date <= date &&
        (r.data as Training).type === 'resistance' &&
        (r.data as Training).status === 'completed',
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const ids = [
    ...new Set(
      sessions
        .flatMap((r) => (r.data as Training).exercises ?? [])
        .map((e) => exerciseDefinition(e)?.id)
        .filter((id): id is string => !!standardFor(id)),
    ),
  ];
  const exercises = ids.map((id) => {
    const standard = standardFor(id)!;
    const daily = new Map<
      string,
      {
        date: string;
        estimate: number | null;
        value: number | null;
        reason: string | null;
        bodyweight: ReturnType<typeof ratingBodyweight>;
        age: number | null;
        measured: boolean;
      }
    >();
    for (const session of sessions) {
      const matches =
        (session.data as Training).exercises?.filter(
          (e) => exerciseDefinition(e)?.id === id,
        ) ?? [];
      if (!matches.length) continue;
      const estimates = matches
        .map(ratingEstimate)
        .filter((n): n is number => n !== null);
      const estimate = estimates.length ? Math.max(...estimates) : null;
      const bodyweight = ratingBodyweight(records, session.date);
      const age =
        profile?.age == null
          ? null
          : profile.age +
            (Date.parse(session.date) -
              Date.parse(profile.ageAsOf ?? today())) /
              (365.25 * 86400000);
      const thresholds =
        bodyweight && age !== null
          ? strengthThresholds(id, profile?.sex ?? '', age, bodyweight.value)
          : null;
      const reason =
        profileIssue ??
        (estimate === null
          ? '需要1～15次有效正式组'
          : !bodyweight
            ? '缺少训练时的近期晨重'
            : !thresholds
              ? '年龄或体重超出参考范围'
              : null);
      const point = {
        date: session.date,
        estimate,
        value: reason === null ? strengthLevel(estimate!, thresholds!) : null,
        reason,
        bodyweight,
        age,
        measured: matches.some((e) =>
          workingSets(e).some((s) => s.reps === 1 && s.weight === estimate),
        ),
      };
      const previous = daily.get(session.date);
      if (
        !previous ||
        (point.value !== null &&
          (previous.value === null || point.value > previous.value)) ||
        (point.value === null &&
          previous.value === null &&
          (point.estimate ?? 0) > (previous.estimate ?? 0))
      )
        daily.set(session.date, point);
    }
    const history = [...daily.values()];
    const last = history.at(-1)!;
    const recent = history.filter((p) => p.date >= shiftDate(date, -27));
    const pair = recent.slice(-2);
    const stale = last.date < shiftDate(date, -27);
    const reason =
      last.reason ??
      (stale
        ? '近期记录待更新'
        : pair.some((p) => p.value === null)
          ? '最近记录缺少可比条件'
          : null);
    const provisional = pair.length < 2;
    const value =
      reason === null ? Math.min(...pair.map((p) => p.value!)) : null;
    return {
      id,
      name: exerciseDefinition({
        catalogId: id,
        name: '',
        load: standard.load as Exercise['load'],
      })!.name,
      pattern: standard.pattern,
      source: standard.source,
      firstDate: (history.find((p) => p.estimate !== null) ?? history[0]).date,
      dates: history.filter((p) => p.estimate !== null).length,
      last,
      value,
      level: value === null ? null : Math.min(20, Math.floor(value + 1e-9)),
      provisional,
      reason,
      stale,
    };
  });
  const patterns = strengthPatterns.map((pattern) => {
    const options = exercises
      .filter((e) => e.pattern === pattern.id)
      .sort(
        (a, b) =>
          a.firstDate.localeCompare(b.firstDate) ||
          ids.indexOf(a.id) - ids.indexOf(b.id),
      );
    const override = settings?.references?.[pattern.id];
    const excluded = override === 'none';
    const exercise = excluded
      ? null
      : override
        ? (options.find((e) => e.id === override) ?? null)
        : (options.find((e) => e.dates >= 2) ?? options[0] ?? null);
    const reason = excluded
      ? '此类不参与对标'
      : !exercise
        ? override
          ? '所选动作尚无记录'
          : '暂无适用动作记录'
        : exercise.reason;
    const ready =
      !!exercise && !reason && !exercise.provisional && exercise.level !== null;
    return { ...pattern, exercise, reason, ready, excluded };
  });
  const coverage = patterns.filter((p) => p.ready).length;
  const value =
    enabled && coverage === 4
      ? patterns.reduce((sum, p) => sum + p.exercise!.level!, 0) / 4
      : null;
  const level = value === null ? null : Math.min(20, Math.floor(value + 1e-9));
  return {
    enabled,
    profileIssue,
    version: strengthStandardVersion,
    exercises,
    patterns,
    coverage,
    value,
    level,
    fraction: value === null ? 0 : level === 20 ? 1 : value - level!,
  };
}
