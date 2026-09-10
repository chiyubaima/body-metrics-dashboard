'use client';
import type {
  CoachToolAction,
  CoachToolProgress,
} from '@/lib/coach-tool-types';
import { useCallback, useEffect, useRef, useState, useId } from 'react';
import {
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  Bookmark,
  CalendarCheck,
  Clock3,
  Heart,
  MessageCircle,
  ShieldCheck,
  Target,
  Zap,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { Field, Picker } from './form-controls';
import { CoachConnection } from './coach-connection';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  commitmentLabels,
  memoryLabels,
  quietNow,
  shanghaiDateTime,
  localDateTime,
  coachOpeningKey,
  coachOpeningHours,
  memoryActive,
  commitmentPending,
  commitmentExpiry,
} from '@/lib/coach';
import { today } from '@/lib/model';
import type {
  CoachState,
  CoachTurn,
  CoachMemory,
  Commitment,
  CommitmentKind,
  MemoryCategory,
} from '@/lib/coach';
import type { Snapshot } from '@/lib/model';
import { CoachConversation } from './coach-conversation';
import type { CoachScrollPosition } from './coach-conversation';
import {
  captainActivity,
  coachEntryPreview,
  mergeCoachTurns,
} from '@/lib/coach-chat';
import { requestCoachStream } from '@/lib/coach-stream';
import { CaptainAvatar } from './captain-avatar';
import './coach.css';

async function coachRequest<T>(
  path: string,
  body?: unknown,
  method = 'POST',
): Promise<T> {
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
    throw new Error('连接中断，输入仍在。恢复连接后可以重试。');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('服务暂时没有回应，输入仍在，请稍后重试。');
  }
  if (!response.ok)
    throw new Error(
      (data as { error?: string }).error ?? '暂时无法完成，请重试。',
    );
  return data as T;
}
type Editor =
  | {
      type: 'memory';
      item?: CoachMemory;
      restore?: boolean;
      expectedUpdatedAt?: string;
    }
  | {
      type: 'commitment';
      item?: Commitment;
      restore?: boolean;
      expectedUpdatedAt?: string;
    };
type EditorDraft = {
  id: string;
  text: string;
  category: MemoryCategory;
  kind: CommitmentKind;
  dueAt: string;
  expiresAt: string;
  dirty: boolean;
};
export function Coach({
  date,
  ready,
  snapshot,
  blocked,
  selectDate,
  settingsRequest = 0,
  onToolAction,
  onRecordsChanged,
}: {
  date: string;
  ready: boolean;
  snapshot: Snapshot;
  blocked: boolean;
  selectDate: (date: string) => void;
  settingsRequest?: number;
  onToolAction?: (action: CoachToolAction) => Promise<void>;
  onRecordsChanged?: () => Promise<unknown>;
}) {
  const toneId = useId();
  const editorGeneration = useRef(0);
  const confirmingRecord = useRef(false);
  const [toolProgress, setToolProgress] = useState<CoachToolProgress | null>(
    null,
  );
  const [state, setState] = useState<CoachState | null>(null),
    [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chat'),
    [draft, setDraft] = useState('');
  const [error, setError] = useState(''),
    [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false);
  const [localTurns, setLocalTurns] = useState<CoachTurn[]>([]),
    [older, setOlder] = useState<CoachTurn[]>([]);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [olderAvailable, setOlderAvailable] = useState<boolean | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null),
    [removing, setRemoving] = useState<{
      type: 'memory' | 'commitment';
      id: string;
      text: string;
      permanent?: boolean;
    } | null>(null);
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const working = useRef(false),
    refreshSequence = useRef(0),
    openingAttempts = useRef(new Set<string>());
  const scrollPosition = useRef<CoachScrollPosition>({ top: 0, pinned: true });
  const entry = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousTab = useRef(tab);
  const handledSettingsRequest = useRef(0);
  useEffect(() => {
    if (
      !ready ||
      !settingsRequest ||
      handledSettingsRequest.current === settingsRequest
    )
      return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      handledSettingsRequest.current = settingsRequest;
      setTab('settings');
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, settingsRequest]);
  useEffect(() => {
    if (open && previousTab.current !== tab) heading.current?.focus();
    previousTab.current = tab;
  }, [open, tab]);
  const readPosition = useCallback(() => scrollPosition.current, []);
  const savePosition = useCallback((value: CoachScrollPosition) => {
    scrollPosition.current = value;
  }, []);
  const refresh = useCallback(async (tick = true) => {
    const sequence = ++refreshSequence.current;
    const next = await coachRequest<CoachState>(
      '/api/coach',
      tick ? {} : undefined,
    );
    if (sequence === refreshSequence.current) setState(next);
  }, []);
  function edit(next: Editor) {
    editorGeneration.current++;
    setEditor(next);
    setEditorDraft({
      id: next.item?.id ?? crypto.randomUUID(),
      text: next.item
        ? 'content' in next.item
          ? next.item.content
          : next.item.title
        : '',
      category:
        next.type === 'memory'
          ? (next.item?.category ?? 'preference')
          : 'preference',
      kind:
        next.type === 'commitment' ? (next.item?.kind ?? 'checkin') : 'checkin',
      dueAt:
        next.type === 'commitment' &&
        next.item &&
        next.item.dueAt > new Date().toISOString()
          ? localDateTime(next.item.dueAt)
          : '',
      expiresAt:
        next.item?.expiresAt && !next.restore
          ? localDateTime(next.item.expiresAt)
          : '',
      dirty: false,
    });
  }
  async function handleToolAction(action: CoachToolAction) {
    if (blocked || saving || (editor && editorDraft?.dirty))
      throw new Error('请先保存或关闭当前编辑内容，再打开这条建议。');
    if (action.type === 'memory' || action.type === 'commitment') {
      const generation = editorGeneration.current;
      const fresh = await coachRequest<CoachState>('/api/coach');
      if (editorGeneration.current !== generation)
        throw new Error('请先完成当前编辑，再打开这条建议。');
      setState(fresh);
      const item =
        action.type === 'memory'
          ? fresh.memories.find((m) => m.id === action.id && memoryActive(m))
          : fresh.commitments.find(
              (c) => c.id === action.id && commitmentPending(c),
            );
      if (!item || item.updatedAt !== action.baseUpdatedAt)
        throw new Error('该条目已修改、过期或忘掉，请重新核对后再整理。');
      const next = { ...item, ...action.changes };
      if (action.type === 'memory')
        edit({
          type: 'memory',
          item: next as CoachMemory,
          expectedUpdatedAt: action.baseUpdatedAt,
        });
      else
        edit({
          type: 'commitment',
          item: next as Commitment,
          expectedUpdatedAt: action.baseUpdatedAt,
        });
      setEditorDraft((current) =>
        current ? { ...current, dirty: true } : current,
      );
      setTab('memory');
      return;
    }
    if (!onToolAction) throw new Error('暂时无法打开日记，请刷新后重试。');
    await onToolAction(action);
    setOpen(false);
  }
  async function confirmRecord(
    turnId: string,
    runId: string,
    actionIndex: number,
  ) {
    if (confirmingRecord.current || saving || blocked)
      throw new Error('正在处理其他记录，请稍后再确认。');
    confirmingRecord.current = true;
    setSaving(true);
    try {
      const result = await coachRequest<{ turn: CoachTurn }>(
        '/api/coach/records',
        { turnId, runId, actionIndex },
      );
      ++refreshSequence.current;
      setOlder((old) => mergeCoachTurns([...old, result.turn], []));
      setState((current) =>
        current
          ? {
              ...current,
              turns: mergeCoachTurns([...current.turns, result.turn], []),
            }
          : current,
      );
      // The record is already saved. A dashboard refresh failure must not turn success into a retryable write.
      await onRecordsChanged?.().catch(() =>
        setFeedback('已记录，看板暂未刷新；重新打开页面即可同步。'),
      );
      void refresh(false).catch(() => {});
    } finally {
      confirmingRecord.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    if (!ready) return;
    void refresh().catch((e) => setError(e.message));
  }, [ready, snapshot, refresh]);
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      if (document.visibilityState === 'visible') refresh().catch(() => {});
    };
    const timer = setInterval(check, 30_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [ready, refresh]);
  const send = useCallback(
    async (
      message: string,
      kind: 'chat' | 'opening' = 'chat',
      retry?: CoachTurn,
    ) => {
      if (working.current) return;
      working.current = true;
      setBusy(true);
      setFeedback('');
      const selected = retry?.date ?? (kind === 'opening' ? today() : date);
      const request = {
        id: retry?.id ?? crypto.randomUUID(),
        kind,
        date: selected,
        message,
      };
      const now = new Date().toISOString();
      const optimistic: CoachTurn = {
        id: request.id,
        kind,
        dayKey:
          kind === 'opening'
            ? (retry?.dayKey ?? coachOpeningKey(new Date(now)))
            : null,
        date: selected,
        userText: message,
        reply: null,
        status: 'pending',
        proposals: [],
        evidence: [],
        createdAt: retry?.createdAt ?? now,
        updatedAt: now,
      };
      setLocalTurns((turns) => [
        ...turns.filter((turn) => turn.id !== request.id),
        optimistic,
      ]);
      setSendErrors((errors) => {
        const next = { ...errors };
        delete next[request.id];
        return next;
      });
      if (kind === 'chat' && !retry) {
        setDraft((value) => (value.trim() === message ? '' : value));
        scrollPosition.current.pinned = true;
      }
      setToolProgress(null);
      try {
        const result = await requestCoachStream(
          request,
          (delta) =>
            setLocalTurns((turns) =>
              turns.map((turn) =>
                turn.id === request.id
                  ? { ...turn, reply: (turn.reply ?? '') + delta }
                  : turn,
              ),
            ),
          fetch,
          setToolProgress,
        );
        if (result.turn) {
          setState((current) =>
            current
              ? {
                  ...current,
                  turns: [
                    ...current.turns.filter(
                      (turn) => turn.id !== result.turn!.id,
                    ),
                    result.turn!,
                  ],
                  opening: kind === 'opening' ? result.turn : current.opening,
                }
              : current,
          );
        }
        setLocalTurns((turns) =>
          turns.filter((turn) => turn.id !== request.id),
        );
        await refresh(false).catch(() => {});
      } catch (error) {
        setLocalTurns((turns) =>
          turns.map((turn) =>
            turn.id === request.id
              ? {
                  ...turn,
                  status: 'failed',
                  updatedAt: new Date().toISOString(),
                }
              : turn,
          ),
        );
        setSendErrors((errors) => ({
          ...errors,
          [request.id]:
            error instanceof Error ? error.message : '这次没能回应，请重试。',
        }));
        await refresh(false).catch(() => {});
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [date, refresh],
  );
  useEffect(() => {
    if (
      !state?.active ||
      blocked ||
      quietNow(state.settings) ||
      document.visibilityState !== 'visible'
    )
      return;
    const key = coachOpeningKey(new Date(state.now));
    if (
      !key ||
      state.opening?.dayKey === key ||
      openingAttempts.current.has(key) ||
      working.current ||
      state.turns.some((t) => t.status === 'pending')
    )
      return;
    openingAttempts.current.add(key);
    void send('', 'opening');
  }, [state, blocked, send]);
  const allTurns = mergeCoachTurns(
    [...older, ...(state?.turns ?? [])],
    localTurns,
  );
  useEffect(() => {
    if (
      !open ||
      busy ||
      !state?.turns.some((turn) => turn.status === 'pending')
    )
      return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible')
        void refresh().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [open, busy, state?.turns, refresh]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);
  async function mutate(
    path: string,
    body: unknown,
    method = 'POST',
    message = '已保存',
  ) {
    if (saving) return false;
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const result = await coachRequest<{
        turn?: CoachTurn;
        turns?: CoachTurn[];
      }>(path, body, method);
      const changedTurns = [
        ...(result.turn ? [result.turn] : []),
        ...(result.turns ?? []),
      ];
      if (changedTurns.length)
        setOlder((old) => mergeCoachTurns([...old, ...changedTurns], []));
      await refresh();
      setFeedback(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，内容仍在。');
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function loadOlder() {
    const first = allTurns[0];
    if (!first) return;
    try {
      const page = await coachRequest<CoachState>(
        `/api/coach?before=${encodeURIComponent(first.createdAt + '|' + first.id)}`,
      );
      setOlder((old) => [...page.turns, ...old]);
      setOlderAvailable(page.hasOlder);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : '历史读取失败，请重试。',
      );
    }
  }
  const quiet = state ? quietNow(state.settings) : false;
  const due = quiet
    ? []
    : (state?.commitments ?? []).filter(
        (c) =>
          commitmentPending(c) &&
          c.dueAt <= (state?.now ?? '') &&
          !c.notifiedAt,
      );
  const pending = state?.commitments.filter((c) => commitmentPending(c)) ?? [];
  const ended =
    state?.commitments.filter((c) => c.status === 'completed').reverse() ?? [];
  const memories = state?.memories.filter((m) => memoryActive(m)) ?? [];
  const archivedMemories =
    state?.memories.filter((m) => !memoryActive(m)) ?? [];
  const archivedCommitments =
    state?.commitments.filter(
      (c) => c.status !== 'completed' && !commitmentPending(c),
    ) ?? [];
  const awaiting = busy || allTurns.some((turn) => turn.status === 'pending');
  const headline =
    error && !state
      ? 'Captain 暂时没连接上，点这里重试'
      : due.length
        ? `还记得我们的约定吗？${due[0].title}`
        : quiet
          ? '今天安静陪着你，想聊时随时来。'
          : (allTurns.findLast(
              (turn) =>
                turn.kind === 'opening' && turn.date === today() && turn.reply,
            )?.reply ??
            state?.opening?.reply ??
            (state?.active
              ? '今天，从你想聊的那件事开始。'
              : '让 Captain 认识你，从聊两句开始。'));
  function show() {
    setOpen(true);
    setTab('chat');
    if (!state) refresh().catch(() => {});
  }
  return (
    <>
      <div className="coach-strip" data-annotate="coach.entry">
        <button
          className="coach-strip-main"
          ref={entry}
          disabled={!ready || blocked}
          onClick={show}
          aria-label="与 Captain 聊聊"
        >
          <CaptainAvatar
            activity={captainActivity(
              state?.now ?? new Date().toISOString(),
              awaiting,
              quiet,
            )}
            animated={!open}
            className="captain-entry-avatar"
          />
          <span className="coach-strip-copy">
            <b>Captain</b>
            <span className="coach-entry-bubble">
              <span>{coachEntryPreview(headline)}</span>
            </span>
          </span>
        </button>
        {state?.active && (
          <button
            className="coach-quiet"
            disabled={saving}
            aria-label={quiet ? '恢复主动提醒' : '今天安静'}
            title={quiet ? '恢复主动提醒' : '今天安静'}
            onClick={() =>
              void mutate(
                '/api/coach',
                { quiet: quiet ? 'off' : 'today' },
                'PATCH',
                quiet ? '已恢复主动提醒' : '今天暂停主动提醒，仍可随时聊天',
              )
            }
          >
            {quiet ? <BellOff size={18} /> : <Bell size={18} />}
          </button>
        )}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="coach-sheet"
          showCloseButton={false}
          finalFocus={entry}
          initialFocus={(interaction) =>
            interaction !== 'touch' && tab === 'chat' && state?.active
              ? document.querySelector<HTMLTextAreaElement>(
                  '.coach-composer textarea',
                )
              : false
          }
        >
          <header className="coach-header" data-annotate="coach.header">
            {tab !== 'chat' ? (
              <button
                className="coach-header-button"
                aria-label="返回聊天"
                onClick={() => setTab('chat')}
              >
                <ChevronLeft size={22} />
              </button>
            ) : (
              <CaptainAvatar className="captain-contact-avatar" />
            )}
            <div className="coach-contact">
              <SheetTitle ref={heading} tabIndex={-1}>
                {tab === 'chat'
                  ? 'Captain'
                  : tab === 'memory'
                    ? '记忆与约定'
                    : 'Captain 设置'}
              </SheetTitle>
              <SheetDescription className="sr-only">
                与 Captain 聊天，管理记忆、约定和连接设置。
              </SheetDescription>
            </div>
            {tab === 'chat' && (
              <div className="coach-header-actions">
                <button
                  className="coach-header-action"
                  data-annotate="coach.memory"
                  onClick={() => setTab('memory')}
                >
                  <Bookmark size={17} />
                  <span>记忆和约定</span>
                </button>
                <button
                  className="coach-header-action"
                  data-annotate="coach.settings"
                  onClick={() => setTab('settings')}
                >
                  <Settings2 size={17} />
                  <span>设置</span>
                </button>
              </div>
            )}
            <SheetClose
              className="coach-header-button"
              aria-label="收起 Captain"
            >
              <X size={21} />
            </SheetClose>
          </header>
          <div className="coach-pages">
            {error && (
              <div className="coach-error" role="alert">
                <span>{error}</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setError('');
                    void refresh().catch((e) => setError(e.message));
                  }}
                >
                  <RotateCcw size={15} />
                  重试读取
                </button>
              </div>
            )}
            {feedback && (
              <output className="coach-feedback">
                <Check size={16} />
                {feedback}
              </output>
            )}
            <section
              aria-label="与 Captain 聊天"
              hidden={tab !== 'chat'}
              className="coach-chat-panel"
            >
              <CoachConversation
                avatar={
                  <CaptainAvatar
                    activity="greeting"
                    animated={open && tab === 'chat'}
                    className="captain-empty-avatar"
                  />
                }
                state={state}
                onToolAction={handleToolAction}
                records={snapshot.records}
                onConfirmRecord={confirmRecord}
                toolProgress={toolProgress}
                turns={allTurns}
                errors={sendErrors}
                saving={saving}
                visible={open && tab === 'chat'}
                draft={draft}
                onDraft={setDraft}
                onSend={(message) => void send(message)}
                onRetry={(turn) => void send(turn.userText, turn.kind, turn)}
                date={date}
                onDate={(value, keepOpen) => {
                  selectDate(value);
                  if (!keepOpen) setOpen(false);
                }}
                onManage={() => setTab('memory')}
                onSettings={() => setTab('settings')}
                onReschedule={(commitment) => {
                  edit({ type: 'commitment', item: commitment });
                  setTab('memory');
                }}
                hasOlder={olderAvailable ?? state?.hasOlder ?? false}
                loadOlder={loadOlder}
                readPosition={readPosition}
                savePosition={savePosition}
                mutate={mutate}
              />
            </section>
            <section
              aria-label="记忆与约定"
              hidden={tab !== 'memory'}
              className="coach-management"
              data-annotate="coach.memory.page"
            >
              {editor ? (
                <CoachEditor
                  key={editor.type + (editor.item?.id ?? 'new')}
                  editor={editor}
                  draft={editorDraft!}
                  change={setEditorDraft}
                  busy={saving}
                  close={() => setEditor(null)}
                  save={async (body) => {
                    const ok = await mutate(
                      editor.type === 'memory'
                        ? '/api/coach/memories'
                        : '/api/coach/commitments',
                      {
                        ...(body as Record<string, unknown>),
                        ...(editor.expectedUpdatedAt
                          ? { expectedUpdatedAt: editor.expectedUpdatedAt }
                          : {}),
                      },
                    );
                    if (ok) setEditor(null);
                  }}
                />
              ) : (
                <>
                  <div className="coach-page-intro">
                    <span className="coach-overline">和 Captain 一起</span>
                    <h2>一起记住，一起做到。</h2>
                    <p>重要的事留在这里，小小的约定慢慢完成。</p>
                  </div>
                  <section
                    className="coach-detail-card"
                    aria-label="我们的约定"
                  >
                    <div className="coach-section-heading">
                      <span className="coach-section-icon">
                        <CalendarCheck size={22} />
                      </span>
                      <h3>
                        我们的约定 <span>{pending.length}</span>
                      </h3>
                      {!!pending.length && (
                        <button
                          className="text-button"
                          onClick={() => edit({ type: 'commitment' })}
                        >
                          <Plus size={16} />
                          加个约定
                        </button>
                      )}
                    </div>
                    {!pending.length && (
                      <div className="coach-empty-card">
                        <span className="coach-empty-symbol">
                          <CalendarCheck size={30} />
                        </span>
                        <b>从一件小事开始</b>
                        <p>约好下一步，到时候 Captain 陪你接着做。</p>
                        <button
                          className="primary"
                          onClick={() => edit({ type: 'commitment' })}
                        >
                          <Plus size={16} />
                          加个约定
                        </button>
                      </div>
                    )}
                    {pending.map((c) => (
                      <div className="coach-saved coach-commitment" key={c.id}>
                        <time className="coach-date-tile" dateTime={c.dueAt}>
                          <small>
                            {Number(localDateTime(c.dueAt).slice(5, 7))}月
                          </small>
                          <strong>
                            {Number(localDateTime(c.dueAt).slice(8, 10))}
                          </strong>
                        </time>
                        <div className="coach-saved-body">
                          <div>
                            <b>{c.title}</b>
                            <span>
                              {shanghaiDateTime(c.dueAt)} ·{' '}
                              {commitmentLabels[c.kind]}
                            </span>
                            <span className="coach-validity">
                              有效至 {shanghaiDateTime(commitmentExpiry(c))}
                            </span>
                          </div>
                          <div className="coach-actions">
                            <button
                              className="text-button"
                              onClick={() =>
                                edit({ type: 'commitment', item: c })
                              }
                            >
                              <Pencil size={14} />
                              调整
                            </button>
                            <button
                              className="coach-complete-button"
                              disabled={saving}
                              onClick={() =>
                                void mutate(
                                  '/api/coach/commitments',
                                  { id: c.id, status: 'completed' },
                                  'PATCH',
                                  '约定已完成',
                                )
                              }
                            >
                              <Check size={14} />
                              完成
                            </button>
                            <button
                              className="text-button"
                              disabled={saving}
                              onClick={() =>
                                void mutate(
                                  '/api/coach/commitments',
                                  { id: c.id, status: 'cancelled' },
                                  'PATCH',
                                  '约定已移入忘掉的历史',
                                )
                              }
                            >
                              忘掉约定
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!!ended.length && (
                      <details className="coach-ended">
                        <summary>已完成的约定 · {ended.length}</summary>
                        {ended.map((c) => (
                          <div className="coach-saved" key={c.id}>
                            <div>
                              <b>{c.title}</b>
                              <span>
                                {shanghaiDateTime(c.dueAt)} ·{' '}
                                {c.completion === 'record'
                                  ? '已由记录确认完成'
                                  : '你已确认完成'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </details>
                    )}
                    <p className="coach-card-footnote">
                      <Clock3 size={13} />
                      北京时间 · 页面打开时提醒，返回后继续跟进。
                    </p>
                  </section>
                  <section
                    className="coach-detail-card"
                    aria-label="记得你的事"
                  >
                    <div className="coach-section-heading">
                      <span className="coach-section-icon">
                        <Bookmark size={22} />
                      </span>
                      <h3>
                        记得你的事 <span>{memories.length}</span>
                      </h3>
                      {!!memories.length && (
                        <button
                          className="text-button"
                          onClick={() => edit({ type: 'memory' })}
                        >
                          <Plus size={16} />
                          添一条
                        </button>
                      )}
                    </div>
                    {!memories.length && (
                      <div className="coach-empty-card">
                        <span className="coach-empty-symbol">
                          <Bookmark size={30} />
                        </span>
                        <b>越了解你，越懂怎么陪你</b>
                        <p>你的偏好、目标和日常安排，都可以告诉 Captain。</p>
                        <div className="coach-memory-kinds">
                          <span>偏好</span>
                          <span>目标</span>
                          <span>日常安排</span>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => edit({ type: 'memory' })}
                        >
                          <Plus size={16} />
                          记住一件事
                        </button>
                      </div>
                    )}
                    {memories.map((m) => (
                      <div className="coach-saved" key={m.id}>
                        <div>
                          <span className="coach-memory-tag">
                            {m.category === 'preference' ? (
                              <Heart size={13} />
                            ) : m.category === 'goal' ? (
                              <Target size={13} />
                            ) : (
                              <Clock3 size={13} />
                            )}
                            {memoryLabels[m.category]}
                          </span>
                          <p>{m.content}</p>
                          <span className="coach-validity">
                            {m.expiresAt
                              ? `有效至 ${shanghaiDateTime(m.expiresAt)}`
                              : '长期记忆'}
                          </span>
                          <details>
                            <summary>记忆来源</summary>
                            <p>{m.source}</p>
                          </details>
                        </div>
                        <div className="coach-actions">
                          <button
                            className="text-button"
                            onClick={() => edit({ type: 'memory', item: m })}
                          >
                            <Pencil size={14} />
                            修改
                          </button>
                          <button
                            className="text-button"
                            onClick={() =>
                              setRemoving({
                                type: 'memory',
                                id: m.id,
                                text: m.content,
                              })
                            }
                          >
                            <Trash2 size={14} />
                            忘掉
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
                  <details
                    className="coach-detail-card coach-archive"
                    data-annotate="coach.archive"
                  >
                    <summary>
                      <span>
                        <RotateCcw size={18} /> 已过期/忘掉的记忆和约定
                      </span>
                      <span>
                        {archivedMemories.length + archivedCommitments.length}
                      </span>
                    </summary>
                    <p className="coach-muted">
                      这里的内容不再用于陪伴或提醒。恢复前可以调整内容和有效期。
                    </p>
                    {!archivedMemories.length &&
                      !archivedCommitments.length && (
                        <p className="coach-archive-empty">
                          暂时没有过期或忘掉的内容。
                        </p>
                      )}
                    {archivedMemories.map((m) => (
                      <article className="coach-saved" key={m.id}>
                        <span className="coach-memory-tag">
                          记忆 ·{' '}
                          {m.status === 'forgotten' ? '已忘掉' : '已过期'} ·{' '}
                          {memoryLabels[m.category]}
                        </span>
                        <p>{m.content}</p>
                        <span>
                          {m.expiresAt
                            ? `原有效期至 ${shanghaiDateTime(m.expiresAt)}`
                            : '原为长期记忆'}
                        </span>
                        <details>
                          <summary>记忆来源</summary>
                          <p>{m.source}</p>
                        </details>
                        <div className="coach-actions">
                          <button
                            className="secondary"
                            disabled={saving}
                            onClick={() =>
                              edit({ type: 'memory', item: m, restore: true })
                            }
                          >
                            <RotateCcw size={14} /> 恢复记忆
                          </button>
                          <button
                            className="text-button"
                            disabled={saving}
                            onClick={() =>
                              setRemoving({
                                type: 'memory',
                                id: m.id,
                                text: m.content,
                                permanent: true,
                              })
                            }
                          >
                            <Trash2 size={14} /> 永久忘掉
                          </button>
                        </div>
                      </article>
                    ))}
                    {archivedCommitments.map((c) => (
                      <article className="coach-saved" key={c.id}>
                        <span className="coach-memory-tag">
                          约定 ·{' '}
                          {c.status === 'cancelled' ? '已忘掉' : '已过期'} ·{' '}
                          {commitmentLabels[c.kind]}
                        </span>
                        <p>{c.title}</p>
                        <span>原提醒 {shanghaiDateTime(c.dueAt)}</span>
                        <span>
                          原有效期至 {shanghaiDateTime(commitmentExpiry(c))}
                        </span>
                        <div className="coach-actions">
                          <button
                            className="secondary"
                            disabled={saving}
                            onClick={() =>
                              edit({
                                type: 'commitment',
                                item: c,
                                restore: true,
                              })
                            }
                          >
                            <RotateCcw size={14} /> 恢复约定
                          </button>
                          <button
                            className="text-button"
                            disabled={saving}
                            onClick={() =>
                              setRemoving({
                                type: 'commitment',
                                id: c.id,
                                text: c.title,
                                permanent: true,
                              })
                            }
                          >
                            <Trash2 size={14} /> 永久忘掉
                          </button>
                        </div>
                      </article>
                    ))}
                  </details>
                </>
              )}
            </section>
            <section
              aria-label="Captain 设置"
              hidden={tab !== 'settings'}
              className="coach-management"
              data-annotate="coach.settings.page"
            >
              <div className="coach-connection-hero">
                <div>
                  <span
                    className={`coach-connection-status ${state?.active ? 'is-active' : ''}`}
                  >
                    {state?.active
                      ? '已启用'
                      : state?.connection.configured
                        ? '等待启用'
                        : '尚未连接'}
                  </span>
                  <h2>
                    {state?.active ? 'Captain 在这里。' : '按你的节奏，陪你。'}
                  </h2>
                  <p>
                    {state?.active
                      ? '聊聊近况，也一起照顾好自己。'
                      : '连上模型，就可以开始聊聊。'}
                  </p>
                </div>
                <CaptainAvatar className="captain-settings-avatar" />
              </div>
              <section
                className="coach-detail-card coach-connection"
                aria-label="模型连接与数据"
              >
                <div className="coach-section-heading">
                  <span className="coach-section-icon">
                    <ShieldCheck size={22} />
                  </span>
                  <h3>模型连接</h3>
                </div>
                {open && (
                  <CoachConnection
                    visible={tab === 'settings'}
                    disabled={saving || busy}
                    onSaved={refresh}
                  />
                )}
                <div className="coach-model-row">
                  <span>模型服务</span>
                  <strong>
                    {state?.connection.destination || '正在读取…'}
                  </strong>
                </div>
                <div className="coach-model-row">
                  <span>当前模型</span>
                  <code>{state?.connection.model || '尚未选择'}</code>
                </div>
                <p className="coach-setting-copy">
                  启用后，Captain
                  会将你的近期身体、饮食和训练摘要、所选日明细、个人资料、近期聊天以及已保存的记忆与约定发送到上方模型服务，用于回应你。按需查询的历史记录也会提供给模型。知识查询只向
                  Europe PMC 发送通用主题词，来源可在回复中展开查看。
                </p>
                <p className="coach-setting-copy">
                  聊天与记忆保存在本机账本。调用模型需要联网；通过 Codex
                  连接时会使用当前账户的 Codex 额度。
                </p>
                {state?.connection.configured ? (
                  <button
                    className={state.active ? 'secondary' : 'primary'}
                    disabled={saving}
                    onClick={async () => {
                      const enable = !state.active;
                      const ok = await mutate(
                        '/api/coach',
                        {
                          enabled: enable,
                          consentConfig: state.connection.fingerprint,
                        },
                        'PATCH',
                        enable
                          ? 'Captain 已启用，可以开始聊了'
                          : 'Captain 已停用',
                      );
                      if (ok && enable) setTab('chat');
                    }}
                  >
                    {state.active ? '停用 AI 聊天' : '启用 Captain，开始聊聊'}
                  </button>
                ) : (
                  <div className="coach-setup">
                    <p>在上方完成登录或保存 API 配置，就可以启用 Captain。</p>
                  </div>
                )}
              </section>
              <section className="coach-detail-card" aria-label="怎么陪你">
                <div className="coach-section-heading">
                  <span className="coach-section-icon">
                    <MessageCircle size={22} />
                  </span>
                  <h3>怎么陪你</h3>
                </div>
                <RadioGroup
                  aria-label="Captain 语气"
                  className="coach-tone-options"
                  disabled={saving}
                  value={state?.settings.tone ?? 'direct'}
                  onValueChange={(tone) => {
                    if (!saving)
                      void mutate(
                        '/api/coach',
                        { tone },
                        'PATCH',
                        'Captain 语气已调整',
                      );
                  }}
                >
                  <label
                    htmlFor={`${toneId}-direct`}
                    className={
                      state?.settings.tone !== 'gentle' ? 'is-selected' : ''
                    }
                  >
                    <Zap size={23} />
                    <b>直球一点</b>
                    <span>有点俏皮，陪你迈出下一步。</span>
                    <RadioGroupItem id={`${toneId}-direct`} value="direct" />
                  </label>
                  <label
                    htmlFor={`${toneId}-gentle`}
                    className={
                      state?.settings.tone === 'gentle' ? 'is-selected' : ''
                    }
                  >
                    <Heart size={23} />
                    <b>温和一点</b>
                    <span>先听你说，慢慢找到节奏。</span>
                    <RadioGroupItem id={`${toneId}-gentle`} value="gentle" />
                  </label>
                </RadioGroup>
              </section>
              <section
                className="coach-detail-card"
                aria-label="主动问候与提醒"
              >
                <div className="coach-section-heading">
                  <span className="coach-section-icon">
                    <Bell size={22} />
                  </span>
                  <h3>一天里的几声问候</h3>
                </div>
                <p className="coach-setting-copy">
                  每隔4小时，结合你的最新记录聊一句，也跟进已经保存的约定。
                </p>
                <div className="coach-schedule" aria-label="北京时间问候时段">
                  {coachOpeningHours.map((hour) => {
                    const current =
                      state?.active &&
                      !quiet &&
                      coachOpeningKey(new Date(state.now))?.includes(
                        `T${hour}:`,
                      );
                    return (
                      <div key={hour} className={current ? 'is-current' : ''}>
                        <i aria-hidden="true" />
                        <b>{hour}:00</b>
                        <span>
                          {hour === 10
                            ? '上午'
                            : hour === 14
                              ? '午后'
                              : hour === 18
                                ? '傍晚'
                                : '晚间'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="coach-card-footnote">
                  <Clock3 size={13} />
                  北京时间 · 页面打开时更新，返回后补最近时段。
                </p>
                <button
                  className="secondary"
                  disabled={saving}
                  onClick={() =>
                    void mutate(
                      '/api/coach',
                      { quiet: quiet ? 'off' : 'today' },
                      'PATCH',
                      quiet ? '已恢复主动提醒' : '今天暂停主动提醒',
                    )
                  }
                >
                  {quiet ? <BellOff size={16} /> : <Bell size={16} />}
                  {quiet ? '今天已安静 · 恢复提醒' : '今天安静陪着我'}
                </button>
              </section>
              <details className="coach-detail-card coach-setting-block">
                <summary>切换模型与数据备份</summary>
                <p className="coach-setting-copy">
                  API 接口支持 Responses 与兼容的 Chat Completions。运行{' '}
                  <code>npm run coach:setup</code>{' '}
                  切换，重启后核对服务并重新启用。密钥不会进入网页或备份。
                </p>
                <p className="coach-setting-copy">
                  聊天、记忆和约定会随“个人资料与备份”中的全部记录一起导出。
                </p>
              </details>
            </section>
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!removing}
        onOpenChange={(value) => {
          if (!value && !saving) setRemoving(null);
        }}
      >
        <AlertDialogContent className="coach-forget">
          <AlertDialogTitle>
            {removing?.permanent ? '永久忘掉这条内容？' : '忘掉这条记忆？'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {removing?.text}。
            {removing?.permanent
              ? '永久删除后无法恢复。原聊天仍可查看，关联的建议卡片内容会删除，该轮聊天不再提供给 Captain。'
              : '不再作为记忆使用，可在“已过期/忘掉的记忆和约定”中恢复。'}
          </AlertDialogDescription>
          <div className="coach-actions">
            <button
              className="secondary"
              disabled={saving}
              onClick={() => setRemoving(null)}
            >
              保留
            </button>
            <button
              className="danger-button"
              disabled={saving}
              onClick={async () => {
                if (
                  removing &&
                  (await mutate(
                    removing.type === 'memory'
                      ? '/api/coach/memories'
                      : '/api/coach/commitments',
                    { id: removing.id, permanent: !!removing.permanent },
                    'DELETE',
                    removing.permanent
                      ? '已永久忘掉'
                      : '已忘掉，可以在历史中恢复',
                  ))
                )
                  setRemoving(null);
              }}
            >
              {removing?.permanent ? '永久忘掉' : '忘掉'}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CoachEditor({
  editor,
  draft,
  change,
  busy,
  close,
  save,
}: {
  editor: Editor;
  draft: EditorDraft;
  change: (draft: EditorDraft) => void;
  busy: boolean;
  close: () => void;
  save: (body: unknown) => Promise<void>;
}) {
  const { id, text, category, kind, dueAt, expiresAt, dirty } = draft;
  const [discard, setDiscard] = useState(false);
  return (
    <form
      className="coach-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save(
          editor.type === 'memory'
            ? {
                id,
                content: text,
                category,
                expiresAt: expiresAt ? expiresAt + ':00+08:00' : null,
                ...(editor.restore
                  ? { action: 'restore' }
                  : editor.item
                    ? { action: 'update' }
                    : {}),
              }
            : {
                id,
                title: text,
                kind,
                dueAt: dueAt + ':00+08:00',
                expiresAt: expiresAt ? expiresAt + ':00+08:00' : null,
                ...(editor.restore
                  ? { action: 'restore' }
                  : editor.item
                    ? { action: 'update' }
                    : {}),
              },
        );
      }}
    >
      <div className="coach-section-heading">
        <h3>
          {editor.restore ? '恢复' : editor.item ? '调整' : '添加'}
          {editor.type === 'memory' ? '记忆' : '约定'}
        </h3>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            if (dirty) setDiscard(true);
            else close();
          }}
        >
          返回
        </button>
      </div>
      {discard && (
        <div className="coach-turn-error">
          <span>这次修改还没保存。</span>
          <button className="text-button" type="button" onClick={close}>
            放弃修改
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setDiscard(false)}
          >
            继续填写
          </button>
        </div>
      )}
      <Field
        label={
          editor.type === 'memory' ? '希望 Captain记住什么 *' : '约定做什么 *'
        }
      >
        <textarea
          required
          maxLength={editor.type === 'memory' ? 300 : 160}
          value={text}
          rows={3}
          onChange={(e) => {
            change({ ...draft, text: e.target.value, dirty: true });
          }}
        />
      </Field>
      {editor.type === 'memory' ? (
        <Field label="记忆类型">
          <Picker
            popupClassName="captain-picker"
            label="记忆类型"
            value={category}
            options={Object.entries(memoryLabels)}
            onChange={(v) => {
              change({ ...draft, category: v as MemoryCategory, dirty: true });
            }}
          />
        </Field>
      ) : (
        <>
          <Field label="提醒时间（北京时间）*">
            <input
              type="datetime-local"
              required
              value={dueAt}
              onChange={(e) => {
                change({ ...draft, dueAt: e.target.value, dirty: true });
              }}
            />
          </Field>
          <Field label="完成依据">
            <Picker
              popupClassName="captain-picker"
              label="约定完成依据"
              value={kind}
              options={Object.entries(commitmentLabels)}
              onChange={(v) => {
                change({ ...draft, kind: v as CommitmentKind, dirty: true });
              }}
            />
          </Field>
          <p className="coach-muted">
            {kind === 'checkin'
              ? '这件事由你确认是否完成。具体动作、时长或次数要求也选此项。'
              : `当天保存${commitmentLabels[kind]}后自动确认。提醒时间用于开口，完成依据按当天匹配。`}
          </p>
        </>
      )}
      <Field label="有效期至（北京时间，可不填）">
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) =>
            change({ ...draft, expiresAt: e.target.value, dirty: true })
          }
        />
      </Field>
      <p className="coach-muted">
        {editor.type === 'memory'
          ? editor.restore
            ? '请重新确认有效期；不填写表示恢复为长期记忆。'
            : '有截止时间的安排请填写；不填写则作为长期记忆。'
          : '不填写时，约定在提醒当天结束后失效。恢复已过期的约定需重新选择未来的提醒时间。'}
      </p>
      <button className="primary" disabled={busy}>
        {busy ? '正在保存…' : editor.restore ? '确认恢复' : '保存'}
      </button>
    </form>
  );
}
