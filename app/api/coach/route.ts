import { env } from 'cloudflare:workers';
import { api, readBody } from '@/lib/api';
import {
  coachState,
  coachTick,
  coachCursor,
  updateCoachSettings,
  acknowledgeCoach,
} from '@/lib/coach-service';
export const dynamic = 'force-dynamic';
export async function GET(r: Request) {
  return api(r, (db, owner) =>
    coachState(
      db,
      owner,
      env,
      coachCursor(new URL(r.url).searchParams.get('before')),
    ),
  );
}
export async function POST(r: Request) {
  return api(r, (db, owner) => coachTick(db, owner, env), true);
}
export async function PATCH(r: Request) {
  return api(
    r,
    async (db, owner) => {
      const b = await readBody(r);
      if (b.action === 'acknowledge') return acknowledgeCoach(db, owner, b);
      return updateCoachSettings(db, owner, env, b);
    },
    true,
  );
}
