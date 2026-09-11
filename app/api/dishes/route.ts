import { api, readBody } from '@/lib/api';
import { listDishes, deleteDish } from '@/db/dishes';
import { searchDishes } from '@/lib/dishes';
import { InputError } from '@/lib/model';

export const dynamic = 'force-dynamic';
export async function GET(r: Request) {
  return api(r, async (db, owner) => {
    const p = new URL(r.url).searchParams,
      offset = Number(p.get('offset') ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 30000)
      throw new InputError('请重新搜索菜品。');
    return searchDishes(
      await listDishes(db, owner),
      (p.get('q') ?? '').slice(0, 80),
      offset,
      p.get('basis') ?? 'all',
    );
  });
}
export async function DELETE(r: Request) {
  return api(
    r,
    async (db, owner) => deleteDish(db, owner, (await readBody(r)).id),
    true,
  );
}
