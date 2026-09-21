'use client';
import type { Food } from '@/lib/model';
import type { FoodPortion } from '@/lib/food-portions';
import { portionGrams, portionReferences } from '@/lib/food-portions';
import { displayFoodName } from '@/lib/food-labels';
import { basisLabels, nutritionSummary } from '@/lib/progress';

export function FoodPortionInput({
  food,
  onChange,
}: {
  food: Food;
  onChange: (change: Partial<Food>) => void;
}) {
  const name = displayFoodName(food),
    portion = food.portion;
  const references = portionReferences(food);
  const apply = (next: FoodPortion) =>
    onChange({
      portion: next,
      grams: portionGrams(next),
      estimatedPortion: true,
    });
  const custom = (change: Partial<FoodPortion> = {}) =>
    apply({
      quantity: portion?.quantity ?? 1,
      unit: portion?.unit ?? '份',
      gramsPerUnit: portion?.gramsPerUnit ?? 0,
      ...change,
      source: 'custom',
    });
  return (
    <div className="everyday-portion">
      <div className="food-portion">
        <input
          aria-label={`${name}${portion ? '份量数量' : '重量克'}`}
          type="number"
          inputMode="decimal"
          min={portion ? 0.001 : 1}
          max={10000}
          step="any"
          required
          value={(portion ? portion.quantity : food.grams) || ''}
          onChange={(e) =>
            portion
              ? apply({ ...portion, quantity: Number(e.target.value) })
              : onChange({
                  grams: Number(e.target.value),
                  portion: undefined,
                  estimatedPortion: false,
                })
          }
        />
        <select
          aria-label={`${name}份量单位`}
          value={
            portion?.source === 'custom'
              ? 'custom'
              : (portion?.referenceId ?? 'grams')
          }
          onChange={(e) => {
            if (e.target.value === 'grams') onChange({ portion: undefined });
            else if (e.target.value === 'custom') custom();
            else {
              const reference = references.find(
                (r) => r.referenceId === e.target.value,
              );
              if (reference)
                apply({ ...reference, quantity: portion?.quantity ?? 1 });
            }
          }}
        >
          <option value="grams">克</option>
          {references.map((r) => (
            <option key={r.referenceId} value={r.referenceId}>
              {r.unit}
            </option>
          ))}
          <option value="custom">
            {portion?.source === 'custom' && portion.unit
              ? `${portion.unit}（自定）`
              : '自定义份量…'}
          </option>
        </select>
        <strong>
          {food.grams > 0
            ? (nutritionSummary([food]).total.energy?.toFixed(0) ?? '—')
            : '—'}
          <small>大卡</small>
        </strong>
      </div>
      <p className="portion-conversion">
        {basisLabels[food.basis]}
        {portion
          ? ` · 约 ${food.grams || '—'}g · 份量估算`
          : food.estimatedPortion
            ? ' · 克重为估算，可按称重修改'
            : ' · 按实际可食部分记录'}
      </p>
      {portion && portion.source !== 'custom' && (
        <div className="portion-reference">
          <small>
            1 {portion.unit} ≈ {portion.gramsPerUnit}g ·{' '}
            {portion.source === 'usda' ? 'USDA参考' : '已确认配方'}
          </small>
          <button
            type="button"
            className="text-button"
            onClick={() => custom()}
          >
            调整参考
          </button>
        </div>
      )}
      {portion?.source === 'custom' && (
        <div className="portion-custom">
          <label>
            <span>单位</span>
            <input
              aria-label={`${name}自定义单位`}
              maxLength={20}
              required
              value={portion.unit}
              placeholder="碗、杯、份…"
              onChange={(e) => custom({ unit: e.target.value })}
            />
          </label>
          <label>
            <span>每单位克重 · g</span>
            <input
              aria-label={`${name}每单位克重`}
              type="number"
              inputMode="decimal"
              min={0.1}
              max={10000}
              step="any"
              required
              value={portion.gramsPerUnit || ''}
              placeholder="按称重或包装填写"
              onChange={(e) => custom({ gramsPerUnit: Number(e.target.value) })}
            />
          </label>
          <small>按你确认的可食克重换算，保存后“最近吃过”会沿用。</small>
        </div>
      )}
      {portion?.unit.includes('USDA') && (
        <small className="portion-cup-note">
          参考杯不等于家里的饭碗，可调整为你的每碗克重。
        </small>
      )}
    </div>
  );
}
