'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Code2,
  MousePointer2,
  Hand,
  MessageSquare,
  Check,
  X,
  ArrowLeft,
  LocateFixed,
  Pencil,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import type { Annotation, AnnotationTarget } from '@/lib/annotations';
import {
  captureTarget,
  elementLabel,
  locateTarget,
  listenForAnnotations,
} from '@/lib/annotation-target';
import './developer-mode.css';
const moduleNames: Record<string, string> = {
  body: '身体',
  diet: '饮食',
  training: '训练',
  global: '全局',
};
type Action = 'exit' | 'close' | 'list' | 'pick' | 'operate';
async function request<T>(method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/annotations', {
      method,
      cache: 'no-store',
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    });
  } catch {
    throw new Error('批注暂时未保存，输入已保留。请重试。');
  }
  const result = (await response.json()) as { error?: string } & T;
  if (!response.ok)
    throw new Error(result.error ?? '批注服务暂时不可用，请重试。');
  return result as T;
}
export function DeveloperMode({
  date,
  ready,
}: {
  date: string;
  ready: boolean;
}) {
  const [enabled, setEnabled] = useState(false),
    [picking, setPicking] = useState(false),
    [panel, setPanel] = useState<'editor' | 'list' | null>(null),
    [notes, setNotes] = useState<Annotation[]>([]),
    [loaded, setLoaded] = useState(false),
    [filter, setFilter] = useState<'open' | 'resolved'>('open'),
    [target, setTarget] = useState<AnnotationTarget | null>(null),
    [id, setId] = useState(''),
    [message, setMessage] = useState(''),
    [original, setOriginal] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [discard, setDiscard] = useState<Action | null>(null),
    [deleting, setDeleting] = useState<string | null>(null),
    [host, setHost] = useState<HTMLDivElement | null>(null),
    [inDialog, setInDialog] = useState(false),
    [highlight, setHighlight] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
    } | null>(null);
  const selectedElement = useRef<Element | null>(null),
    textarea = useRef<HTMLTextAreaElement | null>(null),
    panelRef = useRef<HTMLDialogElement | null>(null),
    draftDirty = panel === 'editor' && message !== original;
  const perform = useCallback((action: Action) => {
    setDiscard(null);
    setError('');
    setDeleting(null);
    setMessage('');
    setOriginal('');
    setTarget(null);
    selectedElement.current = null;
    setHighlight(null);
    if (action === 'exit') {
      setEnabled(false);
      setPicking(false);
      setPanel(null);
    } else {
      setPanel(action === 'list' ? 'list' : null);
      setPicking(action !== 'operate' && action !== 'list');
    }
  }, []);
  const act = useCallback(
    (action: Action) => {
      if (busy) return;
      if (draftDirty) {
        setDiscard(action);
        return;
      }
      perform(action);
    },
    [busy, draftDirty, perform],
  );
  const refresh = useCallback(async () => {
    try {
      setNotes(await request<Annotation[]>());
      setLoaded(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法读取批注，请重试。');
    }
  }, []);
  useEffect(() => {
    if (enabled) void Promise.resolve().then(refresh);
  }, [enabled, refresh]);
  useEffect(() => {
    if (!enabled) return;
    const container = document.createElement('div');
    container.dataset.developerUi = '';
    container.className = 'developer-host';
    let parent: Element | null = null;
    function moveHost() {
      const dialogs = [
        ...document.querySelectorAll('[data-slot="dialog-content"]'),
      ].filter(
        (e) => !e.hasAttribute('data-closed') && !e.hasAttribute('hidden'),
      );
      const next = dialogs.at(-1) ?? document.body;
      if (parent === next && container.isConnected) return;
      parent = next;
      next.insertBefore(container, next.firstChild);
      setInDialog(next !== document.body);
    }
    const frame = requestAnimationFrame(() => {
      moveHost();
      setHost(container);
    });
    const observer = new MutationObserver(moveHost);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-closed', 'hidden'],
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.remove();
    };
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const draw = () => {
      const element = selectedElement.current;
      if (!element?.isConnected) {
        setHighlight(null);
        return;
      }
      const r = element.getBoundingClientRect();
      let left = Math.max(2, r.left),
        top = Math.max(2, r.top),
        right = Math.min(innerWidth - 2, r.right),
        bottom = Math.min(innerHeight - 2, r.bottom);
      for (
        let parent = element.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent),
          bounds = parent.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
          top = Math.max(top, bounds.top);
          bottom = Math.min(bottom, bounds.bottom);
        }
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
          left = Math.max(left, bounds.left);
          right = Math.min(right, bounds.right);
        }
      }
      setHighlight(
        right > left && bottom > top
          ? {
              x: left,
              y: top,
              width: right - left,
              height: bottom - top,
              label: elementLabel(element),
            }
          : null,
      );
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const select = (element: Element) => {
      selectedElement.current = element;
      schedule();
      setTarget(captureTarget(element, date));
      setId(crypto.randomUUID());
      setMessage('');
      setOriginal('');
      setError('');
      setNotice('');
      setPanel('editor');
      setPicking(false);
    };
    const unsubscribe = listenForAnnotations({
      picking,
      editorOpen: panel === 'editor',
      panelOpen: panel !== null,
      onPick: select,
      onHover: (element) => {
        selectedElement.current = element;
        schedule();
      },
      onEscape: () => act(panel ? 'close' : 'operate'),
      onGeometry: schedule,
    });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [enabled, picking, panel, date, act]);
  useEffect(() => {
    if (!enabled || !draftDirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [enabled, draftDirty]);
  useEffect(() => {
    if (panel === 'editor' && host) {
      const frame = requestAnimationFrame(() => textarea.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (panel === 'list' && host) {
      panelRef.current?.focus();
    }
  }, [panel, id, host]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function save() {
    if (!target || !message.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<Annotation>('POST', { id, message, target });
      setNotes((rows) =>
        [...rows.filter((n) => n.id !== result.id), result].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ),
      );
      setLoaded(true);
      perform('pick');
      setNotice('批注已保存，继续点击下一个元素');
    } catch (e) {
      setError(e instanceof Error ? e.message : '没有保存成功，请重试。');
    } finally {
      setBusy(false);
    }
  }
  function edit(note: Annotation) {
    setId(note.id);
    setTarget(note.target);
    setMessage(note.message);
    setOriginal(note.message);
    setPanel('editor');
    setPicking(false);
    setError('');
    selectedElement.current = locateTarget(note.target, date);
  }
  async function remove(note: Annotation) {
    setBusy(true);
    setError('');
    try {
      await request('DELETE', { id: note.id });
      setNotes((rows) => rows.filter((n) => n.id !== note.id));
      setDeleting(null);
      setNotice('批注已删除');
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败，请重试。');
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(note: Annotation) {
    setBusy(true);
    setError('');
    const status = note.status === 'open' ? 'resolved' : 'open';
    try {
      await request('PATCH', { id: note.id, status });
      setNotes((rows) =>
        rows.map((n) => (n.id === note.id ? { ...n, status } : n)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '状态没有保存，请重试。');
    } finally {
      setBusy(false);
    }
  }
  function locate(note: Annotation) {
    const element = locateTarget(note.target, date);
    if (!element) {
      setError(
        `请先回到 ${note.target.date} 的「${note.target.view}」并展开对应内容，再定位这条批注。`,
      );
      return;
    }
    element.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant',
    });
    selectedElement.current = element;
    const r = element.getBoundingClientRect();
    setHighlight({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      label: note.target.label,
    });
    setPanel(null);
    setPicking(false);
    setError('');
    setNotice(`已定位：${note.target.label}`);
  }
  const pending = notes.filter((n) => n.status === 'open').length,
    shown = notes.filter((n) => n.status === filter);
  const tools = (
    <div
      className={`developer-tools ${inDialog ? 'in-dialog' : ''}`}
      data-developer-ui=""
    >
      <div
        className="developer-toolbar"
        role="toolbar"
        aria-label="开发者批注工具"
      >
        <span className="developer-mode-label">
          <Code2 size={16} />
          <b>开发者模式</b>
        </span>
        <div className="developer-mode-switch">
          <button
            disabled={busy}
            className={picking ? 'selected' : ''}
            aria-pressed={picking}
            onClick={() => act('pick')}
          >
            <MousePointer2 size={15} />
            选择元素
          </button>
          <button
            disabled={busy}
            className={!picking && !panel ? 'selected' : ''}
            aria-pressed={!picking && !panel}
            onClick={() => act('operate')}
          >
            <Hand size={15} />
            操作页面
          </button>
        </div>
        <button
          disabled={busy}
          className={`developer-list-button ${panel === 'list' ? 'selected' : ''}`}
          onClick={() => act('list')}
        >
          <MessageSquare size={15} />
          批注 <b>{pending}</b>
        </button>
        <button
          disabled={busy}
          className="developer-exit"
          onClick={() => act('exit')}
          aria-label="退出开发者模式"
        >
          <X size={17} />
        </button>
        {!panel && (
          <span className="developer-instruction">
            {picking ? '点击元素写批注 · 滚动可用' : '可正常打开弹窗、切换日期'}
          </span>
        )}
      </div>
      {notice && (
        <output className="developer-notice">
          <Check size={14} />
          {notice}
        </output>
      )}
      {error && !panel && (
        <div className="developer-error" role="alert">
          {error}
          <button onClick={() => void refresh()}>重新读取</button>
        </div>
      )}
      {panel && (
        <dialog
          open
          className="developer-panel"
          ref={panelRef}
          aria-label={panel === 'editor' ? '编辑元素批注' : '批注清单'}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              const items = panelRef.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),textarea,a[href],input:not(:disabled),[tabindex="0"]',
              );
              if (!items?.length) return;
              const first = items[0],
                last = items[items.length - 1];
              if (
                e.shiftKey &&
                (document.activeElement === first ||
                  document.activeElement === panelRef.current)
              ) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }}
        >
          <header>
            <div>
              <span>页面批注</span>
              <h2>
                {panel === 'editor' ? '这个细节，你想怎么改？' : '待打磨的细节'}
              </h2>
            </div>
            <button
              className="developer-icon"
              aria-label="关闭批注面板"
              disabled={busy}
              onClick={() => act('close')}
            >
              <X size={19} />
            </button>
          </header>
          {discard && (
            <div className="developer-confirm" role="alert">
              <p>这条批注还没有保存，要放弃吗？</p>
              <div>
                <button onClick={() => setDiscard(null)}>继续写</button>
                <button onClick={() => perform(discard)}>放弃批注</button>
              </div>
            </div>
          )}
          {error && (
            <p className="developer-error" role="alert">
              {error}
            </p>
          )}
          {panel === 'editor' && target ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="developer-editor"
            >
              <div className="developer-target">
                <span>
                  {moduleNames[target.module] ?? target.module} · {target.view}
                </span>
                <strong>{target.label}</strong>
                <small>{target.date} · 已锁定对应元素</small>
              </div>
              <label htmlFor="developer-message">你的调整意见</label>
              <textarea
                ref={textarea}
                id="developer-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                required
                placeholder="比如：这个数字再小一些，和右侧的标签对齐…"
                disabled={busy}
              />
              <div className="developer-editor-meta">
                <span>保存到本机，刷新后仍保留</span>
                <span>{message.length}/2000</span>
              </div>
              <footer>
                <button
                  type="button"
                  className="developer-secondary"
                  disabled={busy}
                  onClick={() => act('list')}
                >
                  <ArrowLeft size={14} />
                  批注清单
                </button>
                <button
                  className="developer-primary"
                  disabled={busy || !message.trim()}
                >
                  <Check size={16} />
                  {busy ? '保存中…' : '保存批注'}
                </button>
              </footer>
            </form>
          ) : (
            <>
              <div className="developer-list-tabs">
                <button
                  aria-pressed={filter === 'open'}
                  className={filter === 'open' ? 'selected' : ''}
                  onClick={() => {
                    setFilter('open');
                    setDeleting(null);
                  }}
                >
                  待处理 {pending}
                </button>
                <button
                  aria-pressed={filter === 'resolved'}
                  className={filter === 'resolved' ? 'selected' : ''}
                  onClick={() => {
                    setFilter('resolved');
                    setDeleting(null);
                  }}
                >
                  已处理 {notes.length - pending}
                </button>
                <button
                  className="developer-icon"
                  aria-label="重新读取批注"
                  onClick={() => void refresh()}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className="developer-note-list">
                {!shown.length && (
                  <div className="developer-empty">
                    <MessageSquare size={30} />
                    <strong>
                      {!loaded
                        ? '正在读取批注…'
                        : filter === 'open'
                          ? '把想调整的地方留在页面上'
                          : '处理完成的批注会留在这里'}
                    </strong>
                    <p>
                      {filter === 'open'
                        ? '点击“选择元素”，再点一下你想改的位置。'
                        : '记录会保留，方便回看修改前的想法。'}
                    </p>
                  </div>
                )}
                {shown.map((note) => (
                  <article className="developer-note" key={note.id}>
                    <div className="developer-note-context">
                      <b>#{notes.findIndex((n) => n.id === note.id) + 1}</b>
                      <span>
                        {moduleNames[note.target.module] ?? note.target.module}{' '}
                        · {note.target.view}
                      </span>
                    </div>
                    <strong className="developer-note-target">
                      {note.target.label}
                    </strong>
                    <p>{note.message}</p>
                    <small>
                      {note.target.date} ·{' '}
                      {new Date(note.createdAt).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      批注
                    </small>
                    {deleting === note.id ? (
                      <div className="developer-confirm">
                        <p>删除这条批注？删除后无法恢复。</p>
                        <div>
                          <button
                            disabled={busy}
                            onClick={() => setDeleting(null)}
                          >
                            保留
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void remove(note)}
                          >
                            删除批注
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="developer-note-actions">
                        <button disabled={busy} onClick={() => locate(note)}>
                          <LocateFixed size={13} />
                          定位
                        </button>
                        <button disabled={busy} onClick={() => edit(note)}>
                          <Pencil size={13} />
                          编辑
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void changeStatus(note)}
                        >
                          <Check size={13} />
                          {note.status === 'open' ? '已处理' : '重新打开'}
                        </button>
                        <button
                          disabled={busy}
                          aria-label={`删除批注 ${note.message.slice(0, 30)}`}
                          onClick={() => setDeleting(note.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <footer className="developer-list-footer">
                批注完后，在聊天里告诉我“批注完了”，我会读取这些意见集中修改。
              </footer>
            </>
          )}
        </dialog>
      )}
    </div>
  );
  const highlightParent =
    inDialog && host?.parentElement
      ? host.parentElement
      : typeof document !== 'undefined'
        ? document.body
        : null;
  const parentRect = inDialog ? highlightParent?.getBoundingClientRect() : null;
  return (
    <>
      <button
        data-developer-ui=""
        className={`secondary small developer-toggle ${enabled ? 'enabled' : ''}`}
        disabled={!ready || busy}
        aria-pressed={enabled}
        onClick={() => {
          if (enabled) act('exit');
          else {
            setHost(null);
            setEnabled(true);
            setPicking(true);
            setError('');
            setNotice('');
          }
        }}
      >
        <Code2 size={17} />
        <span>{enabled ? '正在批注' : '开发者模式'}</span>
      </button>
      {enabled && host && createPortal(tools, host)}
      {enabled &&
        highlight &&
        highlightParent &&
        createPortal(
          <div
            data-developer-ui=""
            className="developer-highlight"
            style={{
              position: inDialog ? 'absolute' : 'fixed',
              left:
                highlight.x -
                (parentRect?.left ?? 0) +
                (inDialog ? highlightParent.scrollLeft : 0),
              top:
                highlight.y -
                (parentRect?.top ?? 0) +
                (inDialog ? highlightParent.scrollTop : 0),
              width: highlight.width,
              height: highlight.height,
            }}
          >
            <span style={{ top: highlight.y < 35 ? 4 : -27 }}>
              {highlight.label}
            </span>
          </div>,
          highlightParent,
        )}
    </>
  );
}
