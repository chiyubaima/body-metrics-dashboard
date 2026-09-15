import { api } from '@/lib/api';
import { snapshot } from '@/db/repository';
import { medalViews, claimMedalNotifications } from '@/db/medals';
export async function POST(request: Request) {
  return api(
    request,
    async (db, owner) => ({
      awards: await claimMedalNotifications(
        db,
        owner,
        await medalViews(db, owner, (await snapshot(db, owner)).records),
      ),
    }),
    true,
  );
}
