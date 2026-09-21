import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Public, synthetic grid only. Never read profiles or training records here.
const exercises = [
  ['bench-press', 'bench-press', 'push', 'total'],
  ['dumbbell-bench', 'dumbbell-bench-press', 'push', 'perHand'],
  ['barbell-press', 'shoulder-press', 'push', 'total'],
  ['dumbbell-press', 'dumbbell-shoulder-press', 'push', 'perHand'],
  ['barbell-row', 'bent-over-row', 'pull', 'total'],
  ['dumbbell-row', 'dumbbell-row', 'pull', 'perHand'],
  ['squat', 'squat', 'squat', 'total'],
  ['front-squat', 'front-squat', 'squat', 'total'],
  ['deadlift', 'deadlift', 'hinge', 'total'],
  ['romanian-deadlift', 'romanian-deadlift', 'hinge', 'total'],
  ['barbell-curl', 'barbell-curl', null, 'total'],
  ['lateral-raise', 'dumbbell-lateral-raise', null, 'perHand'],
];
const ages = [18, 20, 25, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const retrievedAt = new Date().toISOString().slice(0, 10);
const cache = new URL(
  `../../work/strength-rating/sources/${retrievedAt}/`,
  import.meta.url,
);
await mkdir(cache, { recursive: true });
const hash = (text) => createHash('sha256').update(text).digest('hex');
async function download(url, filename) {
  const file = new URL(filename, cache);
  try {
    return await readFile(file, 'utf8');
  } catch {}
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
  const body = await response.text();
  await writeFile(file, body);
  return body;
}
const results = [];
// Sequential requests deliberately keep load on the source low.
for (const [id, slug, pattern, load] of exercises) {
  const source = `https://strengthlevel.com/strength-standards/${slug}/kg`;
  const html = await download(source, `${id}.html`);
  const exerciseId = html.match(/data-exercise-id="([^"]+)"/)?.[1];
  if (!exerciseId) throw new Error(`No published exercise ID: ${id}`);
  const tables = {};
  const fingerprints = {};
  for (const sex of ['male', 'female']) {
    const weights = Array.from(
      { length: sex === 'male' ? 19 : 17 },
      (_, i) => (sex === 'male' ? 50 : 40) + i * 5,
    );
    tables[sex] = {};
    for (const age of ages) {
      const params = new URLSearchParams({
        exercise_id: exerciseId,
        gender: sex,
        bodyweights: weights.join(','),
        ages: String(age),
        unit: 'kg',
        row: 'bodyweight',
        value: 'weight',
      });
      const body = await download(
        `https://strengthlevel.com/api/standard-table-definitions?${params}`,
        `${id}-${sex}-${age}.json`,
      );
      const table = JSON.parse(body).data?.[0];
      if (
        table?.headers?.join(',') !==
          'Bodyweight,Beginner,Novice,Intermediate,Advanced,Elite' ||
        table.body.length !== weights.length
      )
        throw new Error(`Unexpected public table: ${id}/${sex}/${age}`);
      const rows = table.body.map((row, i) => {
        if (
          row[0] !== weights[i] ||
          row.length !== 6 ||
          !row.every(Number.isFinite) ||
          row.slice(1).some((v, j) => v <= 0 || (j > 0 && v <= row[j]))
        )
          throw new Error(`Invalid standard row: ${id}/${sex}/${age}`);
        return row.slice(0, 5);
      });
      tables[sex][age] = rows;
      fingerprints[`${sex}-${age}`] = hash(body);
    }
  }
  results.push({
    id,
    slug,
    pattern,
    load,
    source,
    exerciseId,
    pageSha256: hash(html),
    fingerprints,
    tables,
  });
  console.log(`Verified ${id}: ${ages.length * 2} joint tables`);
}
const catalog = {
  version: `strength-level-${retrievedAt}`,
  retrievedAt,
  ages,
  tiers: ['Beginner', 'Novice', 'Intermediate', 'Advanced'],
  endpoint: 'https://strengthlevel.com/api/standard-table-definitions',
  exercises: results,
};
await writeFile(
  new URL('../data/strength-standards.json', import.meta.url),
  JSON.stringify(catalog) + '\n',
);
console.log(`Saved ${results.length} public exercise standards.`);
