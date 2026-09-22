'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  LockKeyhole,
  Utensils,
} from 'lucide-react';
import type { AccessStatus } from '@/lib/journal-access';
import Dashboard from './dashboard';
import { DeveloperMode } from './developer-mode';
import { today } from '@/lib/model';
import './journal-access.css';

async function access(action?: string, pin?: string, confirmation?: string) {
  let response: Response;
  try {
    response = await fetch(
      '/api/access',
      action
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, pin, confirmation }),
            signal: AbortSignal.timeout(10000),
          }
        : { cache: 'no-store', signal: AbortSignal.timeout(10000) },
    );
  } catch {
    throw new Error('连接暂时中断，请重试。');
  }
  const result = (await response.json().catch(() => {
    throw new Error('服务暂时没有响应，请稍后重试。');
  })) as AccessStatus & { error?: string };
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || '暂时无法打开日记，请重试。'),
      { result },
    );
  return result;
}

export default function JournalAccess({
  signInPath,
  localPreview,
}: {
  signInPath: string;
  localPreview: boolean;
}) {
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [error, setError] = useState('');
  const [entering, setEntering] = useState(false);
  const [lockVersion, setLockVersion] = useState(0);
  const version = useRef({ value: 0, lock: 0 });
  const channel = useRef<BroadcastChannel | null>(null);
  const locked = useCallback(() => {
    version.current.value++;
    setEntering(false);
    setLockVersion(++version.current.lock);
    setStatus((current) =>
      current ? { ...current, unlocked: false } : current,
    );
  }, []);
  const check = useCallback(async () => {
    const current = ++version.current.value;
    try {
      const next = await access();
      if (current === version.current.value) {
        setStatus((previous) =>
          previous && !previous.unlocked && next.unlocked ? previous : next,
        );
        setError('');
      }
    } catch (e) {
      if (current === version.current.value) {
        setStatus((previous) =>
          previous ? { ...previous, unlocked: false } : null,
        );
        setError(e instanceof Error ? e.message : '暂时无法连接，请重试。');
      }
    }
  }, []);
  useEffect(() => {
    const lifecycle = version.current;
    void Promise.resolve().then(check);
    const visible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) {
        locked();
        void check();
      }
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    window.addEventListener('pageshow', restored);
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('body-journal-access');
      channel.current.onmessage = (event) => {
        if (event.data === 'locked') locked();
      };
    }
    const broadcast = channel.current;
    const timer = setInterval(visible, 60000);
    return () => {
      lifecycle.value++;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
      window.removeEventListener('pageshow', restored);
      broadcast?.close();
      channel.current = null;
    };
  }, [check, locked]);
  async function lock() {
    await access('lock');
    channel.current?.postMessage('locked');
    locked();
  }
  if (status?.unlocked)
    return (
      <div className={entering ? 'journal-entering' : undefined}>
        <Dashboard
          signInPath={signInPath}
          localPreview={localPreview}
          onLock={lock}
        />
      </div>
    );
  return (
    <PinScreen
      key={`${lockVersion}-${!status ? 'loading' : status.configured ? 'unlock' : 'setup'}`}
      status={status}
      localPreview={localPreview}
      error={error}
      onRetry={() => void check()}
      onUnlocked={(next) => {
        if (version.current.lock !== lockVersion) return;
        version.current.value++;
        setEntering(true);
        setStatus(next);
      }}
      onStatus={setStatus}
    />
  );
}

export function PinScreen({
  status,
  error: connectionError,
  onRetry,
  onUnlocked,
  onStatus,
  localPreview = false,
}: {
  status: AccessStatus | null;
  error: string;
  onRetry: () => void;
  onUnlocked: (status: AccessStatus) => void;
  onStatus: (status: AccessStatus) => void;
  localPreview?: boolean;
}) {
  const [date] = useState(today);
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const [retryAt, setRetryAt] = useState(
    () => Date.now() + (status?.retryAfter ?? 0) * 1000,
  );
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configured = !!status?.configured;
  const confirming = !configured && !!firstPin;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const remaining = Math.max(0, Math.ceil((retryAt - clock) / 1000));
  const ready = !!status;
  const blocked = remaining > 0;
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const countdown = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(countdown);
  }, [retryAt]);
  useEffect(() => {
    if (ready && !busy && !success && !blocked)
      input.current?.focus({ preventScroll: true });
  }, [ready, busy, success, blocked]);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working.current || success || !status || pin.length !== 4 || remaining)
      return;
    setError('');
    if (!configured && !confirming) {
      setFirstPin(pin);
      setPin('');
      input.current?.focus();
      return;
    }
    if (confirming && pin !== firstPin) {
      setError('两次密码不一致，再确认一次。');
      setPin('');
      setAttempt((value) => value + 1);
      input.current?.focus();
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      const next = await access(
        configured ? 'unlock' : 'setup',
        confirming ? firstPin : pin,
        confirming ? pin : undefined,
      );
      if (!alive.current) return;
      setPin('');
      setFirstPin('');
      setSuccess(true);
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      timer.current = setTimeout(() => onUnlocked(next), reduced ? 100 : 850);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : '暂时无法解锁，请重试。');
      const result = (e as { result?: Partial<AccessStatus> }).result;
      if (result?.configured !== undefined) {
        onStatus({ ...status, configured: result.configured });
        setFirstPin('');
      }
      setClock(Date.now());
      setRetryAt(Date.now() + (result?.retryAfter ?? 0) * 1000);
      setPin('');
      setAttempt((value) => value + 1);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const title = success
    ? '日记已解锁'
    : !status
      ? '正在打开日记'
      : configured
        ? '留一点时间，给自己'
        : confirming
          ? '再输入一次，记住它'
          : '为你的日记，设一把小锁';
  const hint = success
    ? '一点点，变更好。'
    : !status
      ? '正在连接你的记录空间…'
      : configured
        ? '输入 4 位数字密码，继续今天的记录。'
        : confirming
          ? '确认刚刚设置的 4 位数字密码。'
          : '设置一个你记得住的 4 位数字密码。';
  return (
    <main
      className={`journal-launch${success ? ' is-unlocking' : ''}`}
      data-annotate="launch"
      data-annotate-view="启动页"
    >
      <header className="launch-header">
        {localPreview && (
          <DeveloperMode date={date} ready={!busy && !success} scope="launch" />
        )}
      </header>
      <div className="launch-layout">
        <section
          className="launch-story"
          aria-label="一点点，变更好"
          data-annotate="launch.story"
        >
          <div className="launch-brand" data-annotate="launch.brand">
            <span aria-hidden="true">
              <Activity size={23} strokeWidth={2.5} />
            </span>
            <div>
              身体日记<small>｜BODY JOURNAL</small>
            </div>
          </div>
          <h1>
            一餐一练，一点一滴。
            <br />
            在自己的节奏里，
            <br />
            <span>看见每一份积累。</span>
          </h1>
          <div className="launch-journal" aria-hidden="true">
            <div className="launch-paper launch-paper-back" />
            <div className="launch-paper launch-paper-front">
              <div className="launch-paper-top">
                <Activity size={21} />
                <span>MY BODY JOURNAL</span>
                <i />
              </div>
              <div className="launch-paper-title">今天，也在好好生活。</div>
              <div className="launch-paper-rule" />
              <div className="launch-paper-rule short" />
              <div className="launch-paper-marks">
                <span>
                  <Activity size={19} />
                </span>
                <span>
                  <Utensils size={19} />
                </span>
                <span>
                  <Dumbbell size={20} />
                </span>
                <div>身体 · 饮食 · 训练</div>
              </div>
              <span className="launch-paper-note">a little, every day.</span>
            </div>
          </div>
        </section>
        <section
          className="launch-card"
          data-annotate="launch.password"
          aria-labelledby="pin-title"
          aria-busy={busy}
        >
          <div className="launch-lock" aria-hidden="true">
            {success ? (
              <Check size={30} strokeWidth={2} />
            ) : (
              <LockKeyhole size={27} strokeWidth={1.6} />
            )}
          </div>
          <div className="launch-card-eyebrow">
            {configured ? 'YOUR PERSONAL SPACE' : 'A NEW CHAPTER'}
          </div>
          <h2 id="pin-title">{title}</h2>
          <p id="pin-hint" className="launch-hint">
            {hint}
          </p>
          {status && !connectionError ? (
            <form onSubmit={submit} className="launch-form">
              <div
                className={`launch-pin${error ? ' has-error' : ''}${success ? ' is-complete' : ''}`}
              >
                <div
                  key={attempt}
                  className="launch-pin-slots"
                  aria-hidden="true"
                >
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      data-filled={success || index < pin.length}
                      data-current={
                        !success && index === Math.min(pin.length, 3)
                      }
                    >
                      {(success || index < pin.length) && <i />}
                    </span>
                  ))}
                </div>
                <input
                  ref={input}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  aria-label={
                    confirming
                      ? '再次输入4位数字密码'
                      : configured
                        ? '4位数字密码'
                        : '设置4位数字密码'
                  }
                  autoComplete={
                    configured ? 'current-password' : 'new-password'
                  }
                  aria-describedby="pin-hint pin-feedback"
                  aria-invalid={!!error}
                  required
                  disabled={busy || success || remaining > 0}
                  value={pin}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (/^[0-9]*$/.test(value)) {
                      setPin(value.slice(0, 4));
                      setError('');
                    } else setError('只需输入 4 位数字。');
                  }}
                />
              </div>
              <output
                id="pin-feedback"
                className={`launch-feedback${error ? ' is-error' : ''}`}
                aria-live="polite"
              >
                {remaining > 0
                  ? `请在 ${remaining} 秒后重试`
                  : error ||
                    (success
                      ? '欢迎回来'
                      : confirming
                        ? '记住这个密码，下次用它打开日记。'
                        : '\u00a0')}
              </output>
              <button
                className="launch-submit"
                data-annotate="launch.submit"
                disabled={pin.length !== 4 || busy || success || remaining > 0}
                type="submit"
              >
                <span>
                  {success
                    ? '正在进入…'
                    : busy
                      ? '正在验证…'
                      : configured
                        ? '解锁日记'
                        : confirming
                          ? '开启我的日记'
                          : '继续'}
                </span>
                {success && <Check size={19} />}
              </button>
              {confirming && !success && (
                <button
                  type="button"
                  className="launch-back"
                  disabled={busy}
                  onClick={() => {
                    setFirstPin('');
                    setPin('');
                    setError('');
                    input.current?.focus();
                  }}
                >
                  <ArrowLeft size={14} />
                  重新设置
                </button>
              )}
            </form>
          ) : connectionError ? (
            <div className="launch-connection">
              <p role="alert">{connectionError}</p>
              <button className="launch-submit" onClick={onRetry}>
                重新连接
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <output className="launch-loading" aria-label="正在连接">
              <i />
              <i />
              <i />
            </output>
          )}
          <div className="launch-card-footer">
            <LockKeyhole size={13} />
            <span>属于你的记录空间</span>
          </div>
        </section>
      </div>
      <footer className="launch-footer" data-annotate="launch.footer">
        <span>一点点，变更好。</span>
        <div>
          <i />
          <i />
          <i />
          <span>BODY · FOOD · MOVEMENT</span>
        </div>
      </footer>
    </main>
  );
}
