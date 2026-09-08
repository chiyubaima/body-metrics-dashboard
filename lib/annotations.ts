import { InputError, validId, validDate } from './model.ts';
export type AnnotationTarget = {
  path: string;
  module: string;
  date: string;
  view: string;
  anchor: string;
  selector: string;
  tag: string;
  label: string;
  text: string;
  classes: string;
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  style: {
    color: string;
    background: string;
    fontSize: string;
    padding: string;
  };
};
export type Annotation = {
  id: string;
  message: string;
  target: AnnotationTarget;
  status: 'open' | 'resolved';
  createdAt: string;
  updatedAt: string;
};
function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('批注格式有误，请重新选择元素。');
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number, required = false) {
  if (
    typeof value !== 'string' ||
    value.length > limit ||
    (required && !value.trim())
  )
    throw new InputError(
      required
        ? `请填写批注内容（最多 ${limit} 字）或重新选择元素。`
        : '元素信息不完整，请重新选择。',
    );
  return value.trim();
}
function dimension(value: unknown, min = 0) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > 1000000
  )
    throw new InputError('元素位置无效，请重新选择。');
  return Math.round(value);
}
export function validateAnnotation(value: unknown) {
  const v = object(value),
    t = object(v.target),
    rect = object(t.rect),
    viewport = object(t.viewport),
    style = object(t.style);
  const path = text(t.path, 500, true);
  if (!path.startsWith('/') || path.startsWith('//') || /[?#]/.test(path))
    throw new InputError('只能批注当前页面路径。');
  const target: AnnotationTarget = {
    path,
    module: text(t.module, 40, true),
    date: validDate(t.date),
    view: text(t.view, 120, true),
    anchor: text(t.anchor, 160),
    selector: text(t.selector, 2500, true),
    tag: text(t.tag, 40, true),
    label: text(t.label, 160, true),
    text: text(t.text, 200),
    classes: text(t.classes, 500),
    rect: {
      x: dimension(rect.x, -1000000),
      y: dimension(rect.y, -1000000),
      width: dimension(rect.width),
      height: dimension(rect.height),
    },
    viewport: {
      width: dimension(viewport.width),
      height: dimension(viewport.height),
    },
    style: {
      color: text(style.color, 100),
      background: text(style.background, 100),
      fontSize: text(style.fontSize, 50),
      padding: text(style.padding, 100),
    },
  };
  return { id: validId(v.id), message: text(v.message, 2000, true), target };
}
export function annotationStatus(value: unknown) {
  if (value !== 'open' && value !== 'resolved')
    throw new InputError('批注状态无效。');
  return value;
}
