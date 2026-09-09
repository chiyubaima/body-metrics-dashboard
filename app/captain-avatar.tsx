'use client';
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import captain from '../public/captain/manifest.json';

export type CaptainActivity = keyof typeof captain.animations;
const descriptions: Record<CaptainActivity, string> = {
  idle: 'Captain 在这里陪你',
  greeting: 'Captain 挥手打招呼',
  thinking: 'Captain 正在想怎么回复',
  fitness: 'Captain 在举哑铃',
  eating: 'Captain 在好好吃饭',
  rest: 'Captain 正在休息',
};

export function CaptainAvatar({
  activity = 'idle',
  animated = false,
  className = '',
}: {
  activity?: CaptainActivity;
  animated?: boolean;
  className?: string;
}) {
  const sprite = useRef<HTMLSpanElement>(null);
  const sequence = captain.animations[activity];
  useEffect(() => {
    const element = sprite.current;
    if (!animated || !element?.animate) return;
    const duration = sequence.durations.reduce(
      (total, value) => total + value,
      0,
    );
    let elapsed = 0;
    const frames = sequence.durations.map((time, index) => {
      const frame = {
        backgroundPositionX: `${(index / (sequence.frames - 1)) * 100}%`,
        offset: elapsed / duration,
        easing: 'steps(1, end)',
      };
      elapsed += time;
      return frame;
    });
    const animation = element.animate(
      [...frames, { backgroundPositionX: '100%', offset: 1 }],
      {
        duration,
        iterations: Infinity,
      },
    );
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      if (reduced.matches || document.visibilityState === 'hidden')
        animation.pause();
      else animation.play();
      if (reduced.matches) animation.currentTime = 0;
    };
    update();
    reduced.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      animation.cancel();
      reduced.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [animated, sequence]);
  return (
    <span
      className={`captain-avatar ${animated ? 'is-animated' : ''} ${className}`}
      style={{ '--captain-frames': sequence.frames } as CSSProperties}
    >
      <Image
        className="captain-poster"
        src={captain.avatar}
        alt={animated ? descriptions[activity] : 'Captain'}
        width={256}
        height={256}
        draggable={false}
        unoptimized
      />
      {animated && (
        <span
          ref={sprite}
          className="captain-sprite"
          aria-hidden="true"
          style={{ backgroundImage: `url(${sequence.src})` }}
        />
      )}
    </span>
  );
}
