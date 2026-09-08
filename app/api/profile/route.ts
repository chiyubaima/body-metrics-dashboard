import { api, readBody } from '@/lib/api';
import { saveProfile } from '@/db/repository';
export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) => saveProfile(db, owner, await readBody(r)),
    true,
  );
}
