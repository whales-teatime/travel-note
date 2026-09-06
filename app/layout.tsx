import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '동선노트 — 여행 동선 플래너',
  description: '시간과 장소를 입력해 네이버 지도 위에서 여행 동선을 정리하는 플래너',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
