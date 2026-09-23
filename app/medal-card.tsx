'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Award } from 'lucide-react';
import { medalMetrics, ruleSummary, medalView } from '@/lib/medals';
import type {
  Medal,
  MedalDefinition,
  MedalProgress,
  MedalRule,
  MedalView,
} from '@/lib/medals';
import type { Snapshot } from '@/lib/model';
import { today } from '@/lib/model';
import { cardioTypes, resistanceExercises } from '@/lib/exercises';
const motifs = { whale: '鲸跃', mountain: '登峰', lighthouse: '灯塔' };
export function MedalArtwork({
  art,
  id,
  stage = 0,
}: {
  art: import('@/lib/medals').MedalArt;
  id?: string;
  stage?: number;
}) {
  const src =
    art.kind === 'generated' && id
      ? `/api/medals/art?id=${encodeURIComponent(id)}&key=${encodeURIComponent(art.key || '')}`
      : `/medals/${art.motif}.jpg`;
  const [failedSource, setFailedSource] = useState('');
  const failed = failedSource === src;
  return (
    <span className={`medal-art ${stage ? 'is-earned' : ''}`}>
      {failed ? (
        <span className="medal-image-error">
          <Award size={27} />
          图案暂不可用
        </span>
      ) : (
        <Image
          src={src}
          alt={`${art.kind === 'generated' && art.subject ? art.subject : motifs[art.motif]}勋章图案`}
          width={640}
          height={640}
          unoptimized
          onError={() => setFailedSource(src)}
        />
      )}
      {!!stage && (
        <span className="medal-stage">{String(stage).padStart(2, '0')}</span>
      )}
    </span>
  );
}

export function MedalRulePreview({
  definition: d,
  progress: p,
}: {
  definition: MedalDefinition;
  progress: MedalProgress;
}) {
  return (
    <>
      <div className="medal-preview-rule">{ruleSummary(d)}</div>
      <p>
        按当前规则，已有{' '}
        <strong>
          {p.value} {d.unit}
        </strong>{' '}
        可计入。
      </p>
      {!!p.conditions?.length && (
        <ul className="medal-condition-progress">
          {p.conditions.map((c, i) => (
            <li key={i}>
              <span>{c.label}</span>
              <b>
                {c.value} / {c.target} {c.unit}
              </b>
            </li>
          ))}
        </ul>
      )}
      {!!p.notices?.length && (
        <details className="medal-evidence-notes">
          <summary>核验依据与历史范围</summary>
          {p.notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </details>
      )}
    </>
  );
}
export function MedalCard({
  medal,
  children,
  pending = false,
}: {
  medal: MedalView;
  children?: ReactNode;
  pending?: boolean;
}) {
  return (
    <article
      className="captain-medal-card"
      aria-label={medal.definition.name + '勋章'}
    >
      <div className="captain-medal-heading">
        <MedalArtwork
          art={medal.art}
          id={medal.id}
          stage={
            !pending && medal.status === 'active'
              ? medal.progress.achieved.length
              : 0
          }
        />
        <div>
          <small>
            {pending
              ? '进度待刷新'
              : medal.proposal
                ? '新版本待确认'
                : medal.status === 'draft'
                  ? '勋章草稿'
                  : medal.status === 'archived'
                    ? '已归档'
                    : medal.progress.achieved.length
                      ? '已获得'
                      : '正在追踪'}
          </small>
          <h4>{medal.definition.name}</h4>
          <p>{medal.definition.goal}</p>
        </div>
      </div>
      {pending ? (
        <p className="medal-fine">规则已更新，读取最新进度后即可继续。</p>
      ) : (
        <MedalRulePreview
          definition={medal.definition}
          progress={medal.progress}
        />
      )}
      <p className="medal-fine">
        {medal.definition.includeHistory ? '计入已有记录' : '从启用当天开始'}
        {medal.definition.startDate
          ? ' · ' + medal.definition.startDate + ' 起'
          : ''}
        {medal.definition.endDate ? ' · 至 ' + medal.definition.endDate : ''}
      </p>
      {children}
    </article>
  );
}
async function callMedal<T = { job?: { id: string; status: string } }>(
  path: string,
  body?: unknown,
) {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      (result as { error?: string }).error || '暂时未能完成，草稿仍在。',
    );
  return result as T;
}
export function CaptainMedalCard({
  initial,
  snapshot,
  onChanged,
  onEdit,
  disabled = false,
}: {
  initial: MedalView;
  snapshot?: Snapshot;
  onChanged?: () => Promise<unknown>;
  onEdit?: () => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState<Medal>(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [imageJob, setImageJob] = useState<{
      id: string;
      revision: number;
    } | null>(null);
  const fresh = snapshot?.medals?.find((m) => m.id === initial.id);
  const m = fresh && fresh.revision >= local.revision ? fresh : local;
  const preview = snapshot?.overview?.medalPreviews[m.id];
  const pending =
    !!snapshot?.overview &&
    (m.proposal
      ? preview?.revision !== m.revision
      : fresh !== m && m.revision !== initial.revision);
  const view =
    fresh === m && !m.proposal
      ? fresh
      : snapshot?.overview
        ? preview?.revision === m.revision
          ? preview
          : { ...initial, ...m, definition: m.proposal ?? m.definition }
        : snapshot
          ? medalView(
              m.proposal ? { ...m, definition: m.proposal, versions: [] } : m,
              snapshot.records,
              today(),
              snapshot.medalFacts,
            )
          : initial;
  useEffect(() => {
    let active = true;
    void callMedal(
      '/api/medals/art?id=' + encodeURIComponent(initial.id) + '&task=latest',
    )
      .then((result) => {
        if (active && result.job?.status === 'pending')
          setImageJob({ id: result.job.id, revision: initial.revision });
        else if (active && result.job?.status === 'complete')
          void onChanged?.();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [initial.id, initial.revision, onChanged]);
  useEffect(() => {
    if (!imageJob) return;
    let stopped = false;
    const timer = setInterval(() => {
      void callMedal(
        '/api/medals/art?id=' +
          encodeURIComponent(m.id) +
          '&task=latest&job=' +
          encodeURIComponent(imageJob.id),
      )
        .then(async (result) => {
          if (stopped) return;
          if (result.job && result.job.status !== 'pending') {
            setImageJob(null);
            if (result.job?.status === 'failed')
              setError('图案生成未完成，规则已保留，可重试。');
            await onChanged?.();
          }
        })
        .catch(() => {});
    }, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [imageJob, m.id, onChanged]);
  async function act(operation: () => Promise<void>) {
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成，请重试。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <MedalCard medal={{ ...view, proposal: m.proposal }} pending={pending}>
      <div className="captain-medal-actions">
        {(m.status === 'draft' || m.proposal) && (
          <button
            className="coach-confirm-record"
            disabled={busy || disabled || pending}
            onClick={() =>
              void act(async () => {
                const saved = await callMedal<Medal>('/api/medals', {
                  id: m.id,
                  revision: m.revision,
                  action: m.proposal ? 'revise' : 'activate',
                  ...(m.proposal ? { definition: m.proposal } : {}),
                });
                setLocal(saved);
                await onChanged?.();
              })
            }
          >
            {m.proposal
              ? '采用这版规则'
              : view.progress.achieved.length
                ? '启用并获得'
                : '开始追踪'}
          </button>
        )}
        <button
          className="coach-chip"
          disabled={busy || disabled || !!imageJob}
          onClick={onEdit}
        >
          调整规则
        </button>
        <button
          className="coach-chip"
          disabled={
            busy ||
            disabled ||
            !!imageJob ||
            !!m.proposal ||
            m.status === 'archived'
          }
          onClick={() =>
            void act(async () => {
              const job = imageJob || {
                id: crypto.randomUUID(),
                revision: m.revision,
              };
              const result = await callMedal('/api/medals/art', {
                id: m.id,
                revision: m.revision,
                requestId: job.id,
                background: true,
              });
              if (result.job)
                setImageJob({ id: result.job.id, revision: m.revision });
            })
          }
        >
          {imageJob
            ? '图案生成中…'
            : m.art.kind === 'generated'
              ? '换个图案'
              : '生成专属图案'}
        </button>
      </div>
      {pending && (
        <button
          className="coach-chip"
          disabled={busy || disabled}
          onClick={() =>
            void act(async () => {
              await onChanged?.();
            })
          }
        >
          刷新进度
        </button>
      )}
      {error && <output className="coach-error">{error}</output>}
      {imageJob && (
        <output className="medal-fine">
          你可以继续聊天，图案完成后会更新。请保持本机服务运行。
        </output>
      )}
    </MedalCard>
  );
}
export function MedalRuleEditor({
  rule,
  onChange,
}: {
  rule: MedalRule;
  onChange: (rule: MedalRule) => void;
}) {
  const update = (
    index: number,
    patch: Partial<MedalRule['conditions'][number]>,
  ) =>
    onChange({
      ...rule,
      conditions: rule.conditions.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    });
  return (
    <section className="medal-rule-editor" aria-label="组合与周期规则">
      <label>
        条件关系
        <select
          value={rule.match}
          onChange={(e) =>
            onChange({
              ...rule,
              match: e.target.value as MedalRule['match'],
            })
          }
        >
          <option value="all">全部满足</option>
          <option value="any">任一满足</option>
        </select>
      </label>
      <label>
        在哪个范围核对
        <select
          value={rule.period}
          onChange={(e) =>
            onChange({
              ...rule,
              period: e.target.value as MedalRule['period'],
              consecutive:
                e.target.value === 'total' ? false : rule.consecutive,
            })
          }
        >
          <option value="total">整个统计范围</option>
          <option value="day">每个自然日</option>
          <option value="week">每个自然周（周一开始）</option>
        </select>
      </label>
      {rule.period !== 'total' && (
        <label className="medal-history-toggle">
          <input
            type="checkbox"
            checked={rule.consecutive}
            onChange={(e) =>
              onChange({ ...rule, consecutive: e.target.checked })
            }
          />
          要求连续达标
        </label>
      )}
      {rule.conditions.map((c, i) => (
        <div className="medal-condition-editor" key={i}>
          <label>
            条件 {i + 1}
            <select
              value={c.metric}
              onChange={(e) =>
                update(i, {
                  metric: e.target.value as typeof c.metric,
                  exerciseId: '',
                  activityIds: [],
                })
              }
            >
              {Object.entries(medalMetrics)
                .filter(
                  ([key]) => key !== 'conditions' && !key.startsWith('manual'),
                )
                .map(([key, meta]) => (
                  <option value={key} key={key}>
                    {meta.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            至少（{medalMetrics[c.metric].unit}）
            <input
              type="number"
              min="0.01"
              step="any"
              value={c.target}
              onChange={(e) => update(i, { target: Number(e.target.value) })}
            />
          </label>
          {['exercise_gain', 'exercise_weight'].includes(c.metric) && (
            <>
              <label>
                力量动作
                <select
                  value={c.exerciseId}
                  onChange={(e) => update(i, { exerciseId: e.target.value })}
                >
                  <option value="">选择动作</option>
                  {resistanceExercises.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                每组至少几次
                <input
                  type="number"
                  min="1"
                  value={c.minReps}
                  onChange={(e) =>
                    update(i, { minReps: Number(e.target.value) })
                  }
                />
              </label>
            </>
          )}
          {['training_sessions', 'training_days'].includes(c.metric) && (
            <label>
              训练类型
              <select
                value={c.trainingType}
                onChange={(e) =>
                  update(i, {
                    trainingType: e.target.value as typeof c.trainingType,
                  })
                }
              >
                <option value="all">全部训练</option>
                <option value="cardio">有氧</option>
                <option value="resistance">抗阻</option>
              </select>
            </label>
          )}
          {['cardio_minutes', 'cardio_types'].includes(c.metric) && (
            <label>
              有氧项目
              <select
                value={c.activityIds[0] || ''}
                onChange={(e) =>
                  update(i, {
                    activityIds: e.target.value ? [e.target.value] : [],
                  })
                }
              >
                <option value="">全部有氧项目</option>
                {cardioTypes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              {c.activityIds.length > 1 && (
                <small>
                  当前已选 {c.activityIds.length} 项；重新选择会替换项目。
                </small>
              )}
            </label>
          )}
          {rule.conditions.length > 1 && (
            <button
              type="button"
              className="medal-text-button"
              onClick={() =>
                onChange({
                  ...rule,
                  conditions: rule.conditions.filter((_, n) => n !== i),
                })
              }
            >
              移除条件
            </button>
          )}
        </div>
      ))}
      {rule.conditions.length < 6 && (
        <button
          type="button"
          className="secondary"
          onClick={() =>
            onChange({
              ...rule,
              conditions: [
                ...rule.conditions,
                {
                  metric: 'training_sessions',
                  target: 1,
                  trainingType: 'all',
                  activityIds: [],
                  exerciseId: '',
                  minReps: 1,
                },
              ],
            })
          }
        >
          添加条件
        </button>
      )}
    </section>
  );
}
