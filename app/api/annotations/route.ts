import { api, readBody } from '@/lib/api';
import {
  listAnnotations,
  saveAnnotation,
  setAnnotationStatus,
  deleteAnnotation,
} from '@/db/annotations';
export const dynamic = 'force-dynamic';
export async function GET(r: Request) {
  return api(r, listAnnotations);
}
export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) => saveAnnotation(db, owner, await readBody(r)),
    true,
  );
}
export async function PATCH(r: Request) {
  return api(
    r,
    async (db, owner) => {
      const b = await readBody(r);
      return setAnnotationStatus(db, owner, b.id, b.status);
    },
    true,
  );
}
export async function DELETE(r: Request) {
  return api(
    r,
    async (db, owner) => deleteAnnotation(db, owner, (await readBody(r)).id),
    true,
  );
}
