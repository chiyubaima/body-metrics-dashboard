import { api, readBody } from '@/lib/api';
import {
  saveCoachMemory,
  deleteCoachMemory,
  permanentlyForgetCoachItem,
} from '@/db/coach';
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
    async (db, owner) => {
      const body = await readBody(r);
      return body.permanent === true
        ? permanentlyForgetCoachItem(db, owner, 'memory', body.id)
        : deleteCoachMemory(db, owner, body.id);
    },
    true,
  );
}
