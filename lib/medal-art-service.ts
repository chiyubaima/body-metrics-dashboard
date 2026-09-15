import type { CoachEnvironment } from './coach-model.ts';
import type { MedalArt } from './medals.ts';
import { medalId } from './medals.ts';
import { InputError } from './model.ts';
import {
  getMedal,
  attachMedalArt,
  runMedalGeneration,
  medalArtJob,
} from '../db/medals.ts';
import { generateMedalImage } from './medal-generation.ts';

export async function startMedalArt(
  db: D1Database,
  owner: string,
  storage: R2Bucket | undefined,
  environment: CoachEnvironment,
  input: { id: string; revision: number; requestId: string },
  defer: (work: Promise<unknown>) => void,
  generate = generateMedalImage,
) {
  if (!storage) throw new InputError('图案存储尚未就绪，规则已保留。');
  const m = await getMedal(db, owner, input.id);
  if (m.revision !== input.revision)
    throw new InputError('勋章已更新，请先读取当前版本再生成。');
  const requestId = medalId(input.requestId),
    fingerprint = JSON.stringify(['art', m.id, m.revision]);
  // Expire interrupted tasks before trying to claim a replacement.
  await medalArtJob(db, owner, m.id, m.revision);
  const claimed = await db
    .prepare(
      "INSERT OR IGNORE INTO medal_generations(id,owner,fingerprint,status,created_at) SELECT ?,?,?,'pending',? WHERE NOT EXISTS(SELECT 1 FROM medal_generations WHERE owner=? AND json_extract(CASE WHEN json_valid(fingerprint) THEN fingerprint ELSE '[]' END,'$[0]')='art' AND json_extract(CASE WHEN json_valid(fingerprint) THEN fingerprint ELSE '[]' END,'$[1]')=? AND status='pending') RETURNING id",
    )
    .bind(requestId, owner, fingerprint, new Date().toISOString(), owner, m.id)
    .first();
  if (!claimed) {
    const existing =
      (await medalArtJob(db, owner, m.id, m.revision, requestId)) ||
      (await medalArtJob(db, owner, m.id, m.revision));
    if (!existing) throw new InputError('图案请求已变化，请重新生成。');
    return { job: existing };
  }
  const work = runMedalGeneration(
    db,
    owner,
    requestId,
    fingerprint,
    async (): Promise<MedalArt> => {
      const image = await generate(environment, m.definition);
      const key = `medals/${m.id}/${crypto.randomUUID()}`;
      await storage.put(key, image.bytes, {
        httpMetadata: { contentType: image.type },
      });
      const art: MedalArt = {
        kind: 'generated',
        key,
        motif: m.definition.motif,
        subject: m.definition.subject,
        style: 'enamel-v1',
      };
      const current = await getMedal(db, owner, m.id);
      if (
        current.definition.subject !== m.definition.subject ||
        current.definition.motif !== m.definition.motif
      )
        throw new InputError('图案描述已修改，旧任务不会覆盖新图案。');
      await attachMedalArt(db, owner, m.id, current.revision, art);
      return art;
    },
    true,
  ).catch(() => {});
  defer(work);
  return { job: { id: requestId, status: 'pending' } };
}
