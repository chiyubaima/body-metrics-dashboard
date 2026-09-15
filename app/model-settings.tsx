'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CoachConnection } from './coach-connection';
import { ImageConnection, type Connection } from './medals';
import type { CoachState } from '@/lib/coach';

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(value.error || '连接设置暂时不可用，请重试。');
  return value as T;
}
export function ModelSettings({
  visible,
  onChanged,
  onDirty,
  onBusy,
}: {
  visible: boolean;
  onChanged: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [coach, setCoach] = useState<CoachState | null>(null);
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false);
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachDirty, setCoachDirty] = useState(false);
  const [imageDirty, setImageDirty] = useState(false);
  const markImageDirty = useCallback(
    (value = true) => setImageDirty(value),
    [],
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(
    () => onDirty(coachDirty || imageDirty),
    [coachDirty, imageDirty, onDirty],
  );
  useEffect(() => onBusy(working || coachBusy), [working, coachBusy, onBusy]);
  const refresh = useCallback(async () => {
    const [image, state] = await Promise.all([
      request<Connection>('/api/medals/connection'),
      request<CoachState>('/api/coach'),
    ]);
    setConnection(image);
    setCoach(state);
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) return refresh();
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, refresh]);
  const saved = async () => {
    onChanged();
    await refresh();
  };
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成，请重试。');
      return false;
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }
  return (
    <div className="model-settings">
      {error && (
        <div role="alert" className="medal-message is-error">
          {error}
          <button className="secondary" onClick={() => run(refresh)}>
            重新读取
          </button>
        </div>
      )}
      {notice && <output className="settings-library-notice">{notice}</output>}
      <section className="model-settings-card" aria-label="教练模型">
        <h3>教练模型</h3>
        <p>用于 Captain 对话和勋章规则整理。</p>
        <CoachConnection
          visible={visible}
          disabled={working}
          onSaved={saved}
          onDirty={setCoachDirty}
          onBusy={setCoachBusy}
        />
        <div className="model-settings-destination">
          <span>数据发送至</span>
          <strong>{coach?.connection.destination || '尚未连接'}</strong>
          <small>{coach?.connection.model}</small>
        </div>
        <p>
          启用后会发送近期身体、饮食和训练摘要、所选日明细、个人资料、近期聊天，以及已保存的记忆和约定。按需查询的历史记录也会提供给模型。聊天和记忆保存在本机，调用模型需要联网并使用所选服务额度。
        </p>
        <p>知识查询只向 Europe PMC 发送通用主题词，来源可在回复中查看。</p>
        {coach?.connection.configured && (
          <button
            className={coach.active ? 'secondary' : 'primary'}
            disabled={working || coachBusy || coachDirty}
            onClick={() =>
              run(async () => {
                await request('/api/coach', {
                  enabled: !coach.active,
                  consentConfig: coach.connection.fingerprint,
                });
                await saved();
                setNotice(
                  coach.active
                    ? 'Captain 已停用。'
                    : 'Captain 已启用，可以开始聊了。',
                );
              })
            }
          >
            {coach.active ? '停用 AI 聊天' : '启用 Captain，开始聊聊'}
          </button>
        )}
      </section>
      <section className="model-settings-card" aria-label="勋章图案模型">
        <h3>勋章图案模型</h3>
        <p>只发送勋章图案描述和公开风格参考。</p>
        {connection && (
          <ImageConnection
            connection={connection}
            onRefresh={setConnection}
            busy={working || coachBusy}
            dirty={markImageDirty}
            run={run}
            onSaved={async () => {
              await saved();
              setNotice('图案连接已保存。');
            }}
          />
        )}
      </section>
    </div>
  );
}
