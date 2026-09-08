import { api } from '@/lib/api';
import { snapshot } from '@/db/repository';
import { localizeEntry } from '@/lib/food-localization';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(request, async (db, owner) => {
    const data = await snapshot(db, owner);
    return { ...data, records: data.records.map(localizeEntry) };
  });
}
