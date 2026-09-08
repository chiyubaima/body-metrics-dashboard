import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/db';
import { InputError } from '@/lib/model';
export async function api(
  request: Request,
  action: (db: D1Database, owner: string) => Promise<unknown>,
  mutating = false,
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: '请先登录后再查看或保存记录。' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  if (mutating) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { error: '请求来源不匹配，请刷新后重试。' },
        { status: 403 },
      );
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return Response.json({ error: '请使用记录表单提交。' }, { status: 415 });
  }
  try {
    return Response.json(await action(database(), user.userId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof InputError)
      return Response.json(
        { error: error.message },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    console.error(
      'Record operation failed',
      error instanceof Error ? error.name : 'unknown',
    );
    return Response.json(
      { error: '暂时无法保存或读取，输入会保留，请稍后重试。' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export async function readBody(request: Request) {
  const body = await request.text();
  if (body.length > 64000) throw new InputError('内容太长，请分次记录。');
  try {
    const value = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new InputError('内容格式有误，请重新填写。');
  }
}
