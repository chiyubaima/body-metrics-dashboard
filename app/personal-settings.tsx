'use client';
import { useRef, useState } from 'react';
import {
  BookOpen,
  ChefHat,
  Download,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import type { CustomDish, Profile } from '@/lib/model';
import { basisLabels } from '@/lib/progress';
import { ProfileForm, type Save } from './forms';
import { DishDetails } from './dish-details';
import { DeleteConfirm } from './delete-confirm';
import './personal-settings.css';

export function PersonalSettings({
  profile,
  dishes,
  save,
  busy,
  dirty,
  onDirty,
  onRemoveDish,
  onOpenGuide,
}: {
  profile: Profile | null;
  dishes: CustomDish[];
  save: Save;
  busy: boolean;
  dirty: boolean;
  onDirty: () => void;
  onRemoveDish: (id: string) => Promise<void>;
  onOpenGuide: () => void;
}) {
  const [section, setSection] = useState('profile');
  return (
    <div className="personal-settings">
      <nav className="settings-nav" aria-label="个人设置栏目">
        {(
          [
            ['profile', '个人资料', UserRound],
            ['dishes', '自建菜品', ChefHat],
            ['backup', '备份与引导', Download],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            type="button"
            key={id}
            aria-pressed={section === id}
            disabled={busy}
            onClick={() => setSection(id)}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <section
        className="settings-panel settings-profile"
        hidden={section !== 'profile'}
        aria-label="个人资料"
      >
        <p className="settings-intro">
          资料可以选填，称呼用于问候，身高用于计算 BMI。
        </p>
        <ProfileForm
          profile={profile}
          save={save}
          busy={busy}
          onDirty={onDirty}
        />
      </section>
      <section
        className="settings-panel settings-dishes"
        hidden={section !== 'dishes'}
        aria-label="自建菜品库"
        data-annotate="settings.dishes"
      >
        <DishLibrary dishes={dishes} busy={busy} onRemove={onRemoveDish} />
      </section>
      <section
        className="settings-panel settings-backup"
        hidden={section !== 'backup'}
        aria-label="备份与引导"
      >
        <article className="settings-backup-card">
          <span className="settings-card-icon">
            <Download size={23} aria-hidden="true" />
          </span>
          <h3>把记录带走</h3>
          <p>
            导出日记、个人资料、历史计划、自建菜品，以及 Captain
            的对话、记忆和约定。
          </p>
          <a className="primary settings-export" href="/api/export" download>
            <Download size={16} aria-hidden="true" />
            导出全部记录与计划
          </a>
          <small>备份包含个人信息，请保存在你信任的位置。</small>
        </article>
        <article className="settings-guide-card">
          <BookOpen size={20} aria-hidden="true" />
          <div>
            <h3>使用引导</h3>
            <p>重新了解记录、目标设置和 Captain。</p>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={busy || dirty}
            onClick={onOpenGuide}
          >
            重新查看使用引导
          </button>
          {dirty && (
            <output className="settings-guide-hint">
              保存个人资料后可以重新打开引导。
            </output>
          )}
        </article>
      </section>
    </div>
  );
}

function DishLibrary({
  dishes,
  busy,
  onRemove,
}: {
  dishes: CustomDish[];
  busy: boolean;
  onRemove: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState(''),
    [limit, setLimit] = useState(24),
    [selected, setSelected] = useState<CustomDish | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const working = useRef(false),
    normalized = query.trim().normalize('NFKC').toLowerCase(),
    matching = dishes.filter((dish) =>
      dish.recipe.name.normalize('NFKC').toLowerCase().includes(normalized),
    );
  return (
    <>
      <div className="settings-library-controls">
        <div className="settings-library-heading">
          <h3>我的配方</h3>
          <span>{dishes.length} 道已确认菜品</span>
        </div>
        <div className="settings-dish-search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="搜索自建菜品"
            placeholder="搜索菜名"
            value={query}
            maxLength={80}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="清空菜品搜索"
              onClick={() => {
                setQuery('');
                setLimit(24);
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <p className="settings-intro">
          这里保留你确认过的配方，Captain 记录时会优先查找。
        </p>
        {notice && (
          <output className="settings-library-notice">
            {notice}
          </output>
        )}
      </div>
      <div className="settings-library-list" aria-label="自建菜品列表">
        {matching.slice(0, limit).map((dish) => (
          <article className="settings-dish" key={dish.id}>
            <header>
              <div>
                <h4>{dish.recipe.name}</h4>
                <p>
                  {basisLabels[dish.recipe.basis]} · 保存于{' '}
                  <time dateTime={dish.createdAt}>
                    {new Date(dish.createdAt).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </p>
              </div>
              <button
                type="button"
                className="settings-dish-remove"
                aria-label={`移出菜品库：${dish.recipe.name}`}
                disabled={busy || saving}
                onClick={() => {
                  setSelected(dish);
                  setError('');
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                <span>移出</span>
              </button>
            </header>
            <DishDetails
              recipe={dish.recipe}
              grams={dish.recipe.portionGrams}
              estimatedPortion
            />
          </article>
        ))}
        {!matching.length && (
          <div className="settings-library-empty">
            <ChefHat size={30} aria-hidden="true" />
            <h4>{query ? '没有找到这道菜' : '还没有自建菜品'}</h4>
            <p>
              {query
                ? '换个菜名试试，或清空搜索查看全部。'
                : '告诉 Captain 你吃了什么，确认新配方后会保存在这里。'}
            </p>
          </div>
        )}
        {matching.length > limit && (
          <button
            type="button"
            className="secondary settings-show-more"
            onClick={() => setLimit((value) => value + 24)}
          >
            查看更多 · 还有 {matching.length - limit} 道
          </button>
        )}
      </div>
      <DeleteConfirm
        className="personal-settings-confirm"
        count={selected ? 1 : 0}
        label="自建菜品"
        title={`将「${selected?.recipe.name ?? ''}」移出自建菜品库？`}
        description="以后搜索时不再使用这道配方。历史饮食的配方、份量与营养都会保留。"
        confirmLabel="移出菜品库"
        cancelLabel="保留菜品"
        busy={busy || saving}
        error={error}
        cancel={() => setSelected(null)}
        confirm={async () => {
          if (!selected || working.current || busy) return;
          working.current = true;
          setSaving(true);
          setError('');
          try {
            await onRemove(selected.id);
            setSelected(null);
            setNotice('已移出自建菜品库，历史饮食记录保留。');
          } catch (e) {
            setError(e instanceof Error ? e.message : '移除失败，请重试。');
          } finally {
            working.current = false;
            setSaving(false);
          }
        }}
      />
    </>
  );
}
