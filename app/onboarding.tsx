'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  MessageCircle,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { activePlan, today } from '@/lib/model';
import type { Snapshot } from '@/lib/model';
import './onboarding.css';

const preferenceKey = 'body-journal-onboarding-v1';
export type OnboardingTarget = 'profile' | 'diet' | 'training' | 'coach';
export function Onboarding({
  ready,
  snapshot,
  blocked,
  openRequest,
  configure,
}: {
  ready: boolean;
  snapshot: Snapshot;
  blocked: boolean;
  openRequest: number;
  configure: (target: OnboardingTarget) => void;
}) {
  const [visible, setVisible] = useState(false);
  const checked = useRef(false),
    lastRequest = useRef(0);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (openRequest !== lastRequest.current) {
        lastRequest.current = openRequest;
        checked.current = true;
        setVisible(true);
      } else if (!checked.current) {
        checked.current = true;
        let dismissed = false;
        try {
          dismissed = localStorage.getItem(preferenceKey) === 'done';
        } catch {}
        setVisible(
          !dismissed &&
            !snapshot.profile &&
            !snapshot.records.length &&
            !snapshot.plans.length,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, snapshot, openRequest]);
  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(preferenceKey, 'done');
    } catch {}
  }
  const diet = activePlan(snapshot.plans, 'diet', today());
  const training = activePlan(snapshot.plans, 'training', today());
  return (
    <Dialog
      open={visible && ready && !blocked}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent
        className="dialog-popup onboarding-dialog"
        showCloseButton={false}
        finalFocus={blocked ? false : undefined}
      >
        <div className="onboarding-heading">
          <span className="onboarding-eyebrow">从今天的一笔开始</span>
          <DialogTitle>欢迎来到身体日记</DialogTitle>
          <button
            className="icon-button"
            aria-label="跳过使用引导"
            onClick={dismiss}
          >
            <X size={20} />
          </button>
        </div>
        <DialogDescription>
          先做几项简单设置，也可以直接开始记录。
        </DialogDescription>
        <ol className="onboarding-steps">
          <li className="onboarding-profile">
            <span className="onboarding-icon">
              <UserRound size={23} />
            </span>
            <div className="onboarding-step-content">
              <h3>
                你的资料{' '}
                {snapshot.profile && (
                  <span className="onboarding-status">
                    <Check size={13} />
                    已保存
                  </span>
                )}
              </h3>
              <p>
                {snapshot.profile
                  ? `${snapshot.profile.name || '个人资料'}${snapshot.profile.height ? ` · 身高 ${snapshot.profile.height} cm` : ''}`
                  : '称呼用于问候，身高用于计算 BMI。其他资料可以选填。'}
              </p>
              <button
                className="secondary"
                onClick={() => configure('profile')}
              >
                {snapshot.profile ? '修改资料' : '填写资料'}
                <ArrowRight size={15} />
              </button>
            </div>
          </li>
          <li className="onboarding-goals">
            <span className="onboarding-icon">
              <Target size={23} />
            </span>
            <div className="onboarding-step-content">
              <h3>你的目标</h3>
              <p>按自己的计划填写。还没有目标，也能正常记饮食和训练。</p>
              <div className="onboarding-actions">
                <button className="secondary" onClick={() => configure('diet')}>
                  {diet && <Check size={14} />}
                  {diet ? '调整饮食目标' : '设置饮食目标'}
                </button>
                <button
                  className="secondary"
                  onClick={() => configure('training')}
                >
                  {training && <Check size={14} />}
                  {training ? '调整训练计划' : '设置训练计划'}
                </button>
              </div>
            </div>
          </li>
          <li className="onboarding-captain">
            <span className="onboarding-icon">
              <MessageCircle size={23} />
            </span>
            <div className="onboarding-step-content">
              <h3>
                认识 Captain <span className="onboarding-optional">可选</span>
              </h3>
              <p>结合你的记录聊聊近况。连接模型并由你启用后，才会开始陪伴。</p>
              <button
                className="secondary"
                onClick={() => {
                  dismiss();
                  configure('coach');
                }}
              >
                设置 Captain
                <ArrowRight size={15} />
              </button>
            </div>
          </li>
        </ol>
        <div className="onboarding-footer">
          <span>以后可以在“个人资料与备份”里重新打开引导。</span>
          <button className="primary" onClick={dismiss}>
            开始记录
            <ArrowRight size={17} />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
