import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function untranslatedText(name) {
  return (
    name
      .replace(
        /维生素\s*[ABCDEK](?:\d+)?(?:[\s·及,]+[ABCDEK](?:\d+)?)*(?![a-z])/g,
        '',
      )
      .replace(
        /双A级|V8|佳得乐G2|G运动表现O 2|鼠李糖乳杆菌GG|克利夫儿童Z|Z系列营养棒|安利XS|配方编号 C-32/g,
        '',
      )
      .match(/[a-z]+/gi) ?? []
  );
}

export function auditFoodTranslations(source, translation) {
  const rows = JSON.parse(source);
  assert.equal(
    translation.sourceSha256,
    createHash('sha256').update(source).digest('hex'),
    'Source catalog changed; review translations before rebuilding.',
  );
  const names = new Map(translation.foods);
  assert.equal(names.size, rows.length, 'Missing or extra translation IDs');
  assert.equal(
    translation.foods.length,
    rows.length,
    'Duplicate translation IDs',
  );
  const failures = [];
  for (const [id, original] of rows) {
    const name = names.get(id);
    if (typeof name !== 'string' || !/[\u3400-\u9fff]/.test(name)) {
      failures.push(`${id}: Missing Chinese name`);
      continue;
    }
    const remaining = untranslatedText(name);
    if (remaining.length)
      failures.push(`${id}: Untranslated: ${remaining.join(' ')}`);
    const numbers = name.match(/\d+(?:\.\d+)?/g) ?? [];
    for (const number of original.match(/\d+(?:\.\d+)?/g) ?? []) {
      const index = numbers.indexOf(number);
      if (index < 0)
        failures.push(`${id}: Missing numeric qualifier ${number}`);
      else numbers.splice(index, 1);
    }
  }
  assert.deepEqual(failures, [], failures.slice(0, 20).join('\n'));
  return {
    foods: rows.length,
    descriptions: new Set(rows.map((r) => r[1])).size,
    untranslated: 0,
    missingNumericQualifiers: 0,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const base = new URL('../data/', import.meta.url);
  console.log(
    auditFoodTranslations(
      fs.readFileSync(new URL('foods.json', base), 'utf8'),
      JSON.parse(
        fs.readFileSync(new URL('food-translations.json', base), 'utf8'),
      ),
    ),
  );
}
