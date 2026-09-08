import { api, readBody } from '@/lib/api';
import { saveEntry, removeEntry, restoreEntry } from '@/db/repository';
export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) => saveEntry(db, owner, await readBody(r)),
    true,
  );
}
export async function DELETE(r: Request) {
  return api(
    r,
    async (db, owner) => {
      const b = await readBody(r);
      return removeEntry(db, owner, b.ids ?? b.id);
    },
    true,
  );
}
export async function PATCH(r: Request) {
  return api(
    r,
    async (db, owner) => restoreEntry(db, owner, (await readBody(r)).id),
    true,
  );
}
