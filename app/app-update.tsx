'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import './app-update.css';

type UpdateStatus = {
  phase:
    | 'idle'
    | 'checking'
    | 'available'
    | 'blocked'
    | 'updating'
    | 'pending'
    | 'restarting'
    | 'current'
    | 'error'
    | 'unsupported';
  message: string;
  current?: string;
  latest?: string;
  branch?: string;
  restartRequired?: boolean;
};
const endpoint = '/__body-journal/update';
async function request(action = 'status'): Promise<UpdateStatus> {
  const response = await fetch(
    endpoint + (action === 'status' ? '' : '/' + action),
    {
      method: action === 'status' ? 'GET' : 'POST',
      headers:
        action === 'status' ? undefined : { 'X-Body-Journal-Update': '1' },
      cache: 'no-store',
      signal: AbortSignal.timeout(action === 'status' ? 5000 : 120000),
    },
  );
  const status = (await response.json()) as UpdateStatus;
  if (!response.ok)
    throw new Error(status.message || '无法连接更新服务，请稍后重试。');
  return status;
}
export function AppUpdate() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const checking = useRef(false);
  const mounted = useRef(false);
  const restartingAt = useRef(0);
  const reconnectRequested = useRef(false);
  const check = useCallback(async () => {
    if (
      inFlight.current ||
      checking.current ||
      reconnectRequested.current ||
      document.visibilityState === 'hidden'
    )
      return;
    checking.current = true;
    try {
      const current = await request();
      const next =
        ['idle', 'current', 'available', 'error', 'blocked'].includes(
          current.phase,
        ) && !current.restartRequired
          ? await request('check')
          : current;
      if (mounted.current && !inFlight.current) setStatus(next);
    } catch (error) {
      if (mounted.current && !inFlight.current)
        setStatus((previous) => ({
          ...previous,
          phase: previous?.restartRequired ? 'pending' : 'error',
          message:
            error instanceof Error
              ? error.message
              : '检查更新失败，请稍后重试。',
        }));
    } finally {
      checking.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const initial = setTimeout(() => void check(), 0);
    const interval = setInterval(() => void check(), 15 * 60 * 1000);
    const foreground = () => {
      if (document.visibilityState !== 'hidden') void check();
    };
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [check]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (
      !working &&
      !reconnecting &&
      status?.phase !== 'restarting' &&
      status?.phase !== 'updating'
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request();
        if (cancelled) return;
        setStatus(next);
        if (
          reconnectRequested.current &&
          next.phase === 'current' &&
          !next.restartRequired
        ) {
          reconnectRequested.current = false;
          window.location.reload();
          return;
        }
        if (
          reconnectRequested.current &&
          next.phase === 'pending' &&
          next.message !== '代码已更新，重启后生效。'
        ) {
          reconnectRequested.current = false;
          setReconnecting(false);
          setOpen(true);
          return;
        }
      } catch {
        /* A brief disconnect is expected while the owned server restarts. */
      }
      if (cancelled) return;
      if (
        reconnectRequested.current &&
        Date.now() - restartingAt.current > 5 * 60 * 1000
      ) {
        reconnectRequested.current = false;
        setReconnecting(false);
        setStatus((previous) => ({
          ...previous,
          phase: 'pending',
          restartRequired: true,
          message:
            '服务尚未恢复，请查看启动窗口中的提示。可重试重启，或关闭窗口后重新启动；已有记录会保留。',
        }));
        return;
      }
      timer = setTimeout(() => void poll(), 1200);
    };
    timer = setTimeout(() => void poll(), 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [working, reconnecting, status?.phase]);

  async function apply() {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setOpen(false);
    setStatus((previous) => ({
      ...previous,
      phase: 'updating',
      message: '正在拉取并核对新版本…',
    }));
    try {
      const next = await request('apply');
      if (!mounted.current) return;
      setStatus(next);
      if (next.phase === 'current') setNotice(next.message);
      else setOpen(true);
    } catch (error) {
      if (mounted.current) {
        setStatus((previous) => ({
          ...previous,
          phase: 'error',
          message:
            error instanceof Error ? error.message : '更新未完成，请重试。',
        }));
        setOpen(true);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  async function restart() {
    if (inFlight.current || reconnectRequested.current) return;
    inFlight.current = true;
    reconnectRequested.current = true;
    restartingAt.current = Date.now();
    setReconnecting(true);
    setStatus((previous) => ({
      ...previous,
      phase: 'restarting',
      message: '正在重启，页面恢复后会自动刷新…',
    }));
    try {
      await request('restart');
    } catch {
      /* The response can be lost during shutdown; polling verifies completion. */
    } finally {
      inFlight.current = false;
    }
  }
  const busy =
    working ||
    reconnecting ||
    status?.phase === 'updating' ||
    status?.phase === 'restarting';
  const needsRestart = !!status?.restartRequired;
  const hasUpdate =
    status?.phase === 'available' || status?.phase === 'blocked';
  const visible =
    status && !['idle', 'current', 'checking'].includes(status.phase);
  return (
    <>
      {visible && (
        <button
          type="button"
          className={`secondary small app-update-button ${hasUpdate ? 'has-update' : ''}`}
          disabled={busy}
          aria-busy={busy}
          title={status.message}
          onClick={() => {
            if (status.phase === 'available') void apply();
            else setOpen(true);
          }}
        >
          {busy ? (
            <LoaderCircle size={17} className="app-update-spinner" />
          ) : needsRestart ? (
            <RefreshCw size={17} />
          ) : (
            <Download size={17} />
          )}
          <span>
            {busy
              ? reconnecting || status.phase === 'restarting'
                ? '正在重启…'
                : '正在更新…'
              : needsRestart
                ? '重启完成更新'
                : hasUpdate
                  ? '更新版本'
                  : '检查更新'}
          </span>
          {hasUpdate && <i aria-hidden="true" />}
        </button>
      )}
      {(notice || busy) && (
        <output className="app-update-notice">
          {notice || status?.message}
        </output>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="dialog-popup app-update-dialog"
          showCloseButton={!busy}
        >
          <div className="app-update-heading">
            <div className="app-update-symbol" aria-hidden="true">
              {busy ? (
                <LoaderCircle className="app-update-spinner" size={20} />
              ) : needsRestart ? (
                <RefreshCw size={20} />
              ) : (
                <Download size={20} />
              )}
            </div>
            <DialogTitle>
              {busy
                ? '正在完成更新'
                : needsRestart
                  ? '重启以完成更新？'
                  : status?.phase === 'available'
                    ? '发现新版本'
                    : '版本更新'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {needsRestart && !busy
              ? '重启后新版本生效，页面会短暂断开并自动刷新。请先保存各页面中尚未提交的内容；已保存的记录会保留。'
              : status?.phase === 'unsupported'
                ? '请关闭运行身体日记的终端窗口，再双击「启动身体日记」启用自动更新。'
                : status?.message}
          </DialogDescription>
          {status?.latest && (
            <p className="app-update-version">
              {status.branch} · {status.current?.slice(0, 7)}
              {status.latest !== status.current && (
                <> → {status.latest.slice(0, 7)}</>
              )}
            </p>
          )}
          {needsRestart &&
            status?.phase === 'pending' &&
            status.message !== '代码已更新，重启后生效。' && (
              <p className="form-error" role="alert">
                {status.message}
              </p>
            )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {needsRestart
                ? '稍后重启'
                : status?.phase === 'unsupported'
                  ? '知道了'
                  : '关闭'}
            </button>
            {needsRestart ? (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void restart()}
              >
                {busy ? '正在重启…' : '确认重启'}
              </button>
            ) : (
              status?.phase !== 'unsupported' && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void apply()}
                >
                  {status?.phase === 'available' ? '更新版本' : '重试更新'}
                </button>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
