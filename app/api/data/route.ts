import { getMedalFacts } from '@/db/medal-facts';
import { api } from '@/lib/api';
import { snapshot } from '@/db/repository';
import { localizeEntry } from '@/lib/food-localization';
import { medalViews } from '@/db/medals';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(request, async (db, owner) => {
    const data = await snapshot(db, owner);
    const medalFacts = await getMedalFacts(db, owner, data);
    return {
      medalFacts,
      ...data,
      medals: await medalViews(db, owner, data.records, medalFacts),
      records: data.records.map(localizeEntry),
    };
  });
}
