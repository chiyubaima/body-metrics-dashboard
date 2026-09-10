import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const target = new URL(
  process.env.BODY_DASHBOARD_TEST_URL ?? 'http://127.0.0.1:3001',
);
assert(
  target.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(target.hostname) &&
    !target.username &&
    !target.password &&
    !target.search &&
    !target.hash &&
    target.pathname === '/',
);
const live = process.env.BODY_COACH_LIVE_MODEL === '1';
if (live) {
  assert(
    process.cwd().endsWith('/work/coach-check'),
    'Live model checks require the isolated verification checkout',
  );
  assert(
    readFileSync(resolve('AGENT.md'), 'utf8').includes(
      'Synthetic records only',
    ),
  );
}
const marker = 'Synthetic coach API verification';
const headers = {
  Cookie: '__sites_local_auth=1',
  'Content-Type': 'application/json',
  Origin: target.origin,
};
const memoryId = crypto.randomUUID(),
  commitmentId = crypto.randomUUID();
const memoryIds = [memoryId],
  commitmentIds = [commitmentId],
  turnIds = [],
  bodyIds = [];
let enabledHere = false;
async function call(path, body, method = 'POST', customHeaders = headers) {
  const response = await fetch(
    target.origin + path,
    body === undefined
      ? { headers: customHeaders }
      : { method, headers: customHeaders, body: JSON.stringify(body) },
  );
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}
const q = (id) => {
  assert.match(id, /^[0-9a-f-]{36}$/);
  return `'${id}'`;
};
try {
  assert.equal((await call('/api/coach', undefined, 'GET', {})).status, 401);
  assert.equal(
    (
      await call('/api/coach', undefined, 'GET', {
        'oai-authenticated-user-id': 'forged',
        'oai-authenticated-user-email': 'forged@example.test',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call('/api/coach', {}, 'POST', {
        ...headers,
        Origin: 'https://example.test',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call('/api/coach', {}, 'POST', {
        ...headers,
        'Content-Type': 'text/plain',
      })
    ).status,
    415,
  );
  let state = await call('/api/coach');
  assert.equal(state.status, 200);
  assert.equal(state.headers.get('cache-control'), 'no-store');
  assert(!JSON.stringify(state.data.connection).includes('TOKEN'));
  if (live) {
    assert.equal(state.data.memories.length, 0);
    assert.equal(state.data.turns.length, 0);
    assert.equal(state.data.commitments.length, 0);
    assert.equal((await call('/api/data')).data.records.length, 0);
  }
  assert.equal(
    (
      await call(
        '/api/coach',
        { enabled: true, consentConfig: 'incorrect' },
        'PATCH',
      )
    ).status,
    400,
  );
  console.log(
    'PASS coach authentication, origin, content type and explicit destination consent',
  );

  const memory = {
    id: memoryId,
    content: marker + ' preference',
    category: 'preference',
  };
  assert.equal((await call('/api/coach/memories', memory)).status, 200);
  assert.equal((await call('/api/coach/memories', memory)).status, 200);
  assert.equal(
    (
      await call('/api/coach/memories', {
        ...memory,
        content: marker + ' updated',
      })
    ).status,
    200,
  );
  state = await call('/api/coach');
  assert.equal(state.data.memories.filter((m) => m.id === memoryId).length, 1);
  assert.equal(
    state.data.memories.find((m) => m.id === memoryId).content,
    marker + ' updated',
  );
  const dueAt = new Date(Date.now() - 1000).toISOString();
  const commitment = {
    id: commitmentId,
    title: marker + ' checkin',
    kind: 'checkin',
    dueAt,
  };
  assert.equal((await call('/api/coach/commitments', commitment)).status, 200);
  state = await call('/api/coach', {});
  assert.equal(
    state.data.commitments.find((c) => c.id === commitmentId).status,
    'pending',
  );
  assert.equal(
    (
      await call(
        '/api/coach',
        { action: 'acknowledge', ids: [commitmentId] },
        'PATCH',
      )
    ).status,
    200,
  );
  assert(
    (await call('/api/coach')).data.commitments.find(
      (c) => c.id === commitmentId,
    ).notifiedAt,
  );
  assert.equal(
    (
      await call('/api/coach/commitments', {
        ...commitment,
        dueAt: new Date(Date.now() + 3600000).toISOString(),
      })
    ).status,
    200,
  );
  assert.equal(
    (await call('/api/coach')).data.commitments.find(
      (c) => c.id === commitmentId,
    ).notifiedAt,
    null,
  );
  assert.equal(
    (
      await call(
        '/api/coach/commitments',
        { id: commitmentId, status: 'cancelled' },
        'PATCH',
      )
    ).status,
    200,
  );
  console.log(
    'PASS durable memory edits and commitment acknowledgement, rescheduling and cancellation',
  );

  if (live) {
    await call('/api/coach/memories', { id: memoryId }, 'DELETE');
    const bodyId = crypto.randomUUID();
    bodyIds.push(bodyId);
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
    }).format(new Date());
    assert.equal(
      (
        await call('/api/records', {
          id: bodyId,
          kind: 'body',
          date,
          data: {
            weight: 80,
            waist: null,
            bodyFat: null,
            primary: true,
            condition: 'morning',
            estimated: false,
            note: marker,
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          '/api/coach',
          { enabled: true, consentConfig: state.data.connection.fingerprint },
          'PATCH',
        )
      ).status,
      200,
    );
    enabledHere = true;
    const tomorrow = new Date(
      new Date(date + 'T12:00:00Z').getTime() + 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const chat = {
      id: crypto.randomUUID(),
      kind: 'chat',
      date,
      message:
        marker +
        `。我喜欢短一点的回复。请在${tomorrow}北京时间19:00提醒我记录体重。也请告诉我今天已经记录的体重。`,
    };
    turnIds.push(chat.id);
    const response = await call('/api/coach/chat', chat);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.turn.status, 'complete');
    assert(response.data.turn.reply.includes('80'));
    assert(
      response.data.turn.evidence.some(
        (e) => e.id === bodyId || e.id === 'body-average',
      ),
    );
    assert(response.data.turn.proposals.some((p) => p.type === 'memory'));
    assert(response.data.turn.proposals.some((p) => p.type === 'commitment'));
    const retry = await call('/api/coach/chat', chat);
    assert.deepEqual(retry.data, response.data);
    for (const proposal of response.data.turn.proposals) {
      (proposal.type === 'memory' ? memoryIds : commitmentIds).push(
        proposal.id,
      );
      assert.equal(
        (
          await call('/api/coach/proposals', {
            turnId: chat.id,
            proposalId: proposal.id,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call('/api/coach/proposals', {
            turnId: chat.id,
            proposalId: proposal.id,
          })
        ).status,
        200,
      );
    }
    console.log(
      'PASS live gpt-6-astra through Worker → authenticated local bridge → official Codex CLI',
    );
    console.log('Synthetic reply: ' + response.data.turn.reply);
    console.log(
      'PASS live cited data, memory/commitment proposals, save confirmation and retry deduplication',
    );
  }
  const exported = await call('/api/export');
  assert.equal(exported.status, 200);
  assert(exported.data.coach);
  assert(exported.data.coach.commitments.some((c) => c.id === commitmentId));
  assert(!('consentConfig' in exported.data.coach.settings));
  console.log('PASS coach included in owner backup without connection secrets');
} finally {
  if (enabledHere) await call('/api/coach', { enabled: false }, 'PATCH');
  for (const id of memoryIds) {
    await call('/api/coach/memories', { id }, 'DELETE');
    await call('/api/coach/memories', { id, permanent: true }, 'DELETE');
  }
  const clauses = [
    `DELETE FROM coach_commitments WHERE owner='local_seedy' AND id IN (${commitmentIds.map(q).join(',')})${live ? '' : ` AND title LIKE '${marker}%'`}`,
  ];
  if (turnIds.length)
    clauses.push(
      `DELETE FROM coach_turns WHERE owner='local_seedy' AND id IN (${turnIds.map(q).join(',')}) AND user_text LIKE '${marker}%'`,
    );
  if (bodyIds.length)
    clauses.push(
      `DELETE FROM records WHERE owner='local_seedy' AND id IN (${bodyIds.map(q).join(',')}) AND json_extract(payload,'$.note')='${marker}'`,
    );
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
      clauses.join('; '),
    ],
    { stdio: 'pipe' },
  );
  const state = (await call('/api/coach')).data;
  assert(!state.memories.some((m) => memoryIds.includes(m.id)));
  assert(!state.commitments.some((c) => commitmentIds.includes(c.id)));
  assert(!state.turns.some((t) => turnIds.includes(t.id)));
  console.log(
    'PASS exact synthetic fixtures removed; personal records untouched',
  );
}
