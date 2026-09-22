import { api } from '@/lib/api';
import { accessResponse } from '@/db/journal-access';

export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return api(
    request,
    (db, owner) => accessResponse(db, owner, request),
    false,
    true,
  );
}
export function POST(request: Request) {
  return api(
    request,
    (db, owner) => accessResponse(db, owner, request),
    true,
    true,
  );
}
