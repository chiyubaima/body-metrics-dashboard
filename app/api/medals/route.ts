import { api, readBody } from '@/lib/api';
import { snapshot } from '@/db/repository';
import { medalViews, saveMedal } from '@/db/medals';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(request, async (db, owner) => ({
    medals: await medalViews(
      db,
      owner,
      (await snapshot(db, owner)).records,
    ),
  }));
}
export async function POST(request: Request) {
  return api(
    request,
    async (db, owner) => {
      const body = await readBody(request);
      return saveMedal(
        db,
        owner,
        body,
        (await snapshot(db, owner)).records,
      );
    },
    true,
  );
}
