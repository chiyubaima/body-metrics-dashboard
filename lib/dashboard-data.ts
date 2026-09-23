import { morningIndex, shiftDate, weekDates } from './model.ts';
import type { Body, Entry, Kind, Snapshot, Training } from './model.ts';
import { exerciseProgress } from './strength.ts';
import { strengthRating } from './strength-rating.ts';
import { medalView } from './medals.ts';
import type { MedalProgress, MedalView } from './medals.ts';
import type { dayMarks } from './calendar.ts';

export type HistoryQuery = {
  kind: Kind;
  from: string;
  to: string;
  condition: string;
  page: number;
};
export type HistoryPage = {
  records: Entry[];
  total: number;
  page: number;
  pageSize: number;
  averages: Record<
    string,
    ReturnType<ReturnType<typeof morningIndex>['averageAt']>
  >;
};
export type CalendarMarks = Record<string, ReturnType<typeof dayMarks>>;
export type DashboardOverview = {
  date: string;
  recordCount: number;
  dietDays: number;
  waist: Entry | null;
  fat: Entry | null;
  latestTraining: Entry | null;
  progress: (ReturnType<typeof exerciseProgress>[number] & { days: number })[];
  rating: ReturnType<typeof strengthRating>;
  medalPreviews: Record<string, MedalView>;
};

function compactProgress(p: MedalProgress): MedalProgress {
  return { ...p, evidence: [] };
}
function compactMedal(m: MedalView): MedalView {
  return {
    ...m,
    events: [],
    progress: compactProgress(m.progress),
    past: m.past.map(compactProgress),
  };
}

// Complete history stays on the server. Only chart points and the selected week
// travel with the home page; lifetime baselines are calculated before slicing.
export function dashboardData(data: Snapshot, date: string): Snapshot {
  const rows = data.records.filter((r) => r.date <= date);
  const week = weekDates(date);
  const from = shiftDate(date, -95);
  const overview: DashboardOverview = {
    date,
    recordCount: data.records.length,
    dietDays: new Set(rows.filter((r) => r.kind === 'diet').map((r) => r.date))
      .size,
    waist:
      rows.find((r) => r.kind === 'body' && (r.data as Body).waist !== null) ??
      null,
    fat:
      rows.find(
        (r) => r.kind === 'body' && (r.data as Body).bodyFat !== null,
      ) ?? null,
    latestTraining:
      rows.find(
        (r) =>
          r.kind === 'training' &&
          (r.data as Training).status === 'completed' &&
          (r.data as Training).type !== 'rest',
      ) ?? null,
    progress: exerciseProgress(data.records, date).map((p) => ({
      ...p,
      days: p.history.length,
      history: p.history.slice(-12),
    })),
    rating: strengthRating(data.records, data.profile, date),
    medalPreviews: Object.fromEntries(
      (data.medals ?? [])
        .filter((m) => m.proposal)
        .map((m) => [
          m.id,
          compactMedal(
            medalView(
              { ...m, definition: m.proposal!, versions: [] },
              data.records,
              undefined,
              data.medalFacts,
            ),
          ),
        ]),
    ),
  };
  return {
    records: data.records.filter(
      (r) =>
        r.date <= week[6] && r.date >= (r.kind === 'body' ? from : week[0]),
    ),
    plans: data.plans,
    profile: data.profile,
    dishes: data.dishes,
    medals: data.medals?.map(compactMedal),
    overview,
  };
}
