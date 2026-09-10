import { api, readBody } from '@/lib/api';
import { acceptCoachProposal, dismissCoachProposal } from '@/db/coach';
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
export async function PATCH(r: Request) {
  return api(
    r,
    async (db, owner) => {
      const b = await readBody(r);
      return dismissCoachProposal(db, owner, b.turnId, b.proposalId);
    },
    true,
  );
}
