import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const target = new URL(
  process.env.BODY_DASHBOARD_TEST_URL ?? 'http://localhost:3000',
);
assert(
  target.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) &&
    target.pathname === '/' &&
    !target.username &&
    !target.password &&
    !target.search &&
    !target.hash,
  'API checks only run against a local installation',
);
const base = target.origin;
const id = crypto.randomUUID();
const headers = {
  Cookie: '__sites_local_auth=1',
  'Content-Type': 'application/json',
  Origin: base,
};
async function call(path, options = {}) {
  const r = await fetch(base + path, {
    ...options,
    headers: { ...options.headers, Connection: 'close' },
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: r.status, data, headers: r.headers };
}
const payload = {
  id,
  kind: 'body',
  date: '2001-01-03',
  data: {
    weight: 80,
    waist: null,
    bodyFat: null,
    condition: 'morning',
    estimated: true,
    primary: true,
    note: 'Temporary automated API verification',
  },
};
let created = false;
const extraIds = [];
const planIds = [];
const annotationIds = [];
try {
  let r = await call('/api/data');
  assert.equal(r.status, 401);
  console.log('PASS unauthenticated access rejected');
  r = await call('/api/data', {
    headers: {
      'oai-authenticated-user-id': 'forged',
      'oai-authenticated-user-email': 'forged@example.test',
    },
  });
  assert.equal(r.status, 401);
  console.log('PASS client-forged identity rejected by local dispatcher');
  r = await call('/api/annotations');
  assert.equal(r.status, 401);
  const annotationId = crypto.randomUUID();
  annotationIds.push(annotationId);
  const annotation = {
    id: annotationId,
    message: 'Temporary annotation API verification',
    target: {
      path: '/',
      module: 'global',
      date: '2001-01-04',
      view: '看板',
      anchor: 'layout.header',
      selector: '[data-annotate="layout.header"]',
      tag: 'header',
      label: 'Automated annotation fixture',
      text: '',
      classes: 'topbar',
      rect: { x: 0, y: 0, width: 100, height: 40 },
      viewport: { width: 1200, height: 800 },
      style: {
        color: 'black',
        background: 'white',
        fontSize: '12px',
        padding: '0px',
      },
    },
  };
  r = await call('/api/annotations', {
    method: 'POST',
    headers: { ...headers, Origin: 'https://example.test' },
    body: JSON.stringify(annotation),
  });
  assert.equal(r.status, 403);
  for (let retry = 0; retry < 2; retry++) {
    r = await call('/api/annotations', {
      method: 'POST',
      headers,
      body: JSON.stringify(annotation),
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  r = await call('/api/annotations', { headers });
  assert.equal(r.status, 200);
  assert.equal(r.data.filter((n) => n.id === annotationId).length, 1);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(
    r.data.find((n) => n.id === annotationId).target,
    annotation.target,
  );
  r = await call('/api/annotations', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ id: annotationId, status: 'resolved' }),
  });
  assert.equal(r.status, 200);
  r = await call('/api/annotations', { headers });
  assert.equal(r.data.find((n) => n.id === annotationId).status, 'resolved');
  r = await call('/api/annotations', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...annotation,
      message: 'Temporary annotation API verification edited',
    }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'open');
  r = await call('/api/annotations', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...annotation, message: '   ' }),
  });
  assert.equal(r.status, 400);
  console.log(
    'PASS annotation save, retry, target snapshot, edit, status and access checks',
  );
  r = await call('/api/records', {
    method: 'POST',
    headers: { ...headers, Origin: 'https://example.test' },
    body: JSON.stringify(payload),
  });
  assert.equal(r.status, 403);
  console.log('PASS cross-origin write rejected');
  r = await call('/api/records', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, date: '2026-02-30' }),
  });
  assert.equal(r.status, 400);
  console.log('PASS invalid date rejected');
  r = await call('/api/records', { method: 'POST', headers, body: 'null' });
  assert.equal(r.status, 400);
  console.log('PASS invalid JSON shape rejected');
  for (let i = 0; i < 2; i++) {
    r = await call('/api/records', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    created = true;
  }
  r = await call('/api/data', { headers });
  assert.equal(r.data.records.filter((x) => x.id === id).length, 1);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  console.log('PASS save, read-back and idempotent retry');
  payload.data.weight = 79.5;
  r = await call('/api/records', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(r.status, 200);
  r = await call('/api/data', { headers });
  assert.equal(r.data.records.find((x) => x.id === id).data.weight, 79.5);
  console.log('PASS edit updates persisted record');
  r = await call('/api/records', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ id }),
  });
  assert.equal(r.status, 200);
  r = await call('/api/data', { headers });
  assert.equal(
    r.data.records.some((x) => x.id === id),
    false,
  );
  r = await call('/api/records', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ id }),
  });
  assert.equal(r.status, 200);
  console.log('PASS delete and restore');
  r = await call('/api/trash');
  assert.equal(r.status, 401);
  r = await call('/api/foods?q=rice');
  assert.equal(r.status, 401);
  r = await call('/api/foods?q=' + encodeURIComponent('酱牛肉'), { headers });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert(r.data.catalogCount > 13000);
  assert(r.data.foods.length > 0);
  assert(r.data.foods[0].fdcId);
  assert(r.data.foods[0].originalName);
  assert(r.data.foods[0].nutrition.protein > 0);
  console.log(
    'PASS authenticated local USDA lookup with original source and nutrients',
  );
  r = await call('/api/foods?q=' + encodeURIComponent('红腰豆'), { headers });
  assert.equal(r.status, 200);
  const {
    localizedName: chineseFoodName,
    approximate: _approximate,
    ...catalogFood
  } = r.data.foods[0];
  assert(chineseFoodName.includes('红腰豆'));
  const mealId = crypto.randomUUID(),
    workoutId = crypto.randomUUID();
  const mealPayload = {
    id: mealId,
    kind: 'diet',
    date: '2001-01-04',
    data: {
      status: 'logged',
      complete: false,
      note: 'Temporary meal verification',
      foods: [
        {
          name: 'Test food',
          grams: 125,
          basis: 'cooked',
          meal: 'lunch',
          nutrition: { energy: 120, protein: 20, carbs: null, fat: 1 },
          source: 'Automated fixture',
        },
        {
          ...catalogFood,
          name: '豆类 · kidney',
          grams: 135,
          meal: 'breakfast',
        },
      ],
    },
  };
  const workoutPayload = {
    id: workoutId,
    kind: 'training',
    date: '2001-01-04',
    data: {
      type: 'resistance',
      status: 'completed',
      minutes: null,
      content: 'Temporary set verification',
      details: '',
      exercises: [
        {
          name: '杠铃卧推',
          catalogId: 'bench-press',
          load: 'total',
          sets: [
            {
              id: crypto.randomUUID(),
              weight: 40,
              reps: 10,
              completed: true,
              warmup: false,
            },
            {
              id: crypto.randomUUID(),
              weight: null,
              reps: null,
              completed: false,
              warmup: false,
            },
          ],
        },
      ],
    },
  };
  for (const value of [mealPayload, workoutPayload]) {
    r = await call('/api/records', {
      method: 'POST',
      headers,
      body: JSON.stringify(value),
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    extraIds.push(value.id);
    r = await call('/api/records', {
      method: 'POST',
      headers,
      body: JSON.stringify(value),
    });
    assert.equal(r.status, 200);
  }
  const beforeGoals = (await call('/api/data', { headers })).data;
  for (const protein of [160, 180]) {
    const goalId = crypto.randomUUID();
    planIds.push(goalId);
    r = await call('/api/plans', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: goalId,
        kind: 'diet',
        date: mealPayload.date,
        data: {
          mode: 'macros',
          protein,
          carbs: 220,
          fat: 80,
          note: 'Temporary historical goal verification',
        },
      }),
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  r = await call('/api/data', { headers });
  assert.equal(r.data.plans.filter((p) => planIds.includes(p.id)).length, 2);
  assert(
    r.data.plans
      .filter((p) => planIds.includes(p.id))
      .every((p) => p.data.scope === 'day'),
  );
  assert.equal(
    r.data.records.find((x) => x.id === mealId).planId,
    planIds.at(-1),
  );
  assert.deepEqual(
    r.data.records.find((x) => x.id === mealId).data,
    beforeGoals.records.find((x) => x.id === mealId).data,
  );
  assert.deepEqual(
    r.data.records.filter((x) => x.id !== mealId),
    beforeGoals.records.filter((x) => x.id !== mealId),
  );
  console.log(
    'PASS historical day-only goal revisions preserve versions, actual meals and other dates',
  );
  mealPayload.data.complete = true;
  mealPayload.data.foods[0].grams = 200;
  r = await call('/api/records', {
    method: 'POST',
    headers,
    body: JSON.stringify(mealPayload),
  });
  assert.equal(r.status, 200);
  r = await call('/api/data', { headers });
  assert.deepEqual(r.data.records.find((x) => x.id === mealId)?.data, {
    ...mealPayload.data,
    foods: mealPayload.data.foods.map((f, i) =>
      i === 1 ? { ...f, localizedName: chineseFoodName } : f,
    ),
  });
  assert.deepEqual(
    r.data.records.find((x) => x.id === workoutId)?.data,
    workoutPayload.data,
  );
  assert.equal(r.data.records.filter((x) => x.id === workoutId).length, 1);
  console.log(
    'PASS meal nutrition, completion and structured sets survive save, retry and read-back',
  );
  r = await call('/api/records', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...workoutPayload,
      data: {
        ...workoutPayload.data,
        exercises: [
          {
            ...workoutPayload.data.exercises[0],
            sets: [{ ...workoutPayload.data.exercises[0].sets[0], reps: 1.5 }],
          },
        ],
      },
    }),
  });
  assert.equal(r.status, 400);
  console.log('PASS invalid structured sets rejected');
  const cardioId = crypto.randomUUID();
  const cardioPayload = {
    id: cardioId,
    kind: 'training',
    date: '2001-01-04',
    data: {
      type: 'cardio',
      status: 'completed',
      minutes: 599,
      content: 'stale title',
      details: 'Temporary cardio verification',
      cardioActivities: [
        { catalogId: 'indoor-run', minutes: 30 },
        { catalogId: 'indoor-cycle', minutes: 30 },
      ],
    },
  };
  extraIds.push(cardioId);
  for (let retry = 0; retry < 2; retry++) {
    r = await call('/api/records', {
      method: 'POST',
      headers,
      body: JSON.stringify(cardioPayload),
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  r = await call('/api/data', { headers });
  assert.equal(r.data.records.filter((x) => x.id === cardioId).length, 1);
  let cardioData = r.data.records.find((x) => x.id === cardioId).data;
  assert.equal(cardioData.minutes, 60);
  assert.deepEqual(
    cardioData.cardioActivities,
    cardioPayload.data.cardioActivities,
  );
  cardioPayload.data.cardioActivities[1].minutes = 20;
  r = await call('/api/records', {
    method: 'POST',
    headers,
    body: JSON.stringify(cardioPayload),
  });
  assert.equal(r.status, 200);
  r = await call('/api/data', { headers });
  cardioData = r.data.records.find((x) => x.id === cardioId).data;
  assert.equal(cardioData.minutes, 50);
  r = await call('/api/records', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ ids: [cardioId] }),
  });
  assert.equal(r.status, 200);
  r = await call('/api/trash', { headers });
  assert.deepEqual(r.data.find((x) => x.id === cardioId).data, cardioData);
  r = await call('/api/trash', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ ids: [cardioId] }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('/api/data', { headers });
  assert.deepEqual(
    r.data.records.find((x) => x.id === cardioId).data,
    cardioData,
  );
  console.log(
    'PASS cardio activities save, retry, duration recalculation, edit and restore',
  );
  r = await call('/api/export', { headers });
  assert.equal(r.status, 200);
  assert.equal(r.data.version, 2);
  assert(Array.isArray(r.data.trash));
  assert(r.data.records.some((x) => x.id === id));
  assert(r.headers.get('content-disposition').includes('attachment'));
  assert.deepEqual(
    r.data.records.find((x) => x.id === mealId)?.data,
    mealPayload.data,
  );
  assert.deepEqual(
    r.data.records.find((x) => x.id === workoutId)?.data,
    workoutPayload.data,
  );
  console.log('PASS complete downloadable backup including meals and sets');
  r = await call('/api/records', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ ids: [mealId, workoutId] }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('/api/trash', { headers });
  assert.equal(r.status, 200);
  assert(r.data.some((x) => x.id === mealId && x.deletedAt));
  const deletedFood = r.data.find((x) => x.id === mealId).data.foods[1];
  assert.equal(deletedFood.name, '豆类 · kidney');
  assert.equal(deletedFood.localizedName, chineseFoodName);
  assert.deepEqual(deletedFood.nutrition, catalogFood.nutrition);
  assert(r.data.some((x) => x.id === workoutId));
  r = await call('/api/records', {
    method: 'POST',
    headers,
    body: JSON.stringify(mealPayload),
  });
  assert.equal(r.status, 400);
  r = await call('/api/trash', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ ids: [mealId, workoutId] }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('/api/data', { headers });
  assert(r.data.records.some((x) => x.id === mealId));
  const restoredFood = r.data.records.find((x) => x.id === mealId).data
    .foods[1];
  assert.deepEqual(restoredFood, deletedFood);
  console.log(
    'PASS complete Chinese food names across lookup, saved history, trash and restoration; raw exports and nutrients unchanged',
  );
  assert(r.data.records.some((x) => x.id === workoutId));
  console.log(
    'PASS batch soft deletion, trash timestamps, stale-edit rejection and restoration',
  );
} finally {
  for (const noteId of annotationIds) {
    const response = await call('/api/annotations', { headers });
    const saved = response.data.find((n) => n.id === noteId);
    if (saved) {
      assert(saved.message.startsWith('Temporary annotation API verification'));
      await call('/api/annotations', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id: noteId }),
      });
    }
  }
  if (annotationIds.length) {
    const response = await call('/api/annotations', { headers });
    assert(!response.data.some((n) => annotationIds.includes(n.id)));
    console.log('PASS exact annotation test fixtures removed');
  }
  const ids = [...extraIds, ...(created ? [id] : [])];
  if (ids.length) {
    await call('/api/records', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ ids }),
    });
    // Only this invocation's UUIDs with explicit fixture markers, and only the local DB.
    const quoted = ids
      .map((value) => {
        assert.match(value, /^[0-9a-f-]{36}$/);
        return "'" + value + "'";
      })
      .join(',');
    let sql = `DELETE FROM records WHERE id IN (${quoted}) AND owner='local_seedy' AND ((date='2001-01-03' AND json_extract(payload,'$.note')='Temporary automated API verification') OR (date='2001-01-04' AND (json_extract(payload,'$.note')='Temporary meal verification' OR json_extract(payload,'$.content')='Temporary set verification' OR json_extract(payload,'$.details')='Temporary cardio verification')))`;
    if (planIds.length) {
      const planQuoted = planIds
        .map((value) => {
          assert.match(value, /^[0-9a-f-]{36}$/);
          return "'" + value + "'";
        })
        .join(',');
      sql += `; DELETE FROM plans WHERE id IN (${planQuoted}) AND owner='local_seedy' AND date='2001-01-04' AND json_extract(payload,'$.note')='Temporary historical goal verification'`;
    }
    execFileSync(
      './node_modules/.bin/wrangler',
      [
        'd1',
        'execute',
        'site-creator-d1',
        '--local',
        '--config',
        'wrangler.local.jsonc',
        '--command',
        sql,
      ],
      { stdio: 'pipe' },
    );
    const active = await call('/api/data', { headers }),
      deleted = await call('/api/trash', { headers });
    assert(!active.data.records.some((r) => ids.includes(r.id)));
    assert(!active.data.plans.some((p) => planIds.includes(p.id)));
    assert(!deleted.data.some((r) => ids.includes(r.id)));
    console.log(
      'PASS exact temporary fixtures cleaned from local records and trash',
    );
  }
}
