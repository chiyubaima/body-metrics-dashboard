'use client';
import { foodPortionLabel } from '@/lib/food-portions';
import { useMemo, useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  Activity,
  ChevronRight,
  CircleCheck,
  Dumbbell,
  History,
  Plus,
  Settings2,
  Utensils,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  average,
  activePlan,
  today,
  trainingDraft,
  weekDates,
  weekCounts,
} from '@/lib/model';
import type {
  Body,
  Diet,
  DietPlan,
  Entry,
  Kind,
  MealSlot,
  Plan,
  Training,
  TrainingPlan,
} from '@/lib/model';
import {
  bodyPoints,
  defaultMealSlot,
  bodyMassIndex,
  cardioEntries,
  bodyDomain,
  foodEquivalent,
  canCompleteDiet,
  mealLabels,
  nutritionSummary,
  workoutStats,
} from '@/lib/progress';
import { cardioTypes } from '@/lib/exercises';
import { exerciseProgress } from '@/lib/strength';
import { strengthRating } from '@/lib/strength-rating';
import { StrengthRating } from './strength-rating';
import { referenceFoods } from '@/lib/foods';
import { displayFoodName } from '@/lib/food-labels';
import { MealIcon, MacroLine, NutritionRings } from './nutrition';
type PanelProps = {
  overview?: import('@/lib/dashboard-data').DashboardOverview;
  records: Entry[];
  plans: Plan[];
  date: string;
  ready: boolean;
  module: Kind;
  edit: (kind: Kind, entry?: Entry, meal?: MealSlot) => void;
  history: (kind: Kind) => void;
  plan: (kind: 'diet' | 'training') => void;
  onFactsChanged?: () => Promise<unknown>;
  profile?: import('@/lib/model').Profile | null;
  ratingSettings?: () => void;
};
export const compactDate = (d: string) => d.slice(5).replace('-', '/');
export const numeric = (n: number | null | undefined, digits = 1) =>
  n == null ? '—' : Number(n.toFixed(digits)).toLocaleString('zh-CN');
function Panel({
  kind,
  title,
  subtitle,
  action,
  children,
  active,
  disabled,
  history,
}: {
  kind: Kind;
  title: string;
  subtitle: string;
  action: () => void;
  children: ReactNode;
  active: boolean;
  disabled: boolean;
  history: () => void;
}) {
  const Icon =
    kind === 'body' ? Activity : kind === 'diet' ? Utensils : Dumbbell;
  return (
    <section
      data-annotate={`panel.${kind}`}
      data-module={kind}
      aria-label={title + '模块'}
      className={`panel ${kind}-panel ${active ? '' : 'hidden-mobile'}`}
    >
      <div className="panel-fixed">
        <div className="panel-heading">
          <span className="module-icon">
            <Icon size={23} strokeWidth={2.5} />
          </span>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <span className="module-number">
            {kind === 'body' ? '01' : kind === 'diet' ? '02' : '03'}
          </span>
        </div>
        <div className="panel-record-actions">
          <button
            className="primary panel-action"
            onClick={action}
            disabled={disabled}
          >
            <Plus size={19} />
            {kind === 'body'
              ? '记录身体'
              : kind === 'diet'
                ? '记录饮食'
                : '记录训练'}
          </button>
          <button
            className="secondary panel-history"
            disabled={disabled}
            onClick={history}
          >
            <History size={18} />
            <span>
              {kind === 'body'
                ? '身体日记'
                : kind === 'diet'
                  ? '饮食日记'
                  : '训练日记'}
            </span>
          </button>
        </div>
      </div>
      <div className="panel-scroll" aria-label={title + '内容，可上下滚动'}>
        {children}
      </div>
    </section>
  );
}
export function Segmented({
  items,
  value,
  onChange,
  label,
}: {
  items: [string, string][];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <fieldset className="segmented" aria-label={label}>
      {items.map(([key, text]) => (
        <button
          key={key}
          aria-pressed={key === value}
          onClick={() => onChange(key)}
          className={key === value ? 'selected' : ''}
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}
function SectionTitle({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h3>{children}</h3>
      {aside}
    </div>
  );
}
function EmptyChart({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="chart-empty">
      <Activity size={30} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
function TrendChart({
  points,
  color,
  unit,
  mean = false,
  minimumSpan = false,
  connectGaps = false,
}: {
  points: { date: string; value: number | null; mean?: number | null }[];
  color: string;
  unit: string;
  mean?: boolean;
  minimumSpan?: boolean;
  connectGaps?: boolean;
}) {
  return (
    <figure
      className="chart"
      aria-label={`${points.filter((p) => p.value !== null).length}条${unit}记录${mean ? '与7天均值' : ''}趋势`}
    >
      <ResponsiveContainer
        width="100%"
        height={190}
        initialDimension={{ width: 320, height: 190 }}
      >
        <LineChart
          data={points}
          margin={{ left: -25, right: 12, top: 12, bottom: 0 }}
        >
          <CartesianGrid
            stroke="#e7eef0"
            vertical={false}
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="date"
            tickFormatter={compactDate}
            tick={{ fill: '#7a898b', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
          />
          <YAxis
            domain={
              minimumSpan
                ? bodyDomain(points.flatMap((p) => [p.value, p.mean]))
                : ['auto', 'auto']
            }
            tick={{ fill: '#7a898b', fontSize: 12 }}
            tickFormatter={(v) => numeric(Number(v))}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            labelFormatter={(d) => String(d)}
            contentStyle={{
              background: '#fff',
              border: '1px solid #dce5e7',
              borderRadius: 12,
              fontSize: 14,
            }}
            formatter={(v, n) => [
              `${numeric(Number(v))} ${unit}`,
              n === 'mean' ? '7天均值' : '测量值',
            ]}
          />
          <Line
            dataKey="value"
            stroke={mean ? '#a3d3ea' : color}
            strokeWidth={mean ? 1.5 : 3}
            dot={{ r: 3, fill: mean ? '#a3d3ea' : color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls={connectGaps}
            isAnimationActive={false}
          />
          {mean && (
            <Line
              dataKey="mean"
              stroke={color}
              strokeWidth={3}
              dot={false}
              connectNulls={connectGaps}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
export function BodyPanel(props: PanelProps & { height: number | null }) {
  const { records, date, edit, history, ready } = props;
  const [period, setPeriod] = useState('30'),
    [metric, setMetric] = useState<'weight' | 'waist' | 'bodyFat' | 'bmi'>(
      'weight',
    ),
    [morningOnly, setMorningOnly] = useState(true);
  const rows = records.filter((r) => r.kind === 'body' && r.date <= date),
    avg = average(records, date);
  const waist = props.overview
      ? props.overview.waist
      : rows.find((r) => (r.data as Body).waist !== null),
    fat = props.overview
      ? props.overview.fat
      : rows.find((r) => (r.data as Body).bodyFat !== null);
  const points = useMemo(
      () =>
        bodyPoints(
          records,
          date,
          Number(period),
          metric,
          metric === 'bmi' || morningOnly,
          props.height,
        ),
      [records, date, period, metric, morningOnly, props.height],
    ),
    has = points.some((p) => p.value !== null);
  return (
    <Panel
      kind="body"
      title="身体"
      subtitle="让趋势说话"
      active={props.module === 'body'}
      disabled={!ready || date > today()}
      action={() => edit('body')}
      history={() => history('body')}
    >
      <div
        className="body-metric-strip summary-block"
        data-annotate="body.summary"
        aria-label="选择身体趋势指标"
      >
        {(
          [
            ['weight', '7天晨重均值', avg.value, 'kg', ''],
            [
              'waist',
              '最近腰围',
              waist ? (waist.data as Body).waist : null,
              'cm',
              waist ? '' : '尚未记录',
            ],
            [
              'bodyFat',
              '最近体脂',
              fat ? (fat.data as Body).bodyFat : null,
              '%',
              fat ? '' : '尚未记录',
            ],
            [
              'bmi',
              'BMI',
              bodyMassIndex(avg.value, props.height),
              '',
              props.height ? '' : '请在资料填身高',
            ],
          ] as const
        ).map(([key, label, value, unit, detail]) => (
          <button
            key={key}
            data-annotate={`body.metric.${key}`}
            aria-pressed={metric === key}
            className={metric === key ? 'selected' : ''}
            onClick={() => setMetric(key)}
          >
            <span>{label}</span>
            <strong>
              {ready ? numeric(value) : '—'}
              <small>{unit}</small>
            </strong>
            {detail && <small>{detail}</small>}
            <i />
          </button>
        ))}
      </div>
      <div className="chart-card" data-annotate="body.trend">
        <SectionTitle
          aside={
            <Segmented
              label="身体趋势时间范围"
              items={[
                ['30', '30 天'],
                ['90', '90 天'],
              ]}
              value={period}
              onChange={setPeriod}
            />
          }
        >
          变化轨迹
        </SectionTitle>
        {has ? (
          <TrendChart
            points={points}
            unit={
              metric === 'weight'
                ? 'kg'
                : metric === 'waist'
                  ? 'cm'
                  : metric === 'bmi'
                    ? 'BMI'
                    : '%'
            }
            color="#168fca"
            mean={metric === 'bmi' || (metric === 'weight' && morningOnly)}
            minimumSpan
            connectGaps
          />
        ) : (
          <EmptyChart
            title="你的第一段曲线，从这里开始"
            detail="没有记录的日子留空，不把波动当作结论。"
          />
        )}
        <div className="chart-legend">
          <i />
          {metric === 'bmi'
            ? `深蓝 · 7天均值　浅蓝 · 当日 BMI${props.height ? ` · 身高 ${props.height} cm` : ''}`
            : metric === 'weight'
              ? morningOnly
                ? '深蓝 · 7天均值　浅蓝 · 当日晨重'
                : '每日最近一次体重 · 包含其他测量时段'
              : metric === 'bodyFat'
                ? '每日最近一次体脂，可能包含估计值'
                : '每日最近一次腰围'}
        </div>
        {metric === 'weight' && (
          <label className="chart-condition">
            <input
              type="checkbox"
              checked={!morningOnly}
              onChange={(e) => setMorningOnly(!e.target.checked)}
            />
            图中包括其他时段测量
          </label>
        )}
      </div>
    </Panel>
  );
}
export function DietPanel(
  props: PanelProps & { complete: (entry: Entry) => void; busy: boolean },
) {
  const { records, plans, date, ready, edit, history, plan } = props;
  const [meal, setMeal] = useState<MealSlot>('lunch'),
    [equivalents, setEquivalents] = useState(false);
  const row = records.find((r) => r.kind === 'diet' && r.date === date),
    diet = row?.data as Diet | undefined,
    summary = nutritionSummary(diet?.foods ?? []);
  const cp = activePlan(plans, 'diet', date),
    target = cp?.data as DietPlan | undefined;
  const loggedSlots = new Set(
    (diet?.foods ?? []).map((f) => f.meal ?? 'unsorted'),
  );
  const selectedFoods = (diet?.foods ?? []).filter(
    (f) => (f.meal ?? 'unsorted') === meal,
  );
  const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  return (
    <Panel
      kind="diet"
      title="饮食"
      subtitle="吃得明白，记录轻松"
      active={props.module === 'diet'}
      disabled={!ready || date > today()}
      action={() => edit('diet', row, defaultMealSlot(diet?.foods ?? []))}
      history={() => history('diet')}
    >
      <div
        className="nutrition-summary summary-block"
        data-annotate="diet.summary"
      >
        <div className="nutrition-heading section-heading">
          <h3>今日摄入</h3>
          <div>
            <button
              className="text-button"
              aria-expanded={equivalents}
              onClick={() => setEquivalents(!equivalents)}
            >
              <Utensils size={14} />
              食物换算
            </button>
            <button
              className="text-button"
              disabled={!ready}
              onClick={() => plan('diet')}
            >
              <Settings2 size={14} />
              {target ? '调整目标' : '设置目标'}
            </button>
          </div>
        </div>
        {equivalents && <FoodEquivalents target={target} />}
        <NutritionRings foods={diet?.foods ?? []} target={target} />
        <p className="nutrition-coverage">
          {summary.count
            ? `${summary.known.energy}/${summary.count} 项有热量 · ${diet?.complete ? '全天已记完' : '正在记录'}`
            : '添加食物，自动按份量计算营养'}
          {Object.values(summary.known).some((n) => n < summary.count)
            ? ' · * 部分营养待补全'
            : ''}
        </p>
        {target && target.mode !== 'macros' && (
          <button className="legacy-plan-link" onClick={() => plan('diet')}>
            原食物计划已保留 · 改用营养素目标 <ChevronRight size={14} />
          </button>
        )}
      </div>
      <div className="plate-card" data-annotate="diet.plate">
        <SectionTitle
          aside={
            row && diet && (canCompleteDiet(diet) || diet.complete) ? (
              <button
                className={`plate-complete ${diet.complete ? 'done' : ''}`}
                disabled={props.busy}
                aria-pressed={!!diet.complete}
                onClick={() => props.complete(row)}
                title={diet.complete ? '点击继续补记' : '确认当天饮食已记完'}
              >
                <CircleCheck size={15} />
                {diet.complete ? '全天已记好' : '这天都记好了'}
              </button>
            ) : undefined
          }
        >
          今日餐盘
        </SectionTitle>
        <div className="plate-surface">
          <div className="plate-tabs" aria-label="选择餐次">
            {slots.map((slot) => {
              const mealSummary = nutritionSummary(
                (diet?.foods ?? []).filter((food) => food.meal === slot),
              );
              const energy = !mealSummary.count
                ? '待记录'
                : mealSummary.total.energy === null
                  ? '热量待补全'
                  : `${numeric(mealSummary.total.energy, 0)} 大卡${mealSummary.known.energy < mealSummary.count ? '（部分）' : ''}`;
              return (
                <button
                  key={slot}
                  data-annotate={`diet.meal.${slot}`}
                  aria-pressed={meal === slot}
                  className={`${meal === slot ? 'selected' : ''} ${loggedSlots.has(slot) ? 'logged' : ''}`}
                  onClick={() => setMeal(slot)}
                >
                  <span>
                    <MealIcon meal={slot} />
                  </span>
                  <b>{mealLabels[slot]}</b>
                  <small>{energy}</small>
                </button>
              );
            })}
          </div>
          {loggedSlots.has('unsorted') && (
            <button className="text-button" onClick={() => setMeal('unsorted')}>
              查看未分餐旧记录
            </button>
          )}
          <section
            className="plate-detail"
            key={date + meal}
            aria-label={`${mealLabels[meal]}餐食明细`}
          >
            {selectedFoods.map((food, i) => (
              <div className="plate-food" key={i}>
                <div className="plate-food-description">
                  <strong>{displayFoodName(food)}</strong>
                  <small>
                    {foodPortionLabel(food)} ·{' '}
                    {food.basis === 'raw'
                      ? '生重'
                      : food.basis === 'cooked'
                        ? '熟重'
                        : '食用份量'}
                  </small>
                  <MacroLine foods={[food]} />
                </div>
                <b>
                  {numeric(nutritionSummary([food]).total.energy, 0)}
                  <small>大卡</small>
                </b>
              </div>
            ))}
            {!selectedFoods.length && <p className="empty-inline">暂无记录</p>}
            <button
              className="secondary plate-edit"
              disabled={!ready || date > today()}
              onClick={() => edit('diet', row, meal)}
            >
              <Plus size={17} />
              {selectedFoods.length
                ? '补充 / 修改这一餐'
                : `记录${mealLabels[meal]}`}
            </button>
          </section>
        </div>
      </div>
      {diet?.note && <p className="daily-note">{diet.note}</p>}
      {diet && diet.status !== 'logged' && (
        <p className="legacy-note">
          原打卡：{diet.status === 'planned' ? '基本按计划' : '有调整'}
          ，可继续添加每餐食物。
        </p>
      )}
    </Panel>
  );
}
function FoodEquivalents({ target }: { target?: DietPlan }) {
  const [choices, setChoices] = useState({ protein: 0, carbs: 1, fat: 9 });
  return (
    <div className="food-equivalents">
      {(['protein', 'carbs', 'fat'] as const).map((key) => {
        const food = referenceFoods[choices[key]],
          grams = foodEquivalent(target?.[key], food.nutrition?.[key]);
        return (
          <div className="equivalent-row" key={key}>
            <label>
              {{ protein: '蛋白质', carbs: '碳水', fat: '脂肪' }[key]}{' '}
              {target?.[key] ?? '—'}g
              <select
                value={choices[key]}
                aria-label={`${key}食物换算`}
                onChange={(e) =>
                  setChoices((old) => ({
                    ...old,
                    [key]: Number(e.target.value),
                  }))
                }
              >
                {referenceFoods.map(
                  (f, i) =>
                    (f.nutrition?.[key] ?? 0) > (key === 'fat' ? 2 : 5) && (
                      <option key={i} value={i}>
                        {f.name} ·{' '}
                        {f.basis === 'raw'
                          ? '生重'
                          : f.basis === 'cooked'
                            ? '熟重'
                            : '可食部分'}
                      </option>
                    ),
                )}
              </select>
            </label>
            <strong>≈ {numeric(grams, 0)} g</strong>
          </div>
        );
      })}
      <p>
        每行只比较一种营养素，不是把三行食物加起来当食谱。食物还含其他营养；数值按
        USDA 每 100g 数据换算，无需模型。
        {!target && '先设置营养目标即可查看。'}
      </p>
    </div>
  );
}
export function TrainingPanel(props: PanelProps) {
  const { records, plans, date, ready, edit, history, plan } = props,
    [selected, setSelected] = useState(''),
    [showAll, setShowAll] = useState(false);
  const progress = useMemo(
    () =>
      props.overview?.progress ??
      exerciseProgress(records, date).map((p) => ({
        ...p,
        days: p.history.length,
      })),
    [props.overview, records, date],
  );
  const visible = showAll ? progress : progress.slice(0, 3);
  const cp = activePlan(plans, 'training', date),
    target = (cp?.data as TrainingPlan) ?? trainingDraft;
  const sessions = records
      .filter((r) => r.kind === 'training' && r.date <= date)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt) ||
          b.id.localeCompare(a.id),
      ),
    rows = sessions.filter((r) => r.date === date),
    latest = props.overview
      ? props.overview.latestTraining
      : sessions.find(
          (r) =>
            (r.data as Training).status === 'completed' &&
            (r.data as Training).type !== 'rest',
        );
  const counts = weekCounts(sessions, date),
    goal = target.resistance + target.cardio,
    completed =
      Math.min(counts.resistance, target.resistance) +
      Math.min(counts.cardio, target.cardio),
    latestTraining = latest?.data as Training | undefined,
    latestActivities = latestTraining ? cardioEntries(latestTraining) : [],
    latestMinutes = latestActivities.length
      ? latestActivities.every((activity) => activity.minutes !== null)
        ? latestActivities.reduce((sum, activity) => sum + activity.minutes!, 0)
        : null
      : latestTraining?.minutes;
  const rating = useMemo(
    () =>
      props.overview?.rating ?? strengthRating(records, props.profile, date),
    [props.overview, records, props.profile, date],
  );
  const schedule = cp
    ? target.schedule[weekDates(date).indexOf(date)]
    : 'unplanned';
  return (
    <Panel
      kind="training"
      title="训练"
      subtitle="每一组，都有进步的证据"
      active={props.module === 'training'}
      disabled={!ready || date > today()}
      action={() => edit('training')}
      history={() => history('training')}
    >
      <section className="training-today" data-annotate="training.today">
        <SectionTitle
          aside={
            <button
              className="text-button"
              disabled={!ready}
              onClick={() => plan('training')}
            >
              <Settings2 size={14} />
              {cp ? '调整计划' : '设置计划'}
            </button>
          }
        >
          {date === today() ? '今日训练' : compactDate(date) + ' 训练'}
        </SectionTitle>
        {rows.length ? (
          <div className="session-list">
            {rows.map((r) => {
              const t = r.data as Training,
                s = workoutStats(t);
              return (
                <button
                  key={r.id}
                  className="session-row"
                  onClick={() => edit('training', r)}
                >
                  <Image
                    className="session-art"
                    src={`/training-types/${t.type}.png`}
                    alt=""
                    width={76}
                    height={76}
                    sizes="76px"
                  />
                  <div className="grow">
                    <strong>
                      {t.content ||
                        {
                          resistance: '抗阻训练',
                          cardio: '有氧训练',
                          rest: '休息恢复',
                        }[t.type]}
                    </strong>
                    <p>
                      {t.status === 'rest'
                        ? '休息也是计划的一部分'
                        : t.status === 'missed'
                          ? '已记为未完成'
                          : s.exercises
                            ? `${s.exercises} 个动作 · ${s.sets} 个工作组${t.minutes ? ` · ${t.minutes} 分钟` : ''}`
                            : `${t.minutes ?? '—'} 分钟`}
                    </p>
                    {t.type === 'cardio' && cardioEntries(t).length > 0 && (
                      <span className="session-activities">
                        {cardioEntries(t)
                          .map(
                            (a) =>
                              `${cardioTypes.find((c) => c.id === a.catalogId)?.name} ${a.minutes ?? '—'} 分钟`,
                          )
                          .join(' · ')}
                      </span>
                    )}
                    <small>{t.exercises?.map((e) => e.name).join(' · ')}</small>
                  </div>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="training-week-card">
            <div className="training-week-heading">
              <strong>
                {cp && goal > 0
                  ? `本周计划已完成 ${completed} / ${goal} 次`
                  : cp
                    ? '本周未安排训练目标'
                    : `本周已完成 ${counts.resistance + counts.cardio} 次训练`}
              </strong>
              {schedule === 'rest' && (
                <small>{date === today() ? '今日休息' : '当日休息'}</small>
              )}
            </div>
            <div className="training-week-metrics">
              {(
                [
                  ['resistance', '抗阻'],
                  ['cardio', '有氧'],
                ] as const
              ).map(([type, label]) => (
                <div key={type}>
                  <div>
                    <span>{label}</span>
                    <strong>
                      {counts[type]}
                      <small>
                        {cp && target[type] > 0
                          ? ` / ${target[type]} 次`
                          : ' 次'}
                      </small>
                    </strong>
                  </div>
                  {cp && target[type] > 0 ? (
                    <progress
                      max={target[type]}
                      value={Math.min(counts[type], target[type])}
                      aria-label={`本周${label}计划完成度`}
                    />
                  ) : (
                    <small>{cp ? '未安排目标' : '尚未设置目标'}</small>
                  )}
                </div>
              ))}
            </div>
            <p className="training-last-session">
              {latest && latestTraining
                ? `上次训练：${compactDate(latest.date)}，${latestTraining.type === 'cardio' ? '有氧运动' : '抗阻训练'}${latestMinutes != null ? `${latestMinutes}分钟` : ' · 时长未记录'}`
                : '暂无已完成的训练记录'}
            </p>
          </div>
        )}
      </section>
      <StrengthRating
        rating={rating}
        onSettings={props.ratingSettings}
        onRecordBody={() => edit('body')}
      />
      <section
        className="exercise-progress summary-block"
        data-annotate="training.strength"
        aria-label="训练进步"
      >
        <SectionTitle aside={<span className="subtle">较首次记录</span>}>
          训练进步
        </SectionTitle>
        {!progress.length ? (
          <p className="empty-inline">
            记录训练的重量和次数，下一次就能看到变化。
          </p>
        ) : (
          <div className="exercise-progress-list">
            {visible.map((item) => {
              const expanded = selected === item.key;
              const setLabel = (point: typeof item.last) =>
                item.bodyOnly
                  ? `${point.reps} 次`
                  : `${numeric(point.weight, 2)} kg × ${point.reps}次`;
              const summary = item.baseline
                ? '首次记录 · 待比较'
                : !item.comparable
                  ? '次数不同 · 不直接比较加重'
                  : item.change === 0
                    ? '与首次持平'
                    : `${item.stale ? '上次较首次' : '较首次'}${item.change! > 0 ? '增加' : '减少'} ${numeric(Math.abs(item.change!), 2)} ${item.changeUnit}`;
              return (
                <div key={item.key} className="exercise-progress-item">
                  <button
                    className="exercise-progress-row"
                    aria-expanded={expanded}
                    aria-controls={
                      expanded ? 'strength-exercise-detail' : undefined
                    }
                    onClick={() => setSelected(expanded ? '' : item.key)}
                  >
                    <span className="exercise-progress-heading">
                      <strong>{item.name}</strong>
                      <ChevronRight
                        size={15}
                        className={expanded ? 'rotate-90' : ''}
                      />
                    </span>
                    <span className="exercise-progress-sets">
                      {!item.baseline && (
                        <>
                          <span>
                            {item.bodyOnly
                              ? item.first.reps
                              : item.first.reps === item.last.reps
                                ? numeric(item.first.weight, 2)
                                : setLabel(item.first)}
                          </span>
                          <span aria-hidden="true">→</span>
                        </>
                      )}
                      <b>{setLabel(item.last)}</b>
                    </span>
                    <span className="exercise-progress-caption">
                      <span>{summary}</span>
                      <small>
                        {item.bodyOnly
                          ? '自重'
                          : item.load === 'perHand'
                            ? '单手重量'
                            : item.load === 'bodyweight'
                              ? '额外负重'
                              : '总重量'}
                      </small>
                    </span>
                    <small className="exercise-progress-date">
                      最近 {compactDate(item.last.date)}
                      {item.stale ? ' · 久未记录' : ''}
                    </small>
                  </button>
                  {expanded && (
                    <div
                      className="strength-exercise-detail exercise-progress-chart"
                      id="strength-exercise-detail"
                    >
                      <p className="chart-note">
                        {compactDate(item.first.date)} 首次记录 · 共 {item.days}{' '}
                        个训练日
                      </p>
                      <TrendChart
                        points={item.history.slice(-12).map((point) => ({
                          date: point.date,
                          value: item.bodyOnly ? point.reps : point.weight,
                        }))}
                        color="#e38a16"
                        unit={item.bodyOnly ? '次' : 'kg'}
                      />
                      <p className="helper">
                        {item.bodyOnly
                          ? '每天正式组的最多次数，保持动作幅度一致。'
                          : '每天最重正式组的实记重量，各日次数可能不同，曲线上升不直接代表力量提升。'}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {progress.length > 3 && (
          <button
            className="text-button exercise-progress-more"
            aria-expanded={showAll}
            onClick={() => {
              setShowAll(!showAll);
              setSelected('');
            }}
          >
            {showAll ? '收起动作' : `查看全部 ${progress.length} 个动作`}
          </button>
        )}
        {progress.length > 0 && (
          <details
            className="strength-method"
            onToggle={(e) => {
              if (e.currentTarget.open)
                void fetch('/api/medals/facts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ metric: 'strength_viewed' }),
                })
                  .then((response) => {
                    if (response.ok) return props.onFactsChanged?.();
                  })
                  .catch(() => {});
            }}
          >
            <summary>如何比较训练进步？</summary>
            <p>
              同一个动作、同一种负重口径，每天取最重的已完成正式组，同重取次数最多的一组。和首次记录相比，次数相同才计算加重；重量相同可比较次数。两者都变了就保留原成绩，不直接判断力量变化。
            </p>
            <p>
              自重动作看次数，哑铃注明单手重量，负重引体等只显示额外负重。更正或删除历史会重新计算。这里展示实际训练记录，不参与上方的力量等级。
            </p>
          </details>
        )}
      </section>
    </Panel>
  );
}
