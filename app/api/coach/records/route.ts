import { api, readBody } from '@/lib/api';
import { confirmCoachRecord } from '@/db/coach';

export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) => confirmCoachRecord(db, owner, await readBody(r)),
    true,
  );
}
