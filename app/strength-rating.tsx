'use client';
import Image from 'next/image';
import type { strengthRating } from '@/lib/strength-rating';
import { standardFor } from '@/lib/strength-standards';

type Rating = ReturnType<typeof strengthRating>;
const stages = [
  '整装出发',
  '舒展肩背',
  '稳稳下蹲',
  '踮脚平衡',
  '弓步启程',
  '弹力舒展',
  '握住力量',
  '从容弯举',
  '抱铃蓄力',
  '稳稳托举',
  '向上推举',
  '扎实提铃',
  '初握杠铃',
  '挺胸承重',
  '宽站稳持',
  '稳步负重',
  '弓步进阶',
  '单侧掌控',
  '从容持杠',
  '力量自如',
];
const number = (value: number) => Number(value.toFixed(1));
const label = (exercise: Rating['exercises'][number]) =>
  exercise.level === null
    ? '待评级'
    : `${exercise.provisional ? '暂评 ' : ''}Lv. ${exercise.level}`;

export function StrengthRating({
  rating,
  onSettings,
  onRecordBody,
}: {
  rating: Rating;
  onSettings?: () => void;
  onRecordBody: () => void;
}) {
  const { level, enabled, coverage } = rating;
  return (
    <section
      className="strength-rating strength-overview summary-block"
      aria-label="力量等级"
    >
      <div className="section-title">
        <h3>我的力量等级</h3>
        <span className="subtle">高阶 · Lv. 20</span>
      </div>
      <div className="strength-growth" data-annotate="training.avatar">
        {level !== null && (
          <Image
            src={`/strength-avatar/level-${String(level).padStart(2, '0')}.png`}
            alt={`力量第 ${level} 级 · ${stages[level - 1]}`}
            width={144}
            height={144}
            sizes="144px"
          />
        )}
        <div className="strength-growth-copy">
          <span>
            {level === null ? '四类均衡 · 按身体资料对标' : stages[level - 1]}
          </span>
          <strong>
            {!enabled ? (
              '对标已关闭'
            ) : level === null ? (
              '待评级'
            ) : (
              <>
                Lv. {level}
                <small> / 20</small>
              </>
            )}
          </strong>
          <p>
            {rating.profileIssue ??
              (level === 20
                ? '四类代表动作均达到高阶参考'
                : level !== null
                  ? '基于近期两次表现确认'
                  : rating.patterns.some((p) => p.excluded)
                    ? '已排除部分类别，仅显示单项等级'
                    : `${coverage}/4 类已确认，补齐后显示总等级`)}
          </p>
          {level !== null && (
            <progress
              max={20}
              value={rating.value!}
              aria-label="综合力量距高阶进度"
            />
          )}
          {onSettings && (
            <button type="button" className="text-button" onClick={onSettings}>
              {rating.profileIssue && enabled ? '补充个人资料' : '调整评级设置'}
            </button>
          )}
        </div>
      </div>
      {enabled && (
        <>
          <div className="strength-rating-grid">
            {rating.patterns.map((pattern) => (
              <div key={pattern.id} className="strength-rating-category">
                <span>{pattern.name}</span>
                <strong>
                  {pattern.reason || !pattern.exercise
                    ? '—'
                    : label(pattern.exercise)}
                </strong>
                <span>
                  {pattern.exercise?.name ??
                    (pattern.excluded ? '不参与对标' : '待建立参照')}
                </span>
                <small>
                  {pattern.reason ??
                    (pattern.exercise?.provisional
                      ? '再记录一次同动作训练以确认'
                      : '近两次表现已确认')}
                </small>
              </div>
            ))}
          </div>
          {rating.exercises.some(
            (e) => e.reason === '缺少训练时的近期晨重',
          ) && (
            <button
              type="button"
              className="text-button"
              onClick={onRecordBody}
            >
              记录晨重，为后续训练建立参照
            </button>
          )}
          <details className="strength-method strength-rating-evidence">
            <summary>单项等级与计算依据</summary>
            {!rating.exercises.length && (
              <p>
                记录卧推、划船、深蹲或硬拉类训练后，这里会显示单项评级。器械和自重动作继续记录个人进步。
              </p>
            )}
            {rating.exercises.map((exercise) => (
              <div key={exercise.id} className="strength-rating-detail">
                <div>
                  <strong>{exercise.name}</strong>
                  <b>{label(exercise)}</b>
                </div>
                <p>
                  {exercise.reason ??
                    (exercise.provisional
                      ? '只有一个日期的表现，暂不计入综合等级。'
                      : '近28天内最近两个训练日，取较低等级确认。')}
                </p>
                <p>
                  最近记录 {exercise.last.date} ·{' '}
                  {exercise.last.estimate === null
                    ? '缺少有效正式组'
                    : `${exercise.last.measured ? '单次实记' : '单次最大重量估算'} ${number(exercise.last.estimate)} kg${standardFor(exercise.id)?.load === 'perHand' ? ' / 单手' : ' / 总重'}`}
                </p>
                {exercise.last.bodyweight && (
                  <p>
                    体重参照 {number(exercise.last.bodyweight.value)} kg ·{' '}
                    {exercise.last.bodyweight.basis}（截至{' '}
                    {exercise.last.bodyweight.date}）
                    {exercise.last.age !== null
                      ? ` · 参考年龄约 ${number(exercise.last.age)} 岁`
                      : ''}
                  </p>
                )}
                <a href={exercise.source} target="_blank" rel="noreferrer">
                  查看此动作的标准来源 ↗
                </a>
              </div>
            ))}
            <p>
              入门5级、新手10级、中阶15级、高阶20级，中间线性换算。上肢推、上肢拉、下肢蹲、髋部伸展等权；各项最高20，四类已确认等级的平均数向下取整。弯举、侧平举有单项评级，不额外抬高总等级。
            </p>
            <p>
              每类默认选最早持续记录的适用动作，可在个人资料里固定其他动作或排除一类。缺少、过期、不适用不算0，也不按已有几类凑总分。
            </p>
            <p>
              已完成正式组的1次直接用重量，2～7次用Brzycki估算，8～10次过渡到Epley，11～15次用Epley。无需测试极限重量；未记录力竭程度和动作质量，估算有误差，请保持动作幅度和负重口径一致。
            </p>
            <p>
              按训练当日的年龄、性别和体重匹配联合标准。年龄由填写时年龄及日期推算；旧资料用保存日期作参考。体重取当日及此前6天主晨重均值，缺少时取28天内最近主晨重。仅覆盖18～90岁、男性50～140
              kg和女性40～120 kg，超出范围暂不评级。
            </p>
            <p>
              这是训练人群的高阶参考，不是普通人的生理上限、健康诊断或必须完成的目标。年龄和体重匹配不能代表伤病或全部身体差异；不适用时可关闭对标。当前等级会随近期表现及历史更正重算。
            </p>
            <p>
              来源 Strength Level · 2026-09-21
              固定版本。1～20级、四类综合及两次确认是本产品规则，未经独立验证为综合体能量表。
            </p>
            <a
              href="https://strengthlevel.com/about"
              target="_blank"
              rel="noreferrer"
            >
              了解来源与样本 ↗
            </a>
            {' · '}
            <a
              href="https://strengthlevel.com/faq"
              target="_blank"
              rel="noreferrer"
            >
              了解估算方法 ↗
            </a>
          </details>
        </>
      )}
      <details className="strength-journey" data-annotate="training.levels">
        <summary>查看 20 级力量形象</summary>
        <div className="strength-avatar-gallery">
          {stages.map((stage, index) => (
            <figure
              key={stage}
              className={level !== null && index < level ? 'unlocked' : ''}
            >
              <Image
                src={`/strength-avatar/level-${String(index + 1).padStart(2, '0')}.png`}
                alt={stage}
                width={96}
                height={96}
                sizes="96px"
                loading="lazy"
              />
              <figcaption>
                <strong>Lv. {index + 1}</strong>
                <span>{stage}</span>
                <small>
                  {level === null
                    ? '待评级'
                    : index < level
                      ? '当前已达到'
                      : '后续阶段'}
                </small>
              </figcaption>
            </figure>
          ))}
        </div>
      </details>
    </section>
  );
}
