import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  annotationElement,
  captureTarget,
  elementText,
  locateTarget,
  listenForAnnotations,
} from '../lib/annotation-target.ts';
const win = new Window({ url: 'http://localhost:3000/' });
for (const key of [
  'window',
  'document',
  'Element',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'NodeFilter',
  'CSS',
  'location',
  'PointerEvent',
  'KeyboardEvent',
  'MouseEvent',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === 'window' ? win : win[key],
  });
}
Object.defineProperty(globalThis, 'getComputedStyle', {
  configurable: true,
  value: win.getComputedStyle.bind(win),
});
Object.defineProperty(globalThis, 'innerWidth', {
  configurable: true,
  value: 1200,
});
Object.defineProperty(globalThis, 'innerHeight', {
  configurable: true,
  value: 800,
});
function fixture() {
  win.document.body.innerHTML =
    '<section data-annotate="panel.body" data-module="body"><button id="record" aria-label="记录身体"><svg><path></path></svg><span>记录身体</span></button><div data-annotate="body.metric.weight"><strong>98.2</strong><label>备注<input value="private input"/></label><textarea>private textarea</textarea><select><option>private selection</option></select><div data-developer-ui><button id="tool">保存批注</button></div></div></section>';
  const metric = win.document.querySelector(
    '[data-annotate="body.metric.weight"]',
  )!;
  Object.defineProperty(metric, 'getBoundingClientRect', {
    value: () => ({
      x: 30,
      y: 120,
      left: 30,
      top: 120,
      right: 130,
      bottom: 180,
      width: 100,
      height: 60,
    }),
  });
  return {
    metric: metric as unknown as Element,
    button: win.document.querySelector('#record')!,
    tool: win.document.querySelector('#tool')!,
  };
}
await test('annotation capture chooses the control behind an icon and omits form values and review UI', () => {
  const { metric, button } = fixture();
  assert.equal(
    annotationElement(
      win.document.querySelector('path') as unknown as EventTarget,
    ),
    button,
  );
  assert.equal(
    annotationElement(
      win.document.querySelector('#tool') as unknown as EventTarget,
    ),
    null,
  );
  const target = captureTarget(metric, '2026-09-08');
  assert.equal(target.module, 'body');
  assert.equal(target.anchor, 'body.metric.weight');
  assert.equal(target.selector, '[data-annotate="body\\.metric\\.weight"]');
  assert.equal(target.text, '98.2 备注');
  assert(!JSON.stringify(target).includes('private'));
  assert(!JSON.stringify(target).includes('保存批注'));
  assert.equal(
    elementText(win.document.querySelector('input') as unknown as Element),
    '',
  );
  assert.equal(locateTarget(target, '2026-09-08'), metric);
});
await test('saved targets reject changed labels, dates, hidden duplicates and malformed selectors', () => {
  const { metric } = fixture(),
    target = captureTarget(metric, '2026-09-08');
  assert.equal(locateTarget(target, '2026-09-07'), null);
  metric.querySelector('strong')!.textContent = '97.4';
  assert.equal(locateTarget(target, '2026-09-08'), null);
  assert.equal(
    locateTarget({ ...target, selector: '[invalid' }, '2026-09-08'),
    null,
  );
  assert.equal(locateTarget({ ...target, path: '/other' }, '2026-09-08'), null);
});
await test('dialog targets preserve the actual form date and view, even when the dashboard date differs', () => {
  fixture();
  const dialog = win.document.createElement('div');
  dialog.setAttribute('data-slot', 'dialog-content');
  dialog.setAttribute('data-annotate', 'dialog.record.body');
  dialog.setAttribute('data-module', 'body');
  dialog.innerHTML =
    '<h2 data-slot="dialog-title">编辑身体数据</h2><form data-record-date="2026-09-01"><button>保存身体</button></form>';
  win.document.body.appendChild(dialog);
  const button = dialog.querySelector('button')!;
  Object.defineProperty(button, 'getBoundingClientRect', {
    value: () => ({
      x: 30,
      y: 120,
      left: 30,
      top: 120,
      right: 130,
      bottom: 180,
      width: 100,
      height: 60,
    }),
  });
  const target = captureTarget(button as unknown as Element, '2026-09-08');
  assert.equal(target.date, '2026-09-01');
  assert.equal(target.view, '编辑身体数据');
  assert.equal(locateTarget(target, '2026-09-08'), button);
  dialog.remove();
  assert.equal(locateTarget(target, '2026-09-08'), null);
});
await test('selection prevents business clicks while annotation controls and scrolling remain usable; cleanup restores clicks', () => {
  const { button, tool } = fixture();
  let business = 0,
    toolClicks = 0,
    selected: Element | null = null,
    scrolled = 0;
  button.addEventListener('click', () => business++);
  tool.addEventListener('click', () => toolClicks++);
  const cleanup = listenForAnnotations({
    picking: true,
    editorOpen: false,
    panelOpen: false,
    onPick: (e) => {
      selected = e;
    },
    onHover: () => {},
    onEscape: () => {},
    onGeometry: () => scrolled++,
  });
  const click = new win.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  });
  button.dispatchEvent(click);
  assert.equal(business, 0);
  assert.equal(click.defaultPrevented, true);
  assert.equal(selected, button);
  tool.dispatchEvent(
    new win.MouseEvent('click', { bubbles: true, cancelable: true }),
  );
  assert.equal(toolClicks, 1);
  const touch = new win.PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerType: 'touch',
  });
  button.dispatchEvent(touch);
  assert.equal(touch.defaultPrevented, false);
  win.document.dispatchEvent(new win.Event('scroll', { bubbles: true }));
  assert.equal(scrolled, 1);
  cleanup();
  assert.equal(
    win.document.documentElement.hasAttribute('data-developer-picking'),
    false,
  );
  button.dispatchEvent(
    new win.MouseEvent('click', { bubbles: true, cancelable: true }),
  );
  assert.equal(business, 1);
});
await test('operating mode preserves ordinary Escape and clicks, while an open annotation editor blocks background actions', () => {
  const { button, tool } = fixture();
  let clicks = 0,
    escape = 0,
    reviewEscape = 0;
  button.addEventListener('click', () => clicks++);
  button.addEventListener('keydown', (e) => {
    if ((e as unknown as KeyboardEvent).key === 'Escape') escape++;
  });
  const options = {
    picking: false,
    editorOpen: false,
    panelOpen: false,
    onPick: () => {},
    onHover: () => {},
    onEscape: () => reviewEscape++,
    onGeometry: () => {},
  };
  let cleanup = listenForAnnotations(options);
  button.dispatchEvent(
    new win.MouseEvent('click', { bubbles: true, cancelable: true }),
  );
  button.dispatchEvent(
    new win.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(clicks, 1);
  assert.equal(escape, 1);
  assert.equal(reviewEscape, 0);
  cleanup();
  cleanup = listenForAnnotations({
    ...options,
    editorOpen: true,
    panelOpen: true,
  });
  button.dispatchEvent(
    new win.MouseEvent('click', { bubbles: true, cancelable: true }),
  );
  assert.equal(clicks, 1);
  tool.dispatchEvent(
    new win.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(reviewEscape, 1);
  cleanup();
});
