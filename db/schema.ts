import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const records = sqliteTable(
  'records',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    kind: text('kind').notNull(),
    date: text('date').notNull(),
    payload: text('payload').notNull(),
    primaryMorning: integer('primary_morning').notNull().default(0),
    planId: text('plan_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('idx_records_owner_date').on(t.owner, t.date),
    uniqueIndex('idx_one_morning_per_day')
      .on(t.owner, t.date)
      .where(sql`kind='body' AND primary_morning=1 AND deleted_at IS NULL`),
    uniqueIndex('idx_one_diet_per_day')
      .on(t.owner, t.date)
      .where(sql`kind='diet' AND deleted_at IS NULL`),
  ],
);
export const plans = sqliteTable(
  'plans',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    kind: text('kind').notNull(),
    date: text('date').notNull(),
    payload: text('payload').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_plans_owner_kind_date').on(t.owner, t.kind, t.date)],
);
export const profiles = sqliteTable('profiles', {
  owner: text('owner').primaryKey(),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const annotations = sqliteTable(
  'annotations',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    message: text('message').notNull(),
    target: text('target').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_annotations_owner_created').on(t.owner, t.createdAt)],
);

export const coachSettings = sqliteTable('coach_settings', {
  owner: text('owner').primaryKey(),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const coachMemories = sqliteTable(
  'coach_memories',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    content: text('content').notNull(),
    category: text('category').notNull(),
    source: text('source').notNull(),
    status: text('status').notNull().default('active'),
    expiresAt: text('expires_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_coach_memories_owner').on(t.owner)],
);
export const coachCommitments = sqliteTable(
  'coach_commitments',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    title: text('title').notNull(),
    kind: text('kind').notNull(),
    dueAt: text('due_at').notNull(),
    expiresAt: text('expires_at'),
    status: text('status').notNull().default('pending'),
    completion: text('completion'),
    evidenceId: text('evidence_id'),
    notifiedAt: text('notified_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_coach_commitments_owner_due').on(t.owner, t.dueAt)],
);
export const coachTurns = sqliteTable(
  'coach_turns',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    kind: text('kind').notNull(),
    date: text('date').notNull(),
    dayKey: text('day_key'),
    userText: text('user_text').notNull(),
    reply: text('reply'),
    status: text('status').notNull().default('pending'),
    proposals: text('proposals').notNull().default('[]'),
    evidence: text('evidence').notNull().default('[]'),
    toolRuns: text('tool_runs').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('idx_coach_turns_owner_created').on(t.owner, t.createdAt, t.id),
    uniqueIndex('idx_coach_daily_opening').on(t.owner, t.dayKey),
    uniqueIndex('idx_coach_one_pending')
      .on(t.owner)
      .where(sql`status='pending'`),
  ],
);
