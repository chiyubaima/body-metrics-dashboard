import { api, readBody } from '@/lib/api';
import { savePlan } from '@/db/repository';
export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) => savePlan(db, owner, await readBody(r)),
    true,
  );
}
