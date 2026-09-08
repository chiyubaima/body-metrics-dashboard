import type { AnnotationTarget } from './annotations.ts';
export const annotationUi = '[data-developer-ui]';
const interactive =
  'button,a,input,textarea,select,summary,[role="button"],[role="tab"],[role="checkbox"]';
export function annotationElement(target: EventTarget | null): Element | null {
  if (
    !(target instanceof Element) ||
    target.closest(annotationUi) ||
    target.closest('[data-slot="dialog-overlay"]')
  )
    return null;
  const element =
    target.closest(interactive) ?? target.closest('svg') ?? target;
  if (['HTML', 'BODY'].includes(element.tagName) || element.closest('[hidden]'))
    return null;
  return element;
}
export function elementText(element: Element) {
  if (element.matches('input,textarea,select')) return '';
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
  );
  let text = '',
    node: Node | null;
  while ((node = walker.nextNode()) && text.length < 200) {
    const parent = node.parentElement;
    if (
      parent &&
      !parent.closest(
        `input,textarea,select,script,style,[hidden],[aria-hidden="true"],${annotationUi}`,
      )
    )
      text += ' ' + node.textContent;
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}
export function elementLabel(element: Element) {
  const label =
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    (element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? [...(element.labels ?? [])].map((l) => elementText(l)).join(' ')
      : '') ||
    elementText(element) ||
    element.getAttribute('placeholder') ||
    element.tagName.toLowerCase();
  return label.replace(/\s+/g, ' ').trim().slice(0, 160);
}
export function elementSelector(element: Element) {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node.tagName !== 'HTML') {
    const anchor = node.getAttribute('data-annotate');
    if (anchor) {
      parts.unshift(`[data-annotate="${CSS.escape(anchor)}"]`);
      break;
    }
    const name = node.localName;
    const siblings = node.parentElement
      ? [...node.parentElement.children].filter((n) => n.localName === name)
      : [node];
    parts.unshift(`${name}:nth-of-type(${siblings.indexOf(node) + 1})`);
    node = node.parentElement;
  }
  return parts.join(' > ');
}
export function captureTarget(
  element: Element,
  date: string,
): AnnotationTarget {
  const dialog = element.closest('[data-slot="dialog-content"]'),
    moduleName =
      element.closest('[data-module]')?.getAttribute('data-module') ?? 'global',
    rect = element.getBoundingClientRect(),
    style = getComputedStyle(element);
  return {
    path: location.pathname,
    module: moduleName,
    date:
      element.closest('[data-record-date]')?.getAttribute('data-record-date') ??
      date,
    view:
      dialog
        ?.querySelector('[data-slot="dialog-title"]')
        ?.textContent?.trim()
        .slice(0, 120) || '看板',
    anchor:
      element.closest('[data-annotate]')?.getAttribute('data-annotate') ?? '',
    selector: elementSelector(element),
    tag: element.localName,
    label: elementLabel(element),
    text: elementText(element),
    classes: element.getAttribute('class')?.slice(0, 500) ?? '',
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    viewport: { width: innerWidth, height: innerHeight },
    style: {
      color: style.color,
      background: style.backgroundColor,
      fontSize: style.fontSize,
      padding: style.padding,
    },
  };
}
export function locateTarget(
  target: AnnotationTarget,
  date: string,
): Element | null {
  if (target.path !== location.pathname) return null;
  try {
    const matches = [...document.querySelectorAll(target.selector)].filter(
      (e) => !e.closest(annotationUi) && e.getBoundingClientRect().width > 0,
    );
    if (matches.length !== 1) return null;
    const element = matches[0];
    if (
      (element
        .closest('[data-record-date]')
        ?.getAttribute('data-record-date') ?? date) !== target.date
    )
      return null;
    const dialog = element.closest('[data-slot="dialog-content"]');
    const view =
      dialog
        ?.querySelector('[data-slot="dialog-title"]')
        ?.textContent?.trim() || '看板';
    if (
      view !== target.view ||
      element.localName !== target.tag ||
      elementLabel(element) !== target.label ||
      elementText(element) !== target.text
    )
      return null;
    return element;
  } catch {
    return null;
  }
}

export function listenForAnnotations(options: {
  picking: boolean;
  editorOpen: boolean;
  panelOpen: boolean;
  onPick: (element: Element) => void;
  onHover: (element: Element | null) => void;
  onEscape: () => void;
  onGeometry: () => void;
}) {
  const { picking, editorOpen, panelOpen } = options;
  const isTool = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest(annotationUi);
  const move = (event: PointerEvent) => {
    if (picking && !panelOpen) options.onHover(annotationElement(event.target));
  };
  const block = (event: Event) => {
    if (isTool(event.target) || (!picking && !editorOpen)) return;
    event.stopImmediatePropagation();
    if (!(event instanceof PointerEvent && event.pointerType === 'touch'))
      event.preventDefault();
  };
  const click = (event: MouseEvent) => {
    if (isTool(event.target) || (!picking && !editorOpen)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const element = annotationElement(event.target);
    if (picking && !panelOpen && element) options.onPick(element);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && (picking || panelOpen)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      options.onEscape();
      return;
    }
    if (isTool(event.target)) return;
    if (
      (picking || editorOpen) &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const element = annotationElement(event.target);
      if (picking && !panelOpen && element) options.onPick(element);
    }
  };
  if (picking) document.documentElement.dataset.developerPicking = '';
  else delete document.documentElement.dataset.developerPicking;
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerdown', block, true);
  window.addEventListener('mousedown', block, true);
  window.addEventListener('click', click, true);
  window.addEventListener('dblclick', block, true);
  window.addEventListener('keydown', key, true);
  window.addEventListener('scroll', options.onGeometry, true);
  window.addEventListener('resize', options.onGeometry);
  return () => {
    delete document.documentElement.dataset.developerPicking;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerdown', block, true);
    window.removeEventListener('mousedown', block, true);
    window.removeEventListener('click', click, true);
    window.removeEventListener('dblclick', block, true);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('scroll', options.onGeometry, true);
    window.removeEventListener('resize', options.onGeometry);
  };
}
