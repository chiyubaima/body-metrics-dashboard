'use client';
import { useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CircleAlert,
  Check,
  FilePenLine,
} from 'lucide-react';
import type { CoachToolRun, CoachToolAction } from '@/lib/coach-tool-types';
import type { Body, Diet, Entry, Training, MealSlot } from '../lib/model.ts';
import { previewDietMeals } from '../lib/coach-tool-types.ts';
import {
  basisLabels,
  mealLabels,
  loadLabels,
  cardioEntries,
} from '../lib/progress.ts';
import { cardioTypes, exerciseDefinition } from '../lib/exercises.ts';

function RecordPreview({ entry, meals }: { entry: Entry; meals?: MealSlot[] }) {
  if (entry.kind === 'body') {
    const body = entry.data as Body;
    return (
      <>
        <dl className="coach-record-metrics">
          {body.weight !== null && (
            <div>
              <dt>体重</dt>
              <dd>
                {body.weight}
                <span> kg</span>
              </dd>
            </div>
          )}
          {body.waist !== null && (
            <div>
              <dt>腰围</dt>
              <dd>
                {body.waist}
                <span> cm</span>
              </dd>
            </div>
          )}
          {body.bodyFat !== null && (
            <div>
              <dt>体脂率</dt>
              <dd>
                {body.bodyFat}
                <span> %</span>
              </dd>
            </div>
          )}
        </dl>
        <p className="coach-record-meta">
          {body.condition === 'morning' ? '晨起空腹' : '其他时间'}
          {body.primary ? ' · 选为当天晨重' : ''}
          {body.estimated ? ' · 估计值' : ''}
        </p>
        {body.note && <p className="coach-record-note">{body.note}</p>}
      </>
    );
  }
  if (entry.kind === 'diet') {
    const diet = entry.data as Diet;
    const visibleFoods = meals
      ? diet.foods.filter((f) => meals.includes(f.meal ?? 'unsorted'))
      : diet.foods;
    return (
      <>
        <p className="coach-record-meta">
          {meals ? '本次记录' : '全天餐盘'} · {visibleFoods.length} 项
          {diet.complete ? ' · 全天已记完' : ' · 部分记录'}
        </p>
        {Object.entries(mealLabels).map(([meal, label]) => {
          if (meals && !meals.includes(meal as MealSlot)) return null;
          const foods = diet.foods.filter(
            (f) => (f.meal ?? 'unsorted') === meal,
          );
          if (!foods.length)
            return meals ? (
              <p className="coach-record-meta" key={meal}>
                {label} · 将清空本餐食物
              </p>
            ) : null;
          return (
            <div className="coach-record-group" key={meal}>
              <strong>{label}</strong>
              <ul>
                {foods.map((food, i) => (
                  <li key={i}>
                    <span>{food.localizedName || food.name}</span>
                    <b>
                      {food.grams} g<small>{basisLabels[food.basis]}</small>
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {diet.note && <p className="coach-record-note">{diet.note}</p>}
      </>
    );
  }
  const training = entry.data as Training;
  return (
    <>
      <p className="coach-record-meta">
        {
          { resistance: '抗阻训练', cardio: '有氧训练', rest: '休息恢复' }[
            training.type
          ]
        }{' '}
        ·{' '}
        {
          { completed: '已完成', missed: '未完成', rest: '休息' }[
            training.status
          ]
        }
        {training.minutes !== null ? ` · ${training.minutes} 分钟` : ''}
      </p>
      {training.content && (
        <p className="coach-record-note">{training.content}</p>
      )}
      {cardioEntries(training).map((activity) => (
        <div className="coach-record-line" key={activity.catalogId}>
          <span>
            {cardioTypes.find((c) => c.id === activity.catalogId)?.name ??
              activity.catalogId}
          </span>
          <b>{activity.minutes ?? '—'} 分钟</b>
        </div>
      ))}
      {training.exercises?.map((exercise, i) => (
        <div className="coach-record-group" key={i}>
          <strong>{exercise.name}</strong>
          <small>
            {exerciseDefinition(exercise)?.weightLabel ??
              loadLabels[exercise.load]}
          </small>
          <ul>
            {exercise.sets.map((set, j) => (
              <li key={set.id}>
                <span>
                  {set.warmup ? '热身' : `第 ${j + 1} 组`}
                  {!set.completed ? ' · 未完成' : ''}
                </span>
                <b>
                  {exerciseDefinition(exercise)?.bodyOnly
                    ? ''
                    : `${set.weight ?? '—'} kg × `}
                  {set.reps ?? '—'} 次
                </b>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {training.details && (
        <p className="coach-record-note">{training.details}</p>
      )}
    </>
  );
}

export function CoachToolCards({
  runs,
  onAction,
  onRetry,
  onConfirmRecord,
  disabled = false,
  records = [],
}: {
  runs: CoachToolRun[];
  onAction?: (action: CoachToolAction) => Promise<void>;
  onRetry?: () => void;
  onConfirmRecord?: (runId: string, actionIndex: number) => Promise<void>;
  disabled?: boolean;
  records?: Entry[];
}) {
  const working = useRef(false);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  async function act(id: string, operation: () => Promise<void>) {
    if (working.current || disabled) return;
    working.current = true;
    setBusy(id);
    setError('');
    try {
      await operation();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '暂时未能完成操作，内容仍在，请重试。',
      );
    } finally {
      setBusy('');
      working.current = false;
    }
  }
  return (
    <div className="coach-tool-results">
      {runs.map((run) => (
        <section
          key={run.id}
          className="coach-tool-card"
          aria-label={run.title}
        >
          <div className="coach-tool-title">
            {run.status === 'error' ? (
              <CircleAlert size={15} />
            ) : run.sources ? (
              <BookOpen size={15} />
            ) : run.actions?.some(
                (a) => a.type === 'record' && a.draft && !a.savedAt,
              ) ? (
              <FilePenLine size={15} />
            ) : (
              <Check size={15} />
            )}
            <strong>{run.title}</strong>
          </div>
          <p>
            {run.actions?.some((a) => a.type === 'record' && a.draft)
              ? run.actions.every((a) => a.type === 'record' && a.savedAt)
                ? '已记录到日记。'
                : '核对下方内容，确认后直接记入日记。'
              : run.summary}
          </p>
          {run.status === 'error' && (
            <button
              className="coach-chip"
              disabled={disabled || !onRetry || !!busy}
              onClick={onRetry}
            >
              再试一次
            </button>
          )}
          {run.actions?.some((a) => 'quote' in a && a.quote) && (
            <details className="coach-record-source">
              <summary>查看原话</summary>
              <blockquote>
                {run.actions
                  .filter((a) => 'quote' in a)
                  .map((a) => ('quote' in a ? a.quote : ''))
                  .join('；')}
              </blockquote>
            </details>
          )}
          {!!run.sources?.length && (
            <details>
              <summary>查看 {run.sources.length} 篇来源与摘要</summary>
              <ol className="coach-source-list">
                {run.sources.map((source) => (
                  <li key={source.id}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title}
                      <ArrowUpRight size={13} />
                    </a>
                    <span>
                      {source.year} · {source.journal} · 研究摘要
                    </span>
                    <details>
                      <summary>已读取的摘要</summary>
                      <p lang="en">{source.abstract}</p>
                    </details>
                  </li>
                ))}
              </ol>
              <small>
                仅本次检索的相关研究，未读取全文，也不代表完整证据评估。
              </small>
            </details>
          )}
          {!!run.actions?.length && (
            <div className="coach-tool-action-list">
              {run.actions.map((action, i) =>
                action.type === 'record' && action.draft ? (
                  <div className="coach-record-preview" key={i}>
                    <div className="coach-record-heading">
                      <strong>
                        {
                          {
                            body: '身体记录',
                            diet: '饮食记录',
                            training: '训练记录',
                          }[action.entry.kind]
                        }
                      </strong>
                      <time dateTime={action.entry.date}>
                        {action.entry.date}
                      </time>
                    </div>
                    {action.sourceRecord && (
                      <small>
                        引用 {action.sourceRecord.date} 的
                        {
                          mealLabels[
                            action.sourceRecord.meal as keyof typeof mealLabels
                          ]
                        }
                      </small>
                    )}
                    {action.baseUpdatedAt && !action.savedAt && (
                      <small>
                        {action.entry.kind === 'diet' &&
                        previewDietMeals(action, records)
                          ? '仅展示本次涉及的餐次，其他餐次保留。'
                          : '将更新这天的记录，以下包含保留的原有内容。'}
                      </small>
                    )}
                    {action.savedAt ? (
                      <details>
                        <summary>查看本次记录内容</summary>
                        <RecordPreview
                          entry={action.entry}
                          meals={previewDietMeals(action, records)}
                        />
                      </details>
                    ) : (
                      <RecordPreview
                        entry={action.entry}
                        meals={previewDietMeals(action, records)}
                      />
                    )}
                    <div className="coach-tool-actions coach-record-actions">
                      {action.savedAt ? (
                        <output className="coach-record-saved">
                          <Check size={15} />
                          已记录
                        </output>
                      ) : (
                        <button
                          className="coach-chip coach-record-confirm"
                          disabled={disabled || !!busy || !onConfirmRecord}
                          onClick={() =>
                            onConfirmRecord &&
                            void act(`${run.id}:${i}:save`, () =>
                              onConfirmRecord(run.id, i),
                            )
                          }
                        >
                          {busy === `${run.id}:${i}:save`
                            ? '正在记录…'
                            : '确认记录'}
                        </button>
                      )}
                      <button
                        className="coach-chip"
                        disabled={disabled || !!busy || !onAction}
                        onClick={() =>
                          onAction &&
                          void act(`${run.id}:${i}:open`, () =>
                            onAction(action),
                          )
                        }
                      >
                        {busy === `${run.id}:${i}:open`
                          ? '正在打开…'
                          : action.savedAt
                            ? '查看日记'
                            : '调整内容'}
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    key={i}
                    className="coach-chip"
                    disabled={disabled || !!busy || !onAction}
                    onClick={() =>
                      onAction &&
                      void act(`${run.id}:${i}`, () => onAction(action))
                    }
                  >
                    {busy === `${run.id}:${i}` ? '正在核对…' : action.label}
                    <ArrowUpRight size={13} />
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      ))}
      {error && (
        <output className="coach-copy-error" role="alert">
          {error}
          {onRetry && (
            <button className="text-button" onClick={onRetry}>
              让 Captain 重新核对
            </button>
          )}
        </output>
      )}
    </div>
  );
}
