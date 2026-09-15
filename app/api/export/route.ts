import { recordMedalFact, exportMedalFacts } from '@/db/medal-facts';
import { api } from '@/lib/api';
import { snapshot, trash } from '@/db/repository';
import { exportCoach } from '@/db/coach';
import { listMedals } from '@/db/medals';
import { env } from 'cloudflare:workers';
export const dynamic = 'force-dynamic';
export async function GET(r: Request) {
  const response = await api(r, async (db, owner) => {
    const medals = await listMedals(db, owner);
    const keys = [
      ...new Set(
        medals
          .flatMap((m) => [m.art, ...m.versions.map((v) => v.art)])
          .flatMap((a) => (a.key ? [a.key] : [])),
      ),
    ];
    const medalImages = [];
    for (const key of keys) {
      const image = await env.MEDAL_IMAGES?.get(key);
      if (!image) {
        medalImages.push({ key, missing: true });
        continue;
      }
      const bytes = new Uint8Array(await image.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      medalImages.push({
        key,
        type: image.httpMetadata?.contentType,
        base64: btoa(binary),
      });
    }
    const [data, deleted, coach] = await Promise.all([
      snapshot(db, owner),
      trash(db, owner),
      exportCoach(db, owner),
    ]);
    await recordMedalFact(db, owner, 'backups_created', crypto.randomUUID());
    return {
      version: 4,
      medalFacts: await exportMedalFacts(db, owner),
      exportedAt: new Date().toISOString(),
      ...data,
      trash: deleted,
      coach,
      medals,
      medalImages,
    };
  });
  if (response.ok)
    response.headers.set(
      'Content-Disposition',
      'attachment; filename="body-journal-backup.json"',
    );
  return response;
}
