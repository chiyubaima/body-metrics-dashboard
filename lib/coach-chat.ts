import type { CoachTurn } from './coach.ts';
import { shiftDate, today } from './model.ts';

export function coachEntryPreview(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(
    new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(compact),
    (part) => part.segment,
  );
  return characters.length <= 60
    ? compact
    : characters.slice(0, 59).join('').trimEnd() + '…';
}

// Server-completed replies win even when a client clock is ahead.
export function mergeCoachTurns(history: CoachTurn[], local: CoachTurn[]) {
  const turns = new Map(history.map((turn) => [turn.id, turn]));
  for (const turn of local) {
    const saved = turns.get(turn.id);
    if (
      !saved ||
      (saved.status !== 'complete' &&
        (turn.reply || turn.updatedAt >= saved.updatedAt))
    )
      turns.set(turn.id, turn);
  }
  return [...turns.values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function captainActivity(
  now: string,
  awaiting: boolean,
  quiet: boolean,
) {
  if (awaiting) return 'thinking' as const;
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(now)),
  );
  if (quiet || hour >= 22 || hour < 7) return 'rest' as const;
  if (
    (hour >= 7 && hour < 9) ||
    (hour >= 11 && hour < 14) ||
    (hour >= 18 && hour < 20)
  )
    return 'eating' as const;
  if (hour >= 16 && hour < 18) return 'fitness' as const;
  return 'idle' as const;
}

export function showCoachTimestamp(turn: CoachTurn, previous?: CoachTurn) {
  return (
    !previous ||
    today(new Date(turn.createdAt)) !== today(new Date(previous.createdAt)) ||
    new Date(turn.createdAt).getTime() -
      new Date(previous.createdAt).getTime() >=
      5 * 60_000
  );
}

export function coachTimestamp(value: string, now = new Date()) {
  const stamp = new Date(value),
    day = today(stamp),
    current = today(now),
    clock = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(stamp);
  const label =
    day === current
      ? '今天'
      : day === shiftDate(current, -1)
        ? '昨天'
        : new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            ...(day.slice(0, 4) !== current.slice(0, 4)
              ? { year: 'numeric' }
              : {}),
            month: 'long',
            day: 'numeric',
          }).format(stamp);
  return `${label} ${clock}`;
}

export function shouldSendCoachMessage(event: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  mobile: boolean;
}) {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    !event.mobile
  );
}
