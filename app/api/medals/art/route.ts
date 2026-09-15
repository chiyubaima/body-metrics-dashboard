import { env, waitUntil } from 'cloudflare:workers';
import { startMedalArt } from '@/lib/medal-art-service';
import { api, readBody } from '@/lib/api';
import { resolveCoachEnvironment } from '@/lib/coach-local';
import { getMedal, medalArtJob } from '@/db/medals';
import { InputError } from '@/lib/model';
export async function POST(request: Request) {
  return api(
    request,
    async (db, owner) => {
      if (!env.MEDAL_IMAGES)
        throw new InputError(
          '图案存储尚未就绪，请重新启动本机看板。草稿已保留。',
        );
      const body = await readBody(request);
      const m = await getMedal(db, owner, body.id);
      const environment = await resolveCoachEnvironment(env);
      const pending: Promise<unknown>[] = [];
      const started = await startMedalArt(
        db,
        owner,
        env.MEDAL_IMAGES,
        environment,
        {
          id: m.id,
          revision: body.revision as number,
          requestId: body.requestId as string,
        },
        (work) => {
          waitUntil(work);
          pending.push(work);
        },
      );
      if (body.background === true) return started;
      // Keep the wall's existing response contract while sharing its task with Captain.
      await Promise.all(pending);
      let job = await medalArtJob(db, owner, m.id, m.revision, started.job.id);
      const deadline = Date.now() + 330000;
      while (job?.status === 'pending' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        job = await medalArtJob(db, owner, m.id, m.revision, started.job.id);
      }
      if (job?.status !== 'complete')
        throw new InputError(
          job?.status === 'pending'
            ? '图案仍在生成，规则已保存，可稍后取回同一任务。'
            : '图案生成未完成，规则已保留，请重试。',
        );
      return getMedal(db, owner, m.id);
    },
    true,
  );
}
export async function GET(request: Request) {
  return api(request, async (db, owner) => {
    const url = new URL(request.url);
    const m = await getMedal(db, owner, url.searchParams.get('id'));
    if (url.searchParams.get('task') === 'latest')
      return {
        job: await medalArtJob(
          db,
          owner,
          m.id,
          m.revision,
          url.searchParams.get('job') || undefined,
        ),
      };
    const key = url.searchParams.get('key');
    if (
      !key ||
      ![m.art, ...m.versions.map((v) => v.art)].some(
        (a) => a.kind === 'generated' && a.key === key,
      )
    )
      throw new InputError('图案不存在或已被替换。');
    const object = await env.MEDAL_IMAGES?.get(key);
    if (!object) return new Response('图案暂时无法读取', { status: 404 });
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/png',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
