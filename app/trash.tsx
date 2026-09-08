'use client';
import { useEffect, useState } from 'react';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import type { Entry, Kind, Body, Diet, Training } from '@/lib/model';
import { displayFoodName } from '@/lib/food-labels';
import { Segmented, numeric } from './panels';
import { DatePicker } from './calendar';
type TrashEntry = Entry & { deletedAt: string };
const labels = { body: '身体', diet: '饮食', training: '训练' };
export function TrashView({
  restore,
}: {
  restore: (ids: string[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<TrashEntry[]>([]),
    [kind, setKind] = useState('all'),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [filterDate, setFilterDate] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    try {
      const r = await fetch('/api/trash', { cache: 'no-store' });
      const result = await r.json();
      if (!r.ok) throw new Error((result as { error: string }).error);
      setRows(result as TrashEntry[]);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '回收站暂时无法读取，请重试。');
    }
  }
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  const visible = rows.filter(
      (r) =>
        (kind === 'all' || r.kind === kind) &&
        (!filterDate || r.date === filterDate),
    ),
    chosen = visible.filter((r) => selected.includes(r.id));
  async function recover(ids: string[]) {
    setBusy(true);
    setError('');
    try {
      await restore(ids);
      setRows((old) => old.filter((r) => !ids.includes(r.id)));
      setSelected([]);
      setNotice(`已恢复 ${ids.length} 条记录。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '恢复失败，请重试。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dialog-body trash-view">
      <div className="history-filters">
        <Segmented
          label="回收站模块筛选"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setSelected([]);
          }}
          items={[
            ['all', '全部'],
            ['body', '身体'],
            ['diet', '饮食'],
            ['training', '训练'],
          ]}
        />
        <details className="trash-date-filter">
          <summary>
            按记录日期筛选{filterDate ? ` · ${filterDate}` : ''}
          </summary>
          <DatePicker
            value={
              filterDate ||
              new Date().toLocaleDateString('en-CA', {
                timeZone: 'Asia/Shanghai',
              })
            }
            onChange={setFilterDate}
          />
          {filterDate && (
            <button className="text-button" onClick={() => setFilterDate('')}>
              清除日期筛选
            </button>
          )}
        </details>
      </div>
      <p className="helper">
        回收站不会自动清空。恢复的身体记录会保留当前已选晨重；同一天的饮食冲突会提示你处理。
      </p>
      <div className="selection-toolbar">
        <label>
          <input
            type="checkbox"
            disabled={busy || !visible.length}
            checked={
              visible.length > 0 &&
              chosen.length === Math.min(visible.length, 100)
            }
            onChange={(e) =>
              setSelected(
                e.target.checked ? visible.slice(0, 100).map((r) => r.id) : [],
              )
            }
          />
          {visible.length > 100 ? '选择前100条' : '全选当前结果'}
        </label>
        <span>{chosen.length} 条已选</span>
        <button
          className="text-button"
          disabled={!chosen.length || busy}
          onClick={() => recover(chosen.map((r) => r.id))}
        >
          <ArchiveRestore size={16} />
          恢复所选
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
          {!loaded && (
            <button className="text-button" onClick={load}>
              重试读取
            </button>
          )}
        </p>
      )}
      {notice && <output className="inline-feedback">{notice}</output>}
      {visible.map((r) => (
        <article className={`trash-row ${r.kind}`} key={r.id}>
          <input
            type="checkbox"
            aria-label={`选择${r.date}的${labels[r.kind]}记录`}
            checked={selected.includes(r.id)}
            disabled={busy}
            onChange={(e) =>
              setSelected((old) =>
                e.target.checked
                  ? [...old, r.id]
                  : old.filter((id) => id !== r.id),
              )
            }
          />
          <span className="trash-kind">{labels[r.kind as Kind]}</span>
          <div className="grow">
            <strong>{r.date}</strong>
            <p>
              {r.kind === 'body'
                ? `体重 ${numeric((r.data as Body).weight)} kg · 腰围 ${numeric((r.data as Body).waist)} cm · 体脂 ${numeric((r.data as Body).bodyFat)}%`
                : r.kind === 'diet'
                  ? (r.data as Diet).foods
                      .map((f) => `${displayFoodName(f)} ${f.grams}g`)
                      .join('、') ||
                    (r.data as Diet).note ||
                    '饮食打卡'
                  : (r.data as Training).exercises
                      ?.map((e) => e.name)
                      .join('、') ||
                    (r.data as Training).content ||
                    '训练记录'}
            </p>
            <small>
              删除于{' '}
              {new Date(r.deletedAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })}
            </small>
          </div>
          <button
            className="secondary small"
            disabled={busy}
            onClick={() => recover([r.id])}
          >
            恢复
          </button>
        </article>
      ))}
      {!visible.length && (
        <div className="empty-note">
          <Trash2 size={25} />
          <strong>
            {loaded
              ? rows.length
                ? '没有符合筛选的记录'
                : '回收站是空的'
              : '正在读取回收站…'}
          </strong>
          <p>删除的身体、饮食与训练记录会集中保存在这里。</p>
        </div>
      )}
    </div>
  );
}
