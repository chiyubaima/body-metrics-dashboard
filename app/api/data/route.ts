import { getMedalFacts } from '@/db/medal-facts';
import { api } from '@/lib/api';
import { snapshot } from '@/db/repository';
import { localizeEntry } from '@/lib/food-localization';
import { medalViews } from '@/db/medals';
import { dashboardData } from '@/lib/dashboard-data';
import { InputError, validDate } from '@/lib/model';
import type { Kind } from '@/lib/model';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(request, async (db, owner) => {
    const query = new URL(request.url).searchParams;
    const view = query.get('view');
    if (view && !['dashboard', 'context'].includes(view))
      throw new InputError('读取范围有误。');
    const date = view === 'dashboard' ? validDate(query.get('date')) : null;
    const kind = query.get('kind');
    if (
      view === 'context' &&
      !['body', 'diet', 'training'].includes(kind ?? '')
    )
      throw new InputError('请选择记录类型。');
    const data = await snapshot(
      db,
      owner,
      view === 'context' ? (kind as Kind) : undefined,
    );
    if (view === 'context')
      return {
        ...data,
        records: data.records.filter((r) => r.kind === kind).map(localizeEntry),
      };
    const medalFacts = await getMedalFacts(db, owner, data);
    const complete = {
      medalFacts,
      ...data,
      medals: await medalViews(db, owner, data.records, medalFacts),
    };
    const result = date ? dashboardData(complete, date) : complete;
    return { ...result, records: result.records.map(localizeEntry) };
  });
}
