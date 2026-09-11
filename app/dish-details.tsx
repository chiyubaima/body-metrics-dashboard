import { ChefHat, ChevronDown } from 'lucide-react';
import type { DishRecipe } from '@/lib/model';

export function DishDetails({
  recipe,
  grams,
  estimatedPortion,
  pending = false,
}: {
  recipe: DishRecipe;
  grams: number;
  estimatedPortion?: boolean;
  pending?: boolean;
}) {
  const scale = grams / 100,
    n = recipe.nutrition,
    amount = (value: number) => Math.round(value * scale * 10) / 10;
  return (
    <details className="dish-details">
      <summary className="dish-disclosure dish-details-summary">
        <span className="dish-heading-icon" aria-hidden="true">
          <ChefHat size={19} />
        </span>
        <span className="dish-heading">
          <span className="dish-heading-title">
            配方与营养 <span className="dish-estimate-badge">AI估算</span>
          </span>
          <span className="dish-heading-meta">
            本次 {grams}g · {estimatedPortion ? '份量估算' : '按配方换算'}
          </span>
        </span>
        <ChevronDown className="dish-chevron" size={17} aria-hidden="true" />
      </summary>
      <div className="dish-details-body">
        <section className="dish-nutrition" aria-label="本次估算营养">
          <div className="dish-energy">
            <span>本次估算热量</span>
            <p>
              <strong>{amount(n.energy)}</strong>
              <span>大卡</span>
            </p>
          </div>
          <dl className="dish-macros">
            {(
              [
                ['蛋白质', n.protein],
                ['碳水', n.carbs],
                ['脂肪', n.fat],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {amount(value)}
                  <span>g</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="dish-recipe" aria-label="参考配方">
          <div className="dish-section-heading">
            <h4>参考配方</h4>
            <span>一份成品约 {recipe.portionGrams}g</span>
          </div>
          <ul className="dish-ingredients">
            {recipe.ingredients.map((ingredient, index) => (
              <li key={index}>
                <span>{ingredient.name}</span>
                <span className="dish-ingredient-amount">
                  约 {ingredient.grams}g
                </span>
              </li>
            ))}
          </ul>
          <div className="dish-method">
            <h4>烹饪方式</h4>
            <p>{recipe.cookingMethod}</p>
          </div>
        </section>
        <details className="dish-reference">
          <summary className="dish-disclosure dish-reference-toggle">
            <span>估算说明与营养口径</span>
            <ChevronDown
              className="dish-chevron"
              size={16}
              aria-hidden="true"
            />
          </summary>
          <div className="dish-reference-body">
            <p>
              {estimatedPortion
                ? `份量按参考配方估算为 ${grams}g，可调整后确认。`
                : `本次 ${grams}g，营养按配方估算。`}
            </p>
            <p>{recipe.assumptions}</p>
            <p className="dish-per-hundred">
              每100g：{n.energy}大卡 · 蛋白质 {n.protein}g · 碳水 {n.carbs}g ·
              脂肪 {n.fat}g。
            </p>
            <p>原料与做法不同，实际营养会有差异。</p>
          </div>
        </details>
        {pending && (
          <p className="dish-save-note">确认记录后，同时加入自建菜品库。</p>
        )}
      </div>
    </details>
  );
}
