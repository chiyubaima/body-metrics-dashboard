'use client';
import { useEffect, useRef, useState, useId } from 'react';
import { ArrowUpRight, Check, KeyRound, Laptop, RotateCcw } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Field, Picker } from './form-controls';
import type { CoachLocalSettings } from '@/lib/coach-local';

const endpoint = '/api/coach/connection';
async function connectionRequest<T = CoachLocalSettings>(
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || '连接操作未完成，请重试。');
  return result;
}

export function CoachConnection({
  visible,
  disabled,
  onSaved,
}: {
  visible: boolean;
  disabled: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [settings, setSettings] = useState<CoachLocalSettings | null>(null);
  const [mode, setMode] = useState('codex');
  const [protocol, setProtocol] = useState('responses');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const initialized = useRef(false);
  const onSavedRef = useRef(onSaved);
  const fieldId = useId();
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    connectionRequest()
      .then((value: CoachLocalSettings) => {
        if (cancelled) return;
        setSettings(value);
        setError('');
        if (!initialized.current) {
          setMode(value.provider === 'codex' ? 'codex' : 'api');
          setProtocol(value.api.protocol);
          setBaseUrl(value.api.baseUrl);
          setModel(value.api.model);
          initialized.current = true;
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || settings?.codex.status !== 'pending') return;
    let cancelled = false,
      checking = false;
    const timer = setInterval(async () => {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const value: CoachLocalSettings = await connectionRequest();
        if (cancelled) return;
        setSettings(value);
        if (value.codex.status === 'logged-in') {
          setNotice('Codex 登录成功，可以保存连接并启用 Captain。');
          await onSavedRef.current();
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        checking = false;
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [visible, settings?.codex.status]);

  async function check() {
    setWorking(true);
    setError('');
    setNotice('');
    try {
      setSettings(await connectionRequest());
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function login() {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const codex = await connectionRequest<CoachLocalSettings['codex']>(
        'POST',
        { action: 'start' },
      );
      setSettings((current) => (current ? { ...current, codex } : current));
      if (codex.loginUrl) popup?.location.replace(codex.loginUrl);
      else popup?.close();
    } catch (e) {
      popup?.close();
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function cancelLogin() {
    setWorking(true);
    setError('');
    try {
      const codex = await connectionRequest<CoachLocalSettings['codex']>(
        'POST',
        { action: 'cancel' },
      );
      setSettings((current) => (current ? { ...current, codex } : current));
      setNotice('已取消这次登录。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const value = await connectionRequest(
        'PUT',
        mode === 'codex'
          ? { provider: 'codex' }
          : { provider: protocol, baseUrl, model, apiKey },
      );
      setSettings((current) => (current ? { ...current, ...value } : current));
      setApiKey('');
      await onSaved();
      setNotice('连接已切换，在下方启用 Captain 即可聊天。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  const busy = working || loading || disabled;
  const codex = settings?.codex;
  const sameAddress =
    settings?.api.baseUrl.replace(/\/+$/, '') ===
    baseUrl.trim().replace(/\/+$/, '');
  return (
    <div className="coach-provider-settings" data-annotate="coach.connection">
      <form onSubmit={save}>
        <fieldset className="coach-provider-fields" disabled={busy}>
          <RadioGroup
            aria-label="连接方式"
            className="coach-provider-options"
            value={mode}
            disabled={busy}
            onValueChange={(value) => {
              setMode(value);
              setNotice('');
            }}
          >
            <label htmlFor={`${fieldId}-codex`}>
              <RadioGroupItem value="codex" id={`${fieldId}-codex`} />
              <Laptop size={21} />
              <b>Codex 登录</b>
              <span>使用 ChatGPT 账号</span>
            </label>
            <label htmlFor={`${fieldId}-api`}>
              <RadioGroupItem value="api" id={`${fieldId}-api`} />
              <KeyRound size={21} />
              <b>模型 API</b>
              <span>连接自己的模型服务</span>
            </label>
          </RadioGroup>
          {mode === 'codex' ? (
            <div className="coach-provider-detail">
              <div className="coach-account-state">
                <span>
                  {loading && !settings ? (
                    '正在检查登录…'
                  ) : codex?.status === 'logged-in' ? (
                    <>
                      <Check size={16} /> 已登录 ChatGPT
                    </>
                  ) : codex?.status === 'pending' ? (
                    '等待你完成官方授权'
                  ) : codex?.status === 'error' ? (
                    '连接需要重新检查'
                  ) : (
                    '尚未登录 ChatGPT'
                  )}
                </span>
                <code>gpt-6-astra</code>
              </div>
              <p>通过本机 Codex 使用账号额度，无需填写 API 密钥。</p>
              {codex?.message && <output>{codex.message}</output>}
              {codex?.status === 'pending' ? (
                <div className="coach-provider-actions">
                  <a
                    className="secondary"
                    href={codex.loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    打开官方授权页 <ArrowUpRight size={15} />
                  </a>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={cancelLogin}
                  >
                    取消登录
                  </button>
                </div>
              ) : (
                <div className="coach-provider-actions">
                  {settings && codex?.status !== 'logged-in' && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={login}
                    >
                      登录 ChatGPT <ArrowUpRight size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={check}
                  >
                    <RotateCcw size={14} /> 重新检查
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="coach-api-fields">
              <Field label="API 协议">
                <Picker
                  label="API 协议"
                  popupClassName="captain-picker"
                  value={protocol}
                  onChange={setProtocol}
                  options={[
                    ['responses', 'Responses API'],
                    ['chat-completions', 'Chat Completions（兼容接口）'],
                  ]}
                />
              </Field>
              <Field label="API 根地址">
                <input
                  aria-label="API 根地址"
                  type="url"
                  required
                  value={baseUrl}
                  maxLength={500}
                  placeholder="https://api.openai.com/v1"
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </Field>
              <Field label="模型名称">
                <input
                  aria-label="模型名称"
                  required
                  value={model}
                  maxLength={150}
                  placeholder="填写服务商提供的模型名称"
                  onChange={(e) => setModel(e.target.value)}
                />
              </Field>
              <Field label="API 密钥">
                <input
                  aria-label="API 密钥"
                  type="password"
                  value={apiKey}
                  maxLength={4096}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={
                    settings?.api.hasKey && sameAddress
                      ? '已保存；留空保留现有密钥'
                      : '填写此服务的 API 密钥'
                  }
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </Field>
              <p className="coach-setting-copy">
                密钥仅保存在这台电脑的服务端，不会回显。更换 API
                地址需填写对应密钥；本机免密服务可留空。
              </p>
            </div>
          )}
          {error && (
            <p className="coach-provider-feedback" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <output className="coach-provider-feedback">{notice}</output>
          )}
          <button
            type="submit"
            className="secondary coach-provider-save"
            disabled={
              busy ||
              !settings ||
              (mode === 'codex' && codex?.status !== 'logged-in')
            }
          >
            {working ? '正在处理…' : '保存并切换连接'}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
