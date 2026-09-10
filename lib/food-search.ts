import catalog from '../data/foods.json' with { type: 'json' };
import { referenceFoods } from './foods.ts';
import { breadNames, translatedName } from './food-labels.ts';
import { catalogFoodName } from './food-localization.ts';
import type { Food } from './model.ts';
type Row = [
  number,
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
];
export type FoodMatch = Food & {
  originalName: string;
  fdcId: number;
  approximate: boolean;
};
const rows = catalog as Row[];
const terms: [string, string][] = [
  ...breadNames.map(([en, zh]): [string, string] => [zh, `bread ${en}`]),
  ['玉米布丁式面包', 'spoonbread'],
  ['粗黑麦', 'pumpernickel'],
  ['黑麦', 'rye'],
  ['全麦', 'whole wheat'],
  ['全谷物', 'whole grain'],
  ['杂粮', 'multigrain'],
  ['多谷物', 'multigrain'],
  ['碎麦', 'cracked wheat'],
  ['白小麦', 'white wheat'],
  ['小麦', 'wheat'],
  ['大麦', 'barley'],
  ['燕麦麸', 'oat bran'],
  ['米糠', 'rice bran'],
  ['葡萄干', 'raisin'],
  ['酸面团', 'sourdough'],
  ['无麸质', 'gluten free'],
  ['面粉', 'flour'],
  ['市售', 'commercially prepared'],
  ['烤过', 'toasted'],
  ['牛肉干', 'beef jerky'],
  ['牛肉末', 'beef ground'],
  ['牛绞肉', 'beef ground'],
  ['后腿内侧', 'top round'],
  ['后腿外侧', 'bottom round'],
  ['后腿眼肉', 'eye of round'],
  ['里脊', 'tenderloin'],
  ['肩胛', 'chuck'],
  ['后腿', 'round'],
  ['肉末', 'ground'],
  ['绞肉', 'ground'],
  ['酱牛肉', 'beef braised'],
  ['卤牛肉', 'beef braised'],
  ['牛腱', 'beef shank'],
  ['牛肝', 'beef liver'],
  ['鸡肝', 'chicken liver'],
  ['鸡胸肉', 'chicken breast'],
  ['鸡胸', 'chicken breast'],
  ['鸡腿', 'chicken thigh'],
  ['鸡翅', 'chicken wing'],
  ['牛排', 'beef steak'],
  ['猪里脊', 'pork tenderloin'],
  ['猪排', 'pork chop'],
  ['排骨', 'pork ribs'],
  ['三文鱼', 'salmon'],
  ['金枪鱼', 'tuna'],
  ['鳕鱼', 'cod'],
  ['虾仁', 'shrimp'],
  ['虾', 'shrimp'],
  ['牛肉', 'beef'],
  ['猪肉', 'pork'],
  ['羊肉', 'lamb'],
  ['鸡肉', 'chicken'],
  ['鸭肉', 'duck'],
  ['鱼肉', 'fish'],
  ['白米饭', 'rice cooked'],
  ['米饭', 'rice cooked'],
  ['生米', 'rice raw'],
  ['大米', 'rice raw'],
  ['糙米', 'rice brown'],
  ['燕麦', 'oats'],
  ['面条', 'noodles'],
  ['意面', 'pasta'],
  ['面包', 'bread'],
  ['土豆', 'potato'],
  ['红薯', 'sweet potato'],
  ['紫薯', 'sweet potato'],
  ['玉米', 'corn'],
  ['馒头', 'bread steamed'],
  ['饺子', 'dumpling'],
  ['豆腐', 'tofu'],
  ['豆浆', 'soymilk'],
  ['牛奶', 'milk'],
  ['酸奶', 'yogurt'],
  ['奶酪', 'cheese'],
  ['鸡蛋', 'egg'],
  ['水煮蛋', 'egg boiled'],
  ['鸡蛋白', 'egg white'],
  ['蛋清', 'egg white'],
  ['花生', 'peanut'],
  ['杏仁', 'almond'],
  ['核桃', 'walnut'],
  ['橄榄油', 'oil olive'],
  ['菜籽油', 'oil canola'],
  ['豆油', 'oil soybean'],
  ['黄油', 'butter'],
  ['苹果', 'apple'],
  ['香蕉', 'banana'],
  ['橙子', 'orange'],
  ['草莓', 'strawberry'],
  ['蓝莓', 'blueberry'],
  ['芒果', 'mango'],
  ['牛油果', 'avocado'],
  ['葡萄', 'grape'],
  ['西瓜', 'watermelon'],
  ['西兰花', 'broccoli'],
  ['菠菜', 'spinach'],
  ['生菜', 'lettuce'],
  ['黄瓜', 'cucumber'],
  ['番茄', 'tomato'],
  ['西红柿', 'tomato'],
  ['蘑菇', 'mushroom'],
  ['胡萝卜', 'carrot'],
  ['洋葱', 'onion'],
  ['白菜', 'cabbage'],
  ['西葫芦', 'zucchini'],
  ['茄子', 'eggplant'],
  ['小扁豆', 'lentil'],
  ['兵豆', 'lentil'],
  ['扁豆', 'hyacinth'],
  ['鹰嘴豆', 'chickpea'],
  ['毛豆', 'edamame'],
  ['咖啡', 'coffee'],
  ['茶', 'tea'],
  ['豆', 'bean'],
  ['油', 'oil'],
  ['生重', 'raw'],
  ['生的', 'raw'],
  ['熟重', 'cooked'],
  ['熟的', 'cooked'],
  ['水煮', 'boiled'],
  ['清蒸', 'steamed'],
  ['烤', 'roasted'],
  ['煎', 'fried'],
  ['去皮', 'skinless'],
  ['脱脂', 'nonfat'],
  ['低脂', 'lowfat'],
  ['未加甜味料', 'unsweetened'],
  ['无糖', 'sugar free'],
];
const queryTerms = [...terms].sort((a, b) => b[0].length - a[0].length);
const searchText = (text: string) =>
  text
    .toLowerCase()
    .replace(/\blow[ -]+fat\b/g, 'lowfat')
    .replace(/\bmultigrain\b/g, 'multi grain')
    .replace(/\bsourdough\b/g, 'sour dough')
    .replace(/\bchappatti\b/g, 'chapati');
const descriptions = new Map(rows.map((row) => [row[0], searchText(row[1])]));
const compact = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const chineseNames = new Map(
  rows.map((row) => [row[0], compact(catalogFoodName(row[0], row[1]) ?? '')]),
);
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const qualifiers = [
  '无添加糖',
  '未加甜味料',
  '未添加油脂',
  '添加油脂',
  '无麸质',
  '未加盐',
  '无糖',
  '无脂',
  '低脂',
  '低钠',
  '去皮',
  '带皮',
  '去骨',
  '带骨',
];
const curated = new Map(
  referenceFoods.map((f) => [Number(f.source?.match(/\d+/)?.[0]), f]),
);
function match(row: Row, approximate: boolean): FoodMatch {
  const [id, description, version, energy, protein, carbs, fat] = row,
    known = curated.get(id),
    lower = description.toLowerCase(),
    localizedName =
      catalogFoodName(id, description) ?? translatedName(description);
  return {
    name: localizedName.slice(0, 80),
    localizedName,
    grams: 100,
    basis:
      known?.basis ??
      (/\braw\b/.test(lower)
        ? 'raw'
        : /\b(cooked|braised|fried|roasted|boiled|steamed)\b/.test(lower)
          ? 'cooked'
          : 'asSold'),
    nutrition: { energy, protein, carbs, fat },
    source: `USDA FDC ${id} · ${version}`,
    fdcId: id,
    originalName: description,
    approximate: approximate && !known,
  };
}
export function foodById(id: unknown): FoodMatch | undefined {
  const row = rows.find((row) => row[0] === id);
  return row ? match(row, false) : undefined;
}
export function searchFoods(query: string, offset = 0, basis = 'all') {
  const raw = query.trim().toLowerCase().slice(0, 100),
    chinese = /[\u3400-\u9fff]/.test(raw);
  let normalized = raw;
  for (const [zh, en] of queryTerms)
    normalized = normalized.replaceAll(zh, ` ${en} `);
  const unsupportedAlias = /[\u3400-\u9fff]/.test(
    normalized.replaceAll('肉', '').replaceAll('的', ''),
  );
  const tokens: string[] = searchText(normalized).match(/[a-z0-9]+/g) ?? [];
  const patterns = tokens.map((token) =>
    token === 'bread'
      ? /\b(?!sweetbreads?\b)[a-z]*bread(?:s|sticks|crumbs)?\b/
      : token === 'rye'
        ? /\b(?:rye|pumpernickel)\b/
        : new RegExp(`\\b${token}`),
  );
  let remaining = raw;
  const chineseTokens: string[] = [];
  const requiredQualifiers: string[] = [];
  if (chinese) {
    for (const qualifier of qualifiers) {
      if (!remaining.includes(qualifier)) continue;
      chineseTokens.push(qualifier);
      requiredQualifiers.push(qualifier);
      remaining = remaining.replaceAll(qualifier, ' ');
    }
    chineseTokens.push(
      ...[...segmenter.segment(remaining)]
        .filter((part) => part.isWordLike && part.segment !== '的')
        .map((part) => compact(part.segment)),
    );
  }
  const chineseMatch = (r: Row) =>
    chineseTokens.length > 0 &&
    chineseTokens.every((token) =>
      /[\u3400-\u9fff]/.test(token)
        ? chineseNames.get(r[0])!.includes(token)
        : new RegExp(`\\b${token}`).test(descriptions.get(r[0])!),
    );
  const cookingFilter = (r: Row) =>
    basis === 'all' ||
    (basis === 'raw'
      ? /\braw\b/i.test(r[1])
      : /\b(cooked|braised|fried|roasted|boiled|steamed)\b/i.test(r[1]));
  let matches = rows.filter(
    (r) =>
      cookingFilter(r) &&
      requiredQualifiers.every((qualifier) =>
        chineseNames.get(r[0])!.includes(qualifier),
      ) &&
      (unsupportedAlias
        ? chineseMatch(r)
        : patterns.every((pattern) => pattern.test(descriptions.get(r[0])!))),
  );
  let broadened = false;
  if (
    !matches.length &&
    !unsupportedAlias &&
    raw.includes('牛肉') &&
    tokens.includes('braised')
  ) {
    matches = rows.filter(
      (r) =>
        cookingFilter(r) &&
        requiredQualifiers.every((qualifier) =>
          chineseNames.get(r[0])!.includes(qualifier),
        ) &&
        /beef/i.test(r[1]) &&
        /cooked|braised/i.test(r[1]),
    );
    broadened = true;
  }
  if (
    tokens.includes('beef') &&
    !/肝|肾|心|舌|肚|脑|胰|胸腺/.test(raw) &&
    !tokens.some((t) =>
      [
        'liver',
        'kidney',
        'heart',
        'tongue',
        'tripe',
        'brain',
        'sweetbread',
      ].includes(t),
    )
  )
    matches = matches.filter(
      (r) => !/variety meats|by-products|liver|kidney|tripe|tongue/i.test(r[1]),
    );
  const score = (row: Row) => {
    const name = row[1].toLowerCase();
    const main = name.split(',')[0];
    return (
      (curated.has(row[0]) ? 1000 : 0) +
      (chinese &&
      unsupportedAlias &&
      chineseNames.get(row[0])!.startsWith(compact(raw))
        ? 300
        : 0) +
      (tokens[0] && main.includes(tokens[0]) ? 100 : 0) +
      (row[2].startsWith('FNDDS') ? 10 : 0) -
      name.length / 100 -
      (/not specified|ns as to|nfs/i.test(name) ? 20 : 0)
    );
  };
  matches.sort((a, b) => score(b) - score(a) || a[0] - b[0]);
  return {
    total: matches.length,
    catalogCount: rows.length,
    offset,
    foods: matches
      .slice(offset, offset + 24)
      .map((r) => match(r, chinese || broadened)),
    hint:
      !matches.length && chinese
        ? '没有找到匹配食品。试试主要食材或减少做法限定；也可按包装标签记录。'
        : raw.includes('酱牛肉') || raw.includes('卤牛肉')
          ? '以下为 USDA 炖 / 焖牛肉参考，与中式酱卤配方不同，酱汁、糖和油会改变营养。请选择最接近的部位与做法。'
          : chinese
            ? '每 100g 可食部分；中文译名保留品种、部位和做法，英文原名可核对。'
            : '每 100g 可食部分；生熟、部位和配方不同，营养也会不同。',
  };
}
