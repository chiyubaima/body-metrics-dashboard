import { api, readBody } from '@/lib/api';
import { trash, restoreEntry } from '@/db/repository';
import { localizeEntry } from '@/lib/food-localization';
export const dynamic = 'force-dynamic';
export async function GET(r: Request) {
  return api(r, async (db, owner) =>
    (await trash(db, owner)).map(localizeEntry),
  );
}
export async function PATCH(r: Request) {
  return api(
    r,
    async (db, owner) => {
      const b = await readBody(r);
      return restoreEntry(db, owner, b.ids ?? b.id);
    },
    true,
  );
}
