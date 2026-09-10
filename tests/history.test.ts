import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window, type HTMLInputElement as TestInput } from 'happy-dom';
import { act, createElement } from 'react';
import ts from 'typescript';
import { average } from '../lib/model.ts';
import type { Body, Entry, Kind } from '../lib/model.ts';

await test('diary date ranges, combined filters and deletion remain scoped to visible records', async (t) => {
  const win = new Window({ url: 'http://localhost/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'HTMLInputElement',
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? win : win[key],
    });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const react = `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};`;
  const dataUrl = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const stubs: Record<string, string> = {
    './panels': `${react}
      export const numeric=(value,digits=1)=>value==null?'—':value.toFixed(digits);
      export function Segmented({label,value,items,onChange}){return h('div',{'aria-label':label},items.map(([id,text])=>h('button',{key:id,'aria-pressed':value===id,onClick:()=>onChange(id)},text)))}`,
    './nutrition': 'export function MacroLine(){return null}',
    './delete-confirm': `${react}
      export function DeleteConfirm({count,cancel,confirm,error}){return count?h('div',{role:'alertdialog'},h('span',null,count+' 条待删除'),error,h('button',{onClick:cancel},'取消删除'),h('button',{onClick:confirm},'确认删除')):null}`,
  };
  const source = ts
    .transpileModule(
      readFileSync(new URL('../app/history.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    )
    .outputText.replace(
      /from (["'])([^"']+)\1/g,
      (_match, _quote, name: string) =>
        `from ${JSON.stringify(stubs[name] ? dataUrl(stubs[name]) : name.startsWith('@/lib/') ? new URL('../lib/' + name.slice(6) + '.ts', import.meta.url).href : import.meta.resolve(name))}`,
    );
  const { HistoryView } = await import(dataUrl(source));
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  t.after(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
  });
  const dates = [
    '2025-02-02',
    '2025-02-01',
    '2025-01-31',
    '2025-01-30',
    '2025-01-01',
    '2024-12-31',
    '2024-02-29',
    '2024-02-28',
  ];
  const kinds: Kind[] = ['body', 'diet', 'training'];
  const records: Entry[] = kinds.flatMap((kind) =>
    dates.map((date, i) => ({
      id: `${kind}-${date}`,
      kind,
      date,
      primaryMorning: 1,
      planId: null,
      createdAt: date,
      updatedAt: date,
      data:
        kind === 'body'
          ? {
              weight: 70 + i,
              waist: null,
              bodyFat: null,
              condition: 'morning',
              estimated: false,
              primary: true,
              note: '',
            }
          : kind === 'diet'
            ? { status: 'logged', foods: [], note: '' }
            : {
                type: 'rest',
                status: 'rest',
                minutes: null,
                content: '',
                details: '',
                exercises: [],
              },
    })),
  );
  records.push({
    ...records.find((r) => r.id === 'body-2025-01-31')!,
    id: 'body-other',
    primaryMorning: 0,
    data: { ...(records[0].data as Body), condition: 'other', weight: 95 },
  });
  records.sort((a, b) => b.date.localeCompare(a.date));
  let key = 0;
  let deleted: Entry[] = [];
  let rejectDelete = false;
  async function render(kind: Kind, initialDate?: string) {
    deleted = [];
    await act(async () =>
      root.render(
        createElement(HistoryView, {
          key: ++key,
          kind,
          records,
          plans: [],
          date: '2025-01-31',
          initialDate,
          edit: () => {},
          busy: false,
          remove: async (rows: Entry[]) => {
            if (rejectDelete) throw new Error('合成测试删除失败');
            deleted = rows;
          },
        }),
      ),
    );
  }
  const button = (text: string) => {
    const found = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === text,
    );
    assert(found, text);
    return found;
  };
  const click = async (text: string) => act(async () => button(text).click());
  const results = () => container.querySelector('.history-results')!;
  const visible = () =>
    [...results().querySelectorAll('input[type="checkbox"]')].map((input) =>
      input.getAttribute('aria-label')!.slice(2, 12),
    );
  async function fill(label: string, value: string) {
    const field = [...container.querySelectorAll('label.field')].find(
      (el) => el.textContent === label,
    )!;
    const input = field.querySelector('input')!;
    assert.equal(field.getAttribute('for'), input.id);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        win.HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value);
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
  }
  const setRange = async (start: string, end: string) => {
    await fill('开始日期', start);
    await fill('结束日期', end);
  };
  const selectAll = async () =>
    act(async () =>
      container
        .querySelector('.selection-toolbar')!
        .querySelector('input')!
        .click(),
    );

  await t.test(
    'Captain navigation opens the exact requested day in every diary',
    async () => {
      for (const kind of kinds) {
        await render(kind, '2024-12-31');
        assert.deepEqual([...new Set(visible())], ['2024-12-31']);
        assert.equal(
          container.querySelector<TestInput>('input[type="date"]')?.value,
          '2024-12-31',
        );
      }
    },
  );
  for (const kind of kinds)
    await t.test(
      `${kind}: inclusive, single-day, cross-year and leap-day ranges`,
      async () => {
        await render(kind);
        assert(
          !visible().includes('2025-02-01'),
          'presets use the selected dashboard date',
        );
        await click('自选区间');
        await setRange('2024-12-31', '2025-02-01');
        assert.deepEqual(
          [...new Set(visible())],
          [
            '2025-02-01',
            '2025-01-31',
            '2025-01-30',
            '2025-01-01',
            '2024-12-31',
          ],
        );
        const controls = container.querySelector('.history-controls')!;
        assert(
          controls.contains(container.querySelector('.history-date-range')!),
        );
        assert(
          controls.contains(container.querySelector('.selection-toolbar')!),
        );
        assert(!results().contains(controls));
        await setRange('2025-01-31', '2025-01-31');
        assert.deepEqual(
          visible(),
          Array(kind === 'body' ? 2 : 1).fill('2025-01-31'),
        );
        await setRange('2024-02-28', '2024-02-29');
        assert.deepEqual(visible(), ['2024-02-29', '2024-02-28']);
        await click('30 天');
        assert.deepEqual([...new Set(visible())], ['2025-01-31', '2025-01-30']);
        await click('全部');
        assert.deepEqual([...new Set(visible())], dates.slice(2));
      },
    );

  await t.test(
    'invalid and empty ranges explain the problem and disable deletion',
    async () => {
      await render('diet');
      await click('自选区间');
      await setRange('2025-02-01', '2025-01-31');
      assert.match(
        container.querySelector('[role="alert"]')!.textContent,
        /开始日期不能晚于结束日期/,
      );
      assert.equal(
        container
          .querySelector('input[type="date"]')!
          .getAttribute('aria-invalid'),
        'true',
      );
      assert.deepEqual(visible(), []);
      assert(button('删除所选').disabled);
      await fill('开始日期', '');
      assert.match(
        container.querySelector('[role="alert"]')!.textContent,
        /请选择开始日期和结束日期/,
      );
      await setRange('2099-01-01', '2099-01-02');
      assert.match(
        container.querySelector('[role="alert"]')!.textContent,
        /至今天之间/,
      );
      await setRange('1999-12-31', '2025-01-31');
      assert.match(
        container.querySelector('[role="alert"]')!.textContent,
        /2000年/,
      );
      await setRange('2024-03-01', '2024-03-02');
      assert(!container.querySelector('[role="alert"]'));
      assert.deepEqual(visible(), []);
      assert(container.querySelector('.empty-note'));
      await click('90 天');
      assert(visible().length > 0);
      assert(!container.querySelector('[role="alert"]'));
    },
  );

  await t.test(
    'body conditions reset selection and scroll; filtered deletion preserves other records and averages',
    async () => {
      await render('body');
      await click('自选区间');
      await setRange('2025-01-31', '2025-01-31');
      const cells = results().querySelector('tbody tr')!.querySelectorAll('td');
      assert.equal(
        cells[3].textContent,
        average(records, '2025-01-31').value!.toFixed(1),
      );
      await selectAll();
      assert.match(
        container.querySelector('.selection-toolbar')!.textContent,
        /已选 2 条/,
      );
      results().scrollTop = 200;
      await click('晨起');
      assert.equal(results().scrollTop, 0);
      assert.match(
        container.querySelector('.selection-toolbar')!.textContent,
        /已选 0 条/,
      );
      assert.deepEqual(visible(), ['2025-01-31']);
      await selectAll();
      results().scrollTop = 200;
      await fill('开始日期', '2025-01-30');
      assert.equal(results().scrollTop, 0);
      assert(button('删除所选').disabled);
      await selectAll();
      await click('删除所选');
      assert.match(
        container.querySelector('[role="alertdialog"]')!.textContent,
        /2 条待删除/,
      );
      assert.equal(deleted.length, 0);
      await click('取消删除');
      assert.equal(deleted.length, 0);
      await click('删除所选');
      rejectDelete = true;
      await click('确认删除');
      assert.match(
        container.querySelector('[role="alertdialog"]')!.textContent,
        /合成测试删除失败/,
      );
      rejectDelete = false;
      await click('确认删除');
      assert.deepEqual(
        deleted.map((r) => r.id),
        ['body-2025-01-31', 'body-2025-01-30'],
      );
      assert(!container.querySelector('[role="alertdialog"]'));
      assert(button('删除所选').disabled);
    },
  );
});
