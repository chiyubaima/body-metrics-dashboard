import { api } from '@/lib/api';
import { snapshot, trash } from '@/db/repository';
import { exportCoach } from '@/db/coach';
export const dynamic = 'force-dynamic';
export async function GET(r: Request) {
  const response = await api(r, async (db, owner) => ({
    version: 2,
    exportedAt: new Date().toISOString(),
    ...(await snapshot(db, owner)),
    trash: await trash(db, owner),
    coach: await exportCoach(db, owner),
  }));
  if (response.ok)
    response.headers.set(
      'Content-Disposition',
      'attachment; filename="body-journal-backup.json"',
    );
  return response;
}
