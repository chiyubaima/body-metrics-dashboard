import type { CoachToolRun } from './coach-tool-types.ts';
import { InputError, validDate, validId, today } from './model.ts';

export type MemoryCategory = 'preference' | 'goal' | 'constraint';
export type CommitmentKind =
  | 'checkin'
  | 'body'
  | 'diet'
  | 'resistance'
  | 'cardio';
export const commitmentLabels: Record<CommitmentKind, string> = {
  checkin: '聊聊近况',
  body: '身体记录',
  diet: '完成饮食日记',
  resistance: '抗阻训练',
  cardio: '有氧训练',
};
export const memoryLabels: Record<MemoryCategory, string> = {
  preference: '偏好',
  goal: '目标',
  constraint: '日常安排',
};
export type CoachMemory = {
  id: string;
  content: string;
  category: MemoryCategory;
  source: string;
  status?: 'active' | 'expired' | 'forgotten';
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Commitment = {
  id: string;
  title: string;
  kind: CommitmentKind;
  dueAt: string;
  status: 'pending' | 'completed' | 'cancelled' | 'expired';
  expiresAt?: string | null;
  completion: 'manual' | 'record' | null;
  evidenceId: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Evidence = {
  id: string;
  date: string;
  label: string;
  detail: string;
  url?: string;
};
export type CoachProposal = {
  id: string;
  type: 'memory' | 'commitment';
  text: string;
  category: MemoryCategory | CommitmentKind;
  dueAt: string | null;
  quote: string;
  expiresAt?: string | null;
  status?: 'pending' | 'accepted' | 'dismissed' | 'deleted';
};
export type CoachTurn = {
  id: string;
  kind: 'chat' | 'opening';
  dayKey?: string | null;
  date: string;
  userText: string;
  reply: string | null;
  status: 'pending' | 'complete' | 'failed';
  proposals: CoachProposal[];
  evidence: Evidence[];
  toolRuns?: CoachToolRun[];
  createdAt: string;
  updatedAt: string;
};
export type CoachSettings = {
  enabled: boolean;
  consentConfig: string;
  tone: 'direct' | 'gentle';
  quietUntil: string | null;
};
export const defaultCoachSettings: CoachSettings = {
  enabled: false,
  consentConfig: '',
  tone: 'direct',
  quietUntil: null,
};
export type CoachConnection = {
  configured: boolean;
  destination: string;
  model: string;
  fingerprint: string;
};
export type CoachState = {
  settings: CoachSettings;
  connection: CoachConnection;
  active: boolean;
  memories: CoachMemory[];
  commitments: Commitment[];
  turns: CoachTurn[];
  now: string;
  hasOlder: boolean;
  opening: CoachTurn | null;
};

export function coachObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('内容格式有误，请重新打开教练。');
  return value as Record<string, unknown>;
}
export function coachText(value: unknown, max: number, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new InputError(`${label}请填写1～${max}字。`);
  return value.trim();
}
export function coachChoice<T extends string>(value: unknown, choices: T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T))
    throw new InputError('选项有误，请重新选择。');
  return value as T;
}
export function coachTime(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|\+08:00)$/.test(value)
  )
    throw new InputError('请填写明确的北京时间。');
  validDate(value.slice(0, 10));
  const time = new Date(value);
  if (
    !Number.isFinite(time.getTime()) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59
  )
    throw new InputError('提醒时间不存在。');
  return time.toISOString();
}
export function coachExpiry(value: unknown, now = new Date()) {
  if (value === undefined || value === null || value === '') return null;
  const expiresAt = coachTime(value);
  if (expiresAt <= now.toISOString())
    throw new InputError('有效期已过，请选择未来的失效时间。');
  return expiresAt;
}
export function memoryActive(item: CoachMemory, now = new Date()) {
  return (
    (!item.status || item.status === 'active') &&
    (!item.expiresAt || item.expiresAt > now.toISOString())
  );
}
export function commitmentExpiry(
  item: Pick<Commitment, 'dueAt' | 'expiresAt'>,
) {
  return item.expiresAt ?? nextShanghaiDay(new Date(item.dueAt));
}
export function commitmentPending(item: Commitment, now = new Date()) {
  return (
    item.status === 'pending' && commitmentExpiry(item) > now.toISOString()
  );
}
export function validateMemory(value: unknown, now = new Date()) {
  const v = coachObject(value);
  return {
    id: validId(v.id),
    content: coachText(v.content, 300, '记忆'),
    category: coachChoice(v.category, ['preference', 'goal', 'constraint']),
    expiresAt: coachExpiry(v.expiresAt, now),
  };
}
export function validateCommitment(value: unknown, now = new Date()) {
  const v = coachObject(value),
    dueAt = coachTime(v.dueAt);
  if (new Date(dueAt).getTime() < now.getTime() - 60_000)
    throw new InputError('这个时间已过，请重新选择提醒时间。');
  if (new Date(dueAt).getTime() > now.getTime() + 366 * 86_400_000)
    throw new InputError('请选择一年内的提醒时间。');
  const expiresAt =
    coachExpiry(v.expiresAt, now) ?? nextShanghaiDay(new Date(dueAt));
  if (expiresAt <= dueAt) throw new InputError('失效时间必须晚于提醒时间。');
  return {
    id: validId(v.id),
    title: coachText(v.title, 160, '约定'),
    dueAt,
    expiresAt,
    kind: coachChoice(v.kind, [
      'checkin',
      'body',
      'diet',
      'resistance',
      'cardio',
    ]),
  };
}
export function validateCoachRequest(value: unknown, now = new Date()) {
  const v = coachObject(value),
    kind = coachChoice(v.kind, ['chat', 'opening']);
  const date = kind === 'opening' ? today(now) : validDate(v.date);
  if (date > today(now)) throw new InputError('请先选择今天或过去的日期。');
  return {
    id: validId(v.id),
    kind,
    date,
    userText: kind === 'opening' ? '' : coachText(v.message, 3000, '消息'),
  };
}
export const coachOpeningHours = [10, 14, 18, 22] as const;
export function coachOpeningKey(now = new Date()) {
  const hour = Number(localDateTime(now.toISOString()).slice(11, 13));
  const slot = coachOpeningHours.findLast((value) => value <= hour);
  return slot === undefined ? null : `${today(now)}T${slot}:00+08:00`;
}
export function quietNow(settings: CoachSettings, now = new Date()) {
  return settings.quietUntil !== null && new Date(settings.quietUntil) > now;
}
export function nextShanghaiDay(now = new Date()) {
  return new Date(
    new Date(today(now) + 'T00:00:00+08:00').getTime() + 86_400_000,
  ).toISOString();
}
export function dueCommitments(
  items: Commitment[],
  settings: CoachSettings,
  now = new Date(),
) {
  if (quietNow(settings, now)) return [];
  return items.filter(
    (c) =>
      commitmentPending(c, now) &&
      c.dueAt <= now.toISOString() &&
      !c.notifiedAt,
  );
}
export function shanghaiDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
export function localDateTime(value: string) {
  return new Date(new Date(value).getTime() + 8 * 3_600_000)
    .toISOString()
    .slice(0, 16);
}
