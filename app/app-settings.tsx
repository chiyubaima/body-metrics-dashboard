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
  pendingWork,
  onSelect,
  onLock,
}: {
  disabled: boolean;
  pendingWork: boolean;
  onSelect: (section: SettingsSection) => void;
  onLock: () => Promise<void>;
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
      await onLock();
      setConfirm(false);
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
              disabled={stopping}
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
            <DropdownMenuItem
              key={section}
              disabled={disabled}
              onClick={() => onSelect(section)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </DropdownMenuItem>
          ))}
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
            退出后将返回密码页，已保存的记录会保留。再次进入需要输入密码。
            {pendingWork &&
              '当前还有进行中的任务或未保存内容。退出会关闭当前页面，未保存的输入将丢失；已提交的后台任务可能仍会继续。'}
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
              {stopping ? '正在退出…' : '确认退出'}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
