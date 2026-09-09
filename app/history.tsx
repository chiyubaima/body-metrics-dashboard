'use client';
import { useId, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { average, shiftDate, today } from '@/lib/model';
import type {
  Body,
  Diet,
  DietPlan,
  Entry,
  Kind,
  Plan,
  Training,
  TrainingPlan,
} from '@/lib/model';
import {
  basisLabels,
  loadLabels,
  mealLabels,
  nutritionSummary,
  cardioEntries,
  workoutStats,
} from '@/lib/progress';
import { exerciseDefinition, cardioTypes } from '@/lib/exercises';
import { displayFoodName } from '@/lib/food-labels';
import { DeleteConfirm } from './delete-confirm';
import { numeric, Segmented } from './panels';
import { MacroLine } from './nutrition';
function dietPlanText(p: DietPlan) {
  return p.mode === 'macros'
    ? `蛋白质 ${p.protein}g · 碳水 ${p.carbs}g · 脂肪 ${p.fat}g`
    : `肉 ${p.meat}g · 米 ${p.rice}g · 总脂肪 ${p.fat}g`;
}
export function HistoryView({
  kind,
  records,
  plans,
  date,
  edit,
  remove,
  busy,
}: {
  kind: Kind;
  records: Entry[];
  plans: Plan[];
  date: string;
  edit: (r: Entry) => void;
  remove: (rows: Entry[]) => Promise<void>;
  busy: boolean;
}) {
  const [period, setPeriod] = useState('90'),
    [rangeStart, setRangeStart] = useState(() => shiftDate(date, -89)),
    [rangeEnd, setRangeEnd] = useState(date),
    [condition, setCondition] = useState('all'),
    [selected, setSelected] = useState<string[]>([]),
    [pending, setPending] = useState<Entry[]>([]),
    [deleteError, setDeleteError] = useState('');
  const rangeId = useId();
  const results = useRef<HTMLElement>(null);
  const rangeError =
    period !== 'custom'
      ? ''
      : !rangeStart || !rangeEnd
        ? '请选择开始日期和结束日期。'
        : rangeStart > rangeEnd
          ? '开始日期不能晚于结束日期。'
          : rangeStart < '2000-01-01' || rangeEnd > today()
            ? '请选择2000年1月1日至今天之间的日期。'
            : '';
  const from =
    period === 'custom'
      ? rangeStart
      : period === 'all'
        ? ''
        : shiftDate(date, 1 - Number(period));
  const to = period === 'custom' ? rangeEnd : date;
  function resetResults() {
    setSelected([]);
    if (results.current) results.current.scrollTop = 0;
  }
  const rows = records.filter(
    (r) =>
      !rangeError &&
      r.kind === kind &&
      r.date <= to &&
      r.date >= from &&
      (kind !== 'body' ||
        condition === 'all' ||
        (r.data as Body).condition === condition),
  );
  const selection = rows.filter((r) => selected.includes(r.id));
  const toggle = (id: string) =>
    setSelected((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
    );
  const checkbox = (r: Entry) => (
    <input
      type="checkbox"
      aria-label={`选择${r.date}的记录`}
      checked={selected.includes(r.id)}
      disabled={busy}
      onChange={() => toggle(r.id)}
    />
  );
  const actions = (r: Entry) => (
    <div className="row-actions">
      <button
        className="icon-button"
        aria-label={`修改${r.date}的记录`}
        onClick={() => edit(r)}
        disabled={busy}
      >
        <Pencil size={16} />
      </button>
      <button
        className="icon-button"
        aria-label={`删除${r.date}的${kind === 'diet' ? '当天饮食' : '记录'}`}
        onClick={() => {
          setDeleteError('');
          setPending([r]);
        }}
        disabled={busy}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
  return (
    <div className="dialog-body history-view">
      <div className="history-controls">
        <div className="history-filters">
          <Segmented
            label="历史范围"
            value={period}
            items={[
              ['30', '30 天'],
              ['90', '90 天'],
              ['all', '全部'],
              ['custom', '自选区间'],
            ]}
            onChange={(value) => {
              setPeriod(value);
              resetResults();
            }}
          />
          {kind === 'body' && (
            <Segmented
              label="测量条件筛选"
              value={condition}
              items={[
                ['all', '全部条件'],
                ['morning', '晨起'],
                ['other', '其他时间'],
              ]}
              onChange={(value) => {
                setCondition(value);
                resetResults();
              }}
            />
          )}
        </div>
        {period === 'custom' && (
          <div className="history-date-range" aria-label="自选日期区间">
            <label className="field" htmlFor={`${rangeId}-start`}>
              <span>开始日期</span>
              <input
                id={`${rangeId}-start`}
                type="date"
                value={rangeStart}
                min="2000-01-01"
                max={today()}
                aria-invalid={!!rangeError}
                aria-describedby={rangeError ? `${rangeId}-error` : undefined}
                onChange={(e) => {
                  setRangeStart(e.target.value);
                  resetResults();
                }}
              />
            </label>
            <span className="history-range-separator" aria-hidden="true">
              —
            </span>
            <label className="field" htmlFor={`${rangeId}-end`}>
              <span>结束日期</span>
              <input
                id={`${rangeId}-end`}
                type="date"
                value={rangeEnd}
                min={rangeStart || '2000-01-01'}
                max={today()}
                aria-invalid={!!rangeError}
                aria-describedby={rangeError ? `${rangeId}-error` : undefined}
                onChange={(e) => {
                  setRangeEnd(e.target.value);
                  resetResults();
                }}
              />
            </label>
            {rangeError && (
              <p
                className="history-range-error"
                role="alert"
                id={`${rangeId}-error`}
              >
                {rangeError}
              </p>
            )}
          </div>
        )}
        <div className="selection-toolbar">
          <label>
            <input
              type="checkbox"
              checked={
                rows.length > 0 &&
                selection.length === Math.min(rows.length, 100)
              }
              disabled={!rows.length || busy}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? rows.map((r) => r.id).slice(0, 100) : [],
                )
              }
            />
            {rows.length > 100 ? '选择前100条' : '全选当前结果'}
          </label>
          <span>已选 {selection.length} 条</span>
          <button
            className="danger-text"
            disabled={!selection.length || busy}
            onClick={() => {
              setDeleteError('');
              setPending(selection);
            }}
          >
            <Trash2 size={15} />
            删除所选
          </button>
        </div>
      </div>
      <DeleteConfirm
        count={pending.length}
        label={{ body: '身体', diet: '饮食', training: '训练' }[kind]}
        busy={busy}
        error={deleteError}
        cancel={() => setPending([])}
        confirm={async () => {
          try {
            await remove(pending);
            setPending([]);
            setSelected([]);
          } catch (e) {
            setDeleteError(
              e instanceof Error ? e.message : '删除失败，请重试。',
            );
          }
        }}
      />
      <section
        className="history-results"
        ref={results}
        aria-label="日记记录列表"
      >
        <div className="history-summary">
          <strong>{rows.length} 条记录</strong>
          <span>
            {rows.length
              ? `${rows.at(-1)!.date} — ${rows[0].date}`
              : rangeError
                ? '等待选择有效日期区间'
                : '这一范围还没有记录'}
          </span>
        </div>
        {kind === 'body' && rows.length > 0 ? (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th aria-label="选择记录" />
                  <th>日期 / 条件</th>
                  <th>体重 kg</th>
                  <th>7天均值</th>
                  <th>腰围 cm</th>
                  <th>体脂 %</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = r.data as Body,
                    a = average(records, r.date);
                  return (
                    <tr key={r.id}>
                      <td>{checkbox(r)}</td>
                      <td>
                        <b>{r.date}</b>
                        <small>
                          {b.condition === 'morning' ? '晨起空腹' : '其他时间'}
                          {r.primaryMorning === 1 ? ' · 计入趋势' : ''}
                        </small>
                        {b.note && <p className="table-note">{b.note}</p>}
                      </td>
                      <td>
                        <strong>{numeric(b.weight)}</strong>
                      </td>
                      <td>{numeric(a.value)}</td>
                      <td>{numeric(b.waist)}</td>
                      <td>{numeric(b.bodyFat)}</td>
                      <td>{actions(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          rows.map((r) => (
            <article key={r.id} className="history-card">
              <div className="section-heading">
                <h3 className="history-row-title">
                  {checkbox(r)}
                  {r.date}
                </h3>
                {actions(r)}
              </div>
              <EntryDetails
                entry={r}
                plan={plans.find((p) => p.id === r.planId)}
              />
            </article>
          ))
        )}
        {!rows.length && !rangeError && (
          <div className="empty-note">
            换一个时间范围，或从今天的第一次记录开始。
          </div>
        )}
        {kind !== 'body' && (
          <details className="plan-details">
            <summary>历史计划</summary>
            <div className="plan-inner">
              {plans
                .filter((p) => p.kind === kind)
                .map((p) => (
                  <div className="history-plan" key={p.id}>
                    <strong>
                      {p.date}
                      {p.kind === 'diet' && (p.data as DietPlan).scope === 'day'
                        ? ' · 仅当天'
                        : ' 起生效'}
                      {p.date > today() ? ' · 尚未生效' : ''}
                    </strong>
                    <p>
                      {kind === 'diet'
                        ? dietPlanText(p.data as DietPlan)
                        : `每周抗阻 ${(p.data as TrainingPlan).resistance} 次 · 有氧 ${(p.data as TrainingPlan).cardio} 次`}
                    </p>
                  </div>
                ))}
              {!plans.some((p) => p.kind === kind) && <p>还没有启用计划。</p>}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
export function EntryDetails({ entry, plan }: { entry: Entry; plan?: Plan }) {
  if (entry.kind === 'diet') {
    const d = entry.data as Diet,
      s = nutritionSummary(d.foods);
    return (
      <>
        <div className="history-statline">
          <strong>
            {numeric(s.total.energy, 0)} <small>大卡估算</small>
          </strong>
          <span>
            {d.complete ? '全天已记完' : '部分记录'} · {s.known.energy}/
            {s.count} 项有热量
          </span>
        </div>
        <div className="history-macro-total" aria-label="全天三大营养素">
          <MacroLine foods={d.foods} />
          {Object.values(s.known).some((n) => n < s.count) && (
            <small>* 仅合计已知营养，未提供的数值显示为 —</small>
          )}
        </div>
        {d.status !== 'logged' && (
          <p className="helper">
            原打卡：{d.status === 'planned' ? '基本按计划' : '有调整'}
          </p>
        )}
        {d.foods.map((f, i) => (
          <div className="history-food" key={i}>
            <span className="badge">{mealLabels[f.meal ?? 'unsorted']}</span>
            <span>
              {displayFoodName(f)}
              <small>
                {f.grams} g · {basisLabels[f.basis]}
              </small>
              <MacroLine foods={[f]} />
            </span>
            <b>
              {numeric(nutritionSummary([f]).total.energy, 0)}
              <small>大卡</small>
            </b>
          </div>
        ))}
        {d.note && <p className="daily-note">{d.note}</p>}
        {plan && (
          <p className="helper">
            当时计划：{dietPlanText(plan.data as DietPlan)}
          </p>
        )}
      </>
    );
  }
  const t = entry.data as Training,
    s = workoutStats(t);
  return (
    <>
      <div className="history-statline">
        <strong>
          {t.content ||
            { resistance: '抗阻训练', cardio: '有氧训练', rest: '休息恢复' }[
              t.type
            ]}
        </strong>
        <span>
          {t.status === 'completed'
            ? `${t.minutes ?? '未填时长'}${t.minutes ? ' 分钟' : ''}`
            : t.status === 'rest'
              ? '休息'
              : '未完成'}
        </span>
      </div>
      {cardioEntries(t).map((activity) => (
        <div className="history-cardio" key={activity.catalogId}>
          <strong>
            {cardioTypes.find((c) => c.id === activity.catalogId)?.name}
          </strong>
          <span>{activity.minutes ?? '—'} 分钟</span>
        </div>
      ))}
      {s.sets > 0 && (
        <p className="helper">
          {s.exercises} 个动作 · {s.sets} 个工作组 · 训练量{' '}
          {numeric(s.volume, 0)} kg
        </p>
      )}
      {t.exercises?.map((e, i) => (
        <div className="history-exercise" key={i}>
          <strong>
            {e.name}
            <small>
              {exerciseDefinition(e)?.weightLabel ?? loadLabels[e.load]}
            </small>
          </strong>
          <div className="set-pills">
            {e.sets.map((set, j) => (
              <span key={set.id} className={set.completed ? 'done' : ''}>
                {set.warmup ? '热身' : `第${j + 1}组`} ·{' '}
                {exerciseDefinition(e)?.bodyOnly
                  ? ''
                  : `${numeric(set.weight)}kg × `}
                {set.reps ?? '—'}次{!set.completed ? ' · 未完成' : ''}
              </span>
            ))}
          </div>
        </div>
      ))}
      {t.details && <p className="daily-note">{t.details}</p>}
      {plan && (
        <p className="helper">
          当时计划：抗阻 {(plan.data as TrainingPlan).resistance}次 / 有氧{' '}
          {(plan.data as TrainingPlan).cardio}次
        </p>
      )}
    </>
  );
}
