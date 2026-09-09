import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { InputError } from '../lib/model.ts';

const defaultPath = fileURLToPath(
  new URL('../.dev.vars.coach.json', import.meta.url),
);
const defaultApi = {
  protocol: 'responses',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  apiKey: '',
};

function apiAddress(value) {
  try {
    if (typeof value !== 'string' || value.length > 500) throw new Error();
    const url = new URL(value.trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    )
      throw new Error();
    return { baseUrl: url.href.replace(/\/+$/, ''), local };
  } catch {
    throw new InputError(
      '请填写 HTTPS API 根地址；本机服务可以使用 localhost 的 HTTP 地址。',
    );
  }
}

/** @param {{path?: string, seed?: Record<string, string | undefined>}} [options] */
export async function createCoachConfiguration({
  path = defaultPath,
  seed,
} = {}) {
  if (!seed) {
    let vars = {};
    try {
      vars = parseEnv(
        await readFile(new URL('../.dev.vars', import.meta.url), 'utf8'),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    seed = { ...process.env, ...vars };
  }
  const initial = {
    provider: seed.COACH_PROVIDER || (seed.COACH_MODEL ? 'responses' : 'codex'),
    revision: '',
    api: {
      protocol:
        seed.COACH_PROVIDER === 'chat-completions'
          ? 'chat-completions'
          : 'responses',
      baseUrl: seed.COACH_API_BASE_URL || defaultApi.baseUrl,
      model: seed.COACH_MODEL || '',
      apiKey: seed.COACH_API_KEY || '',
    },
  };
  async function read() {
    try {
      const value = JSON.parse(await readFile(path, 'utf8'));
      if (
        !['codex', 'responses', 'chat-completions'].includes(value.provider) ||
        typeof value.revision !== 'string' ||
        !value.api ||
        !['responses', 'chat-completions'].includes(value.api.protocol) ||
        ['baseUrl', 'model', 'apiKey'].some(
          (key) => typeof value.api[key] !== 'string',
        )
      )
        throw new Error();
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(initial);
      throw new InputError('本机模型配置无法读取，请检查配置文件后重试。');
    }
  }
  function publicSettings(value) {
    return {
      provider: value.provider,
      api: {
        protocol: value.api.protocol,
        baseUrl: value.api.baseUrl,
        model: value.api.model,
        hasKey: !!value.api.apiKey,
      },
    };
  }
  let saving = Promise.resolve();
  function save(input) {
    const operation = saving.then(async () => {
      if (
        !input ||
        !['codex', 'responses', 'chat-completions'].includes(input.provider)
      )
        throw new InputError('请选择 Codex 或模型 API。');
      const current = await read();
      let api = current.api;
      if (input.provider !== 'codex') {
        const address = apiAddress(input.baseUrl);
        const model = typeof input.model === 'string' ? input.model.trim() : '';
        if (!model || model.length > 150 || /[\r\n\x00-\x1f]/.test(model))
          throw new InputError('请填写有效的模型名称，最多150个字符。');
        if (
          typeof input.apiKey !== 'string' ||
          input.apiKey.length > 4096 ||
          /[\r\n\x00-\x1f]/.test(input.apiKey)
        )
          throw new InputError('请重新填写 API 密钥。');
        const provided = input.apiKey.trim();
        const sameAddress =
          address.baseUrl === current.api.baseUrl.replace(/\/+$/, '');
        const apiKey = provided || (sameAddress ? current.api.apiKey : '');
        if (!apiKey && !address.local)
          throw new InputError(
            sameAddress
              ? '请填写 API 密钥后保存。'
              : 'API 地址已变化，请为新地址填写密钥。',
          );
        api = {
          protocol: input.provider,
          baseUrl: address.baseUrl,
          model,
          apiKey,
        };
      }
      const value = { provider: input.provider, api, revision: randomUUID() };
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(value) + '\n', {
          mode: 0o600,
          flag: 'wx',
        });
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
      return publicSettings(value);
    });
    saving = operation.catch(() => {});
    return operation;
  }
  return {
    read,
    save,
    publicSettings,
    async environment() {
      const value = await read();
      return {
        COACH_PROVIDER: value.provider,
        COACH_API_BASE_URL: value.api.baseUrl,
        COACH_MODEL: value.api.model,
        COACH_API_KEY: value.api.apiKey,
        COACH_CONFIG_REVISION: value.revision,
      };
    },
  };
}
