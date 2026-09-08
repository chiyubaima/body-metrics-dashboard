import Dashboard from './dashboard';
import { headers } from 'next/headers';
import { requireChatGPTUser, chatGPTSignInPath } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  await requireChatGPTUser('/');
  const host = (await headers()).get('host') ?? '';
  return (
    <Dashboard
      signInPath={chatGPTSignInPath('/')}
      localPreview={/^(localhost|127\.0\.0\.1)(:|$)/.test(host)}
    />
  );
}
