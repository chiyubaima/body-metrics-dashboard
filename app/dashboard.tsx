'use client';
import { useState, useEffect, useCallback, useRef, useId } from 'react';
import {
  Activity,
  Trash2,
  Settings2,
  X,
  Check,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RecordForm, PlanForm, ProfileForm } from './forms';
import { BodyPanel, DietPanel, TrainingPanel, compactDate } from './panels';
import { HistoryView } from './history';
import { JournalCalendar } from './calendar';
import { TrashView } from './trash';
import { DeveloperMode } from './developer-mode';
import { Coach } from './coach';
import { Onboarding } from './onboarding';
import { today, activePlan } from '@/lib/model';
import {
  workoutAchievements,
  workoutStats,
  nutritionSummary,
} from '@/lib/progress';
import type {
  Snapshot,
  Entry,
  Kind,
  Diet,
  Training,
  MealSlot,
} from '@/lib/model';
type Modal =
  | { type: 'record'; kind: Kind; entry?: Entry; meal?: MealSlot }
  | { type: 'history'; kind: Kind }
  | { type: 'plan'; kind: 'diet' | 'training' }
  | { type: 'settings' }
  | { type: 'trash' };
const labels = { body: '身体', diet: '饮食', training: '训练' };
const initial: Snapshot = { records: [], plans: [], profile: null };
async function request<T = unknown>(
  path: string,
  body?: unknown,
  method = 'POST',
) {
  let response: Response;
  try {
    response = await fetch(
      path,
      body === undefined
        ? { cache: 'no-store' }
        : {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new Error('连接中断，输入已保留。请检查网络后重试。');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('服务暂时没有响应，输入已保留，请稍后重试。');
  }
  if (!response.ok)
    throw new Error(
      (data as { error?: string }).error ?? '暂时无法连接，请稍后重试。',
    );
  return data as T;
}
export default function Dashboard({
  signInPath,
  localPreview,
}: {
  signInPath: string;
  localPreview: boolean;
}) {
  const recordFormId = useId();
  const [onboardingRequest, setOnboardingRequest] = useState(0);
  const [coachSettingsRequest, setCoachSettingsRequest] = useState(0);
  const [celebration, setCelebration] = useState('');
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(''), 6000);
    return () => clearTimeout(timer);
  }, [celebration]);
  const [date, setDate] = useState(today),
    [module, setModule] = useState<Kind>('body'),
    [data, setData] = useState<Snapshot>(initial),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState(''),
    [modal, setModal] = useState<Modal | null>(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [confirmClose, setConfirmClose] = useState(false),
    [notice, setNotice] = useState('');
  const requestSequence = useRef(0),
    working = useRef(false);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const next = await request<Snapshot>('/api/data');
      if (sequence === requestSequence.current) {
        setData(next);
        setLoaded(true);
        setLoadError('');
      }
    } catch (e) {
      if (sequence === requestSequence.current)
        setLoadError(e instanceof Error ? e.message : '读取失败');
      throw e;
    }
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch(() => {});
    const focused = () => {
      if (!working.current) refresh().catch(() => {});
    };
    window.addEventListener('focus', focused);
    return () => window.removeEventListener('focus', focused);
  }, [refresh]);
  const open = useCallback((next: Modal) => {
    setDirty(false);
    setConfirmClose(false);
    setModal(next);
  }, []);
  const close = () => {
    if (busy) return;
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    setModal(null);
  };
  const changeModule = (value: string) => {
    setModule(value as Kind);
    try {
      localStorage.setItem('body-journal-module', value);
    } catch {}
  };
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem('body-journal-module');
        if (saved && saved in labels) setModule(saved as Kind);
      } catch {}
    });
  }, []);
  async function save(path: string, payload: unknown, method = 'POST') {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await request(path, payload, method);
      const saved = payload as {
        id?: string;
        kind?: Kind;
        date: string;
        data?: Diet | Training;
      };
      if (path === '/api/records' && saved.kind === 'training' && saved.data) {
        const existing = data.records.find((r) => r.id === saved.id);
        const candidate = {
          id: saved.id!,
          kind: saved.kind,
          date: saved.date,
          data: saved.data,
          primaryMorning: 0,
          planId: null,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Entry;
        const previousWins = existing
          ? workoutAchievements(existing, data.records)
          : [];
        const wins = workoutAchievements(candidate, data.records).filter(
          (win) =>
            !previousWins.some(
              (old) =>
                old.name === win.name &&
                old.label === win.label &&
                old.detail === win.detail,
            ),
        );
        setCelebration(
          wins[0]
            ? `${wins[0].name} · ${wins[0].label}`
            : existing
              ? '训练记录已更新，能力曲线同步调整'
              : workoutStats(saved.data as Training).sets
                ? `${workoutStats(saved.data as Training).sets} 个工作组，已经记住这次努力`
                : '这次训练已记录',
        );
      } else if (
        path === '/api/records' &&
        saved.kind === 'diet' &&
        saved.data
      ) {
        const count = new Set(
          data.records
            .filter((r) => r.kind === 'diet' && r.date <= saved.date)
            .map((r) => r.date)
            .concat(saved.date),
        ).size;
        const foodSummary = nutritionSummary((saved.data as Diet).foods);
        const meals = new Set(
          (saved.data as Diet).foods.map((food) => food.meal ?? 'unsorted'),
        ).size;
        setCelebration(
          (saved.data as Diet).complete
            ? `这一天已记完 · 累计 ${count} 天饮食记录`
            : `餐盘已更新 · ${meals} 类餐次${foodSummary.total.protein !== null ? ` · 已知蛋白质 ${Math.round(foodSummary.total.protein)}g` : ''}`,
        );
      }
      setModal(null);
      setDirty(false);
      setNotice(
        method === 'DELETE'
          ? `${compactDate(saved.date)}的饮食记录已移入回收站。`
          : path === '/api/plans'
            ? '新计划已保存，历史记录保留原计划。'
            : path === '/api/profile'
              ? '个人信息已保存。'
              : `${compactDate((payload as { date: string }).date)}的记录已保存。`,
      );
      try {
        await refresh();
      } catch {
        setNotice('记录已保存，界面暂未更新。请点击重试读取。');
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function remove(entries: Entry[]) {
    if (working.current) throw new Error('正在处理，请稍后重试。');
    working.current = true;
    setBusy(true);
    try {
      await request(
        '/api/records',
        { ids: entries.map((r) => r.id) },
        'DELETE',
      );
      setNotice(
        `${entries.length} 条${labels[entries[0].kind]}记录已移入回收站。`,
      );
      await refresh();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function restore(ids: string[]) {
    if (working.current) throw new Error('正在处理，请稍后重试。');
    working.current = true;
    setBusy(true);
    try {
      await request('/api/trash', { ids }, 'PATCH');
      await refresh();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (t: unknown, o: { signal: AbortSignal }) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'view_journal_date',
        title: '查看某一天的记录',
        description: '切换看板日期，不修改记录。',
        inputSchema: {
          type: 'object',
          properties: {
            date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
          required: ['date'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute(input: unknown) {
          const v = input as { date?: unknown };
          if (
            typeof v.date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(v.date) ||
            !Number.isFinite(new Date(v.date).getTime()) ||
            new Date(v.date).toISOString().slice(0, 10) !== v.date
          )
            throw new Error('日期无效');
          setDate(v.date);
          return { date: v.date };
        },
      },
      {
        name: 'start_journal_record',
        title: '打开记录表单',
        description:
          '打开身体、饮食或训练表单，由用户填写并保存；此操作本身不创建记录。',
        inputSchema: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['body', 'diet', 'training'] },
          },
          required: ['kind'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute(input: unknown) {
          const kind = (input as { kind?: unknown }).kind;
          if (typeof kind !== 'string' || !(kind in labels))
            throw new Error('模块无效');
          open({
            type: 'record',
            kind: kind as Kind,
            entry:
              kind === 'diet'
                ? data.records.find((r) => r.kind === 'diet' && r.date === date)
                : undefined,
          });
          return { opened: kind, saved: false };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [open, data.records, date]);

  const statsReady = loaded && !loadError;
  const panelProps = {
    records: data.records,
    plans: data.plans,
    date,
    ready: statsReady,
    module,
    edit: (kind: Kind, entry?: Entry, meal?: MealSlot) =>
      open({ type: 'record', kind, entry, meal }),
    history: (kind: Kind) => open({ type: 'history', kind }),
    plan: (kind: 'diet' | 'training') => open({ type: 'plan', kind }),
  };
  const title =
    modal?.type === 'record'
      ? modal.kind === 'body' && modal.entry
        ? '编辑身体数据'
        : `记录${labels[modal.kind]}数据`
      : modal?.type === 'history'
        ? `${labels[modal.kind]}日记`
        : modal?.type === 'plan'
          ? `${labels[modal.kind]}计划`
          : modal?.type === 'trash'
            ? '回收站'
            : '个人资料与备份';
  async function complete(entry: Entry) {
    try {
      await save('/api/records', {
        id: entry.id,
        kind: entry.kind,
        date: entry.date,
        data: { ...entry.data, complete: !(entry.data as Diet).complete },
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '保存失败，请重试。');
    }
  }
  return (
    <main className="dashboard" data-annotate="dashboard">
      <header className="topbar" data-annotate="layout.header">
        <div className="brand">
          <span className="brand-mark">
            <Activity size={25} strokeWidth={3} />
          </span>
          <div>
            <h1>
              身体日记<span>一点点，变更好</span>
            </h1>
            <p>BODY JOURNAL</p>
          </div>
        </div>
        <div className="topbar-tools">
          {localPreview && <DeveloperMode date={date} ready={statsReady} />}
          <button
            className="secondary small trash-open"
            disabled={!statsReady}
            onClick={() => open({ type: 'trash' })}
          >
            <Trash2 size={17} />
            回收站
          </button>
          <span className="local-badge">
            <i />
            {localPreview ? '本机数据' : '我的记录空间'}
          </span>
          <button
            className="icon-button"
            aria-label="个人资料与备份"
            disabled={!statsReady}
            onClick={() => open({ type: 'settings' })}
          >
            <Settings2 size={21} />
          </button>
        </div>
      </header>
      <div className="dashboard-companion-row">
        <JournalCalendar
          name={data.profile?.name}
          date={date}
          onChange={setDate}
          records={data.records}
          plans={data.plans}
        />
        <Coach
          date={date}
          ready={statsReady}
          snapshot={data}
          blocked={modal !== null}
          selectDate={setDate}
          settingsRequest={coachSettingsRequest}
        />
      </div>
      <nav className="mobile-tabs" aria-label="看板模块">
        {Object.entries(labels).map(([key, label]) => (
          <button
            className={key === module ? 'selected' : ''}
            aria-pressed={key === module}
            key={key}
            onClick={() => changeModule(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {loadError && (
        <div className="load-error" role="alert">
          <span>{loadError}</span>
          <button onClick={() => refresh().catch(() => {})}>
            <RotateCcw size={15} />
            重试读取
          </button>
          {!localPreview && <a href={signInPath}>重新登录</a>}
        </div>
      )}
      <div className="columns">
        <BodyPanel {...panelProps} height={data.profile?.height ?? null} />
        <DietPanel {...panelProps} complete={complete} busy={busy} />
        <TrainingPanel {...panelProps} />
      </div>
      <footer className="footer">
        <span>
          <span className="footer-dot" />{' '}
          {localPreview ? '记录保存在这台电脑' : '记录随账户保存'}
        </span>
        <span>北京时间 · 每一栏都可以独立滚动</span>
      </footer>
      {notice && (
        <output className="notice">
          <Check size={18} />
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </output>
      )}
      {celebration && (
        <output className="celebration">
          <Sparkles size={23} />
          <div>
            <strong>{celebration}</strong>
            <span>这份积累，属于你。</span>
          </div>
          <button
            className="icon-button"
            aria-label="关闭成就提示"
            onClick={() => setCelebration('')}
          >
            <X size={16} />
          </button>
        </output>
      )}
      <Onboarding
        ready={statsReady}
        snapshot={data}
        blocked={modal !== null}
        openRequest={onboardingRequest}
        configure={(target) => {
          if (target === 'coach') setCoachSettingsRequest((value) => value + 1);
          else if (target === 'profile') open({ type: 'settings' });
          else {
            setDate(today());
            open({ type: 'plan', kind: target });
          }
        }}
      />
      <Dialog
        open={modal !== null}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent
          data-annotate={
            modal
              ? `dialog.${modal.type}.${'kind' in modal ? modal.kind : 'global'}`
              : undefined
          }
          data-module={modal && 'kind' in modal ? modal.kind : 'global'}
          data-record-date={
            modal?.type === 'record' ? (modal.entry?.date ?? date) : date
          }
          className={`dialog-popup ${modal?.type === 'record' ? 'record-dialog' : ''} ${modal?.type === 'history' ? 'history-dialog' : ''} ${modal?.type === 'record' && modal.kind === 'body' ? 'body-dialog' : ''} ${modal?.type === 'record' && modal.kind === 'training' ? 'training-dialog' : ''} ${modal?.type === 'record' && modal.kind === 'diet' ? 'meal-dialog' : ''} ${modal?.type === 'history' || modal?.type === 'trash' || (modal?.type === 'record' && modal.kind !== 'body') ? 'wide-dialog' : ''}`}
          showCloseButton={false}
        >
          <div
            className={
              modal?.type === 'record'
                ? 'record-dialog-header'
                : modal?.type === 'history'
                  ? 'history-dialog-header'
                  : undefined
            }
          >
            <DialogTitle>{title}</DialogTitle>
            {modal?.type === 'record' && (
              <button
                type="submit"
                form={recordFormId}
                className="primary record-save"
                disabled={busy || confirmClose}
                aria-busy={busy}
              >
                <Check size={17} />
                {busy
                  ? '正在保存…'
                  : modal.kind === 'diet'
                    ? '保存这一餐'
                    : modal.kind === 'training'
                      ? '保存这次记录'
                      : '保存记录'}
              </button>
            )}
            <button
              type="button"
              className="icon-button dialog-close"
              aria-label="关闭"
              onClick={close}
              disabled={busy}
            >
              <X size={20} />
            </button>
          </div>
          {modal?.type !== 'record' && (
            <DialogDescription>
              {modal?.type === 'history'
                ? '按日期筛选记录，支持修改和批量删除。'
                : modal?.type === 'trash'
                  ? '删除的记录集中保管，按模块筛选后恢复。'
                  : modal?.type === 'plan'
                    ? modal.kind === 'diet'
                      ? '按所选日期调整营养目标，实际饮食记录保持原样。'
                      : '训练计划从今天或未来生效，历史版本会保留。'
                    : '资料可以选填，记录可以随时带走。'}
            </DialogDescription>
          )}
          {confirmClose && (
            <div className="dialog-body">
              <p>还有未保存的内容，要放弃这次填写吗？</p>
              <div className="form-actions">
                <button
                  className="secondary"
                  onClick={() => setConfirmClose(false)}
                >
                  继续填写
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setDirty(false);
                    setConfirmClose(false);
                    setModal(null);
                  }}
                >
                  放弃并关闭
                </button>
              </div>
            </div>
          )}
          <div
            className="dialog-form-region"
            style={confirmClose ? { display: 'none' } : undefined}
          >
            {modal?.type === 'record' && (
              <RecordForm
                key={(modal.entry?.id ?? 'new') + modal.kind}
                formId={recordFormId}
                kind={modal.kind}
                existing={modal.entry}
                date={date}
                save={save}
                busy={busy}
                onDirty={() => setDirty(true)}
                records={data.records}
                meal={modal.meal}
              />
            )}
            {modal?.type === 'plan' && (
              <PlanForm
                key={modal.kind}
                kind={modal.kind}
                date={date}
                plan={activePlan(
                  data.plans,
                  modal.kind,
                  modal.kind === 'diet' ? date : today(),
                )}
                save={save}
                busy={busy}
                onDirty={() => setDirty(true)}
              />
            )}
            {modal?.type === 'settings' && (
              <>
                <button
                  className="text-button onboarding-reopen"
                  disabled={busy || dirty}
                  title={dirty ? '保存个人资料后可以重新打开引导' : undefined}
                  onClick={() => {
                    setModal(null);
                    setOnboardingRequest((value) => value + 1);
                  }}
                >
                  重新查看使用引导
                </button>
                <ProfileForm
                  profile={data.profile}
                  save={save}
                  busy={busy}
                  onDirty={() => setDirty(true)}
                />
              </>
            )}
            {modal?.type === 'trash' && <TrashView restore={restore} />}
            {modal?.type === 'history' && (
              <>
                <HistoryView
                  key={modal.kind}
                  kind={modal.kind}
                  records={data.records}
                  plans={data.plans}
                  date={date}
                  edit={(r) => open({ type: 'record', kind: r.kind, entry: r })}
                  remove={remove}
                  busy={busy}
                />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
