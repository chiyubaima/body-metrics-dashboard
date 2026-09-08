import { shiftDate, weekDates } from './model.ts';
import type { Entry, Diet, Training } from './model.ts';
export function monthDates(date: string) {
  const first = date.slice(0, 7) + '-01';
  const start = weekDates(first)[0];
  const next = new Date(first + 'T12:00:00Z');
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = shiftDate(next.toISOString().slice(0, 10), -1);
  const end = weekDates(last)[6];
  return Array.from(
    {
      length: Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1,
    },
    (_, i) => shiftDate(start, i),
  );
}
export function dayMarks(records: Entry[], date: string) {
  const rows = records.filter((r) => r.date === date);
  const diet = rows.find((r) => r.kind === 'diet')?.data as Diet | undefined;
  const training = rows
    .filter((r) => r.kind === 'training')
    .map((r) => r.data as Training);
  return {
    body: rows.some((r) => r.kind === 'body'),
    diet: diet ? (diet.complete ? 'complete' : 'partial') : '',
    training: training.some((t) => t.status === 'completed')
      ? 'complete'
      : training.some((t) => t.status === 'rest')
        ? 'rest'
        : training.length
          ? 'missed'
          : '',
  };
}
