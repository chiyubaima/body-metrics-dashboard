'use client';
import { useState, type ReactNode } from 'react';
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
  bodyMassIndex,
  cardioEntries,
  bodyDomain,
  foodEquivalent,
  canCompleteDiet,
  exerciseCatalog,
  exerciseKey,
  exerciseTimeline,
  loadLabels,
  mealLabels,
  nutritionSummary,
  workoutStats,
  workingSets,
} from '@/lib/progress';
import { exerciseDefinition, cardioTypes } from '@/lib/exercises';
import {
  strengthOverview,
  strengthGroup,
  strengthGrowth,
} from '@/lib/strength';
import { referenceFoods } from '@/lib/foods';
import { displayFoodName } from '@/lib/food-labels';
import { MealIcon, MacroLine, NutritionRings } from './nutrition';
type PanelProps = {
  records: Entry[];
  plans: Plan[];
  date: string;
  ready: boolean;
  module: Kind;
  edit: (kind: Kind, entry?: Entry, meal?: MealSlot) => void;
  history: (kind: Kind) => void;
  plan: (kind: 'diet' | 'training') => void;
};
export const compactDate = (d: string) => d.slice(5).replace('-', '/');
export const numeric = (n: number | null | undefined, digits = 1) =>
  n == null ? '—' : Number(n.toFixed(digits)).toLocaleString('zh-CN');
const strengthStages = [
  '整装出发',
  '舒展肩背',
  '稳稳下蹲',
  '踮脚平衡',
  '弓步启程',
  '弹力舒展',
  '握住力量',
  '从容弯举',
  '抱铃蓄力',
  '稳稳托举',
  '向上推举',
  '扎实提铃',
  '初握杠铃',
  '挺胸承重',
  '宽站稳持',
  '稳步负重',
  '弓步进阶',
  '单侧掌控',
  '从容持杠',
  '力量自如',
];
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
                ? '记一餐'
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
}: {
  points: { date: string; value: number | null; mean?: number | null }[];
  color: string;
  unit: string;
  mean?: boolean;
  minimumSpan?: boolean;
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
            connectNulls={false}
            isAnimationActive={false}
          />
          {mean && (
            <Line
              dataKey="mean"
              stroke={color}
              strokeWidth={3}
              dot={false}
              connectNulls={false}
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
  const waist = rows.find((r) => (r.data as Body).waist !== null),
    fat = rows.find((r) => (r.data as Body).bodyFat !== null);
  const points = bodyPoints(
      records,
      date,
      Number(period),
      metric,
      metric === 'bmi' || morningOnly,
      props.height,
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
    ),
    selectedSummary = nutritionSummary(selectedFoods);
  const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  return (
    <Panel
      kind="diet"
      title="饮食"
      subtitle="吃得明白，记录轻松"
      active={props.module === 'diet'}
      disabled={!ready || date > today()}
      action={() => edit('diet', row, meal)}
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
            {slots.map((slot) => (
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
                <small>{loggedSlots.has(slot) ? '已记录' : '待记录'}</small>
              </button>
            ))}
          </div>
          {loggedSlots.has('unsorted') && (
            <button className="text-button" onClick={() => setMeal('unsorted')}>
              查看未分餐旧记录
            </button>
          )}
          <div className="plate-detail" key={date + meal}>
            <div className="section-heading plate-meal-heading">
              <strong>{mealLabels[meal]}</strong>
              <span className="plate-energy">
                {selectedFoods.length ? (
                  <>
                    <b>{numeric(selectedSummary.total.energy, 0)}</b>
                    <small>
                      大卡
                      {selectedSummary.known.energy < selectedSummary.count
                        ? '（部分）'
                        : ''}
                    </small>
                  </>
                ) : (
                  '还没记'
                )}
              </span>
            </div>
            {selectedFoods.map((food, i) => (
              <div className="plate-food" key={i}>
                <div className="plate-food-description">
                  <strong>{displayFoodName(food)}</strong>
                  <small>
                    {food.grams}g ·{' '}
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
            {!selectedFoods.length && (
              <p className="empty-inline">记下吃了什么，系统帮你算好营养。</p>
            )}
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
          </div>
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
        USDA 每 100g 数据换算，无需模型。{!target && '先设置营养目标即可查看。'}
      </p>
    </div>
  );
}
export function TrainingPanel(props: PanelProps) {
  const { records, plans, date, ready, edit, history, plan } = props,
    [selected, setSelected] = useState(''),
    [group, setGroup] = useState('');
  const overview = strengthOverview(records, date),
    allExercises = exerciseCatalog(records, date),
    catalog = allExercises.filter((e) => strengthGroup(e) === group),
    exercise = catalog.find((e) => exerciseKey(e) === selected) ?? catalog[0];
  const timeline = exercise
      ? exerciseTimeline(records, exerciseKey(exercise), date)
      : [],
    last = timeline.at(-1),
    first = timeline[0];
  const cp = activePlan(plans, 'training', date),
    target = (cp?.data as TrainingPlan) ?? trainingDraft;
  const sessions = records.filter(
      (r) => r.kind === 'training' && r.date <= date,
    ),
    rows = sessions.filter((r) => r.date === date),
    latest = sessions.find((r) => (r.data as Training).status === 'completed');
  const growth = strengthGrowth(overview);
  const bodyOnly = exercise
    ? exerciseDefinition(exercise)?.bodyOnly ||
      (exercise.load === 'bodyweight' &&
        timeline.every((t) =>
          workingSets(t.exercise).every((s) => s.weight === 0),
        ))
    : false;
  const result = (point: (typeof timeline)[number]) =>
    bodyOnly
      ? Math.max(...workingSets(point.exercise).map((s) => s.reps!))
      : point.best;
  const unit = bodyOnly ? '次' : 'kg';
  const points = timeline
    .slice(-12)
    .map((p) => ({ date: p.entry.date, value: result(p) }));
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
          <div className="training-empty">
            <Dumbbell size={24} />
            <strong>
              {schedule === 'rest'
                ? '今天，留一点时间恢复'
                : '训练过的每一组，都值得记下来'}
            </strong>
            <p>
              {latest
                ? `上次训练在 ${compactDate(latest.date)}，可在记录时复用动作。`
                : '添加第一个动作，建立你的能力基线。'}
            </p>
          </div>
        )}
      </section>
      <div
        className="strength-overview summary-block"
        data-annotate="training.strength"
      >
        <SectionTitle
          aside={<span className="subtle">个人参考 · 首次 100</span>}
        >
          我的力量值
        </SectionTitle>
        <div className="strength-growth" data-annotate="training.avatar">
          <Image
            key={growth.level}
            src={`/strength-avatar/level-${String(growth.level).padStart(2, '0')}.png`}
            alt={`力量成长第 ${growth.level} 级形象`}
            aria-label={`力量成长第 ${growth.level} 级 · ${strengthStages[growth.level - 1]}`}
            sizes="160px"
            width={144}
            height={144}
          />
          <div className="strength-growth-copy">
            <span>力量成长 · {strengthStages[growth.level - 1]}</span>
            <strong>
              Lv. {growth.level}
              <small> / 20</small>
            </strong>
            <p>
              {growth.baselines === 0
                ? '从第一份力量基线开始'
                : growth.level === 20
                  ? '20 级形象全部解锁'
                  : `再积累 ${growth.next} 点进步，解锁新形象`}
            </p>
            <progress
              max={10}
              value={growth.fraction * 10}
              aria-label="下一级力量成长进度"
            />
            <small>{growth.baselines}/6 个部位已建立参照</small>
          </div>
        </div>
        <div className="strength-body-grid">
          {overview.map((part) => {
            const count = allExercises.filter(
              (e) => strengthGroup(e) === part.group,
            ).length;
            return (
              <button
                key={part.group}
                data-annotate={`training.group.${part.group}`}
                aria-expanded={group === part.group}
                aria-controls="strength-exercise-detail"
                className={group === part.group ? 'selected' : ''}
                onClick={() => {
                  setGroup(group === part.group ? '' : part.group);
                  setSelected('');
                }}
              >
                <span>
                  {part.group}
                  <ChevronRight
                    size={12}
                    className={group === part.group ? 'rotate-90' : ''}
                  />
                </span>
                <strong>{part.stale ? '—' : (part.score ?? 100)}</strong>
                <small>
                  {part.stale
                    ? '参照待更新'
                    : part.score === null
                      ? count
                        ? '初始值 · 待参照'
                        : '初始值'
                      : part.baseline
                        ? '基线已建立'
                        : `${part.score >= 100 ? '+' : ''}${part.score - 100}% 较首次`}
                </small>
              </button>
            );
          })}
        </div>
        {allExercises.some((e) => !exerciseDefinition(e)) && (
          <button
            className="text-button"
            aria-expanded={group === '其他'}
            onClick={() => {
              setGroup(group === '其他' ? '' : '其他');
              setSelected('');
            }}
          >
            其他历史动作 <ChevronRight size={13} />
          </button>
        )}
        <details className="strength-method">
          <summary>力量值与等级怎么算？</summary>
          <p>
            没有可比数据时，100 只是初始值。各部位相对首次的历史最佳正向增长，每
            1 个百分点积累 1 点进步；合计每 10 点升一级，最高 20
            级。新增部位的首次记录不加分。等级保留已达到的进步，不因短期状态下降或漏记降级；历史更正、删除会重新计算。
          </p>
          <p>
            每个部位固定使用最早有可比数据的动作作为参照。首次记为
            100，以后比较同一动作的重量与次数估算；新增动作和多做几组不会自动加分。
          </p>
          <p>
            仅使用已完成、非热身、1～10 次的外部负重组。以 Brzycki
            公式折算：重量 ÷ (1.0278 − 0.0278 ×
            次数)，再计算与首次的比例。自重动作、只有额外负重的数据及高次数组保留明细，不强行估算；参照超过
            28 天显示“待更新”。
          </p>
          <p>
            这是个人训练表现的参考，不是部位的真实力量或人群排名。没有采集力竭程度、动作质量和器械型号；请保持动作幅度与器械一致。历史更正或删除会重新计算基线。
          </p>
          <a
            href="https://www.unm.edu/~rrobergs/478PredictionAccuracy.pdf"
            target="_blank"
            rel="noreferrer"
          >
            了解估算方法与局限 ↗
          </a>
        </details>
        <details className="strength-journey" data-annotate="training.levels">
          <summary>查看 20 级成长形象</summary>
          <div className="strength-avatar-gallery">
            {strengthStages.map((stage, index) => (
              <figure
                key={stage}
                className={index < growth.level ? 'unlocked' : ''}
              >
                <Image
                  src={`/strength-avatar/level-${String(index + 1).padStart(2, '0')}.png`}
                  alt={stage}
                  aria-label={`力量成长第 ${index + 1} 级 · ${stage}`}
                  sizes="96px"
                  width={96}
                  height={96}
                  loading="lazy"
                />
                <figcaption>
                  <strong>Lv. {index + 1}</strong>
                  <span>{stage}</span>
                  <small>{index < growth.level ? '已解锁' : '待解锁'}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
      </div>
      {group && (
        <div
          className="strength-exercise-detail chart-card"
          id="strength-exercise-detail"
        >
          <SectionTitle
            aside={<span className="subtle">{catalog.length} 个动作</span>}
          >
            {group} · 动作明细
          </SectionTitle>
          {(() => {
            const part = overview.find((p) => p.group === group);
            return (
              part?.reference && (
                <p className="strength-reference">
                  参照：{part.reference.name} ·{' '}
                  {part.first ? compactDate(part.first.date) : ''} 建立
                  {part.last ? ` · 最近 ${compactDate(part.last.date)}` : ''}
                  {part.stale ? ` · 上次指数 ${part.previousScore}` : ''}
                </p>
              )
            );
          })()}
          {exercise && last ? (
            <>
              <label className="exercise-select">
                <select
                  aria-label="选择查看能力变化的动作"
                  value={exerciseKey(exercise)}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {catalog.map((e) => (
                    <option value={exerciseKey(e)} key={exerciseKey(e)}>
                      {e.name} ·{' '}
                      {exerciseDefinition(e)?.weightLabel ?? loadLabels[e.load]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="exercise-detail-stat">
                <strong>
                  {numeric(result(last))}
                  <small>{unit}</small>
                </strong>
                <span>
                  {bodyOnly ? '最近单组最多次数' : '最近最重工作组'}
                  <small>
                    首次 {numeric(result(first))} {unit} · 共 {timeline.length}{' '}
                    次记录
                  </small>
                </span>
              </div>
              <TrendChart points={points} color="#e38a16" unit={unit} />
              <p className="helper">
                {bodyOnly
                  ? '相同动作下比较单组次数，保持动作幅度与标准一致。'
                  : '展示每次最重工作组。每次次数可能不同，重量变化不直接等于力量增长。'}
              </p>
            </>
          ) : (
            <p className="empty-inline">
              这个部位还没有可展示的工作组。保存训练后，动作明细会出现在这里。
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
