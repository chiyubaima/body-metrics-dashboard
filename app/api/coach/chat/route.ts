import { env } from 'cloudflare:workers';
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
      if (!r.headers.get('accept')?.includes('text/event-stream'))
        return coachChat(db, owner, env, body);
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
                (environment, instructions, input) =>
                  generateCoachReply(environment, instructions, input, fetch, {
                    signal,
                    onDelta: (delta) => send({ type: 'delta', delta }),
                  }),
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
