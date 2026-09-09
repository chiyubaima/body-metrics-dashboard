'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  Bookmark,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { Field, Picker, Choices } from './form-controls';
import {
  commitmentLabels,
  memoryLabels,
  quietNow,
  shanghaiDateTime,
  localDateTime,
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
import { captainActivity, mergeCoachTurns } from '@/lib/coach-chat';
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
  | { type: 'memory'; item?: CoachMemory }
  | { type: 'commitment'; item?: Commitment };
type EditorDraft = {
  id: string;
  text: string;
  category: MemoryCategory;
  kind: CommitmentKind;
  dueAt: string;
  dirty: boolean;
};
export function Coach({
  date,
  ready,
  snapshot,
  blocked,
  selectDate,
}: {
  date: string;
  ready: boolean;
  snapshot: Snapshot;
  blocked: boolean;
  selectDate: (date: string) => void;
}) {
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
    [removing, setRemoving] = useState<CoachMemory | null>(null);
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const working = useRef(false),
    refreshSequence = useRef(0),
    openingAttempts = useRef(new Set<string>());
  const scrollPosition = useRef<CoachScrollPosition>({ top: 0, pinned: true });
  const entry = useRef<HTMLButtonElement>(null);
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
        next.type === 'commitment' && next.item
          ? localDateTime(next.item.dueAt)
          : '',
      dirty: false,
    });
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
      try {
        const result = await requestCoachStream(request, (delta) =>
          setLocalTurns((turns) =>
            turns.map((turn) =>
              turn.id === request.id
                ? { ...turn, reply: (turn.reply ?? '') + delta }
                : turn,
            ),
          ),
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
    const key = today();
    if (
      state.opening ||
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
      await coachRequest(path, body, method);
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
          c.status === 'pending' &&
          c.dueAt <= (state?.now ?? '') &&
          !c.notifiedAt,
      );
  const pending =
    state?.commitments.filter((c) => c.status === 'pending') ?? [];
  const ended =
    state?.commitments.filter((c) => c.status !== 'pending').reverse() ?? [];
  const awaiting = busy || allTurns.some((turn) => turn.status === 'pending');
  const headline =
    error && !state
      ? 'Captain 暂时没连接上，点这里重试'
      : due.length
        ? `还记得我们的约定吗？${due[0].title}`
        : quiet
          ? '今天安静陪着你，想聊时随时来。'
          : (allTurns.find(
              (turn) => turn.kind === 'opening' && turn.date === today(),
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
            <span className="coach-entry-bubble">{headline}</span>
            <span className="coach-invitation">
              聊两句 <ArrowUpRight size={15} />
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
              <SheetTitle>
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
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(String(v))}
            className="coach-tabs"
          >
            <TabsList
              className="coach-tab-list"
              hidden={tab === 'chat'}
              aria-label="Captain 详情"
            >
              <TabsTrigger value="chat">聊聊</TabsTrigger>
              <TabsTrigger value="memory">记忆与约定</TabsTrigger>
              <TabsTrigger value="settings">
                <Settings2 size={16} />
                设置
              </TabsTrigger>
            </TabsList>
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
            <TabsContent value="chat" className="coach-chat-panel" keepMounted>
              <CoachConversation
                avatar={
                  <CaptainAvatar
                    activity="greeting"
                    animated={open && tab === 'chat'}
                    className="captain-empty-avatar"
                  />
                }
                state={state}
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
            </TabsContent>
            <TabsContent value="memory" className="coach-management">
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
                      body,
                    );
                    if (ok) setEditor(null);
                  }}
                />
              ) : (
                <>
                  <div className="coach-section-heading">
                    <h3>
                      我们的约定 <span>{pending.length}</span>
                    </h3>
                    <button
                      className="text-button"
                      onClick={() => edit({ type: 'commitment' })}
                    >
                      <Plus size={16} />
                      加个约定
                    </button>
                  </div>
                  <p className="coach-muted">
                    页面打开时提醒；关闭期间的约定，下次打开继续。所有时间按北京时间。
                  </p>
                  {!pending.length && (
                    <p className="coach-empty-line">
                      暂时没有待办约定。先从一件小事开始。
                    </p>
                  )}
                  {pending.map((c) => (
                    <div className="coach-saved" key={c.id}>
                      <div>
                        <b>{c.title}</b>
                        <span>
                          {shanghaiDateTime(c.dueAt)} ·{' '}
                          {commitmentLabels[c.kind]}
                        </span>
                      </div>
                      <div className="coach-actions">
                        <button
                          className="text-button"
                          onClick={() => edit({ type: 'commitment', item: c })}
                        >
                          <Pencil size={14} />
                          调整
                        </button>
                        <button
                          className="text-button"
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
                              '约定已取消',
                            )
                          }
                        >
                          取消约定
                        </button>
                      </div>
                    </div>
                  ))}
                  {!!ended.length && (
                    <details className="coach-ended">
                      <summary>已结束的约定 · {ended.length}</summary>
                      {ended.map((c) => (
                        <div className="coach-saved" key={c.id}>
                          <div>
                            <b>{c.title}</b>
                            <span>
                              {shanghaiDateTime(c.dueAt)} ·{' '}
                              {c.status === 'cancelled'
                                ? '已取消'
                                : c.completion === 'record'
                                  ? '已由记录确认完成'
                                  : '你已确认完成'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </details>
                  )}
                  <div className="coach-section-heading memory-heading">
                    <h3>
                      记得你的事 <span>{state?.memories.length ?? 0}</span>
                    </h3>
                    <button
                      className="text-button"
                      onClick={() => edit({ type: 'memory' })}
                    >
                      <Plus size={16} />
                      添一条
                    </button>
                  </div>
                  {!state?.memories.length && (
                    <p className="coach-empty-line">
                      偏好、目标、日常安排。你愿意让我记住的事，会留在这里。
                    </p>
                  )}
                  {state?.memories.map((m) => (
                    <div className="coach-saved" key={m.id}>
                      <div>
                        <span>{memoryLabels[m.category]}</span>
                        <p>{m.content}</p>
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
                          onClick={() => setRemoving(m)}
                        >
                          <Trash2 size={14} />
                          忘掉
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </TabsContent>
            <TabsContent value="settings" className="coach-management">
              <div className="coach-connection">
                <span className="coach-overline">模型连接</span>
                <h3>{state?.connection.destination || '正在读取连接状态…'}</h3>
                <p>{state?.connection.model || '尚未选择模型'}</p>
                <span className="coach-connection-status">
                  {state?.active
                    ? '已启用'
                    : state?.connection.configured
                      ? '已发现模型连接，等待启用'
                      : '尚未连接'}
                </span>
              </div>
              <p className="coach-setting-copy">
                启用后，Captain
                会将你的近期身体、饮食和训练摘要、所选日明细、个人资料、近期聊天以及已保存的记忆与约定发送到上方模型服务，用于回应你。
              </p>
              <p className="coach-setting-copy">
                聊天与记忆保存在本机账本。通过 Codex
                使用模型仍需联网，并使用当前账户的 Codex 额度。
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
                  <p>
                    本机实验：安装依赖后，在终端运行{' '}
                    <code>npx codex login</code> 登录 ChatGPT，再重启看板。
                  </p>
                  <p>
                    已有 API 服务：运行 <code>npm run coach:setup</code>{' '}
                    配置，密钥只保存到本机服务端。
                  </p>
                  <button
                    className="text-button"
                    onClick={() =>
                      void refresh().catch((e) => setError(e.message))
                    }
                  >
                    <RotateCcw size={15} />
                    重新检查连接
                  </button>
                </div>
              )}
              <div className="coach-setting-block">
                <h3>怎么陪你</h3>
                <Choices
                  label="Captain 语气"
                  value={state?.settings.tone ?? 'direct'}
                  options={[
                    ['direct', '直球一点，有点俏皮'],
                    ['gentle', '温和一点，先听我说'],
                  ]}
                  onChange={(tone) => {
                    if (!saving)
                      void mutate(
                        '/api/coach',
                        { tone },
                        'PATCH',
                        'Captain 语气已调整',
                      );
                  }}
                />
              </div>
              <div className="coach-setting-block">
                <h3>主动提醒</h3>
                <p className="coach-setting-copy">
                  每日一次开场，跟进已经保存的约定。你可以随时主动聊天。
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
              </div>
              <details className="coach-setting-block">
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
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!removing}
        onOpenChange={(value) => {
          if (!value && !saving) setRemoving(null);
        }}
      >
        <AlertDialogContent className="coach-forget">
          <AlertDialogTitle>忘掉这条记忆？</AlertDialogTitle>
          <AlertDialogDescription>
            {removing?.content}。删除后不再作为长期记忆使用，原聊天仍保留。
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
                    '/api/coach/memories',
                    { id: removing.id },
                    'DELETE',
                    '这条长期记忆已删除',
                  ))
                )
                  setRemoving(null);
              }}
            >
              忘掉
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
  const { id, text, category, kind, dueAt, dirty } = draft;
  const [discard, setDiscard] = useState(false);
  return (
    <form
      className="coach-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save(
          editor.type === 'memory'
            ? { id, content: text, category }
            : { id, title: text, kind, dueAt: dueAt + ':00+08:00' },
        );
      }}
    >
      <div className="coach-section-heading">
        <h3>
          {editor.item ? '调整' : '添加'}
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
      <button className="primary" disabled={busy}>
        {busy ? '正在保存…' : '保存'}
      </button>
    </form>
  );
}
