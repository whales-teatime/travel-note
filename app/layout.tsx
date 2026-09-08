import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '여행을 떠나요 — 여행 동선 플래너',
  description: '시간과 장소를 입력해 네이버 지도 위에서 여행 동선을 정리하는 플래너',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: ['/favicon.svg'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><meta name="naver-map-client-id" content={process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? ''} /></head><body>{children}</body></html>;
}
