import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import ts from 'typescript';

await test('Captain plays discrete frames at asset timing and stops for static, hidden or reduced-motion views', async (t) => {
  const win = new Window({ url: 'http://localhost/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? win : win[key],
    });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const events = new win.EventTarget();
  const media = {
    matches: false,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  Object.defineProperty(win, 'matchMedia', { value: () => media });
  let hidden = false;
  Object.defineProperty(win.document, 'visibilityState', {
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  let keyframes: Keyframe[] = [],
    timing: KeyframeAnimationOptions = {};
  let canceled = false,
    paused = false;
  const animation = {
    currentTime: 0,
    pause() {
      paused = true;
    },
    play() {
      paused = false;
    },
    cancel() {
      canceled = true;
    },
  };
  Object.defineProperty(win.HTMLElement.prototype, 'animate', {
    configurable: true,
    value: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
      keyframes = frames;
      timing = options;
      return animation;
    },
  });
  const dataUrl = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const sourceUrl = new URL('../app/captain-avatar.tsx', import.meta.url);
  const source = ts
    .transpileModule(readFileSync(sourceUrl, 'utf8'), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(
      /from (["'])([^"']+)\1/g,
      (_match, _quote, specifier: string) => {
        const target = specifier.endsWith('.json')
          ? dataUrl(
              'export default ' +
                readFileSync(new URL(specifier, sourceUrl), 'utf8'),
            )
          : specifier === 'next/image'
            ? dataUrl(
                `import {createElement} from ${JSON.stringify(import.meta.resolve('react'))}; export default function Image({unoptimized,...props}){return createElement('img',props);}`,
              )
            : import.meta.resolve(specifier);
        return `from ${JSON.stringify(target)}`;
      },
    );
  const { CaptainAvatar } = (await import(
    dataUrl(source)
  )) as typeof import('../app/captain-avatar.tsx');
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  t.after(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
  });
  await act(async () =>
    root.render(
      createElement(CaptainAvatar, { animated: true, activity: 'fitness' }),
    ),
  );
  assert.equal(container.querySelector('img')!.alt, 'Captain 在举哑铃');
  assert.equal(keyframes.length, 7);
  assert.equal(timing.duration, 1500);
  assert.equal(
    timing.easing,
    undefined,
    'effect-wide step easing would freeze all intermediate frames',
  );
  assert.equal(keyframes[1].offset, 320 / 1500);
  assert.equal(keyframes[1].backgroundPositionX, '20%');
  assert(
    keyframes.slice(0, 6).every((frame) => frame.easing === 'steps(1, end)'),
  );
  assert.equal(paused, false);
  hidden = true;
  win.document.dispatchEvent(new win.Event('visibilitychange'));
  assert(paused);
  hidden = false;
  win.document.dispatchEvent(new win.Event('visibilitychange'));
  assert(!paused);
  animation.currentTime = 500;
  media.matches = true;
  events.dispatchEvent(new win.Event('change'));
  assert(paused);
  assert.equal(animation.currentTime, 0);
  await act(async () =>
    root.render(createElement(CaptainAvatar, { animated: false })),
  );
  assert(canceled);
  assert.equal(container.querySelector('.captain-sprite'), null);
  assert.equal(container.querySelector('img')!.alt, 'Captain');
});
