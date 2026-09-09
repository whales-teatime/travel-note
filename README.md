# 여행을 떠나요♬

국내는 네이버 지도, 해외는 Google 지도를 사용하는 여행 일정 플래너입니다. 장소를 검색해 일정 카드로 추가하고, 지도에서 동선을 확인하며 계획을 저장할 수 있습니다.

## 구성

- Next.js 호환 React 앱 (`vinext`)
- 네이버 지도 JavaScript 지도
- 네이버 클라우드 장소 검색 API 서버 프록시
- 결제 없이 쓸 수 있는 MapLibre·OpenFreeMap 해외 여행 모드 (한국어·영어 라벨)
- 선택적으로 Google Maps JavaScript API와 Places API (New)를 연결할 수 있는 확장 경로
- Cloudflare D1에 저장되는 여행 계획과 공개 목록
- 계절 테마, 로컬 초안, 5분 주기 자동 저장

## 로컬 실행

```bash
npm ci
npm run dev
```

지도와 검색 API를 사용하려면 다음 환경 변수를 설정합니다.

```text
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
NAVER_API_HUB_CLIENT_ID=
NAVER_API_HUB_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

`NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`는 국내 지도 SDK용이며, NAVER API Hub 키 두 개는 장소 검색 프록시에서만 사용합니다. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`는 선택 사항입니다. 키가 없어도 해외 모드는 무료 OpenFreeMap으로 동작하고, Google 모드를 다시 사용할 때만 필요합니다. 자세한 내용은 [v2 무료 지도 구조](docs/V2_FREE_MAP.md)를 참고합니다.

## 운영 구조

GitHub는 소스 관리와 변경 이력에 사용하고, 실제 서비스는 서버 런타임과 D1이 필요한 호스팅에서 운영합니다. GitHub Pages만으로 배포하면 `/api/search`, 여행 계획 저장, 비밀번호 보호 같은 서버 기능이 동작하지 않습니다. 커스텀 도메인은 운영 호스팅에 연결하는 방식으로 붙일 수 있습니다.

## 변경 검증

배포 전에는 `npm run lint`, `npm run build`, `npm run check:cloudflare`로 코드와 서버·클라이언트 번들, Cloudflare 배포 패키지를 확인합니다.

## 독립 호스팅

소유자 Cloudflare 계정으로 운영할 빌드는 `npm run check:cloudflare`로 배포 전 검증할 수 있습니다. 계정 연결, 새 주소, DB와 편집 권한 이전, 비용 및 남은 운영 점검은 [독립 운영 안내](docs/HOSTING.md)에 정리했습니다.
