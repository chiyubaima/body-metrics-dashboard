'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import { Check, Copy, Plus, Search, Trash2, Utensils } from 'lucide-react';
import type { Diet, Entry, Food, MealSlot, Nutrition } from '@/lib/model';
import { today } from '@/lib/model';
import { basisLabels, mealLabels, nutritionSummary } from '@/lib/progress';
import { DatePicker } from './calendar';
import { DeleteConfirm } from './delete-confirm';
import type { FoodMatch } from '@/lib/food-search';
import { Field } from './form-controls';
import type { Save } from './forms';
import { compactDate, numeric } from './panels';
import { MealIcon, MacroLine } from './nutrition';
import { displayFoodName } from '@/lib/food-labels';
export function MealForm({
  formId,
  existing,
  draft,
  date,
  records,
  meal,
  save,
  busy,
  onDirty,
}: {
  formId: string;
  existing?: Entry;
  draft?: Entry;
  date: string;
  records: Entry[];
  meal?: MealSlot;
  save: Save;
  busy: boolean;
  onDirty: () => void;
}) {
  const original = (draft ?? existing)?.data as Diet | undefined,
    [id] = useState(() => draft?.id ?? existing?.id ?? crypto.randomUUID());
  const [recordDate, setRecordDate] = useState(
      draft?.date ?? existing?.date ?? date,
    ),
    [slot, setSlot] = useState<MealSlot>(
      meal ??
        (original?.foods.length
          ? (original.foods[0].meal ?? 'unsorted')
          : 'lunch'),
    );
  const [foods, setFoods] = useState<Food[]>(() =>
      structuredClone(original?.foods ?? []),
    ),
    [note, setNote] = useState(original?.note ?? ''),
    [query, setQuery] = useState(''),
    [tab, setTab] = useState('library'),
    [results, setResults] = useState<FoodMatch[]>([]),
    [total, setTotal] = useState(0),
    [catalogCount, setCatalogCount] = useState(0),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(''),
    [hint, setHint] = useState(''),
    [basisFilter, setBasisFilter] = useState('all'),
    [offset, setOffset] = useState(0),
    [confirmDelete, setConfirmDelete] = useState(false),
    [error, setError] = useState(''),
    [feedback, setFeedback] = useState('');
  const visible = foods
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => (f.meal ?? 'unsorted') === slot),
    summary = nutritionSummary(visible.map((x) => x.f));
  const previous = records.find(
    (r) =>
      r.kind === 'diet' &&
      r.id !== existing?.id &&
      r.date <= recordDate &&
      (r.data as Diet).foods.some((f) => (f.meal ?? 'unsorted') === slot),
  );
  const recentMap = new Map<string, Food>();
  for (const row of records.filter(
    (r) => r.kind === 'diet' && r.date <= recordDate,
  )) {
    for (const food of (row.data as Diet).foods) {
      const key =
        (food.fdcId ?? food.originalName ?? food.name) + ':' + food.basis;
      if (!recentMap.has(key)) recentMap.set(key, food);
    }
  }
  const recent = [...recentMap.values()].slice(0, 16);
  useEffect(() => {
    if (tab === 'recent' && !query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const response = await fetch(
          `/api/foods?q=${encodeURIComponent(query)}&basis=${basisFilter}&offset=${offset}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as {
          error?: string;
          foods: FoodMatch[];
          total: number;
          catalogCount: number;
          hint: string;
        };
        if (!response.ok) throw new Error(result.error);
        setResults(result.foods);
        setTotal(result.total);
        setCatalogCount(result.catalogCount);
        setHint(result.hint);
      } catch (e) {
        if (!controller.signal.aborted)
          setSearchError(
            e instanceof Error ? e.message : '食物库暂时无法读取，请重新搜索。',
          );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, tab, basisFilter, offset]);
  const options: Food[] = tab === 'recent' && !query ? recent : results;
  const update = (index: number, change: Partial<Food>) => {
    setFoods((rows) =>
      rows.map((f, i) => (i === index ? { ...f, ...change } : f)),
    );
    onDirty();
  };
  function add(food: Food) {
    if (foods.length >= 60) {
      setError('一天最多记录60项食物。');
      return;
    }
    setFoods((rows) => [...rows, { ...structuredClone(food), meal: slot }]);
    setQuery('');
    setOffset(0);
    setFeedback(`${displayFoodName(food)}已加入，调整份量后保存`);
    onDirty();
  }
  function copyMeal() {
    if (!previous) return;
    const items = (previous.data as Diet).foods.filter(
      (f) => (f.meal ?? 'unsorted') === slot,
    );
    if (foods.length + items.length > 60) {
      setError('一天最多记录60项食物。');
      return;
    }
    setFoods((rows) => [...rows, ...structuredClone(items)]);
    setFeedback(
      `已带入 ${compactDate(previous.date)} 的${mealLabels[slot]}，按今天实际份量调整`,
    );
    onDirty();
  }
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const invalid = foods.find(
      (food) =>
        !food.name.trim() ||
        !Number.isFinite(food.grams) ||
        food.grams < 1 ||
        food.grams > 10000,
    );
    if (invalid) {
      setSlot(invalid.meal ?? 'unsorted');
      setError(
        `请补全「${invalid.name || '未命名食物'}」的名称与重量（1～10000g）。`,
      );
      return;
    }
    try {
      if (
        existing &&
        original?.status === 'logged' &&
        !foods.length &&
        !note.trim()
      ) {
        setConfirmDelete(true);
        return;
      }
      await save('/api/records', {
        id,
        kind: 'diet',
        date: recordDate,
        data: {
          status: original?.status ?? 'logged',
          foods,
          note,
          complete: false,
        },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '保存失败，食物已保留，请重试。',
      );
    }
  }
  return (
    <form
      id={formId}
      className="dialog-body meal-form"
      data-record-date={recordDate}
      onSubmit={submit}
      onChange={onDirty}
    >
      {error && (
        <p className="form-error record-form-error" role="alert">
          {error}
        </p>
      )}
      <DeleteConfirm
        count={confirmDelete ? 1 : 0}
        label="当天饮食"
        busy={busy}
        error={error}
        cancel={() => setConfirmDelete(false)}
        confirm={async () => {
          try {
            await save(
              '/api/records',
              { id, kind: 'diet', date: recordDate },
              'DELETE',
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : '删除失败。');
          }
        }}
      />
      <div className="meal-form-top" data-annotate="form.meal.date">
        <div className="field">
          <span>
            记录日期 <em>*</em>
          </span>
          <DatePicker
            value={recordDate}
            max={today()}
            disabled={!!existing}
            onChange={(d) => {
              setRecordDate(d);
              onDirty();
            }}
          />
        </div>
        <fieldset className="meal-tabs" aria-label="餐次">
          {(
            [
              'breakfast',
              'lunch',
              'dinner',
              'snack',
              ...(foods.some((f) => !f.meal || f.meal === 'unsorted')
                ? ['unsorted']
                : []),
            ] as MealSlot[]
          ).map((m) => (
            <button
              type="button"
              key={m}
              aria-pressed={m === slot}
              className={m === slot ? 'selected' : ''}
              onClick={() => {
                setSlot(m);
                setFeedback('');
              }}
            >
              <MealIcon meal={m} size={18} />
              {mealLabels[m]}
              {foods.some((f) => (f.meal ?? 'unsorted') === m) && <i />}
            </button>
          ))}
        </fieldset>
      </div>
      <div
        className="meal-live-summary"
        data-annotate="form.meal.summary"
        aria-live="polite"
      >
        <div className="meal-summary-caption">
          <strong>{mealLabels[slot]} · 已知估算</strong>
          <small>
            {summary.count} 项食物
            {Object.values(summary.known).some((n) => n < summary.count)
              ? ' · * 营养待补全'
              : ''}
          </small>
        </div>
        <div className="meal-summary-values">
          {(
            [
              ['energy', '热量', '大卡'],
              ['protein', '蛋白质', 'g'],
              ['carbs', '碳水', 'g'],
              ['fat', '脂肪', 'g'],
            ] as const
          ).map(([key, label, unit]) => (
            <span className={key} key={key}>
              <small>{label}</small>
              <strong>
                {numeric(summary.total[key], key === 'energy' ? 0 : 1)}
                <small>
                  {unit}
                  {summary.known[key] < summary.count ? '*' : ''}
                </small>
              </strong>
            </span>
          ))}
        </div>
      </div>
      <div className="meal-scroll-region" aria-label="食物库与本餐明细">
        <div className="meal-editor-grid" data-annotate="form.meal.foods">
          <section className="food-library" aria-label="食物库，可独立滚动">
            <div className="food-search">
              <Search size={18} />
              <input
                aria-label="搜索食物"
                placeholder="搜牛肉、米饭、酱牛肉…"
                value={query}
                onChange={(e) => {
                  e.stopPropagation();
                  setQuery(e.target.value);
                  setResults([]);
                  setSearching(true);
                  setOffset(0);
                  setTab('library');
                }}
                maxLength={80}
              />
            </div>
            <div className="library-tabs">
              <button
                type="button"
                className={tab === 'recent' ? 'selected' : ''}
                onClick={() => setTab('recent')}
              >
                最近吃过
              </button>
              <button
                type="button"
                className={tab === 'library' ? 'selected' : ''}
                onClick={() => setTab('library')}
              >
                USDA 食物库
              </button>
            </div>
            <details className="library-sources">
              <summary>营养数据来源 · 未知项留空</summary>
              <p>
                <a
                  href="https://fdc.nal.usda.gov/"
                  target="_blank"
                  rel="noreferrer"
                >
                  USDA FoodData Central
                </a>{' '}
                提供参考值；按实际份量计算，可根据包装标签更正。
              </p>
              {[
                ...new Map(
                  [...foods, ...options]
                    .filter((f) => f.fdcId && f.source?.startsWith('USDA FDC '))
                    .map((f) => [f.fdcId, f]),
                ).values(),
              ].map((f) => (
                <a
                  key={f.fdcId}
                  href={`https://fdc.nal.usda.gov/food-details/${f.fdcId}/nutrients`}
                  target="_blank"
                  rel="noreferrer"
                  title={f.originalName}
                >
                  {displayFoodName(f)} ↗
                </a>
              ))}
            </details>
            {tab === 'recent' && !recent.length && (
              <p className="helper library-hint">
                常吃的食物会自动留在这里。先从下面选一种。
              </p>
            )}
            {(tab === 'library' || query) && (
              <>
                <div className="library-basis">
                  {[
                    ['all', '全部'],
                    ['raw', '生食材'],
                    ['cooked', '熟食'],
                  ].map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      className={basisFilter === key ? 'selected' : ''}
                      onClick={() => {
                        setBasisFilter(key);
                        setOffset(0);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="food-match-hint">{hint}</p>
                <p className="helper">
                  {searching
                    ? '正在找食物…'
                    : `找到 ${total.toLocaleString()} 项 · 本机 ${catalogCount.toLocaleString()} 项`}
                </p>
                {searchError && (
                  <p className="form-error" role="alert">
                    {searchError}
                  </p>
                )}
              </>
            )}
            <div className="food-options" aria-busy={searching}>
              {options.map((f, i) => (
                <button
                  type="button"
                  key={f.name + i}
                  className="food-option"
                  onClick={() => add(f)}
                  disabled={busy || foods.length >= 60 || searching}
                >
                  <span>
                    <strong>{displayFoodName(f)}</strong>
                    {f.originalName && (
                      <small
                        className="original-food-name"
                        title={f.originalName}
                      >
                        {f.originalName}
                      </small>
                    )}
                    <small>
                      {basisLabels[f.basis]} · {numeric(f.nutrition?.energy, 0)}{' '}
                      大卡 / 100g
                    </small>
                    <MacroLine foods={[f]} per100 />
                  </span>
                  <Plus size={18} />
                </button>
              ))}
              {!options.length && (
                <p className="empty-note">
                  {searching
                    ? '正在搜索…'
                    : tab === 'recent'
                      ? '记录后，常吃的食物会留在这里。'
                      : '试试主要食材，或英文名称。'}
                </p>
              )}
            </div>
            {tab === 'library' && total > 24 && (
              <div className="food-pagination">
                <button
                  type="button"
                  className="text-button"
                  disabled={!offset || searching}
                  onClick={() => setOffset((v) => Math.max(0, v - 24))}
                >
                  上一页
                </button>
                <span>
                  {offset + 1}–{Math.min(offset + 24, total)}
                </span>
                <button
                  type="button"
                  className="text-button"
                  disabled={offset + 24 >= total || searching}
                  onClick={() => setOffset((v) => v + 24)}
                >
                  下一页
                </button>
              </div>
            )}
            <button
              type="button"
              className="secondary manual-food"
              disabled={busy || foods.length >= 60}
              onClick={() =>
                add({
                  name: query,
                  grams: 100,
                  basis: 'asSold',
                  nutrition: null,
                  source: '手动记录',
                })
              }
            >
              <Plus size={16} />
              手动添加{query ? `「${query}」` : ''}
            </button>
            <p className="library-source">
              常见食物参考{' '}
              <a
                href="https://fdc.nal.usda.gov/"
                target="_blank"
                rel="noreferrer"
              >
                USDA FoodData Central
              </a>
              。按每 100g
              可食部分换算；复合菜的油、糖随参考配方，另外添加的调味料单独记录。更换食物或生熟状态，请重新从库中选择。
            </p>
          </section>
          <section className="meal-editing" aria-label="本餐明细，可独立滚动">
            <div className="section-heading">
              <h3>
                {mealLabels[slot]} · {visible.length} 项
              </h3>
              {previous && visible.length === 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={copyMeal}
                  disabled={busy}
                >
                  <Copy size={14} />
                  同上次 {compactDate(previous.date)}
                </button>
              )}
            </div>
            {!visible.length && (
              <div className="food-empty">
                <Utensils size={26} />
                <strong>这顿吃了什么？</strong>
                <p>
                  从左侧选择食物，或手动记下菜名。
                  <br />
                  营养信息可以稍后补全。
                </p>
              </div>
            )}
            <div className="selected-foods">
              {visible.map(({ f, i }) => (
                <article className="selected-food" key={i}>
                  <div className="selected-food-title">
                    {f.originalName && f.source?.startsWith('USDA FDC ') ? (
                      <strong
                        className="selected-food-name"
                        title={f.originalName}
                      >
                        {displayFoodName(f)}
                      </strong>
                    ) : (
                      <input
                        aria-label={`食物${i + 1}名称`}
                        value={f.name}
                        required
                        placeholder="食物或菜名"
                        maxLength={80}
                        onChange={(e) =>
                          update(i, {
                            name: e.target.value,
                            nutrition: null,
                            source: '手动记录',
                            fdcId: undefined,
                            originalName: undefined,
                          })
                        }
                      />
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`移除${displayFoodName(f) || '食物'}`}
                      disabled={busy}
                      onClick={() => {
                        setFoods((a) => a.filter((_, j) => i !== j));
                        onDirty();
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="food-portion">
                    <label>
                      <input
                        aria-label={`${displayFoodName(f)}重量克`}
                        type="number"
                        inputMode="decimal"
                        min={1}
                        max={10000}
                        step="any"
                        required
                        value={f.grams || ''}
                        onChange={(e) =>
                          update(i, { grams: Number(e.target.value) })
                        }
                      />
                      <span>g</span>
                    </label>
                    <select
                      aria-label={`${displayFoodName(f)}重量口径`}
                      value={f.basis}
                      onChange={(e) =>
                        update(i, {
                          basis: e.target.value as Food['basis'],
                          nutrition: null,
                          source: '手动记录',
                          fdcId: undefined,
                          originalName: undefined,
                        })
                      }
                    >
                      {Object.entries(basisLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <strong>
                      {numeric(nutritionSummary([f]).total.energy, 0)}
                      <small>大卡</small>
                    </strong>
                  </div>
                  <div className="food-nutrition-reference">
                    <p className="nutrition-reference-label">
                      每 100g 营养参考 <span>可调整 · 未知留空</span>
                    </p>
                    <div className="nutrition-inputs">
                      {(
                        [
                          ['energy', '热量', '大卡', 1000],
                          ['protein', '蛋白质', 'g', 100],
                          ['carbs', '碳水', 'g', 100],
                          ['fat', '脂肪', 'g', 100],
                        ] as const
                      ).map(([key, label, unit, max]) => (
                        <Field label={`${label} · ${unit}`} key={key}>
                          <input
                            aria-label={`${displayFoodName(f)}每100g${label}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min={0}
                            max={max}
                            placeholder="未知"
                            value={f.nutrition?.[key] ?? ''}
                            onChange={(e) =>
                              update(i, {
                                nutrition: {
                                  energy: null,
                                  protein: null,
                                  carbs: null,
                                  fat: null,
                                  ...f.nutrition,
                                  [key]:
                                    e.target.value === ''
                                      ? null
                                      : Number(e.target.value),
                                } as Nutrition,
                                source: '手动营养值',
                                fdcId: undefined,
                                originalName: undefined,
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
        {feedback && (
          <output className="inline-feedback">
            <Check size={16} />
            {feedback}
          </output>
        )}
        <details>
          <summary>
            当天备注 <span>选填</span>
          </summary>
          <Field label="饮食备注">
            <textarea
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="比如：在外聚餐，份量为估计"
            />
          </Field>
        </details>
      </div>
    </form>
  );
}
