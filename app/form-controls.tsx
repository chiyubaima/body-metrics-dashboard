'use client';
import type { ReactNode } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={'field' + (wide ? ' full' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Choices({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(String(v))}
      className="choice-list"
    >
      {options.map(([key, title]) => (
        <label key={key}>
          <RadioGroupItem value={key} />
          {title}
        </label>
      ))}
    </RadioGroup>
  );
}
export function Picker({
  label,
  value,
  options,
  onChange,
  popupClassName,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  popupClassName?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v);
      }}
    >
      <SelectTrigger aria-label={label} className="w-full min-h-11">
        <SelectValue>{options.find((o) => o[0] === value)?.[1]}</SelectValue>
      </SelectTrigger>
      <SelectContent className={popupClassName}>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
