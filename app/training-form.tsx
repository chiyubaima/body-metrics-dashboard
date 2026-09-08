'use client';
import { useState, type SubmitEvent } from 'react';
import { Copy, Plus, Search, Trash2, ChevronDown, Trophy } from 'lucide-react';
import type {
  CardioActivity,
  Entry,
  Exercise,
  Training,
  WorkoutSet,
} from '@/lib/model';
import {
  exerciseKey,
  exerciseTimeline,
  workingSets,
  cardioEntries,
  workoutAchievements,
} from '@/lib/progress';
import {
  exerciseDefinition,
  resistanceExercises,
  exerciseGroups,
  cardioTypes,
} from '@/lib/exercises';
import type { ExerciseDefinition } from '@/lib/exercises';
import { Choices, Field } from './form-controls';
import { DatePicker } from './calendar';
import type { Save } from './forms';
import { compactDate, numeric } from './panels';
function newSet(
  weight: number | null = null,
  reps: number | null = null,
): WorkoutSet {
  return {
    id: crypto.randomUUID(),
    weight,
    reps,
    completed: true,
    warmup: false,
  };
}
function repeatedValue(sets: WorkoutSet[], key: 'weight' | 'reps') {
  return sets.every((s) => s[key] === sets[0][key]) ? (sets[0][key] ?? '') : '';
}
export function TrainingForm({
  existing,
  date,
  records,
  save,
  busy,
  onDirty,
}: {
  existing?: Entry;
  date: string;
  records: Entry[];
  save: Save;
  busy: boolean;
  onDirty: () => void;
}) {
  const original = existing?.data as Training | undefined;
  const [id] = useState(() => existing?.id ?? crypto.randomUUID()),
    [recordDate, setRecordDate] = useState(existing?.date ?? date),
    [type, setType] = useState<Training['type']>(
      original?.type ?? 'resistance',
    );
  const [exercises, setExercises] = useState<Exercise[]>(() =>
      structuredClone(original?.exercises ?? []),
    ),
    [minutes, setMinutes] = useState(original?.minutes?.toString() ?? ''),
    [details, setDetails] = useState(original?.details ?? ''),
    [content, setContent] = useState(original?.content ?? ''),
    [cardioActivities, setCardioActivities] = useState<CardioActivity[]>(() =>
      original ? structuredClone(cardioEntries(original)) : [],
    ),
    [cardioPicker, setCardioPicker] = useState(
      !original || !cardioEntries(original).length,
    ),
    [cardioQuery, setCardioQuery] = useState(''),
    [error, setError] = useState(''),
    [feedback, setFeedback] = useState(''),
    [picker, setPicker] = useState(!original?.exercises?.length),
    [query, setQuery] = useState(''),
    [group, setGroup] = useState('全部'),
    [gear, setGear] = useState('全部器械'),
    [expanded, setExpanded] = useState<string[]>([]);
  const prior = records.filter(
    (r) =>
      r.id !== id &&
      (r.date < recordDate ||
        (r.date === recordDate &&
          (!existing || r.createdAt < existing.createdAt))),
  );
  const last = prior.find(
    (r) =>
      r.kind === 'training' &&
      (r.data as Training).type === 'resistance' &&
      (r.data as Training).status === 'completed' &&
      (r.data as Training).exercises?.some((e) => workingSets(e).length),
  );
  const options = resistanceExercises.filter(
    (e) =>
      (group === '全部' || e.group === group) &&
      (gear === '全部器械' || e.equipment === gear) &&
      (!query ||
        [e.name, ...e.aliases].some((n) =>
          n.toLowerCase().includes(query.toLowerCase()),
        )),
  );
  const candidate: Training = {
    type,
    status:
      type === 'rest'
        ? 'rest'
        : original?.status === 'missed'
          ? 'missed'
          : 'completed',
    minutes:
      type === 'cardio' && cardioActivities.length
        ? cardioActivities.reduce(
            (sum, activity) => sum + (activity.minutes ?? 0),
            0,
          )
        : minutes
          ? Number(minutes)
          : null,
    content:
      type === 'cardio'
        ? cardioActivities.length > 1
          ? '有氧训练'
          : (cardioTypes.find((c) => c.id === cardioActivities[0]?.catalogId)
              ?.name ?? content)
        : content,
    details,
    ...(type === 'resistance' ? { exercises } : {}),
    ...(type === 'cardio' && cardioActivities.length
      ? { cardioActivities }
      : {}),
  };
  const legacyCardio =
    original?.type === 'cardio' && !cardioEntries(original).length;
  const wins = workoutAchievements(
    {
      id,
      kind: 'training',
      date: recordDate,
      data: candidate,
      primaryMorning: 0,
      planId: null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    records,
  );
  function changeExercise(index: number, fn: (e: Exercise) => Exercise) {
    setExercises((old) => old.map((e, i) => (i === index ? fn(e) : e)));
    onDirty();
  }
  function updateAll(index: number, key: 'weight' | 'reps', value: string) {
    changeExercise(index, (e) => ({
      ...e,
      sets: e.sets.map((s) => ({
        ...s,
        [key]: value === '' ? null : Number(value),
      })),
    }));
  }
  function setCount(index: number, value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 40) return;
    changeExercise(index, (e) => ({
      ...e,
      sets: Array.from(
        { length: value },
        (_, i) =>
          e.sets[i] ??
          newSet(e.sets.at(-1)?.weight ?? null, e.sets.at(-1)?.reps ?? null),
      ),
    }));
  }
  function add(def: ExerciseDefinition) {
    if (exercises.length >= 20) {
      setError('一次最多20个动作。');
      return;
    }
    if (exercises.some((e) => exerciseKey(e) === exerciseKey(def))) {
      setFeedback('已在列表中，直接修改组数即可。');
      return;
    }
    // Past numbers are references, never assumed to be today's performed load/reps.
    setExercises((old) => [
      ...old,
      {
        catalogId: def.id,
        name: def.name,
        load: def.load,
        sets: [newSet(def.bodyOnly ? 0 : null)],
      },
    ]);
    setQuery('');
    setPicker(false);
    setFeedback(`已加入${def.name}，填写这次实际完成的组。`);
    onDirty();
  }
  function reuseLast() {
    if (!last) return;
    setExercises(
      ((last.data as Training).exercises ?? [])
        .filter((e) => workingSets(e).length)
        .map((e) => {
          const def = exerciseDefinition(e);
          return {
            ...e,
            ...(def ? { catalogId: def.id } : {}),
            sets: workingSets(e).map(() => newSet(def?.bodyOnly ? 0 : null)),
          };
        }),
    );
    setPicker(false);
    setFeedback(
      `已带入 ${compactDate(last.date)} 的动作与组数，填入今天实际重量和次数。`,
    );
    onDirty();
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (type === 'resistance' && !exercises.length && !original) {
      setError('先选择一个动作，填写实际完成的重量、组数和次数。');
      return;
    }
    if (type === 'cardio' && !cardioActivities.length && !legacyCardio) {
      setError('从运动目录选择这次有氧类型。');
      return;
    }
    if (
      type === 'cardio' &&
      candidate.status === 'completed' &&
      cardioActivities.some(
        (a) =>
          a.minutes === null ||
          !Number.isFinite(a.minutes) ||
          a.minutes < 1 ||
          a.minutes > 600,
      )
    ) {
      setError('请填写每个有氧项目的实际分钟数（1～600）。');
      return;
    }
    if (
      type === 'cardio' &&
      candidate.minutes !== null &&
      candidate.minutes > 600
    ) {
      setError('一次训练的总时长不能超过 600 分钟。');
      return;
    }
    const invalid =
      type === 'resistance'
        ? exercises.find((e) =>
            e.sets.some(
              (s) =>
                s.completed &&
                (s.weight === null ||
                  s.reps === null ||
                  s.reps < 1 ||
                  !Number.isInteger(s.reps)),
            ),
          )
        : undefined;
    if (invalid) {
      setError(`请补全${invalid.name}的重量和每组次数。`);
      return;
    }
    try {
      await save('/api/records', {
        id,
        kind: 'training',
        date: recordDate,
        data: candidate,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，训练明细已保留。');
    }
  }
  return (
    <form
      className="dialog-body compact-workout"
      data-record-date={recordDate}
      onSubmit={submit}
      onChange={onDirty}
    >
      <div className="workout-top">
        <div className="field">
          <span>
            训练日期 <em>*</em>
          </span>
          <DatePicker
            value={recordDate}
            onChange={(d) => {
              setRecordDate(d);
              onDirty();
            }}
          />
        </div>
        <div>
          <span className="field-label">
            训练类型 <em>*</em>
          </span>
          <Choices
            label="训练类型"
            value={type}
            options={[
              ['resistance', '抗阻'],
              ['cardio', '有氧'],
              ['rest', '休息'],
            ]}
            onChange={(v) => {
              setType(v as Training['type']);
              onDirty();
            }}
          />
        </div>
      </div>
      <div className="workout-meta" data-annotate="form.training.details">
        {(type === 'resistance' ||
          (type === 'cardio' && legacyCardio && !cardioActivities.length)) && (
          <div className="form-grid workout-extras">
            <Field
              label={
                type === 'cardio' ? '运动时长 · 分钟 *' : '训练时长 · 分钟'
              }
            >
              <input
                type="number"
                min={1}
                max={600}
                required={type === 'cardio' && candidate.status === 'completed'}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </Field>
            {type === 'resistance' && (
              <Field label="这次训练的名称">
                <input
                  value={content}
                  maxLength={200}
                  placeholder="例如：上肢训练"
                  onChange={(e) => setContent(e.target.value)}
                />
              </Field>
            )}
          </div>
        )}
        <Field label="训练感受">
          <textarea
            rows={1}
            className="workout-feeling"
            value={details}
            maxLength={2000}
            placeholder="状态、动作调整，或者想留给下次的一句话"
            onChange={(e) => setDetails(e.target.value)}
          />
        </Field>
      </div>
      {type === 'resistance' && (
        <>
          <div className="workout-toolbar">
            <strong>{exercises.length} 个动作</strong>
            <div>
              {last && !exercises.length && (
                <button
                  type="button"
                  className="text-button"
                  onClick={reuseLast}
                >
                  <Copy size={15} />
                  复用上次动作
                </button>
              )}
              <button
                type="button"
                className="secondary small"
                onClick={() => setPicker(!picker)}
                aria-expanded={picker}
              >
                <Plus size={17} />
                添加动作
              </button>
            </div>
          </div>
          {picker && (
            <section className="exercise-picker">
              <div className="exercise-search-line">
                <Search size={18} />
                <input
                  aria-label="搜索规范训练动作"
                  value={query}
                  placeholder="搜卧推、深蹲、划船…"
                  onChange={(e) => {
                    e.stopPropagation();
                    setQuery(e.target.value);
                  }}
                />
                <select
                  aria-label="按器械筛选"
                  value={gear}
                  onChange={(e) => setGear(e.target.value)}
                >
                  {[
                    '全部器械',
                    ...new Set(resistanceExercises.map((e) => e.equipment)),
                  ].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="exercise-group-tabs">
                {['全部', ...exerciseGroups].map((g) => (
                  <button
                    type="button"
                    key={g}
                    className={group === g ? 'selected' : ''}
                    onClick={() => setGroup(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="exercise-picker-list">
                {options.map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    disabled={
                      busy ||
                      exercises.some((x) => exerciseKey(x) === exerciseKey(e))
                    }
                    onClick={() => add(e)}
                  >
                    <span>
                      <b>{e.name}</b>
                      <small>
                        {e.group} · {e.equipment}
                      </small>
                    </span>
                    <Plus size={16} />
                  </button>
                ))}
                {!options.length && (
                  <p className="empty-note">
                    换一个肌群或器械，试试动作的常用名称。
                  </p>
                )}
              </div>
              <p className="helper">
                {resistanceExercises.length} 个规范动作 · 按肌群和器械归类
              </p>
            </section>
          )}
          {feedback && <output className="inline-feedback">{feedback}</output>}
          <div className="workout-matrix">
            <div className="matrix-head">
              <span>动作 / 上次参照</span>
              <span>重量 kg</span>
              <span>组数</span>
              <span>每组次数</span>
              <span />
            </div>
            {exercises.map((exercise, ei) => {
              const def = exerciseDefinition(exercise),
                previous = exerciseTimeline(
                  prior,
                  exerciseKey(exercise),
                  recordDate,
                ).at(-1)?.exercise,
                previousSets = previous ? workingSets(previous) : [],
                key = exerciseKey(exercise),
                isExpanded = expanded.includes(key),
                special = exercise.sets.some((s) => s.warmup || !s.completed),
                different = exercise.sets.some(
                  (s) =>
                    s.weight !== exercise.sets[0].weight ||
                    s.reps !== exercise.sets[0].reps,
                );
              return (
                <section className="matrix-exercise" key={key}>
                  <div className="matrix-row">
                    <div className="matrix-name">
                      <strong>{exercise.name}</strong>
                      <small>{def?.weightLabel ?? '历史重量口径'}</small>
                      <p>
                        {previousSets.length
                          ? `上次 ${previousSets.map((s) => `${numeric(s.weight)}×${s.reps}`).join(' / ')}`
                          : '第一次，为下次建立参照'}
                      </p>
                    </div>
                    <label className="matrix-input">
                      <span className="sr-only">
                        {exercise.name}
                        {def?.weightLabel ?? '重量'}
                      </span>
                      {def?.bodyOnly ? (
                        <span className="bodyweight-label">自重</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          step="any"
                          value={repeatedValue(exercise.sets, 'weight')}
                          placeholder={different ? '各组不同' : 'kg'}
                          disabled={special || busy}
                          onChange={(e) =>
                            updateAll(ei, 'weight', e.target.value)
                          }
                        />
                      )}
                    </label>
                    <label className="matrix-input">
                      <span className="sr-only">{exercise.name}组数</span>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        step={1}
                        value={exercise.sets.length}
                        disabled={special || busy}
                        onChange={(e) => setCount(ei, Number(e.target.value))}
                      />
                    </label>
                    <label className="matrix-input">
                      <span className="sr-only">{exercise.name}每组次数</span>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        step={1}
                        value={repeatedValue(exercise.sets, 'reps')}
                        placeholder={different ? '各组不同' : '次'}
                        disabled={special || busy}
                        onChange={(e) => updateAll(ei, 'reps', e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`移除动作${exercise.name}`}
                      disabled={busy}
                      onClick={() => {
                        setExercises((old) => old.filter((_, i) => i !== ei));
                        onDirty();
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="matrix-row-footer">
                    <span>
                      {def?.hint ??
                        '保留旧记录的名称和重量口径，未推断为新动作。'}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      aria-expanded={isExpanded || special}
                      onClick={() =>
                        setExpanded((old) =>
                          old.includes(key)
                            ? old.filter((k) => k !== key)
                            : [...old, key],
                        )
                      }
                    >
                      {different || special ? '各组明细' : '各组不同？'}
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  {(isExpanded || special) && (
                    <div className="individual-sets">
                      {exercise.sets.map((set, si) => (
                        <div className="individual-set" key={set.id}>
                          <b>第 {si + 1} 组</b>
                          {def?.bodyOnly ? (
                            <span>自重</span>
                          ) : (
                            <label>
                              <input
                                aria-label={`${exercise.name}第${si + 1}组重量`}
                                type="number"
                                min={0}
                                max={1000}
                                step="any"
                                value={set.weight ?? ''}
                                onChange={(e) =>
                                  changeExercise(ei, (x) => ({
                                    ...x,
                                    sets: x.sets.map((s, i) =>
                                      i === si
                                        ? {
                                            ...s,
                                            weight:
                                              e.target.value === ''
                                                ? null
                                                : Number(e.target.value),
                                          }
                                        : s,
                                    ),
                                  }))
                                }
                              />
                              kg
                            </label>
                          )}
                          <label>
                            <input
                              aria-label={`${exercise.name}第${si + 1}组次数`}
                              type="number"
                              min={1}
                              max={200}
                              step={1}
                              value={set.reps ?? ''}
                              onChange={(e) =>
                                changeExercise(ei, (x) => ({
                                  ...x,
                                  sets: x.sets.map((s, i) =>
                                    i === si
                                      ? {
                                          ...s,
                                          reps:
                                            e.target.value === ''
                                              ? null
                                              : Number(e.target.value),
                                        }
                                      : s,
                                  ),
                                }))
                              }
                            />
                            次
                          </label>
                          <small>
                            {set.warmup
                              ? '热身 · 不计纪录'
                              : !set.completed
                                ? '旧记录未完成'
                                : '工作组'}
                          </small>
                        </div>
                      ))}
                      {special && (
                        <p className="helper">
                          旧记录中的热身、未完成组保持原状态，不会自动计入成绩。
                        </p>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
            {!exercises.length && !picker && (
              <p className="empty-note">
                选择动作后，就能在同一张表里记完这次训练。
              </p>
            )}
          </div>
          {wins.length > 0 && (
            <div className="workout-win-preview">
              <Trophy size={20} />
              <span>
                {wins[0].name} · {wins[0].label}
                <small>{wins[0].detail} · 保存后记入成绩</small>
              </span>
            </div>
          )}
          <section className="catalog-source">
            <h4>动作目录的参考来源</h4>
            <p>
              依据《施瓦辛格健身全书》公开目录的分部位组织方式，并参考 ACE
              动作库整理名称与器械分类；这是本产品的记录目录，不是书中训练方案的复刻。
            </p>
            <a
              href="https://books.google.com/books?id=D-_-St_TPfIC"
              target="_blank"
              rel="noreferrer"
            >
              书籍公开目录
            </a>{' '}
            ·{' '}
            <a
              href="https://www.acefitness.org/resources/everyone/exercise-library/"
              target="_blank"
              rel="noreferrer"
            >
              ACE 动作库
            </a>
          </section>
        </>
      )}
      {type === 'cardio' && (
        <section
          className="cardio-workout"
          data-annotate="form.training.cardio"
        >
          <div className="workout-toolbar">
            <strong>{cardioActivities.length} 个项目</strong>
            <button
              type="button"
              className="secondary small"
              aria-expanded={cardioPicker}
              onClick={() => setCardioPicker(!cardioPicker)}
            >
              <Plus size={17} />
              添加项目
            </button>
          </div>
          {cardioPicker && (
            <div className="cardio-picker exercise-picker">
              <div className="exercise-search-line">
                <Search size={17} />
                <input
                  aria-label="搜索有氧项目"
                  placeholder="搜索跑步、单车、游泳…"
                  value={cardioQuery}
                  onChange={(e) => {
                    e.stopPropagation();
                    setCardioQuery(e.target.value);
                  }}
                />
              </div>
              {[...new Set(cardioTypes.map((c) => c.group))].map((group) => {
                const options = cardioTypes.filter(
                  (c) =>
                    c.group === group && c.name.includes(cardioQuery.trim()),
                );
                return (
                  options.length > 0 && (
                    <div key={group}>
                      <h4>{group}</h4>
                      <div>
                        {options.map((c) => {
                          const selected = cardioActivities.some(
                            (a) => a.catalogId === c.id,
                          );
                          return (
                            <button
                              type="button"
                              key={c.id}
                              aria-pressed={selected}
                              className={selected ? 'selected' : ''}
                              disabled={
                                selected || cardioActivities.length >= 30
                              }
                              onClick={() => {
                                setCardioActivities((rows) => [
                                  ...rows,
                                  { catalogId: c.id, minutes: null },
                                ]);
                                setCardioPicker(false);
                                setCardioQuery('');
                                onDirty();
                              }}
                            >
                              {c.name}
                              {selected ? ' · 已添加' : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                );
              })}
              {!cardioTypes.some((c) =>
                c.name.includes(cardioQuery.trim()),
              ) && (
                <p className="helper">没有找到这个项目，试试“跑步”或“游泳”。</p>
              )}
            </div>
          )}
          {cardioActivities.length > 0 && (
            <div className="cardio-matrix">
              <div className="cardio-matrix-head">
                <span>运动项目</span>
                <span>时长 · 分钟 *</span>
                <span />
              </div>
              {cardioActivities.map((activity, index) => {
                const definition = cardioTypes.find(
                  (c) => c.id === activity.catalogId,
                )!;
                return (
                  <div className="cardio-matrix-row" key={activity.catalogId}>
                    <div>
                      <strong>{definition.name}</strong>
                      <small>{definition.group}</small>
                    </div>
                    <label className="matrix-input">
                      <input
                        aria-label={`${definition.name}时长（分钟）`}
                        type="number"
                        min={1}
                        max={600}
                        step="any"
                        required={candidate.status === 'completed'}
                        disabled={candidate.status === 'missed'}
                        value={activity.minutes ?? ''}
                        placeholder="分钟"
                        onChange={(e) => {
                          setCardioActivities((rows) =>
                            rows.map((a, i) =>
                              i === index
                                ? {
                                    ...a,
                                    minutes:
                                      e.target.value === ''
                                        ? null
                                        : Number(e.target.value),
                                  }
                                : a,
                            ),
                          );
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`移除${definition.name}`}
                      onClick={() => {
                        setCardioActivities((rows) =>
                          rows.filter((_, i) => i !== index),
                        );
                        if (cardioActivities.length === 1)
                          setCardioPicker(true);
                        onDirty();
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              {candidate.status === 'completed' && (
                <output className="cardio-total" aria-live="polite">
                  <span>
                    合计
                    {cardioActivities.some((a) => a.minutes === null)
                      ? ' · 时长待填完'
                      : ''}
                  </span>
                  <strong>
                    {numeric(candidate.minutes)}
                    <small> 分钟</small>
                  </strong>
                </output>
              )}
            </div>
          )}
          {legacyCardio && !cardioActivities.length && (
            <p className="legacy-note">
              原记录：{original.content || '有氧训练'}
              。可直接保留；选择目录项目后，将按新明细保存。
            </p>
          )}
          {!cardioActivities.length && !legacyCardio && !cardioPicker && (
            <p className="empty-note">添加运动项目，分别记下实际时长。</p>
          )}
          <a
            className="catalog-source"
            href="https://support.apple.com/zh-cn/105089"
            target="_blank"
            rel="noreferrer"
          >
            类型参考 Apple Watch 体能训练
          </a>
        </section>
      )}
      {original?.status === 'missed' && type !== 'rest' && (
        <p className="legacy-note">
          保留原来的“未完成”状态；本次编辑不自动将旧记录变成已完成。
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions workout-save">
        <button className="primary" disabled={busy}>
          {busy ? '正在保存…' : '保存这次记录'}
        </button>
      </div>
    </form>
  );
}
