import { api, readBody } from '@/lib/api';
import {
  listAnnotations,
  saveAnnotation,
  setAnnotationStatus,
  deleteAnnotation,
} from '@/db/annotations';
export const dynamic = 'force-dynamic';
function launchScope(r: Request) {
  return new URL(r.url).searchParams.get('scope') === 'launch';
}
function allowLockedLaunch(r: Request) {
  return (
    launchScope(r) &&
    process.env.NODE_ENV === 'development' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(r.url).hostname)
  );
}
export async function GET(r: Request) {
  return api(
    r,
    (db, owner) => listAnnotations(db, owner, launchScope(r)),
    false,
    allowLockedLaunch(r),
  );
}
export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) =>
      saveAnnotation(db, owner, await readBody(r), launchScope(r)),
    true,
    allowLockedLaunch(r),
  );
}
export async function PATCH(r: Request) {
  return api(
    r,
    async (db, owner) => {
      const b = await readBody(r);
      return setAnnotationStatus(db, owner, b.id, b.status, launchScope(r));
    },
    true,
    allowLockedLaunch(r),
  );
}
export async function DELETE(r: Request) {
  return api(
    r,
    async (db, owner) =>
      deleteAnnotation(db, owner, (await readBody(r)).id, launchScope(r)),
    true,
    allowLockedLaunch(r),
  );
}
