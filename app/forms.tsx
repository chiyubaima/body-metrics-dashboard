'use client';
import { useState, type SubmitEvent } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Download } from 'lucide-react';
import { today, trainingDraft } from '@/lib/model';
import type {
  Body,
  Entry,
  Plan,
  DietPlan,
  TrainingPlan,
  Profile,
  Kind,
  MealSlot,
} from '@/lib/model';
import { MealForm } from './meal-form';
import { TrainingForm } from './training-form';
import { DatePicker } from './calendar';
import { macroEnergy } from '@/lib/progress';
import { Field, Choices, Picker } from './form-controls';
export type Save = (
  path: string,
  body: unknown,
  method?: 'POST' | 'DELETE',
) => Promise<void>;
const stringField = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};
const amount = (v: FormData, key: string) => {
  const n = stringField(v, key).trim();
  return n === '' ? null : Number(n);
};
function Submit({
  busy,
  label = '保存记录',
}: {
  busy: boolean;
  label?: string;
}) {
  return (
    <div className="form-actions">
      <button className="primary" disabled={busy}>
        {busy ? '正在保存…' : label}
      </button>
    </div>
  );
}

type RecordProps = {
  formId: string;
  kind: Kind;
  date: string;
  existing?: Entry;
  draft?: Entry;
  save: Save;
  busy: boolean;
  onDirty: () => void;
  records: Entry[];
  meal?: MealSlot;
};
export function RecordForm(props: RecordProps) {
  if (props.kind === 'diet') return <MealForm {...props} />;
  if (props.kind === 'training') return <TrainingForm {...props} />;
  return <BodyForm {...props} />;
}
function BodyForm({
  formId,
  existing,
  draft,
  date,
  save,
  onDirty,
}: RecordProps) {
  const body = (draft ?? existing)?.data as Body | undefined,
    [id] = useState(() => draft?.id ?? existing?.id ?? crypto.randomUUID());
  const [condition, setCondition] = useState<Body['condition']>(
      body?.condition ?? 'morning',
    ),
    [estimated, setEstimated] = useState(body?.estimated ?? true),
    [primary, setPrimary] = useState(
      draft
        ? draft.primaryMorning === 1
        : existing
          ? existing.primaryMorning === 1
          : true,
    ),
    [error, setError] = useState(''),
    [recordDate, setRecordDate] = useState(
      draft?.date ?? existing?.date ?? date,
    );
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget),
      weight = amount(form, 'weight');
    try {
      await save('/api/records', {
        id,
        kind: 'body',
        date: stringField(form, 'date'),
        data: {
          weight,
          waist: amount(form, 'waist'),
          bodyFat: amount(form, 'bodyFat'),
          condition,
          estimated,
          primary: condition === 'morning' && weight !== null && primary,
          note: stringField(form, 'note'),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试。');
    }
  }
  return (
    <form
      id={formId}
      className="dialog-body"
      data-record-date={recordDate}
      onSubmit={submit}
      onChange={onDirty}
    >
      {error && (
        <p className="form-error record-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <span>
          记录日期 <em>*</em>
        </span>
        <DatePicker
          name="date"
          value={recordDate}
          onChange={(d) => {
            setRecordDate(d);
            onDirty();
          }}
        />
      </div>
      <div className="measurement-heading">
        身体测量 <em>*</em>
        <small>至少填写一项</small>
      </div>
      <div className="form-grid measurements-grid">
        <Field label="体重 · kg">
          <input
            name="weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="20"
            max="400"
            defaultValue={body?.weight ?? ''}
            placeholder="输入这次测量的体重"
          />
        </Field>
        <Field label="腰围 · cm">
          <input
            name="waist"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="30"
            max="300"
            defaultValue={body?.waist ?? ''}
          />
        </Field>
        <Field label="体脂率 · %">
          <input
            name="bodyFat"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="1"
            max="75"
            defaultValue={body?.bodyFat ?? ''}
          />
        </Field>
        <div className="field full">
          <span>
            测量条件 <em>*</em>
          </span>
          <Choices
            label="测量条件"
            value={condition}
            options={[
              ['morning', '晨起空腹'],
              ['other', '其他时间'],
            ]}
            onChange={(v) => {
              setCondition(v as Body['condition']);
              onDirty();
            }}
          />
        </div>
        {condition === 'morning' && (
          <label className="check-field full" htmlFor="primary-morning">
            <Checkbox
              id="primary-morning"
              checked={primary}
              onCheckedChange={(v) => {
                setPrimary(Boolean(v));
                onDirty();
              }}
            />
            将这次体重用于当日晨重趋势
          </label>
        )}
        <label className="check-field full" htmlFor="estimated-fat">
          <Checkbox
            id="estimated-fat"
            checked={estimated}
            onCheckedChange={(v) => {
              setEstimated(Boolean(v));
              onDirty();
            }}
          />
          体脂率为估计值
        </label>
      </div>
      <div className="form-grid body-note">
        <Field label="备注" wide>
          <textarea
            name="note"
            maxLength={2000}
            defaultValue={body?.note ?? ''}
            placeholder="例如：午饭后测量"
          />
        </Field>
      </div>
      <p className="detail-text">
        晨重趋势每天只使用一次测量，其他时间的体重仍会保存。
      </p>
    </form>
  );
}
export function PlanForm({
  kind,
  plan,
  date,
  save,
  busy,
  onDirty,
}: {
  kind: 'diet' | 'training';
  plan: Plan | null;
  date: string;
  save: Save;
  busy: boolean;
  onDirty: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID()),
    [error, setError] = useState('');
  const diet = plan?.data as DietPlan | undefined,
    training = (plan?.data as TrainingPlan) ?? trainingDraft;
  const [effectiveDate, setEffectiveDate] = useState(
      kind === 'diet' ? date : today(),
    ),
    [macros, setMacros] = useState({
      protein: diet?.protein?.toString() ?? '',
      carbs: diet?.carbs?.toString() ?? '',
      fat: diet?.fat?.toString() ?? '',
    });
  const [schedule, setSchedule] = useState<string[]>(
    training.schedule ?? trainingDraft.schedule,
  );
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    const data =
      kind === 'diet'
        ? {
            mode: 'macros',
            ...(effectiveDate < today() ? { scope: 'day' } : {}),
            protein: Number(macros.protein),
            carbs: Number(macros.carbs),
            fat: Number(macros.fat),
            note: stringField(f, 'note'),
          }
        : {
            resistance: amount(f, 'resistance'),
            cardio: amount(f, 'cardio'),
            minutes: amount(f, 'minutes'),
            schedule,
          };
    try {
      await save('/api/plans', {
        id,
        kind,
        date: stringField(f, 'date'),
        data,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败。');
    }
  }
  return (
    <form onSubmit={submit} onChange={onDirty} className="dialog-body">
      <div className="field">
        <span>
          生效日期 <em>*</em>
        </span>
        <DatePicker
          name="date"
          value={effectiveDate}
          onChange={(d) => {
            setEffectiveDate(d);
            onDirty();
          }}
          min={kind === 'diet' ? '1900-01-01' : today()}
          max="2100-12-31"
        />
      </div>
      {kind === 'diet' && (
        <p className="plan-scope-note">
          {effectiveDate < today()
            ? `仅调整 ${effectiveDate} 当天；其他日期不变，原目标版本保留。`
            : `从 ${effectiveDate} 开始使用，直到下一版目标。`}
        </p>
      )}
      {kind === 'diet' ? (
        <>
          <div className="form-grid measurements-grid">
            {(
              [
                ['protein', '蛋白质', 10, 400],
                ['carbs', '碳水', 0, 1000],
                ['fat', '脂肪', 10, 200],
              ] as const
            ).map(([key, label, min, max]) => (
              <Field key={key} label={`${label} · g / 天 *`}>
                <input
                  name={key}
                  type="number"
                  min={min}
                  max={max}
                  step="0.1"
                  required
                  value={macros[key]}
                  onChange={(e) =>
                    setMacros((m) => ({ ...m, [key]: e.target.value }))
                  }
                  placeholder="你的每日目标"
                />
              </Field>
            ))}
          </div>
          <div className="plan-energy-preview">
            <span>对应热量</span>
            <strong>
              {Object.values(macros).every(
                (v) => v !== '' && Number.isFinite(Number(v)),
              )
                ? Math.round(
                    macroEnergy(
                      Number(macros.protein),
                      Number(macros.carbs),
                      Number(macros.fat),
                    ),
                  ).toLocaleString()
                : '—'}{' '}
              <small>大卡 / 天</small>
            </strong>
            <p>
              蛋白质和碳水每克 4 大卡，脂肪每克 9
              大卡。总脂肪包含食物和烹调用油。
            </p>
          </div>
          {diet && diet.mode !== 'macros' && (
            <p className="legacy-note">
              原计划：肉 {diet.meat}g、生米 {diet.rice}g、总脂肪 {diet.fat}
              g。肉类营养因品种而异，请填入你确认的营养目标；保存后保留旧版本。
            </p>
          )}
          <Field label="饮食说明">
            <textarea
              name="note"
              maxLength={2000}
              defaultValue={diet?.note ?? ''}
            />
          </Field>
        </>
      ) : (
        <>
          <div className="form-grid">
            <Field label="每周抗阻 · 次">
              <input
                name="resistance"
                type="number"
                step="1"
                min={0}
                max={14}
                required
                defaultValue={plan ? training.resistance : ''}
              />
            </Field>
            <Field label="每周有氧 · 次">
              <input
                name="cardio"
                type="number"
                step="1"
                min={0}
                max={14}
                required
                defaultValue={plan ? training.cardio : ''}
              />
            </Field>
            <Field label="单次计划时长 · 分钟" wide>
              <input
                name="minutes"
                type="number"
                min={5}
                max={300}
                required
                defaultValue={plan ? training.minutes : ''}
              />
            </Field>
          </div>
          <details>
            <summary>
              安排具体训练日 <span>可保持自由安排</span>
            </summary>
            <div className="schedule-fields detail-fields">
              {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(
                (day, i) => (
                  <div key={day} className="schedule-row">
                    <span>{day}</span>
                    <Picker
                      label={day + '训练安排'}
                      value={schedule[i]}
                      options={[
                        ['unplanned', '自由安排'],
                        ['resistance', '抗阻'],
                        ['cardio', '有氧'],
                        ['both', '抗阻 + 有氧'],
                        ['rest', '休息'],
                      ]}
                      onChange={(v) => {
                        setSchedule((a) => a.map((x, j) => (i === j ? v : x)));
                        onDirty();
                      }}
                    />
                  </div>
                ),
              )}
            </div>
          </details>
        </>
      )}
      <p className="detail-text">
        新版本从所选日期生效。已有记录保留当时的计划，可在历史中查看。
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Submit busy={busy} label={plan ? '保存新计划' : '启用计划'} />
    </form>
  );
}
export function ProfileForm({
  profile,
  save,
  busy,
  onDirty,
}: {
  profile: Profile | null;
  save: Save;
  busy: boolean;
  onDirty: () => void;
}) {
  const [sex, setSex] = useState(profile?.sex ?? 'unspecified'),
    [error, setError] = useState('');
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await save('/api/profile', {
        name: stringField(f, 'name'),
        height: amount(f, 'height'),
        age: amount(f, 'age'),
        sex,
        note: stringField(f, 'note'),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败。');
    }
  }
  return (
    <form onSubmit={submit} onChange={onDirty} className="dialog-body">
      <Field label="称呼">
        <input
          name="name"
          maxLength={40}
          defaultValue={profile?.name ?? ''}
          placeholder="怎么称呼你"
        />
      </Field>
      <div className="form-grid">
        <Field label="身高 · cm">
          <input
            name="height"
            type="number"
            min={80}
            max={250}
            step="0.1"
            defaultValue={profile?.height ?? ''}
          />
        </Field>
        <Field label="当前年龄 · 岁">
          <input
            name="age"
            type="number"
            min={18}
            max={110}
            defaultValue={profile?.age ?? ''}
          />
        </Field>
      </div>
      <Choices
        label="生理性别"
        value={sex}
        options={[
          ['male', '男性'],
          ['female', '女性'],
          ['unspecified', '暂不填写'],
        ]}
        onChange={(v) => {
          setSex(v);
          onDirty();
        }}
      />
      <Field label="初始参考与备注">
        <textarea
          name="note"
          maxLength={1000}
          defaultValue={profile?.note ?? ''}
          placeholder="可保留饭后体重或估计体脂等参考，不会自动计入晨重趋势。"
        />
      </Field>
      <a className="backup-link" href="/api/export" download>
        <Download size={18} />
        导出全部记录与计划
      </a>
      <p className="detail-text">
        备份包含身体、饮食、训练、个人信息及历史计划。请保存在你信任的位置。
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Submit busy={busy} label="保存个人信息" />
    </form>
  );
}
