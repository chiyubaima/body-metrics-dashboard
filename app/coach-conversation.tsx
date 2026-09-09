'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Bookmark,
  Check,
  Copy,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type { CoachState, CoachTurn, Commitment } from '@/lib/coach';
import { quietNow, shanghaiDateTime } from '@/lib/coach';
import { today } from '@/lib/model';
import {
  coachTimestamp,
  shouldSendCoachMessage,
  showCoachTimestamp,
} from '@/lib/coach-chat';

export type CoachScrollPosition = {
  top: number;
  pinned: boolean;
  lastReply?: string;
  anchor?: { id: string; offset: number };
};
type Props = {
  avatar?: ReactNode;
  state: CoachState | null;
  turns: CoachTurn[];
  errors: Record<string, string>;
  saving: boolean;
  visible: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onSend: (value: string) => void;
  onRetry: (turn: CoachTurn) => void;
  date: string;
  onDate: (date: string, keepOpen?: boolean) => void;
  onManage: () => void;
  onSettings: () => void;
  onReschedule: (commitment: Commitment) => void;
  hasOlder: boolean;
  loadOlder: () => Promise<void>;
  readPosition: () => CoachScrollPosition;
  savePosition: (position: CoachScrollPosition) => void;
  mutate: (
    path: string,
    body: unknown,
    method?: string,
    message?: string,
  ) => Promise<boolean>;
};

export function CoachConversation({
  avatar,
  state,
  turns,
  errors,
  saving,
  visible,
  draft,
  onDraft,
  onSend,
  onRetry,
  date,
  onDate,
  onManage,
  onSettings,
  onReschedule,
  hasOlder,
  loadOlder,
  readPosition,
  savePosition,
  mutate,
}: Props) {
  const list = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    composing = useRef(false),
    compositionEnded = useRef(-Infinity),
    position = useRef<CoachScrollPosition>({ top: 0, pinned: true }),
    positionLoaded = useRef(false),
    loading = useRef(false),
    opened = useRef(false),
    prepend = useRef<{ firstId: string; position: CoachScrollPosition } | null>(
      null,
    );
  const [loadingOlder, setLoadingOlder] = useState(false),
    [away, setAway] = useState(() => !readPosition().pinned),
    [copied, setCopied] = useState(''),
    [copyError, setCopyError] = useState('');
  const awaiting = turns.some((turn) => turn.status === 'pending');
  const due =
    state && !quietNow(state.settings)
      ? state.commitments.filter(
          (c) =>
            c.status === 'pending' && c.dueAt <= state.now && !c.notifiedAt,
        )
      : [];
  const lastReply = turns
    .filter((turn) => turn.status === 'complete')
    .at(-1)?.id;
  const [lastReadReply, setLastReadReply] = useState(
    () => readPosition().lastReply ?? lastReply,
  );
  const newReply = away && lastReply !== lastReadReply;
  const firstId = turns[0]?.id;

  function remember() {
    const node = list.current;
    if (!node || !visible) return;
    const top = node.getBoundingClientRect().top;
    const first = [
      ...node.querySelectorAll<HTMLElement>('[data-turn-id]'),
    ].find((item) => item.getBoundingClientRect().bottom > top + 8);
    const pinned = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
    const wasPinned = position.current.pinned;
    position.current = {
      ...position.current,
      top: node.scrollTop,
      pinned,
      anchor: first
        ? {
            id: first.dataset.turnId!,
            offset: first.getBoundingClientRect().top - top,
          }
        : undefined,
    };
    if (loading.current && prepend.current)
      prepend.current.position = { ...position.current };
    setAway(!pinned);
    if (pinned || wasPinned) {
      setLastReadReply(lastReply);
      position.current.lastReply = lastReply;
    }
    savePosition({ ...position.current });
  }
  function restore(saved: CoachScrollPosition) {
    const node = list.current;
    if (!node) return;
    const anchor = [
      ...node.querySelectorAll<HTMLElement>('[data-turn-id]'),
    ].find((item) => item.dataset.turnId === saved.anchor?.id);
    node.scrollTop = saved.pinned
      ? node.scrollHeight
      : anchor && saved.anchor
        ? node.scrollTop +
          anchor.getBoundingClientRect().top -
          node.getBoundingClientRect().top -
          saved.anchor.offset
        : saved.top;
  }
  function latest() {
    if (!list.current) return;
    position.current.pinned = true;
    list.current.scrollTo({
      top: list.current.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    setAway(false);
    setLastReadReply(lastReply);
    position.current.lastReply = lastReply;
    savePosition({ ...position.current });
  }
  useLayoutEffect(() => {
    if (!visible) {
      opened.current = false;
      return;
    }
    if (!list.current) return;
    if (!positionLoaded.current) {
      position.current = { ...readPosition() };
      positionLoaded.current = true;
    }
    if (prepend.current && firstId !== prepend.current.firstId) {
      restore(prepend.current.position);
      prepend.current = null;
    } else if (!opened.current) {
      restore(position.current);
      opened.current = true;
    } else if (position.current.pinned) {
      list.current.scrollTop = list.current.scrollHeight;
    }
  });
  useEffect(() => {
    if (!visible || !content.current) return;
    const observer = new ResizeObserver(() => {
      if (position.current.pinned && list.current)
        list.current.scrollTop = list.current.scrollHeight;
    });
    observer.observe(content.current);
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, [visible, position]);
  useLayoutEffect(() => {
    if (!visible || !input.current) return;
    const field = input.current;
    field.style.height = '0px';
    field.style.height = `${Math.min(152, Math.max(40, field.scrollHeight))}px`;
    field.style.overflowY = field.scrollHeight > 152 ? 'auto' : 'hidden';
  }, [draft, visible]);
  useEffect(() => {
    if (!visible) return;
    const viewport = window.visualViewport;
    const sheet = list.current?.closest<HTMLElement>('.coach-sheet');
    const resize = () => {
      if (!sheet || !viewport || viewport.scale !== 1) return;
      const mobile = window.matchMedia('(max-width: 760px)').matches;
      sheet.style.setProperty(
        '--coach-viewport-height',
        mobile ? `${viewport.height}px` : '100dvh',
      );
      sheet.style.setProperty(
        '--coach-viewport-top',
        mobile ? `${viewport.offsetTop}px` : '0px',
      );
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      sheet?.style.removeProperty('--coach-viewport-height');
      sheet?.style.removeProperty('--coach-viewport-top');
    };
  }, [visible]);
  useEffect(() => {
    if (!copied && !copyError) return;
    const timer = setTimeout(() => {
      setCopied('');
      setCopyError('');
    }, 3000);
    return () => clearTimeout(timer);
  }, [copied, copyError]);
  async function earlier() {
    if (loading.current || !firstId) return;
    remember();
    prepend.current = { firstId, position: { ...position.current } };
    loading.current = true;
    setLoadingOlder(true);
    try {
      await loadOlder();
    } finally {
      loading.current = false;
      setLoadingOlder(false);
    }
  }
  function send() {
    if (!draft.trim() || awaiting || !state?.active || composing.current)
      return;
    position.current.pinned = true;
    setAway(false);
    setLastReadReply(lastReply);
    position.current.lastReply = lastReply;
    savePosition({ ...position.current });
    onSend(draft.trim());
    input.current?.focus({ preventScroll: true });
  }
  function keepReading() {
    if (!visible) return;
    remember();
    position.current.pinned = false;
    savePosition({ ...position.current });
  }
  async function copy(turn: CoachTurn) {
    try {
      await navigator.clipboard.writeText(turn.reply!);
      setCopied(turn.id);
      setCopyError('');
    } catch {
      setCopyError(turn.id);
    }
  }
  return (
    <>
      {date !== today() && (
        <div className="coach-history-context">
          <CalendarClock size={15} /> 正在聊 {date} 的记录
          <button onClick={() => onDate(today(), true)}>回到今天</button>
        </div>
      )}
      <div className="coach-timeline">
        <div
          className="coach-messages"
          ref={list}
          onScroll={remember}
          aria-label="与 Captain的聊天记录"
        >
          <div className="coach-message-content" ref={content}>
            {hasOlder && (
              <button
                className="coach-older"
                disabled={loadingOlder}
                onClick={() => void earlier()}
              >
                {loadingOlder ? '正在加载…' : '查看更早的消息'}
              </button>
            )}
            {!turns.length && (
              <div className="coach-empty">
                {avatar}
                <strong>Captain，在这里。</strong>
                <p>
                  聊聊训练、吃饭，
                  <br />
                  也可以只是说说今天过得怎么样。
                </p>
                {state?.active ? (
                  <div className="coach-starters">
                    {['帮我看看最近的状态', '今天有点累，想聊聊'].map(
                      (text) => (
                        <button
                          key={text}
                          onClick={() => {
                            onDraft(text);
                            input.current?.focus();
                          }}
                        >
                          {text}
                          <ArrowUpRight size={14} />
                        </button>
                      ),
                    )}
                  </div>
                ) : (
                  <button className="primary" onClick={onSettings}>
                    认识一下 Captain <ChevronRight size={16} />
                  </button>
                )}
              </div>
            )}
            {turns.map((turn, index) => (
              <article
                className="coach-turn"
                key={turn.id}
                data-turn-id={turn.id}
              >
                {showCoachTimestamp(turn, turns[index - 1]) && (
                  <time className="coach-timestamp" dateTime={turn.createdAt}>
                    {coachTimestamp(turn.createdAt)}
                  </time>
                )}
                {turn.kind === 'opening' && (
                  <span className="coach-opening-label">今日问候</span>
                )}
                {turn.date !== today(new Date(turn.createdAt)) && (
                  <span className="coach-record-date">
                    聊的是 {turn.date} 的记录
                  </span>
                )}
                {turn.userText && (
                  <div className="coach-outgoing">
                    <p
                      className="coach-message user"
                      title={shanghaiDateTime(turn.createdAt)}
                    >
                      {turn.userText}
                    </p>
                    {turn.status === 'pending' && !turn.reply && (
                      <span className="coach-message-status">等待回复</span>
                    )}
                  </div>
                )}
                {turn.reply && (
                  <div className="coach-incoming">
                    <div
                      className={`coach-message assistant${turn.status === 'pending' ? ' is-streaming' : ''}`}
                    >
                      <p>{turn.reply}</p>
                    </div>
                    {turn.status === 'complete' && (
                      <div className="coach-message-tools">
                        {!!turn.evidence.length && (
                          <details
                            className="coach-evidence"
                            onToggle={keepReading}
                          >
                            <summary>
                              参考了 {turn.evidence.length} 条记录
                            </summary>
                            <div className="coach-evidence-content">
                              <span className="coach-muted">
                                回复时的记录快照；更正后的数据会用于下次聊天。
                              </span>
                              {turn.evidence.map((evidence) => (
                                <div key={evidence.id}>
                                  <b>
                                    {evidence.label} · {evidence.date}
                                  </b>
                                  <p>{evidence.detail}</p>
                                  <button
                                    className="text-button"
                                    onClick={() => onDate(evidence.date)}
                                  >
                                    查看这一天 <ArrowUpRight size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        <button
                          className="coach-copy"
                          aria-label={
                            copied === turn.id
                              ? '回复已复制'
                              : '复制 Captain 回复'
                          }
                          onClick={() => void copy(turn)}
                        >
                          {copied === turn.id ? (
                            <Check size={14} />
                          ) : (
                            <Copy size={14} />
                          )}{' '}
                          {copied === turn.id ? '已复制' : '复制'}
                        </button>
                      </div>
                    )}
                    {copyError === turn.id && (
                      <output className="coach-copy-error">
                        未能复制，可以选中文字后复制。
                      </output>
                    )}
                  </div>
                )}
                {turn.status === 'pending' && !turn.reply && (
                  <output className="coach-typing">
                    <span className="coach-typing-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>Captain 正在想…</span>
                  </output>
                )}
                {turn.status === 'failed' && (
                  <output className="coach-turn-error">
                    <CircleAlert size={16} />
                    <span>{errors[turn.id] ?? '这条还没有收到回复。'}</span>
                    <button
                      disabled={awaiting || !state?.active}
                      onClick={() => onRetry(turn)}
                    >
                      <RotateCcw size={14} /> 重试
                    </button>
                  </output>
                )}
                {turn.proposals.map((proposal) => {
                  const saved =
                    proposal.type === 'memory'
                      ? state?.memories.find((item) => item.id === proposal.id)
                      : state?.commitments.find(
                          (item) => item.id === proposal.id,
                        );
                  return (
                    <div
                      className={`coach-proposal${saved ? ' is-saved' : ''}`}
                      key={proposal.id}
                    >
                      <span className="coach-attachment-icon">
                        {proposal.type === 'memory' ? (
                          <Bookmark size={18} />
                        ) : (
                          <CalendarClock size={18} />
                        )}
                      </span>
                      <div className="coach-attachment-body">
                        <span className="coach-attachment-label">
                          {proposal.type === 'memory'
                            ? '一条值得记住的事'
                            : '下次的约定'}
                        </span>
                        <p>
                          {saved
                            ? 'content' in saved
                              ? saved.content
                              : saved.title
                            : proposal.text}
                        </p>
                        {proposal.dueAt && (
                          <time>
                            {shanghaiDateTime(
                              saved && 'dueAt' in saved
                                ? saved.dueAt
                                : proposal.dueAt,
                            )}
                          </time>
                        )}
                        {!saved && (
                          <details onToggle={keepReading}>
                            <summary>你说过</summary>
                            <q>{proposal.quote}</q>
                          </details>
                        )}
                        {saved ? (
                          <button
                            className="coach-saved-link"
                            onClick={onManage}
                          >
                            <Check size={14} /> 已保存 · 查看{' '}
                            <ChevronRight size={13} />
                          </button>
                        ) : (
                          <button
                            className="coach-attachment-save"
                            disabled={saving}
                            onClick={() =>
                              void mutate(
                                '/api/coach/proposals',
                                { turnId: turn.id, proposalId: proposal.id },
                                'POST',
                                proposal.type === 'memory'
                                  ? '已记住，可以随时修改'
                                  : '约定已保存',
                              )
                            }
                          >
                            {proposal.type === 'memory'
                              ? '记住这件事'
                              : '保存约定'}
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </article>
            ))}
            {due.map((commitment) => (
              <div className="coach-due" key={commitment.id}>
                <span>
                  <Bell size={15} /> 到了我们约定的时间
                </span>
                <b>{commitment.title}</b>
                <time>{shanghaiDateTime(commitment.dueAt)}</time>
                <div className="coach-actions">
                  <button
                    className="secondary"
                    disabled={saving}
                    onClick={() =>
                      void mutate(
                        '/api/coach/commitments',
                        { id: commitment.id, status: 'completed' },
                        'PATCH',
                        '这件事已完成',
                      )
                    }
                  >
                    <Check size={15} /> 做到了
                  </button>
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() => onReschedule(commitment)}
                  >
                    改个时间
                  </button>
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() =>
                      void mutate(
                        '/api/coach',
                        { action: 'acknowledge', ids: [commitment.id] },
                        'PATCH',
                        '暂时不再提醒这件事',
                      )
                    }
                  >
                    知道了
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {away && (
          <button className="coach-jump" onClick={latest}>
            <ArrowDown size={16} />
            {newReply ? '有新回复' : '回到最新'}
          </button>
        )}
      </div>
      <form
        className="coach-composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        {!state?.active && (
          <button
            type="button"
            className="coach-enable-hint"
            onClick={onSettings}
          >
            启用 Captain，开始聊天 <ChevronRight size={15} />
          </button>
        )}
        <div className="coach-input-row">
          <textarea
            ref={input}
            aria-label="和 Captain 说点什么"
            aria-describedby="coach-input-hint"
            placeholder={
              awaiting ? '也可以先写下一句…' : '和 Captain 说点什么…'
            }
            value={draft}
            rows={1}
            maxLength={3000}
            disabled={!state?.active}
            onChange={(event) => onDraft(event.target.value)}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
              compositionEnded.current = performance.now();
            }}
            onKeyDown={(event) => {
              if (
                shouldSendCoachMessage({
                  key: event.key,
                  shiftKey: event.shiftKey,
                  isComposing:
                    event.nativeEvent.isComposing ||
                    composing.current ||
                    performance.now() - compositionEnded.current < 80,
                  mobile: window.matchMedia('(pointer: coarse)').matches,
                })
              ) {
                event.preventDefault();
                send();
              }
            }}
          />
          <button
            className="coach-send"
            type="submit"
            aria-label="发送消息"
            title={awaiting ? 'Captain 回复后可以发送' : '发送消息'}
            disabled={!draft.trim() || awaiting || !state?.active}
          >
            <ArrowUp size={21} strokeWidth={2.7} />
          </button>
        </div>
        <div className="coach-composer-footer">
          <span id="coach-input-hint">
            {awaiting ? (
              '回复期间可以继续写，草稿会保留'
            ) : (
              <>
                <span className="coach-desktop-hint">
                  Enter 发送 · Shift + Enter 换行
                </span>
                <span className="coach-mobile-hint">想说什么，都可以</span>
              </>
            )}
          </span>
          {draft.length > 2700 && <span>{draft.length}/3000</span>}
        </div>
      </form>
    </>
  );
}
