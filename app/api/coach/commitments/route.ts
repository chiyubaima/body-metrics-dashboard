import { api, readBody } from '@/lib/api';
import { saveCommitment, changeCommitment } from '@/db/coach';
export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) => saveCommitment(db, owner, await readBody(r)),
    true,
  );
}
export async function PATCH(r: Request) {
  return api(
    r,
    async (db, owner) => changeCommitment(db, owner, await readBody(r)),
    true,
  );
}
