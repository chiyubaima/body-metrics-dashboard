'use client';
import { Sunrise, Sun, Moon, Cookie, Utensils } from 'lucide-react';
import type { Food, MealSlot, DietPlan } from '@/lib/model';
import { nutritionSummary } from '@/lib/progress';
const display = (value: number | null | undefined, digits = 1) =>
  value == null ? '—' : Number(value.toFixed(digits)).toLocaleString('zh-CN');
export function MealIcon({
  meal,
  size = 20,
}: {
  meal: MealSlot;
  size?: number;
}) {
  const Icon = {
    breakfast: Sunrise,
    lunch: Sun,
    dinner: Moon,
    snack: Cookie,
    unsorted: Utensils,
  }[meal];
  return <Icon size={size} strokeWidth={2} />;
}
export function MacroLine({
  foods,
  per100 = false,
}: {
  foods: Food[];
  per100?: boolean;
}) {
  const summary = nutritionSummary(
    per100 ? foods.map((f) => ({ ...f, grams: 100 })) : foods,
  );
  return (
    <span className="inline-macros">
      {(
        [
          ['protein', '蛋白质'],
          ['carbs', '碳水'],
          ['fat', '脂肪'],
        ] as const
      ).map(([key, label]) => (
        <span className={key} key={key}>
          {label} <b>{display(summary.total[key])}</b>g
          {summary.known[key] < summary.count && (
            <small title={`仅${summary.known[key]}/${summary.count}项营养已知`}>
              *
            </small>
          )}
        </span>
      ))}
    </span>
  );
}
export function NutritionRings({
  foods,
  target,
}: {
  foods: Food[];
  target?: DietPlan;
}) {
  const summary = nutritionSummary(foods);
  return (
    <div className="nutrition-rings">
      {(
        [
          ['energy', '热量', '大卡'],
          ['protein', '蛋白质', 'g'],
          ['carbs', '碳水', 'g'],
          ['fat', '脂肪', 'g'],
        ] as const
      ).map(([key, label, unit]) => {
        const value = summary.total[key],
          goal = target?.[key],
          fraction =
            value != null && goal != null
              ? goal > 0
                ? Math.min(1, Math.max(0, value / goal))
                : value > 0
                  ? 1
                  : 0
              : 0;
        return (
          <div
            className={`nutrition-orbit ${key}`}
            data-annotate={`diet.nutrient.${key}`}
            key={key}
            aria-label={`${label}已记录${display(value)}${unit}${goal != null ? `，目标${goal}${unit}` : '，未设置目标'}`}
          >
            <span className="orbit-label">{label}</span>
            <div className="orbit-dial">
              <svg viewBox="0 0 88 88" aria-hidden="true">
                <circle className="orbit-track" cx="44" cy="44" r="36" />
                <circle
                  className="orbit-fill"
                  cx="44"
                  cy="44"
                  r="36"
                  pathLength="100"
                  strokeOpacity={fraction > 0 ? 1 : 0}
                  strokeDasharray={`${fraction * 100} 100`}
                />
              </svg>
              <div>
                <strong>{display(value, key === 'energy' ? 0 : 1)}</strong>
                <small>
                  {unit}
                  {summary.known[key] < summary.count ? ' *' : ''}
                </small>
              </div>
            </div>
            <small className="orbit-goal">
              {goal != null ? `目标 ${display(goal, 0)}${unit}` : '未设目标'}
            </small>
          </div>
        );
      })}
    </div>
  );
}
