import type { Metadata } from 'next';
import './globals.css';
import './glass.css';

export const metadata: Metadata = {
  title: '身体日记 · 看见每一份积累',
  description: '个人身体变化、饮食与训练记录看板。',
  robots: { index: false, follow: false },
  icons: { icon: { url: '/favicon.png', type: 'image/png', sizes: '64x64' } },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
