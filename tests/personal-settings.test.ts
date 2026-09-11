import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window, type HTMLInputElement as TestInput } from 'happy-dom';
import { act, createElement } from 'react';
import ts from 'typescript';
import { dishDetailsModule } from './dish-details-module.ts';
import type { CustomDish, Profile } from '../lib/model.ts';

await test('personal settings preserve profile drafts across sections and support full dish lookup, confirmed removal, export and guide reopening', async (t) => {
  const win = new Window({ url: 'http://localhost/' });
  const previousFormData = globalThis.FormData;
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'HTMLInputElement',
    'FormData',
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? win : win[key],
    });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const dataUrl = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const react = `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};`;
  const stubs: Record<string, string> = {
    './meal-form': 'export const MealForm=()=>null;',
    './training-form': 'export const TrainingForm=()=>null;',
    './calendar': 'export const DatePicker=()=>null;',
    '@/components/ui/checkbox': 'export const Checkbox=()=>null;',
    './form-controls': `${react}
      export const Field=({label,children})=>h('label',{className:'field'},h('span',null,label),children);
      export const Choices=({label,value,options,onChange})=>h('div',{className:'choice-list','aria-label':label},options.map(([id,title])=>h('label',{key:id},h('button',{type:'button',role:'radio','aria-checked':value===id,onClick:()=>onChange(id)},title))));
      export const Picker=()=>null;`,
    '@/components/ui/dialog': `${react}
      export const Dialog=({open,children})=>open?h('div',{role:'alertdialog'},children):null;
      export const DialogContent=({children,className})=>h('div',{className},children);
      export const DialogTitle=({children})=>h('h2',{'data-slot':'dialog-title'},children);
      export const DialogDescription=({children})=>h('p',null,children);`,
  };
  const modules: Record<string, string> = {
    './dish-details': dishDetailsModule,
  };
  const compile = (name: string) =>
    dataUrl(
      ts
        .transpileModule(
          readFileSync(new URL('../app/' + name, import.meta.url), 'utf8'),
          {
            compilerOptions: {
              jsx: ts.JsxEmit.ReactJSX,
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          },
        )
        .outputText.replace(/import ['"][^'"]+\.css['"];?/g, '')
        .replace(
          /from (["'])([^"']+)\1/g,
          (_match, _quote, name: string) =>
            `from ${JSON.stringify(modules[name] ?? (stubs[name] ? dataUrl(stubs[name]) : name.startsWith('@/lib/') ? new URL('../lib/' + name.slice(6) + '.ts', import.meta.url).href : import.meta.resolve(name)))}`,
        ),
    );
  modules['./forms'] = compile('forms.tsx');
  modules['./delete-confirm'] = compile('delete-confirm.tsx');
  const { PersonalSettings } = await import(compile('personal-settings.tsx'));
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  container.className = 'dialog-popup personal-settings-dialog';
  win.document.body.append(container);
  const styles = win.document.createElement('style');
  styles.textContent = ['globals.css', 'glass.css', 'personal-settings.css']
    .map((name) =>
      readFileSync(new URL('../app/' + name, import.meta.url), 'utf8'),
    )
    .join('\n');
  win.document.head.append(styles);
  const root = createRoot(container as unknown as HTMLElement);
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.FormData = previousFormData;
    await win.happyDOM.close();
  });
  const dishes: CustomDish[] = Array.from({ length: 26 }, (_, i) => ({
    id: crypto.randomUUID(),
    createdAt: '2026-01-01T00:00:00.000Z',
    recipe: {
      name: i ? `合成面条${i}` : '合成香菇豆腐煲',
      ingredients: [
        { name: '豆腐', grams: 220 },
        { name: '香菇', grams: 80 },
        { name: '食用油', grams: 10 },
      ],
      cookingMethod: '少油煎豆腐，加香菇焖煮。',
      portionGrams: 300,
      basis: 'cooked',
      nutrition: { energy: 125, protein: 9, carbs: 8, fat: 6 },
      assumptions: '合成配方，参考油量10g，成品约300g。',
    },
  }));
  let rejectedRemoval = true,
    rejectedSave = true,
    removalCalls = 0,
    guideCalls = 0;
  let release: () => void = () => {};
  const removalGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saved: Profile | undefined;
  const props = {
    profile: {
      name: '合成用户',
      height: 175,
      age: null,
      sex: 'unspecified',
      note: '',
    } as Profile,
    dishes,
    busy: false,
    dirty: false,
    onDirty: () => {
      props.dirty = true;
      render();
    },
    save: async (path: string, payload: Profile) => {
      assert.equal(path, '/api/profile');
      if (rejectedSave) throw new Error('合成保存失败');
      saved = payload;
      props.dirty = false;
      render();
    },
    onRemoveDish: async (id: string) => {
      assert.equal(id, dishes[0].id);
      removalCalls++;
      if (rejectedRemoval) throw new Error('合成移除失败，请重试。');
      await removalGate;
      props.dishes = props.dishes.filter((dish) => dish.id !== id);
      render();
    },
    onOpenGuide: () => {
      guideCalls++;
    },
  };
  function render() {
    root.render(createElement(PersonalSettings, props));
  }
  const button = (text: string, scope = container) => {
    const b = [...scope.querySelectorAll('button')].find(
      (e) =>
        e.textContent.trim() === text || e.getAttribute('aria-label') === text,
    );
    assert(b, text);
    return b;
  };
  const click = (text: string, scope = container) =>
    act(async () => button(text, scope).click());
  const edit = (input: TestInput, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        win.HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value);
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
  await act(async () => render());
  const profilePanel = container.querySelector('.settings-profile')!;
  const libraryPanel = container.querySelector('.settings-dishes')!;
  assert.equal(profilePanel.hasAttribute('hidden'), false);
  assert.equal(libraryPanel.hasAttribute('hidden'), true);
  const form = container.querySelector('form')!;
  const name = container.querySelector<TestInput>('input[name="name"]')!;
  await edit(name, '合成新称呼');
  assert(props.dirty);
  await click('女性');
  await click('自建菜品');
  assert.equal(profilePanel.hasAttribute('hidden'), true);
  assert.equal(win.getComputedStyle(profilePanel).display, 'none');
  assert.equal(libraryPanel.hasAttribute('hidden'), false);
  assert.equal(container.querySelectorAll('.settings-dish').length, 24);
  await click('查看更多 · 还有 2 道');
  assert.equal(container.querySelectorAll('.settings-dish').length, 26);
  const search = container.querySelector<TestInput>(
    'input[aria-label="搜索自建菜品"]',
  )!;
  await edit(search, '香菇');
  assert.equal(container.querySelectorAll('.settings-dish').length, 1);
  const recipe = container.querySelector('.settings-dish')!;
  assert.equal(
    recipe.querySelector('time')?.getAttribute('datetime'),
    dishes[0].createdAt,
  );
  assert(recipe.textContent.includes('熟重'));
  assert(recipe.textContent.includes(dishes[0].recipe.cookingMethod));
  assert(recipe.textContent.includes('375'));
  assert(recipe.textContent.includes('27'));
  assert(recipe.textContent.includes('食用油'));
  assert(recipe.textContent.includes(dishes[0].recipe.assumptions));
  assert(recipe.textContent.includes('每100g'));
  assert.equal(recipe.querySelectorAll('.dish-ingredients li').length, 3);
  await click('移出菜品库：合成香菇豆腐煲');
  assert.equal(removalCalls, 0);
  assert(
    container
      .querySelector('[role="alertdialog"]')
      ?.textContent.includes('历史饮食'),
  );
  await click('保留菜品');
  assert.equal(container.querySelector('[role="alertdialog"]'), null);
  await click('移出菜品库：合成香菇豆腐煲');
  await click('移出菜品库');
  assert.equal(removalCalls, 1);
  assert(
    container
      .querySelector('[role="alert"]')
      ?.textContent.includes('合成移除失败'),
  );
  rejectedRemoval = false;
  await act(async () => {
    button('移出菜品库').click();
    button('移出菜品库').click();
  });
  assert.equal(removalCalls, 2, 'pending removal cannot start twice');
  assert(button('正在处理…').disabled);
  await act(async () => release());
  assert.equal(container.querySelector('[role="alertdialog"]'), null);
  assert.equal(container.querySelectorAll('.settings-dish').length, 0);
  assert(libraryPanel.textContent.includes('没有找到这道菜'));
  assert(libraryPanel.textContent.includes('历史饮食记录保留'));
  await click('清空菜品搜索');
  assert.equal(container.querySelectorAll('.settings-dish').length, 24);
  await edit(search, '不存在的菜');
  assert(libraryPanel.textContent.includes('没有找到这道菜'));
  await click('个人资料');
  assert.equal(
    container.querySelector('form'),
    form,
    'section navigation keeps the same profile form',
  );
  assert.equal(name.value, '合成新称呼');
  assert.equal(button('女性').getAttribute('aria-checked'), 'true');
  assert.equal(win.getComputedStyle(name).color, '#2e2e33');
  await click('备份与引导');
  assert(button('重新查看使用引导').disabled);
  assert(
    container
      .querySelector('.settings-guide-hint')
      ?.textContent.includes('保存个人资料'),
  );
  const backup = container.querySelector('a[download]')!;
  assert.equal(backup.getAttribute('href'), '/api/export');
  assert.equal(profilePanel.querySelector('a[download]'), null);
  await click('个人资料');
  const submit = () =>
    act(async () =>
      form.dispatchEvent(
        new win.Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
  await submit();
  assert(profilePanel.textContent.includes('合成保存失败'));
  assert.equal(name.value, '合成新称呼');
  rejectedSave = false;
  await submit();
  assert.deepEqual(saved, {
    name: '合成新称呼',
    height: 175,
    age: null,
    sex: 'female',
    note: '',
  });
  assert(!profilePanel.textContent.includes('合成保存失败'));
  await click('备份与引导');
  assert(!button('重新查看使用引导').disabled);
  await click('重新查看使用引导');
  assert.equal(guideCalls, 1);
  props.busy = true;
  await act(async () => render());
  assert(button('重新查看使用引导').disabled);
  assert(button('自建菜品').disabled);
  props.busy = false;
  props.dishes = [];
  await act(async () => render());
  await click('自建菜品');
  await click('清空菜品搜索');
  assert(libraryPanel.textContent.includes('还没有自建菜品'));
});
