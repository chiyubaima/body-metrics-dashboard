import { api, readBody } from '@/lib/api';
import { saveCoachMemory, deleteCoachMemory } from '@/db/coach';
export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) => saveCoachMemory(db, owner, await readBody(r)),
    true,
  );
}
export async function DELETE(r: Request) {
  return api(
    r,
    async (db, owner) => deleteCoachMemory(db, owner, (await readBody(r)).id),
    true,
  );
}
