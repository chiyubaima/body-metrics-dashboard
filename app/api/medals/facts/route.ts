import { api, readBody } from '@/lib/api';
import { InputError } from '@/lib/model';
import { recordMedalFact } from '@/db/medal-facts';
export async function POST(request: Request) {
  return api(
    request,
    async (db, owner) => {
      const body = await readBody(request);
      if (
        body.metric !== 'guide_completed' &&
        body.metric !== 'strength_viewed'
      )
        throw new InputError('该行为只能在业务成功后由服务记录。');
      await recordMedalFact(db, owner, body.metric, 'first');
      return { recorded: true };
    },
    true,
  );
}
