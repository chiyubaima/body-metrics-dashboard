import { api, readBody } from '@/lib/api';
import { acceptCoachProposal } from '@/db/coach';
export async function POST(r: Request) {
  return api(
    r,
    async (db, owner) => {
      const b = await readBody(r);
      return acceptCoachProposal(db, owner, b.turnId, b.proposalId);
    },
    true,
  );
}
