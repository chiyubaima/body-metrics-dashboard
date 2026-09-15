'use client';
import { useRef, useState } from 'react';
import {
  ChefHat,
  Download,
  Power,
  Settings2,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import './personal-settings.css';

export type SettingsSection = 'profile' | 'dishes' | 'backup' | 'models';
export function AppSettings({
  disabled,
  local,
  pendingWork,
  onSelect,
  onStopped,
}: {
  disabled: boolean;
  local: boolean;
  pendingWork: boolean;
  onSelect: (section: SettingsSection) => void;
  onStopped: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  async function stop() {
    if (working.current) return;
    working.current = true;
    setStopping(true);
    setError('');
    try {
      const response = await fetch('/__body-journal/update/shutdown', {
        method: 'POST',
        headers: { 'X-Body-Journal-Update': '1' },
        signal: AbortSignal.timeout(8000),
      });
      const result = (await response.json()) as {
        phase?: string;
        message?: string;
      };
      if (!response.ok || result.phase !== 'stopping')
        throw new Error(result.message || '退出未完成，请重试。');
      let unavailable = 0;
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const health = await fetch('/__body-journal/health', {
            cache: 'no-store',
            signal: AbortSignal.timeout(1000),
          });
          if (!health.ok) throw new Error('closed');
          unavailable = 0;
        } catch {
          if (++unavailable >= 2) {
            onStopped();
            if (window.opener) window.close();
            return;
          }
        }
      }
      throw new Error('服务尚未关闭，请重试，或关闭身体日记的启动窗口。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '退出未完成，请重试。');
    } finally {
      working.current = false;
      setStopping(false);
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className="icon-button"
              aria-label="个人设置"
              disabled={disabled}
            />
          }
        >
          <Settings2 size={21} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={10}
          className="app-settings-menu"
          aria-label="个人设置菜单"
        >
          {(
            [
              ['profile', '个人资料', UserRound],
              ['dishes', '自建菜品', ChefHat],
              ['models', '模型设置', SlidersHorizontal],
              ['backup', '备份与引导', Download],
            ] as const
          ).map(([section, label, Icon]) => (
            <DropdownMenuItem key={section} onClick={() => onSelect(section)}>
              <Icon size={17} />
              <span>{label}</span>
            </DropdownMenuItem>
          ))}
          {local && (
            <DropdownMenuItem
              className="app-settings-exit"
              onClick={() => {
                setError('');
                setConfirm(true);
              }}
            >
              <Power size={17} />
              <span>退出身体日记</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!stopping) setConfirm(open);
        }}
      >
        <AlertDialogContent
          className="dialog-popup app-exit-dialog"
          initialFocus={cancel}
        >
          <Power size={25} aria-hidden="true" />
          <AlertDialogTitle>退出身体日记？</AlertDialogTitle>
          <AlertDialogDescription>
            退出会关闭本机后台服务，已保存的记录会保留。下次双击启动即可继续。
            {pendingWork &&
              '当前还有生成任务或未保存内容，退出会中断任务并丢失未保存的输入。'}
          </AlertDialogDescription>
          {error && <p role="alert">{error}</p>}
          <div className="discard-actions">
            <button
              className="secondary"
              ref={cancel}
              disabled={stopping}
              onClick={() => setConfirm(false)}
            >
              继续使用
            </button>
            <button className="primary" disabled={stopping} onClick={stop}>
              {stopping ? '正在退出…' : '退出并关闭服务'}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
