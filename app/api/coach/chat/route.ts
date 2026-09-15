import { env, waitUntil } from 'cloudflare:workers';
import { startMedalArt } from '@/lib/medal-art-service';
import { resolveCoachEnvironment } from '@/lib/coach-local';
import type { Medal } from '@/lib/medals';
import { api, readBody } from '@/lib/api';
import { coachChat } from '@/lib/coach-service';
import { generateCoachReply } from '@/lib/coach-model';
import { streamFrame } from '@/lib/coach-stream';
import { InputError } from '@/lib/model';
export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) => {
      const body = await readBody(r);
      const onMedalArtRequested = async (m: Medal) =>
        startMedalArt(
          db,
          owner,
          env.MEDAL_IMAGES,
          await resolveCoachEnvironment(env),
          {
            id: m.id,
            revision: m.revision,
            requestId: `${m.id}_${m.revision}_art`,
          },
          waitUntil,
        );
      if (!r.headers.get('accept')?.includes('text/event-stream'))
        return coachChat(db, owner, env, body, undefined, undefined, {
          onMedalArtRequested,
        });
      const abort = new AbortController();
      const signal = AbortSignal.any([r.signal, abort.signal]);
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: unknown) => {
              if (!signal.aborted)
                controller.enqueue(encoder.encode(streamFrame(event)));
            };
            try {
              const result = await coachChat(
                db,
                owner,
                env,
                body,
                (environment, instructions, input, _fetcher, options) =>
                  generateCoachReply(environment, instructions, input, fetch, {
                    signal: AbortSignal.any([
                      signal,
                      ...(options?.signal ? [options.signal] : []),
                    ]),
                    onDelta: (delta) => send({ type: 'delta', delta }),
                  }),
                new Date(),
                {
                  signal,
                  onMedalArtRequested,
                  onProgress: (progress) => send({ type: 'tool', progress }),
                },
              );
              send({ type: 'done', turn: result.turn });
            } catch (error) {
              send({
                type: 'error',
                error:
                  error instanceof InputError
                    ? error.message
                    : '回复中断了，消息已保留，可以原地重试。',
              });
            } finally {
              try {
                controller.close();
              } catch {
                /* The client already canceled. */
              }
            }
          },
          cancel() {
            abort.abort();
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store, no-transform',
            'X-Accel-Buffering': 'no',
          },
        },
      );
    },
    true,
  );
}
