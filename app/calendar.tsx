'use client';
import { useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import {
  today,
  shiftDate,
  weekDates,
  activePlan,
  weekCounts,
} from '@/lib/model';
import type { Entry, Plan, TrainingPlan } from '@/lib/model';
import { monthDates, dayMarks } from '@/lib/calendar';
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
function monthShift(date: string, amount: number) {
  const d = new Date(date.slice(0, 7) + '-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + amount);
  return d.toISOString().slice(0, 10);
}
function CalendarGrid({
  view,
  value,
  onChange,
  min = '2000-01-01',
  max = '2100-12-31',
  records = [],
  week = false,
  footprints = true,
}: {
  view: string;
  value: string;
  onChange: (d: string) => void;
  min?: string;
  max?: string;
  records?: Entry[];
  week?: boolean;
  footprints?: boolean;
}) {
  const dates = week ? weekDates(value) : monthDates(view);
  return (
    <div className={`journal-calendar-grid ${week ? 'week' : 'month'}`}>
      {weekdays.map((d) => (
        <span className="calendar-weekday" key={d}>
          周{d}
        </span>
      ))}
      {dates.map((d) => {
        const marks = dayMarks(footprints ? records : [], d);
        return (
          <button
            type="button"
            key={d}
            disabled={d < min || d > max}
            className={`calendar-day ${d === value ? 'selected' : ''} ${d.slice(0, 7) !== view.slice(0, 7) ? 'outside' : ''} ${d === today() ? 'is-today' : ''}`}
            aria-pressed={d === value}
            aria-label={`${d}${d === today() ? ' 今天' : ''}${marks.body ? ' 身体已记' : ''}${marks.diet ? (marks.diet === 'complete' ? ' 饮食已记完' : ' 饮食部分记录') : ''}${marks.training ? ' 训练' + { complete: '已完成', rest: '休息', missed: '未完成' }[marks.training] : ''}`}
            onClick={() => onChange(d)}
          >
            <b>{Number(d.slice(-2))}</b>
            {footprints && (
              <span className="calendar-marks" aria-hidden="true">
                <i className={`body ${marks.body ? 'filled' : ''}`} />
                <i className={`diet ${marks.diet}`} />
                <i className={`training ${marks.training}`} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
function MonthNav({
  view,
  setView,
  min = '2000-01-01',
  max = '2100-12-31',
}: {
  view: string;
  setView: (d: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <div className="month-nav">
      <button
        type="button"
        className="icon-button"
        aria-label="上个月"
        disabled={view.slice(0, 7) <= min.slice(0, 7)}
        onClick={() => setView(monthShift(view, -1))}
      >
        <ChevronLeft size={18} />
      </button>
      <div>
        <select
          aria-label="选择年份"
          value={view.slice(0, 4)}
          onChange={(e) => setView(e.target.value + view.slice(4, 7) + '-01')}
        >
          {Array.from(
            { length: Number(max.slice(0, 4)) - Number(min.slice(0, 4)) + 1 },
            (_, i) => Number(min.slice(0, 4)) + i,
          ).map((y) => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
        <select
          aria-label="选择月份"
          value={view.slice(5, 7)}
          onChange={(e) => setView(view.slice(0, 5) + e.target.value + '-01')}
        >
          {Array.from({ length: 12 }, (_, i) =>
            String(i + 1).padStart(2, '0'),
          ).map((m) => (
            <option value={m} key={m}>
              {Number(m)} 月
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label="下个月"
        disabled={view.slice(0, 7) >= max.slice(0, 7)}
        onClick={() => setView(monthShift(view, 1))}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
export function DatePicker({
  value,
  onChange,
  name,
  disabled = false,
  min = '2000-01-01',
  max = today(),
  label = '记录日期',
}: {
  value: string;
  onChange: (d: string) => void;
  name?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState(value);
  return (
    <div className="date-picker">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="date-picker-trigger"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setView(value);
          setOpen(!open);
        }}
      >
        <CalendarDays size={17} />
        {value.replaceAll('-', ' / ')}
        <ChevronDown size={16} />
      </button>
      {open && (
        <dialog
          open
          className="date-picker-popover"
          aria-label="选择日期"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <MonthNav view={view} setView={setView} min={min} max={max} />
          <CalendarGrid
            view={view}
            value={value}
            footprints={false}
            min={min}
            max={max}
            onChange={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
          <button
            type="button"
            className="text-button"
            onClick={() => setOpen(false)}
          >
            收起日历
          </button>
        </dialog>
      )}
    </div>
  );
}
export function JournalCalendar({
  date,
  onChange,
  records,
  plans,
  name,
}: {
  date: string;
  onChange: (d: string) => void;
  records: Entry[];
  plans: Plan[];
  name?: string;
}) {
  const [expanded, setExpanded] = useState(false),
    [view, setView] = useState(date);
  const week = weekDates(date),
    counts = weekCounts(records, date),
    plan = activePlan(plans, 'training', date)?.data as
      | TrainingPlan
      | undefined;
  const unique = (kind: string) =>
    new Set(
      records
        .filter((r) => r.kind === kind && week.includes(r.date))
        .map((r) => r.date),
    ).size;
  return (
    <section
      data-annotate="layout.calendar"
      className={`journal-calendar ${expanded ? 'expanded' : ''}`}
      aria-label="统一记录日历"
    >
      <div className="calendar-header">
        <div>
          <strong>打卡日历</strong>
          <span>{name ? `${name}，` : ''}练就有效</span>
        </div>
        <div className="calendar-controls">
          <button
            className="text-button"
            onClick={() => {
              setView(date);
              setExpanded(!expanded);
            }}
            aria-expanded={expanded}
          >
            {date.slice(0, 4)} 年 {Number(date.slice(5, 7))} 月
            <ChevronDown size={16} />
          </button>
          <button
            className="secondary small"
            onClick={() => {
              onChange(today());
              setView(today());
            }}
          >
            今天
          </button>
        </div>
      </div>
      <div className="calendar-week-layout">
        <button
          className="icon-button"
          aria-label="上一周"
          disabled={date <= '2000-01-07'}
          onClick={() => onChange(shiftDate(date, -7))}
        >
          <ChevronLeft size={20} />
        </button>
        <CalendarGrid
          view={date}
          value={date}
          records={records}
          week
          onChange={onChange}
        />
        <button
          className="icon-button"
          aria-label="下一周"
          disabled={date >= '2100-12-25'}
          onClick={() => onChange(shiftDate(date, 7))}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="calendar-footer">
        <div className="calendar-legend">
          <strong>本周打卡进展</strong>
          <span>
            <i className="body" />
            身体 {unique('body')} 天
          </span>
          <span>
            <i className="diet" />
            饮食 {unique('diet')} 天
          </span>
          <span>
            <i className="training" />
            抗阻 {counts.resistance}
            {plan ? `/${plan.resistance}` : ''} · 有氧 {counts.cardio}
            {plan ? `/${plan.cardio}` : ''} 次
          </span>
        </div>
        <small>本周 · 浅绿圆点为部分饮食记录，空心橙圈为休息</small>
      </div>
      {expanded && (
        <div className="calendar-month-sheet">
          <MonthNav view={view} setView={setView} />
          <CalendarGrid
            view={view}
            value={date}
            records={records}
            onChange={(d) => {
              onChange(d);
              setView(d);
              setExpanded(false);
            }}
          />
          <button className="text-button" onClick={() => setExpanded(false)}>
            收起月份
          </button>
        </div>
      )}
    </section>
  );
}
