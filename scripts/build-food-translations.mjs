import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  breadNames,
  foodTranslationPhrases,
  translatedName,
} from '../lib/food-labels.ts';
import { auditFoodTranslations } from './audit-food-translations.mjs';

const base = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, base), 'utf8');
const catalogSource = read('data/foods.json');
const rows = JSON.parse(catalogSource);
const glossary = JSON.parse(read('data/food-translation-glossary.json'));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrases = [
  ...new Map([
    ...foodTranslationPhrases.filter(([en]) => !en.startsWith('bread, ')),
    ...Object.entries(glossary),
  ]),
].sort((a, b) => b[0].length - a[0].length);
const pattern = new RegExp(
  `(?<![a-z0-9])(?:${phrases.map(([en]) => escape(en)).join('|')})(?![a-z0-9])`,
  'gi',
);
const dictionary = new Map(phrases.map(([en, zh]) => [en.toLowerCase(), zh]));
const breadDictionary = new Map(breadNames);
const breadPattern = new RegExp(
  `^bread, (${[...breadDictionary.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|')})(?![a-z0-9])`,
  'i',
);
const translate = (description) => {
  const meat =
    /\b(beef|pork|lamb|chicken|turkey|veal|elk|bison|buffalo|deer|venison|ostrich|game meat)\b/i.test(
      description,
    );
  let text = description
    .replace(/\s+/g, ' ')
    .replace(/\bround\b/gi, (s) => (meat ? s : '圆形'))
    .replace(/, whole(?=,|$)/gi, (s) =>
      /^(?:chocolate |flavored |malted |evaporated )?milk\b|^yogurt\b/i.test(
        description,
      )
        ? ', 全脂'
        : s,
    )
    .replace(
      /\bflesh\b/gi,
      /\b(fish|seal|salmon|whale)\b/i.test(description) ? '肉' : '果肉',
    )
    .replace(/^Bread, reduced-calorie, ([^,]+)/i, 'Bread, $1, reduced-calorie')
    .replace(/\bRice, brown\b/gi, '糙米')
    .replace(/\bRice, white\b/gi, '白米')
    .replace(/,\s*round,\s*(?=top round|bottom round|eye of round)/gi, ', ')
    .replace(/\bground\b/gi, meat ? '绞肉' : '磨碎')
    .replace(
      /(\d+(?:\.\d+)?)% lean meat\s*\/\s*(\d+(?:\.\d+)?)% fat/gi,
      '瘦肉 $1% / 脂肪 $2%',
    )
    .replace(/trimmed to ([\d/]+)" fat/gi, '外层脂肪修至 $1 英寸');
  text = text.replace(breadPattern, (_, type) =>
    breadDictionary.get(type.toLowerCase()),
  );
  text = text.replace(pattern, (match) => dictionary.get(match.toLowerCase()));
  text = translatedName(text);
  return text
    .replace(/\ba\b/g, '一份')
    .replace(/(?<=\d)\s*g\b/g, '克')
    .replace(/(\d)x(?=\d)/g, '$1×')
    .replace(/\bw\//g, '含')
    .replace(/\bpre-/g, '预先')
    .replace(/\s*;\s*/g, '；')
    .replace(/\s*\(\s*/g, '（')
    .replace(/\s*\)\s*/g, '）')
    .replace(/([\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
};
const foods = rows.map(([id, description]) => [id, translate(description)]);
const output = {
  version: '2026-09-08',
  sourceSha256: createHash('sha256').update(catalogSource).digest('hex'),
  foods,
};
console.log(auditFoodTranslations(catalogSource, output));
fs.writeFileSync(
  new URL('data/food-translations.json', base),
  JSON.stringify(output) + '\n',
);
