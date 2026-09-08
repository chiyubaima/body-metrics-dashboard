import { api } from '@/lib/api';
import { searchFoods } from '@/lib/food-search';
import { InputError } from '@/lib/model';
export const dynamic = 'force-dynamic';
export async function GET(r: Request) {
  return api(r, async () => {
    const p = new URL(r.url).searchParams,
      offset = Number(p.get('offset') ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 30000)
      throw new InputError('请重新搜索食物。');
    return searchFoods(p.get('q') ?? '', offset, p.get('basis') ?? 'all');
  });
}
