import { env } from 'cloudflare:workers';
import { api, readBody } from '@/lib/api';
import { resolveCoachEnvironment } from '@/lib/coach-local';
import { interpretMedal } from '@/lib/medal-generation';
import { runMedalGeneration } from '@/db/medals';
import { InputError } from '@/lib/model';
export async function POST(request: Request) {
  return api(
    request,
    async (db, owner) => {
      const body = await readBody(request);
      if (
        typeof body.input !== 'string' ||
        !body.input.trim() ||
        body.input.length > 4000
      )
        throw new InputError('请用 4000 字以内描述目标。');
      const environment = await resolveCoachEnvironment(env);
      return runMedalGeneration(
        db,
        owner,
        body.requestId,
        JSON.stringify(['text', body.input]),
        () => interpretMedal(environment, body.input),
      );
    },
    true,
  );
}
