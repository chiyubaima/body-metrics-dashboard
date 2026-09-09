import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createCoachConfiguration } from './coach-configuration.mjs';

if (!process.stdin.isTTY) {
  console.error(
    '请在本机交互终端运行 npm run coach:setup；密钥不通过命令参数或聊天发送。',
  );
  process.exitCode = 1;
} else {
  let masked = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!masked) process.stdout.write(chunk);
      done();
    },
  });
  const input = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  try {
    const provider =
      (
        await input.question(
          '模型连接：1 本机 Codex（默认） / 2 Responses API / 3 兼容 Chat Completions API：',
        )
      ).trim() || '1';
    if (!['1', '2', '3'].includes(provider)) throw new Error('请选择1、2或3。');
    const settings = {
      COACH_PROVIDER:
        provider === '1'
          ? 'codex'
          : provider === '2'
            ? 'responses'
            : 'chat-completions',
    };
    if (provider !== '1') {
      const base =
        (
          await input.question('API 根地址（默认 https://api.openai.com/v1）：')
        ).trim() || 'https://api.openai.com/v1';
      const url = new URL(base),
        local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
      )
        throw new Error(
          '请使用不含密码、参数和片段的 HTTPS 地址；本机模型可使用回环 HTTP 地址。',
        );
      settings.COACH_API_BASE_URL = url.href.replace(/\/$/, '');
      settings.COACH_MODEL = (await input.question('模型名称：')).trim();
      if (!settings.COACH_MODEL || settings.COACH_MODEL.length > 150)
        throw new Error('请填写有效模型名称。');
      process.stdout.write('API 密钥（输入不显示；本机免密服务可留空）：');
      masked = true;
      try {
        settings.COACH_API_KEY = (await input.question('')).trim();
      } finally {
        masked = false;
        process.stdout.write('\n');
      }
      if (!settings.COACH_API_KEY && !local)
        throw new Error('云端 API 需要密钥，未保存任何配置。');
    }
    const configuration = await createCoachConfiguration();
    await configuration.save({
      provider: settings.COACH_PROVIDER,
      baseUrl: settings.COACH_API_BASE_URL,
      model: settings.COACH_MODEL,
      apiKey: settings.COACH_API_KEY ?? '',
    });
    console.log(
      '连接已保存并立即生效。打开 Captain 设置，核对服务后启用；Codex 登录也可以在设置中完成。',
    );
  } catch (e) {
    console.error('连接配置未完成：' + e.message);
    process.exitCode = 1;
  } finally {
    input.close();
  }
}
