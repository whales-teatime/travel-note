# 여행을 떠나요♬

네이버 지도 기반 여행 일정 플래너입니다. 장소를 검색해 일정 카드로 추가하고, 지도에서 동선을 확인하며 계획을 저장할 수 있습니다.

## 구성

- Next.js 호환 React 앱 (`vinext`)
- 네이버 지도 JavaScript 지도
- 네이버 클라우드 장소 검색 API 서버 프록시
- Cloudflare D1에 저장되는 여행 계획과 공개 목록
- 계절 테마, 로컬 초안, 5분 주기 자동 저장

## 로컬 실행

```bash
npm ci
npm run dev
```

검색 API를 사용하려면 서버 환경 변수에 다음 값을 설정합니다. 키는 브라우저 코드에 넣지 않습니다.

```text
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
NAVER_API_HUB_CLIENT_ID=
NAVER_API_HUB_CLIENT_SECRET=
```

`NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`는 지도 SDK용이며, 나머지 두 값은 장소 검색 프록시용 서버 키입니다.

## 운영 구조

GitHub는 소스 관리와 변경 이력에 사용하고, 실제 서비스는 서버 런타임과 D1이 필요한 호스팅에서 운영합니다. GitHub Pages만으로 배포하면 `/api/search`, 여행 계획 저장, 비밀번호 보호 같은 서버 기능이 동작하지 않습니다. 커스텀 도메인은 운영 호스팅에 연결하는 방식으로 붙일 수 있습니다.

## 변경 검증

배포 전에는 `npm run build`로 서버와 클라이언트 번들을 함께 검증합니다. 기존 UI 컴포넌트에 남아 있는 oxlint 경고는 별도 정리 대상으로 두었습니다.
