'use client';
import type { MedalFacts } from '@/lib/medal-facts';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { MedalArtwork, MedalRuleEditor, MedalRulePreview } from './medal-card';
import {
  Award,
  Sparkles,
  ArrowLeft,
  Plus,
  ArrowUpRight,
  SlidersHorizontal,
  Check,
  Archive,
  RotateCcw,
  LoaderCircle,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { today } from '@/lib/model';
import type { Entry } from '@/lib/model';
import type { CoachLocalSettings } from '@/lib/coach-local';
import { cardioTypes, resistanceExercises } from '@/lib/exercises';
import {
  medalMetrics,
  newMedalDefinition,
  validateMedalDefinition,
  ruleSummary,
  medalView,
  evaluateMedal,
} from '@/lib/medals';
import type {
  Medal,
  MedalDefinition,
  MedalEvidence,
  MedalView,
} from '@/lib/medals';
import './medals.css';

export type Connection = {
  text: boolean;
  local: boolean;
  codex?: CoachLocalSettings['codex'];
  image: {
    configured: boolean;
    provider: 'codex' | 'api';
    model: string;
    baseUrl: string;
    hasKey: boolean;
  };
};
type Props = {
  facts?: MedalFacts;
  openTarget?: { id: string; sequence: number };
  visible?: boolean;
  date?: string;
  blocked?: boolean;
  onClose?: () => void;
  onOpen?: () => void;
  medals: MedalView[];
  records: Entry[];
  onChanged: () => Promise<unknown>;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onEvidence: (evidence: MedalEvidence) => void;
};
const categories = {
  all: '全部',
  training: '训练',
  diet: '饮食',
  body: '身体',
  life: '生活',
};

const motifs = { whale: '鲸跃', mountain: '登峰', lighthouse: '灯塔' };
const examples = [
  {
    motif: 'whale',
    name: '积少成多',
    text: '累计游泳 300 分钟，得到一枚跃出海面的鲸鱼勋章；1000 分钟时再获得下一阶段。',
  },
  {
    motif: 'mountain',
    name: '向前一步',
    text: '完成第一次户外徒步，由我自己确认。图案是一面立在山顶的小旗。',
  },
  {
    motif: 'lighthouse',
    name: '硅步千里',
    text: '累计完成训练 12 天，得到一枚灯塔勋章，不要求连续。',
  },
] as const;
async function request<T>(
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
    throw new Error('连接中断，输入已保留。请重试取回结果，或稍后再试。');
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error('服务暂时没有回应，输入已保留，请稍后重试。');
  }
  if (!response.ok)
    throw new Error(
      (value as { error?: string }).error || '操作未完成，请重试。',
    );
  return value as T;
}
export { MedalArtwork } from './medal-card';
export function Medals({
  facts,
  openTarget,
  visible = true,
  date = today(),
  blocked = false,
  onClose,
  onOpen,
  medals,
  records,
  onChanged,
  onDirty,
  onBusy,
  onEvidence,
}: Props) {
  const view = useRef<HTMLDivElement>(null);
  const [localMedal, setLocalMedal] = useState<Medal | null>(null);
  const items =
    localMedal &&
    localMedal.revision >
      (medals.find((m) => m.id === localMedal.id)?.revision || 0)
      ? [
          medalView(localMedal, records, today(), facts),
          ...medals.filter((m) => m.id !== localMedal.id),
        ]
      : medals;
  const [screen, setScreen] = useState<'wall' | 'compose' | 'edit' | 'detail'>(
    'wall',
  );
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    view.current?.parentElement?.scrollTo({ top: 0 });
  }, [screen, selected]);
  const [tab, setTab] = useState('all');
  const [category, setCategory] = useState('all');
  const [draft, setDraft] = useState<MedalDefinition>(newMedalDefinition);
  const [targets, setTargets] = useState('1');
  const [review, setReview] = useState(false);
  const [input, setInput] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [generation, setGeneration] = useState<'text' | 'art' | null>(null);
  const [notification, setNotification] = useState<{
    title: string;
    message: string;
    failed: boolean;
  } | null>(null);
  const visibleRef = useRef(visible);
  const wasVisible = useRef(false);
  const resume = useRef(false);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    let cancelled = false;
    const reset =
      visible &&
      !wasVisible.current &&
      !resume.current &&
      !working.current &&
      !notification &&
      !dirty &&
      !openTarget;
    const opening = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (opening) {
      resume.current = false;
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setTab('all');
        setCategory('all');
        if (reset) {
          setScreen('wall');
          setSelected(null);
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [visible, notification, dirty, openTarget]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [manualDirty, setManualDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [artLookup, setArtLookup] = useState<{
    key: string;
    status: string;
  } | null>(null);
  const textJob = useRef<{ id: string; input: string } | null>(null);
  const artJob = useRef<{
    id: string;
    medalId: string;
    revision: number;
  } | null>(null);
  const createId = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    request<Connection>('/api/medals/connection')
      .then(setConnection)
      .catch(() => {});
  }, [visible]);
  const current = items.find((m) => m.id === selected);
  const artLookupKey = current ? `${current.id}:${current.revision}` : '';
  const currentId = current?.id;
  const currentRevision = current?.revision;
  const canResumeArt =
    artLookup?.key === artLookupKey &&
    ['pending', 'complete'].includes(artLookup.status);
  useEffect(() => {
    if (screen !== 'edit' || !currentId || !currentRevision || busy) return;
    let cancelled = false;
    request<{ job: { id: string; status: string } | null }>(
      `/api/medals/art?id=${encodeURIComponent(currentId)}&task=latest`,
    )
      .then(({ job }) => {
        if (cancelled) return;
        artJob.current =
          job && ['pending', 'complete'].includes(job.status)
            ? { id: job.id, medalId: currentId, revision: currentRevision }
            : null;
        setArtLookup({ key: artLookupKey, status: job?.status || 'none' });
      })
      .catch(() => {
        if (!cancelled) setArtLookup({ key: artLookupKey, status: 'unknown' });
      });
    return () => {
      cancelled = true;
    };
  }, [screen, currentId, currentRevision, artLookupKey, busy]);

  const artPending =
    artLookup?.key === artLookupKey && artLookup.status === 'pending';
  function mark(value = true) {
    setDirty(value);
    onDirty(value || manualDirty);
  }
  function markManual(value = true) {
    setManualDirty(value);
    onDirty(dirty || value);
  }
  function guard(next: () => void) {
    if (busy) return;
    if (dirty || manualDirty) setPending(() => next);
    else {
      setError('');
      setNotice('');
      next();
    }
  }
  async function run(
    action: () => Promise<void>,
    task: 'text' | 'art' | null = null,
  ) {
    if (working.current) return false;
    working.current = true;
    setGeneration(task);
    if (task) setNotification(null);
    setBusy(true);
    onBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (task && !visibleRef.current)
        setNotification({
          title: task === 'art' ? '勋章图案已生成' : '勋章规则已整理',
          message: '点击返回，继续编辑这枚勋章。',
          failed: false,
        });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : '操作未完成，请重试。';
      setError(message);
      if (task && !visibleRef.current)
        setNotification({
          title: task === 'art' ? '图案生成未完成' : '规则整理未完成',
          message,
          failed: true,
        });
      return false;
    } finally {
      working.current = false;
      setBusy(false);
      setGeneration(null);
      onBusy(false);
    }
  }
  async function accept(m: Medal) {
    setLocalMedal(m);
    setSelected(m.id);
    await onChanged().catch(() =>
      setNotice('勋章已保存。看板进度暂未刷新，重新打开后会同步。'),
    );
  }
  function create(text = '') {
    guard(() => {
      setSelected(null);
      createId.current = crypto.randomUUID();
      setInput(text);
      setQuestion('');
      setAnswer('');
      textJob.current = null;
      setScreen('compose');
      mark(!!text);
    });
  }
  function edit(m?: Medal) {
    const d = m?.proposal || m?.definition || newMedalDefinition();
    setDraft(structuredClone(d));
    setTargets(d.thresholds.join(', '));
    setSelected(m?.id || null);
    setReview(false);
    setScreen('edit');
  }
  const openedTarget = useRef(0);
  useEffect(() => {
    if (
      !visible ||
      !openTarget ||
      openedTarget.current === openTarget.sequence ||
      dirty ||
      busy
    )
      return;
    const m = medals.find((m) => m.id === openTarget.id);
    if (m) {
      openedTarget.current = openTarget.sequence;
      resume.current = true;
      void Promise.resolve().then(() => edit(m));
    }
  }, [openTarget, visible, medals, dirty, busy]);
  function change<K extends keyof MedalDefinition>(
    key: K,
    value: MedalDefinition[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
    setReview(false);
    mark();
  }
  const edited = {
    ...draft,
    thresholds: targets
      .split(/[,，/、\s]+/)
      .filter(Boolean)
      .map(Number),
  };
  const preview = evaluateMedal(
    {
      number: current?.status === 'active' ? current.versions.length + 1 : 0,
      definition: edited,
      art: current?.art || {
        kind: 'system',
        motif: draft.motif,
        style: 'enamel-v1',
      },
      activatedAt: today(),
    },
    records,
    [],
    today(),
    facts,
  );
  async function interpret(fresh = false) {
    await run(async () => {
      const text = answer.trim()
        ? `${input}\n系统追问：${question}\n我的补充：${answer}`
        : input;
      if (!text.trim()) throw new Error('先说说你想完成什么。');
      if (fresh || !textJob.current || textJob.current.input !== text)
        textJob.current = { id: crypto.randomUUID(), input: text };
      const result = await request<{
        outcome: string;
        message: string;
        definition: MedalDefinition | null;
      }>('/api/medals/interpret', {
        requestId: textJob.current.id,
        input: text,
      });
      setInput(text);
      setAnswer('');
      if (result.definition) {
        edit();
        setDraft(result.definition);
        setTargets(result.definition.thresholds.join(', '));
        setQuestion('');
        setNotice(result.message || '规则已整理，请检查后保存。');
        mark();
      } else {
        setQuestion(result.message);
        mark();
      }
    }, 'text');
  }
  async function persistDraft(definition: MedalDefinition) {
    createId.current ||= crypto.randomUUID();
    const m = await request<Medal>('/api/medals', {
      id: current?.id || createId.current,
      revision: current?.revision,
      action: current
        ? current.status === 'draft'
          ? 'save'
          : 'revise'
        : 'create',
      definition,
    });
    return m;
  }
  async function saveDraft() {
    await run(async () => {
      const definition = validateMedalDefinition(edited);
      if (current?.status === 'active' && !review) {
        setReview(true);
        return;
      }
      const m = await persistDraft(definition);
      await accept(m);
      mark(false);
      setScreen('detail');
      setNotice(
        m.status === 'draft'
          ? ''
          : '新版本已启用，旧版本的获奖条件与记录已保留。',
      );
    });
  }
  async function mutate(action: string, extra: Record<string, unknown> = {}) {
    if (!current) return false;
    return run(async () => {
      const m = await request<Medal>('/api/medals', {
        id: current.id,
        revision: current.revision,
        action,
        ...extra,
      });
      await accept(m);
      if (action === 'event') markManual(false);
    });
  }
  async function generateArt(fresh = false) {
    await run(async () => {
      const definition = validateMedalDefinition(edited);
      let saved: Medal | undefined = current;
      const changed =
        !current ||
        JSON.stringify(definition) !== JSON.stringify(current.definition);
      if (current?.status === 'active' && changed)
        throw new Error('请先预览并确认新规则，再生成对应图案。');
      if (changed) {
        saved = await persistDraft(definition);
        await accept(saved);
        setDraft(saved.definition);
        setTargets(saved.definition.thresholds.join(', '));
        mark(false);
      }
      if (!saved) throw new Error('请先填写勋章规则。');
      if (
        fresh ||
        !artJob.current ||
        artJob.current.medalId !== saved.id ||
        artJob.current.revision !== saved.revision
      )
        artJob.current = {
          id: crypto.randomUUID(),
          medalId: saved.id,
          revision: saved.revision,
        };
      setArtLookup({ key: `${saved.id}:${saved.revision}`, status: 'pending' });
      const m = await request<Medal>('/api/medals/art', {
        id: saved.id,
        revision: artJob.current.revision,
        requestId: artJob.current.id,
      });
      await accept(m);
      artJob.current = null;
      setDraft(m.definition);
      setTargets(m.definition.thresholds.join(', '));
      mark(false);
      setScreen('edit');
    }, 'art');
  }
  const groups = {
    all: items,
    progress: items.filter(
      (m) => m.status === 'active' && m.progress.next !== null,
    ),
    earned: items.filter(
      (m) =>
        m.status === 'active' &&
        [m.progress, ...m.past].some((p) => p.achieved.length > 0),
    ),
    draft: items.filter((m) => m.status === 'draft'),
    archived: items.filter((m) => m.status === 'archived'),
  };
  const filtered = groups[tab as keyof typeof groups].filter(
    (m) => category === 'all' || m.definition.category === category,
  );
  const close = () => {
    if (busy && generation) onClose?.();
    else
      guard(() => {
        setScreen('wall');
        setSelected(null);
        onClose?.();
      });
  };
  return (
    <>
      {notification && !visible && (
        <output className="medal-notification" aria-label="勋章通知">
          <Award size={28} aria-hidden="true" />
          <button
            className="medal-notification-open"
            disabled={blocked}
            onClick={() => {
              resume.current = true;
              setNotification(null);
              onOpen?.();
            }}
          >
            <strong>{notification.title}</strong>
            <span>{notification.message}</span>
            <small>
              {blocked
                ? '关闭当前窗口后查看'
                : notification.failed
                  ? '返回并重试'
                  : '继续编辑'}{' '}
              <ArrowUpRight size={12} />
            </small>
          </button>
          <button
            className="medal-notification-close"
            aria-label="关闭勋章通知"
            onClick={() => setNotification(null)}
          >
            <X size={15} />
          </button>
        </output>
      )}
      <Dialog
        open={visible}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className="dialog-popup medals-dialog"
          showCloseButton={false}
          data-annotate="dialog.medals.global"
          data-module="global"
          data-record-date={date}
        >
          <div className="medals-dialog-header">
            {screen !== 'wall' && (
              <button
                className="icon-button medal-header-back"
                aria-label="返回勋章墙"
                disabled={busy}
                onClick={() =>
                  guard(() => {
                    setScreen('wall');
                    setSelected(null);
                  })
                }
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <DialogTitle>勋章墙</DialogTitle>
            <DialogDescription className="sr-only">
              创建目标，编辑获得规则与专属图案。
            </DialogDescription>
            <div className="medal-header-actions">
              {screen === 'edit' && (
                <button
                  className="medal-primary"
                  disabled={busy || artPending}
                  onClick={saveDraft}
                >
                  {current?.status === 'active'
                    ? review
                      ? '确认启用新版本'
                      : '预览新规则'
                    : '保存草稿并预览'}
                  <ArrowUpRight size={16} />
                </button>
              )}
              <button
                className="icon-button dialog-close"
                aria-label="关闭"
                disabled={busy && !generation}
                onClick={close}
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="dialog-form-region">
            <div ref={view} className="medals-view" aria-busy={busy}>
              {screen === 'detail' && (
                <p className="medal-context">
                  {current?.status === 'draft'
                    ? '草稿预览'
                    : current?.status === 'archived'
                      ? '已归档'
                      : '我的里程碑'}
                </p>
              )}
              {error && (
                <div role="alert" className="medal-message is-error">
                  {error}
                </div>
              )}
              {notice && <output className="medal-message">{notice}</output>}
              {screen === 'wall' && (
                <>
                  <div className="medal-wall-title">
                    <div>
                      <p className="medal-eyebrow">MY NEXT MILESTONE</p>
                      <h3>
                        {items.length
                          ? '每一枚，都是你的故事'
                          : '为下一个自己，留一枚勋章'}
                      </h3>
                      <p>一次突破、一段坚持，或一件终于做到的事。</p>
                    </div>
                    <button className="medal-primary" onClick={() => create()}>
                      <Plus size={18} />
                      创造勋章
                    </button>
                  </div>
                  {!items.length && (
                    <div className="medal-inspiration">
                      <div>
                        <span className="medal-overline">从你想做的事开始</span>
                        <h4>
                          有些时刻，
                          <br />
                          值得提前期待。
                        </h4>
                        <p>
                          写下目标，选好属于它的模样。
                          <br />
                          让每一点进步，都有去处。
                        </p>
                        <button
                          className="medal-text-button"
                          onClick={() => {
                            createId.current = crypto.randomUUID();
                            edit();
                          }}
                        >
                          也可以按项创建 <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <div className="medal-example-grid">
                        {examples.map((e) => (
                          <button
                            key={e.motif}
                            className="medal-example"
                            onClick={() => create(e.text)}
                          >
                            <MedalArtwork
                              art={{
                                kind: 'system',
                                motif: e.motif,
                                style: 'enamel-v1',
                              }}
                            />
                            <strong>{e.name}</strong>
                            <span>
                              试试这个灵感 <ArrowUpRight size={12} />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="medal-toolbar">
                    <nav aria-label="勋章状态" className="medal-tabs">
                      {(
                        [
                          ['all', '全部'],
                          ['progress', '进行中'],
                          ['earned', '已获得'],
                          ['draft', '草稿'],
                          ['archived', '归档'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          aria-pressed={tab === key}
                          onClick={() => setTab(key)}
                        >
                          {label}
                          <span>{groups[key].length}</span>
                        </button>
                      ))}
                    </nav>
                    <label className="medal-category">
                      <span className="sr-only">勋章分类</span>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {Object.entries(categories).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {filtered.length ? (
                    <div className="medal-grid">
                      {filtered.map((m) => {
                        const awarded = [...m.past, m.progress]
                          .filter((p) => p.achieved.length)
                          .at(-1);
                        const p =
                          tab === 'earned' && awarded ? awarded : m.progress;
                        const earnedVersion =
                          tab === 'earned' && awarded
                            ? m.versions[awarded.version - 1]
                            : undefined;
                        const definition =
                          earnedVersion?.definition || m.definition;
                        const art = earnedVersion?.art || m.art;
                        const next = p.next || definition.thresholds.at(-1)!;
                        return (
                          <button
                            key={m.id}
                            className="medal-card"
                            onClick={() => {
                              setSelected(m.id);
                              setScreen('detail');
                              setError('');
                              setNotice('');
                            }}
                          >
                            <div className="medal-card-top">
                              <span>{categories[definition.category]}</span>
                              <span>
                                {tab === 'earned'
                                  ? `已获得 · 第 ${p.version} 版`
                                  : m.status === 'draft'
                                    ? '待启用'
                                    : m.status === 'archived'
                                      ? '已归档'
                                      : p.expired && p.next
                                        ? '已结束'
                                        : p.next
                                          ? '进行中'
                                          : '已达成'}
                              </span>
                            </div>
                            <MedalArtwork
                              art={art}
                              id={m.id}
                              stage={p.achieved.length}
                            />
                            <h4>{definition.name}</h4>
                            <p>{definition.goal}</p>
                            <div className="medal-card-progress">
                              <span>
                                {m.status === 'draft' ? '预览进度' : '当前进度'}
                              </span>
                              <strong>
                                {p.value}{' '}
                                <small>
                                  / {next} {definition.unit}
                                </small>
                              </strong>
                            </div>
                            <progress
                              value={Math.min(p.value, next)}
                              max={next}
                            />
                            <span className="medal-card-footer">
                              {tab !== 'earned' && p.next
                                ? `还差 ${Math.max(0, Math.round((p.next - p.value) * 100) / 100)} ${definition.unit}`
                                : `${p.achieved.length} 个阶段已点亮`}
                              <ArrowUpRight size={15} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="medal-list-empty">
                      <Award size={25} />
                      <p>
                        {tab === 'earned'
                          ? '这里会收藏你已经做到的事。'
                          : tab === 'draft'
                            ? '还没有待完成的草稿。'
                            : tab === 'archived'
                              ? '归档的目标会安静地保存在这里。'
                              : items.length
                                ? '这个分类下还没有勋章。'
                                : '第一枚勋章，由你来定义。'}
                      </p>
                    </div>
                  )}
                </>
              )}
              {screen === 'compose' && (
                <section className="medal-create-intro">
                  <p className="medal-eyebrow">A PROMISE TO YOURSELF</p>
                  <h3>纪念每一次进步！</h3>
                  <label>
                    <span className="sr-only">想创造的勋章</span>
                    <textarea
                      rows={5}
                      maxLength={4000}
                      value={input}
                      disabled={busy}
                      placeholder="比如：累计游泳 300 分钟，获得一枚跃出海面的鲸鱼勋章。"
                      onChange={(e) => {
                        setInput(e.target.value);
                        setQuestion('');
                        mark();
                      }}
                    />
                  </label>
                  {question && (
                    <div className="medal-followup">
                      <p>{question}</p>
                      <label>
                        补充说明
                        <textarea
                          rows={2}
                          maxLength={1500}
                          disabled={busy}
                          value={answer}
                          onChange={(e) => {
                            setAnswer(e.target.value);
                            mark();
                          }}
                          placeholder="补充目标，或说明由你本人确认完成…"
                        />
                      </label>
                    </div>
                  )}
                  {connection && !connection.text && (
                    <p>
                      文字模型尚未连接。可先按项创建，或在个人设置的模型设置中连接模型。
                    </p>
                  )}
                  <div className="medal-actions">
                    <button
                      className="medal-primary"
                      disabled={
                        busy || !input.trim() || connection?.text === false
                      }
                      onClick={() => interpret()}
                    >
                      <Sparkles size={17} />
                      {question ? '继续整理' : '整理成勋章'}
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        edit();
                        setDraft((d) => ({ ...d, goal: input.slice(0, 500) }));
                        mark(!!input);
                      }}
                    >
                      按项创建
                    </button>
                    {error && (
                      <button
                        className="medal-text-button"
                        disabled={busy}
                        onClick={() => interpret(true)}
                      >
                        重新发起
                      </button>
                    )}
                  </div>
                  <p className="medal-fine">
                    先给你可修改的规则预览，确认后才开始统计。
                  </p>
                  <div className="medal-prompt-examples">
                    {examples.map((e) => (
                      <button
                        key={e.motif}
                        disabled={busy}
                        onClick={() => {
                          setInput(e.text);
                          setQuestion('');
                          mark();
                        }}
                      >
                        {e.name} <ArrowUpRight size={13} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {screen === 'edit' && (
                <div className="medal-editor">
                  <div className="medal-fields">
                    {review && <h3>确认这次新的约定</h3>}
                    {review && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => setReview(false)}
                      >
                        继续修改
                      </button>
                    )}
                    <fieldset disabled={busy || artPending || review}>
                      <label>
                        勋章名称
                        <input
                          maxLength={32}
                          value={draft.name}
                          onChange={(e) => change('name', e.target.value)}
                          placeholder="给这次成长起个名字"
                        />
                      </label>
                      <label>
                        获得条件
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={draft.goal}
                          onChange={(e) => change('goal', e.target.value)}
                          placeholder="什么事情发生时，就值得获得它？"
                        />
                      </label>
                      <label>
                        如何确认完成
                        <select
                          value={draft.metric}
                          onChange={(e) => {
                            const metric = e.target
                              .value as MedalDefinition['metric'];
                            setDraft((d) => ({
                              ...d,
                              metric,
                              rule:
                                metric === 'conditions'
                                  ? {
                                      match: 'all',
                                      period: 'day',
                                      consecutive: false,
                                      conditions: [
                                        {
                                          metric: 'training_sessions',
                                          target: 1,
                                          trainingType: 'all',
                                          activityIds: [],
                                          exerciseId: '',
                                          minReps: 1,
                                        },
                                      ],
                                    }
                                  : undefined,
                              unit:
                                metric === 'conditions'
                                  ? '天'
                                  : medalMetrics[metric].unit,
                              category: medalMetrics[metric].category,
                              exerciseId: '',
                              activityIds: [],
                            }));
                            mark();
                          }}
                        >
                          {Object.entries(medalMetrics).map(([key, value]) => (
                            <option key={key} value={key}>
                              {value.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {draft.rule && (
                        <MedalRuleEditor
                          rule={draft.rule}
                          onChange={(rule) => {
                            setDraft((d) => ({
                              ...d,
                              rule,
                              unit: { total: '次', day: '天', week: '周' }[
                                rule.period
                              ],
                            }));
                            if (rule.period === 'total') setTargets('1');
                            mark();
                          }}
                        />
                      )}
                      {['training_sessions', 'training_days'].includes(
                        draft.metric,
                      ) && (
                        <label>
                          训练类型
                          <select
                            value={draft.trainingType}
                            onChange={(e) =>
                              change(
                                'trainingType',
                                e.target
                                  .value as MedalDefinition['trainingType'],
                              )
                            }
                          >
                            <option value="all">所有已完成训练</option>
                            <option value="resistance">抗阻训练</option>
                            <option value="cardio">有氧训练</option>
                          </select>
                        </label>
                      )}
                      {['cardio_minutes', 'cardio_types'].includes(
                        draft.metric,
                      ) && (
                        <details className="medal-options">
                          <summary>
                            有氧项目 ·{' '}
                            {draft.activityIds.length
                              ? `已选 ${draft.activityIds.length} 项`
                              : '全部'}
                          </summary>
                          <p>
                            不选择时统计全部有氧。游泳可同时选择泳池和开放水域。
                          </p>
                          <div className="medal-checkbox-grid">
                            {cardioTypes.map((c) => (
                              <label key={c.id}>
                                <input
                                  type="checkbox"
                                  checked={draft.activityIds.includes(c.id)}
                                  onChange={(e) =>
                                    change(
                                      'activityIds',
                                      e.target.checked
                                        ? [...draft.activityIds, c.id]
                                        : draft.activityIds.filter(
                                            (id) => id !== c.id,
                                          ),
                                    )
                                  }
                                />
                                {c.name}
                              </label>
                            ))}
                          </div>
                        </details>
                      )}
                      {['exercise_weight', 'exercise_gain'].includes(
                        draft.metric,
                      ) && (
                        <div className="medal-field-pair">
                          <label>
                            力量动作
                            <select
                              value={draft.exerciseId}
                              onChange={(e) =>
                                change('exerciseId', e.target.value)
                              }
                            >
                              <option value="">选择一个动作</option>
                              {resistanceExercises.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            每组至少完成次数
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={draft.minReps}
                              onChange={(e) =>
                                change('minReps', Number(e.target.value))
                              }
                            />
                          </label>
                        </div>
                      )}
                      <label>
                        阶段目标
                        {draft.metric !== 'manual_amount'
                          ? `（${draft.unit}）`
                          : ''}
                        <input
                          inputMode="decimal"
                          value={targets}
                          onChange={(e) => {
                            setTargets(e.target.value);
                            setReview(false);
                            mark();
                          }}
                          placeholder="例如：1，或 12, 30, 100"
                        />
                        <span className="medal-fine">
                          一个数就是一次达标；多个递增数会逐级点亮，最多 6 个。
                        </span>
                      </label>
                      {draft.metric === 'manual_amount' && (
                        <label>
                          数量单位
                          <input
                            maxLength={12}
                            value={draft.unit}
                            onChange={(e) => change('unit', e.target.value)}
                            placeholder="如：公里、本"
                          />
                        </label>
                      )}
                      <label className="medal-check">
                        <input
                          type="checkbox"
                          checked={draft.includeHistory}
                          onChange={(e) =>
                            change('includeHistory', e.target.checked)
                          }
                        />
                        计入历史记录
                      </label>
                      <p className="medal-fine">
                        {draft.includeHistory
                          ? '将核对统计范围内的历史记录，启用前可看到已达成的进度。'
                          : '默认从启用当天开始，包含当天启用前的记录。'}
                      </p>
                      <details className="medal-options">
                        <summary>日期范围与分类</summary>
                        <div className="medal-field-pair">
                          <label>
                            开始日期（可选）
                            <input
                              type="date"
                              value={draft.startDate}
                              onChange={(e) =>
                                change('startDate', e.target.value)
                              }
                            />
                          </label>
                          <label>
                            结束日期（可选）
                            <input
                              type="date"
                              value={draft.endDate}
                              onChange={(e) =>
                                change('endDate', e.target.value)
                              }
                            />
                          </label>
                        </div>
                        <p className="medal-fine">
                          填写日期后以此范围为准；不填结束日期可长期积累。
                        </p>
                        <label>
                          所在分类
                          <select
                            value={draft.category}
                            onChange={(e) =>
                              change(
                                'category',
                                e.target.value as MedalDefinition['category'],
                              )
                            }
                          >
                            {Object.entries(categories)
                              .filter(([key]) => key !== 'all')
                              .map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                          </select>
                        </label>
                      </details>
                      <label>
                        想要的图案
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={draft.subject}
                          onChange={(e) => change('subject', e.target.value)}
                          placeholder="一只跃出海面的鲸鱼"
                        />
                      </label>
                    </fieldset>
                    <div>
                      <span className="medal-field-label">
                        选一枚样章，或生成专属图案
                      </span>
                      <div className="medal-motif-picker">
                        {Object.entries(motifs).map(([key, label]) => (
                          <button
                            type="button"
                            key={key}
                            aria-pressed={draft.motif === key}
                            disabled={busy || artPending || review}
                            onClick={() =>
                              change('motif', key as MedalDefinition['motif'])
                            }
                          >
                            <Image
                              src={`/medals/${key}.jpg`}
                              alt=""
                              width={58}
                              height={58}
                              unoptimized
                            />
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="medal-generate-tile"
                          disabled={
                            busy ||
                            review ||
                            !connection?.image.configured ||
                            (!!current && artLookup?.key !== artLookupKey) ||
                            (artLookup?.key === artLookupKey &&
                              artLookup?.status === 'unknown')
                          }
                          onClick={() => generateArt(!canResumeArt)}
                        >
                          <span className="medal-generate-mark">
                            <Plus size={32} strokeWidth={1.25} />
                          </span>
                          {canResumeArt
                            ? '取回上次生成'
                            : current?.art.kind === 'generated'
                              ? '重新生成图案'
                              : '生成专属图案'}
                        </button>
                      </div>
                    </div>
                    <div className="medal-art-feedback">
                      <p className="medal-fine">
                        按图案描述生成，保持统一珐琅质感与银色边缘。
                        {connection?.image.provider === 'codex'
                          ? '使用 Codex 账号额度。'
                          : '使用图片 API 额度。'}
                      </p>
                      {current?.art.kind === 'generated' && (
                        <button
                          className="medal-text-button"
                          disabled={busy || artPending || review}
                          onClick={() => mutate('system-art')}
                        >
                          改用系统样章
                        </button>
                      )}
                      {connection?.image.configured === false && (
                        <p className="medal-fine">
                          在个人设置的模型设置中连接图案服务；也可以直接使用样章。
                        </p>
                      )}
                      {artLookup?.key === artLookupKey &&
                        artLookup?.status === 'unknown' && (
                          <p className="medal-fine">
                            暂时无法读取上次生成，请重新打开草稿后重试。
                          </p>
                        )}
                      {error && artLookup?.status === 'pending' && (
                        <button
                          className="medal-text-button"
                          disabled={busy}
                          onClick={() => generateArt()}
                        >
                          重试取回结果
                        </button>
                      )}
                    </div>
                  </div>
                  <aside className="medal-live-preview">
                    <span className="medal-overline">
                      {review ? '启用前预览' : '勋章预览'}
                    </span>
                    <MedalArtwork
                      id={current?.id}
                      art={
                        current?.art.kind === 'generated'
                          ? current.art
                          : {
                              kind: 'system',
                              motif: draft.motif,
                              style: 'enamel-v1',
                            }
                      }
                    />
                    <h4>{draft.name || '属于你的下一枚勋章'}</h4>
                    <p>{draft.goal || '你想完成的事，会写在这里。'}</p>
                    <MedalRulePreview definition={edited} progress={preview} />
                    {draft.metric.startsWith('manual') && (
                      <p className="medal-fine">
                        由你确认完成；每版规则分别记录，旧版确认与健康记录不会自动计入。
                      </p>
                    )}
                    <p className="medal-fine">
                      {current?.art.kind === 'generated'
                        ? current.art.subject !== draft.subject
                          ? '图案描述已修改，生成后会替换当前图案。'
                          : '当前展示专属生成图案。'
                        : '当前展示系统样章，可在左侧生成专属图案。'}
                    </p>
                    {current?.status === 'active' && (
                      <p className="medal-fine">
                        修改将建立新版本。旧版本已经获得的阶段会按原规则保留与核对。
                      </p>
                    )}
                  </aside>
                </div>
              )}
              {screen === 'detail' && current && (
                <div className="medal-detail">
                  <div className="medal-detail-hero">
                    <MedalArtwork
                      art={current.art}
                      id={current.id}
                      stage={current.progress.achieved.length}
                    />
                    <div>
                      <p className="medal-eyebrow">
                        {current.status === 'draft'
                          ? 'READY WHEN YOU ARE'
                          : 'ONE STEP AT A TIME'}
                      </p>
                      <h3>{current.definition.name}</h3>
                      <p>{current.definition.goal}</p>
                      <div className="medal-detail-tags">
                        <span>{categories[current.definition.category]}</span>
                        <span>
                          {current.definition.metric.startsWith('manual')
                            ? '本人确认'
                            : '自动核对'}
                        </span>
                        <span>
                          {current.art.kind === 'generated'
                            ? '专属生成图案'
                            : '系统样章'}
                        </span>
                        {current.versions.length > 1 && (
                          <span>规则版本 {current.versions.length}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="medal-detail-grid">
                    <section className="medal-detail-main">
                      <div className="medal-progress-heading">
                        <span>
                          {current.status === 'draft'
                            ? '启用后可计入'
                            : '已完成'}
                        </span>
                        <strong>
                          {current.progress.value}
                          <small> {current.definition.unit}</small>
                        </strong>
                        <p>
                          {current.progress.next
                            ? `距离下一阶段还有 ${Math.max(0, Math.round((current.progress.next - current.progress.value) * 100) / 100)} ${current.definition.unit}`
                            : '这一程，你做到了。'}
                        </p>
                      </div>
                      <progress
                        value={Math.min(
                          current.progress.value,
                          current.definition.thresholds.at(-1)!,
                        )}
                        max={current.definition.thresholds.at(-1)!}
                      />
                      <div className="medal-milestones">
                        {current.definition.thresholds.map((n, i) => {
                          const a = current.progress.achieved.find(
                            (a) => a.stage === i + 1,
                          );
                          return (
                            <div key={i} className={a ? 'is-earned' : ''}>
                              <span>
                                {a ? (
                                  <Check size={16} />
                                ) : (
                                  String(i + 1).padStart(2, '0')
                                )}
                              </span>
                              <strong>
                                {n} {current.definition.unit}
                              </strong>
                              <small>
                                {a
                                  ? current.status === 'draft'
                                    ? '历史已满足'
                                    : a.date
                                  : '等待点亮'}
                              </small>
                            </div>
                          );
                        })}
                      </div>
                      {current.progress.unknown > 0 && (
                        <p className="medal-message">
                          有 {current.progress.unknown}{' '}
                          项缺少时长、重量或次数，尚未计入。补全原记录后会自动核对。
                        </p>
                      )}
                      {current.progress.expired && current.progress.next && (
                        <p className="medal-message">
                          这段目标已结束，已有进度会保留。可以归档，或修改规则开启新一程。
                        </p>
                      )}
                      {current.status === 'active' &&
                        current.definition.metric.startsWith('manual') &&
                        !(
                          current.definition.metric === 'manual_count' &&
                          current.definition.thresholds.length === 1 &&
                          current.definition.thresholds[0] === 1 &&
                          current.progress.achieved.length
                        ) && (
                          <ManualEvents
                            key={current.id}
                            medal={current}
                            busy={busy}
                            dirty={markManual}
                            mutate={mutate}
                          />
                        )}
                      <EvidenceList
                        evidence={current.progress.evidence}
                        onEvidence={(e) => guard(() => onEvidence(e))}
                      />
                      {!!current.past.length && (
                        <details className="medal-options">
                          <summary>
                            以前的约定与获得记录 · {current.past.length} 个版本
                          </summary>
                          {current.past.map((p) => {
                            const v = current.versions[p.version - 1];
                            return (
                              <div className="medal-past" key={p.version}>
                                <MedalArtwork
                                  art={v.art}
                                  id={current.id}
                                  stage={p.achieved.length}
                                />
                                <strong>
                                  第 {p.version} 版 · {v.definition.name}
                                </strong>
                                <p>{ruleSummary(v.definition)}</p>
                                <p>
                                  {p.achieved.length
                                    ? p.achieved
                                        .map(
                                          (a) =>
                                            `${a.threshold} ${v.definition.unit} · ${a.date}`,
                                        )
                                        .join('；')
                                    : '原记录更正后，暂无满足条件的阶段。'}
                                </p>
                                <EvidenceList
                                  evidence={p.evidence}
                                  onEvidence={(e) => guard(() => onEvidence(e))}
                                />
                              </div>
                            );
                          })}
                        </details>
                      )}
                    </section>
                    <aside className="medal-detail-aside">
                      <h4>我们约好的规则</h4>
                      <p>{ruleSummary(current.definition)}</p>
                      <p>
                        {current.definition.startDate ||
                          (current.definition.includeHistory
                            ? '所有历史'
                            : today())}{' '}
                        起
                        {current.definition.endDate
                          ? `，至 ${current.definition.endDate}`
                          : '，不限结束日期'}
                        。
                      </p>
                      {current.progress.notices?.length ? (
                        current.progress.notices.map((note) => (
                          <p className="medal-fine" key={note}>
                            {note}
                          </p>
                        ))
                      ) : (
                        <p className="medal-fine">
                          {current.definition.metric === 'exercise_weight'
                            ? '只计已完成的正式组，按历史最佳值统计。'
                            : current.definition.metric.endsWith('days')
                              ? '同一自然日只计一次，不要求连续。'
                              : '按符合条件的记录累计。'}
                          更正、删除或恢复原记录后，进度会重新核对。
                        </p>
                      )}
                      <div className="medal-detail-actions">
                        {current.status === 'draft' && (
                          <button
                            className="medal-primary"
                            disabled={busy}
                            onClick={() => mutate('activate')}
                          >
                            <Check size={17} />
                            按这套规则启用
                          </button>
                        )}
                        {current.status !== 'archived' && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => guard(() => edit(current))}
                          >
                            <SlidersHorizontal size={15} />
                            {current.status === 'draft'
                              ? '修改草稿'
                              : '修改规则 · 新版本'}
                          </button>
                        )}
                        {current.status === 'archived' ? (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => mutate('restore')}
                          >
                            <RotateCcw size={15} />
                            恢复到勋章墙
                          </button>
                        ) : (
                          <button
                            className="medal-text-button"
                            disabled={busy}
                            onClick={() => guard(() => void mutate('archive'))}
                          >
                            <Archive size={15} />
                            归档这枚勋章
                          </button>
                        )}
                      </div>
                    </aside>
                  </div>
                  {!!current.events.length && (
                    <details className="medal-options">
                      <summary>
                        本人确认记录与更正 · {current.events.length} 条
                      </summary>
                      <div className="medal-event-history">
                        {[...current.events].reverse().map((e) => (
                          <div key={e.id}>
                            <span>
                              {e.date} · 第 {e.version} 版 · {e.amount}{' '}
                              {current.versions[e.version - 1]?.definition.unit}
                              <small>
                                {e.note || '本人确认完成'}
                                {e.deleted ? ' · 已撤回' : ''}
                              </small>
                            </span>
                            <button
                              className="medal-text-button"
                              disabled={busy}
                              onClick={() =>
                                mutate('toggle-event', {
                                  eventId: e.id,
                                  deleted: !e.deleted,
                                })
                              }
                            >
                              {e.deleted ? '恢复' : '撤回'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
              <AlertDialog
                open={visible && busy && !!generation}
                onOpenChange={(open) => {
                  if (!open) onClose?.();
                }}
              >
                <AlertDialogContent className="dialog-popup medal-generation-dialog">
                  <span className="medal-generation-icon">
                    <LoaderCircle size={27} className="medal-spin" />
                  </span>
                  <AlertDialogTitle>
                    {generation === 'art'
                      ? '正在生成专属图案'
                      : '正在整理勋章规则'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    你可以先去做别的，完成后会在右上角通知你。保留当前网页和本机服务，生成期间草稿会锁定。
                  </AlertDialogDescription>
                  <button
                    className="medal-generation-leave"
                    onClick={() => onClose?.()}
                  >
                    先去做别的
                  </button>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog
                open={!!pending}
                onOpenChange={(open) => {
                  if (!open) setPending(null);
                }}
              >
                <AlertDialogContent className="unsaved-confirm-dialog">
                  <AlertDialogTitle>保留正在编辑的内容？</AlertDialogTitle>
                  <AlertDialogDescription>
                    这部分内容还没有保存。返回后，未保存的修改会丢失。
                  </AlertDialogDescription>
                  <div className="confirm-actions">
                    <button
                      className="secondary"
                      onClick={() => setPending(null)}
                    >
                      继续编辑
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        const next = pending;
                        setPending(null);
                        setDirty(false);
                        setManualDirty(false);
                        onDirty(false);
                        setError('');
                        next?.();
                      }}
                    >
                      放弃修改并返回
                    </button>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function EvidenceList({
  evidence,
  onEvidence,
}: {
  evidence: MedalEvidence[];
  onEvidence: (e: MedalEvidence) => void;
}) {
  return (
    <details className="medal-options">
      <summary>查看完成依据 · {evidence.length} 条</summary>
      {!evidence.length ? (
        <p>还没有符合条件的记录。完成后会自动出现在这里。</p>
      ) : (
        <section className="medal-evidence" aria-label="勋章完成依据">
          {[...evidence].reverse().map((e, i) => (
            <div key={`${e.id}:${i}`}>
              <span>
                <strong>{e.date}</strong>
                <small>{e.label}</small>
              </span>
              {e.kind === 'manual' || e.kind === 'product' ? (
                <span>{e.kind === 'product' ? '系统核验' : '本人确认'}</span>
              ) : (
                <button
                  className="medal-text-button"
                  onClick={() => onEvidence(e)}
                >
                  查看原记录 <ArrowUpRight size={13} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </details>
  );
}
function ManualEvents({
  medal,
  busy,
  dirty,
  mutate,
}: {
  medal: Medal;
  busy: boolean;
  dirty: (value?: boolean) => void;
  mutate: (action: string, extra?: Record<string, unknown>) => Promise<boolean>;
}) {
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('1');
  const [note, setNote] = useState('');
  const id = useRef(crypto.randomUUID());
  return (
    <section className="medal-manual">
      <h4>这一步，我做到了</h4>
      <p>按上面的获得条件确认一次完成；填错可以在下方撤回，再重新确认。</p>
      <fieldset disabled={busy}>
        <div className="medal-field-pair">
          <label>
            完成日期
            <input
              type="date"
              max={today()}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                dirty();
              }}
            />
          </label>
          {medal.definition.metric === 'manual_amount' && (
            <label>
              完成数量（{medal.definition.unit}）
              <input
                type="number"
                min="0.01"
                step="any"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  dirty();
                }}
              />
            </label>
          )}
        </div>
        <label>
          留一句纪念（可选）
          <input
            maxLength={300}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              dirty();
            }}
            placeholder="今天做到了什么？"
          />
        </label>
        <button
          className="medal-primary"
          onClick={async () => {
            if (
              await mutate('event', {
                eventId: id.current,
                date,
                amount: Number(amount),
                note,
              })
            ) {
              setNote('');
              setAmount('1');
              id.current = crypto.randomUUID();
            }
          }}
        >
          <Check size={16} />
          确认这次完成
        </button>
      </fieldset>
    </section>
  );
}
export function ImageConnection({
  connection,
  busy,
  dirty,
  run,
  onSaved,
  onRefresh,
}: {
  connection: Connection;
  busy: boolean;
  dirty: (value?: boolean) => void;
  run: (fn: () => Promise<void>) => Promise<boolean>;
  onSaved: () => Promise<void>;
  onRefresh: (value: Connection) => void;
}) {
  const [provider, setProvider] = useState<'codex' | 'api'>(
    connection?.image.provider || 'codex',
  );
  const [baseUrl, setBaseUrl] = useState(
    connection?.image.baseUrl || 'https://api.openai.com/v1',
  );
  const [model, setModel] = useState(
    connection?.image.model || 'gpt-image-2.5-flare',
  );
  const [apiKey, setKey] = useState('');
  const [loginState, setCodex] = useState<CoachLocalSettings['codex']>();
  const codex = loginState ?? connection.codex;
  const [loginError, setLoginError] = useState('');
  useEffect(() => {
    if (!connection) return;
    dirty(
      provider !== connection.image.provider ||
        baseUrl.trim().replace(/\/+$/, '') !==
          (connection.image.baseUrl || 'https://api.openai.com/v1').replace(
            /\/+$/,
            '',
          ) ||
        model.trim() !== (connection.image.model || 'gpt-image-2.5-flare') ||
        !!apiKey,
    );
  }, [provider, baseUrl, model, apiKey, connection, dirty]);
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);
  useEffect(() => {
    if (codex?.status !== 'pending') return;
    let cancelled = false,
      checking = false;
    const timer = setInterval(async () => {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const value = await request<Connection>('/api/medals/connection');
        if (!cancelled) {
          setCodex(undefined);
          refreshRef.current(value);
          setLoginError('');
        }
      } catch {
        if (!cancelled) setLoginError('登录状态暂时无法刷新，请点击重新检查。');
      } finally {
        checking = false;
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [codex?.status]);
  if (connection?.local === false)
    return (
      <p className="medal-fine">
        Codex 登录在本机看板中使用；当前服务可通过服务端配置图片 API。
      </p>
    );
  const sameAddress =
    connection?.image.baseUrl.replace(/\/+$/, '') ===
    baseUrl.trim().replace(/\/+$/, '');
  async function check() {
    const value = await request<Connection>('/api/medals/connection');
    setCodex(undefined);
    onRefresh(value);
    setLoginError('');
  }
  function login() {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    void run(async () => {
      try {
        const state = await request<CoachLocalSettings['codex']>(
          '/api/medals/connection',
          { action: 'start' },
        );
        setCodex(state);
        if (state.loginUrl) popup?.location.replace(state.loginUrl);
        else popup?.close();
      } catch (e) {
        popup?.close();
        throw e;
      }
    });
  }
  return (
    <div className="medal-image-connection">
      <fieldset disabled={busy || !connection}>
        <fieldset className="medal-provider-options" aria-label="图案连接方式">
          <button
            type="button"
            aria-pressed={provider === 'codex'}
            onClick={() => setProvider('codex')}
          >
            Codex 登录
          </button>
          <button
            type="button"
            aria-pressed={provider === 'api'}
            onClick={() => setProvider('api')}
          >
            图片 API
          </button>
        </fieldset>
        {provider === 'codex' ? (
          <div className="medal-codex-connection">
            <strong>
              {codex?.status === 'logged-in'
                ? '已登录，可复用当前 Codex 账号'
                : codex?.status === 'pending'
                  ? '等待完成官方授权'
                  : codex?.status === 'error'
                    ? 'Codex 连接需要检查'
                    : '尚未登录 Codex'}
            </strong>
            <p className="medal-fine">
              使用 Codex 原生生图，无需 API
              密钥。与教练共用登录，生图使用账号额度。
            </p>
            {codex?.message && <output>{codex.message}</output>}
            <div className="medal-connection-actions">
              {codex?.status === 'pending' ? (
                <>
                  <a
                    href={codex.loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    打开官方授权页 <ArrowUpRight size={14} />
                  </a>
                  <button
                    type="button"
                    className="medal-text-button"
                    onClick={() =>
                      run(async () => {
                        setCodex(
                          await request('/api/medals/connection', {
                            action: 'cancel',
                          }),
                        );
                        await check();
                      })
                    }
                  >
                    取消登录
                  </button>
                </>
              ) : (
                codex?.status !== 'logged-in' && (
                  <button type="button" className="secondary" onClick={login}>
                    使用 ChatGPT 登录
                  </button>
                )
              )}
              <button
                type="button"
                className="medal-text-button"
                onClick={() => run(check)}
              >
                重新检查
              </button>
            </div>
            {loginError && <output>{loginError}</output>}
          </div>
        ) : (
          <>
            <label>
              API 根地址
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              图像模型
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label>
              API 密钥
              <input
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  connection?.image.hasKey && sameAddress
                    ? '已保存，留空则保留'
                    : '填写密钥'
                }
              />
            </label>
            <p className="medal-fine">
              支持 Images edits 接口。密钥只保存在本机，不包含在账本备份中。
            </p>
          </>
        )}
        <button
          className="secondary"
          type="button"
          disabled={provider === 'codex' && codex?.status !== 'logged-in'}
          onClick={() =>
            run(async () => {
              await request(
                '/api/medals/connection',
                provider === 'codex'
                  ? { provider }
                  : { provider, baseUrl, model, apiKey },
                'PUT',
              );
              if (provider === 'api') setKey('');
              await onSaved();
            })
          }
        >
          {provider === 'codex' ? '使用 Codex 生图' : '保存图片 API'}
        </button>
      </fieldset>
    </div>
  );
}
