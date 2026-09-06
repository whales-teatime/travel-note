# 독립 운영

소스는 `whales-teatime/travel-note`에서 관리한다. 현재 서비스는 Sites에 있고, 독립 배포 대상은 소유자의 Cloudflare Workers + D1이다. 소스 업로드만으로 운영 서버나 저장 데이터가 옮겨지지는 않는다.

## 주소와 비용

- 공개 주소: `https://travel.whales-teatime.workers.dev/`. Cloudflare 계정 subdomain을 `whales-teatime`으로 설정했고, Worker 이름 `travel`이 앞에 붙는다.
- 이후 소유한 도메인을 같은 Worker에 연결할 수 있다. 도메인 구입 및 갱신은 별도 비용이다.
- Workers Free와 D1 무료 범위부터 검증한다. Workers 무료 한도는 일 100,000 요청 및 요청당 CPU 10ms이므로 실제 페이지 렌더링의 CPU 사용도 점검해야 한다. 운영 원칙은 무료 플랜 유지, 결제수단 미등록, 자동 유료 전환 금지다. 무료 한도를 넘으면 서비스 요청이 실패할 수 있지만 유료 플랜으로 자동 전환하지 않는다.
- Workers Paid는 월 최소 $5에 초과 사용료가 더해질 수 있다. 유료 전환 전 소유자 승인을 받는다. 네이버 지도와 검색 API 요금은 별도다.
- Vercel Hobby는 비상업적 개인 용도 제한이 있으므로 향후 수익화까지 고려한 기본 운영 대상으로 선택하지 않았다. 후원/광고를 실제 도입할 때 API 및 결제 제공자 약관도 다시 확인한다.

공식 문서: [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/), [D1 요금](https://developers.cloudflare.com/d1/platform/pricing/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Vercel Hobby](https://vercel.com/docs/plans/hobby).

## 계정 연결 전 확인

```sh
npm ci
npm run check:cloudflare
```

독립용 빌드와 배포 파일 검증만 실행한다. 서버, 데이터베이스, 유료 구독을 만들지 않는다. 이 빌드는 Sites 미들웨어를 포함하지 않는다. 기존 Sites 배포에는 기존 `npm run build`를 사용한다.

## 최초 연결

1. 소유자가 Cloudflare 무료 계정을 준비하고 `npx wrangler login`의 브라우저 승인 화면에서 로그인한다. 비밀번호나 API 토큰을 채팅에 붙여넣을 필요는 없다.
2. `npx wrangler whoami`로 소유자 계정을 확인하고 `npx wrangler d1 create travel-note`로 저장소를 만든다. 같은 이름이 이미 있으면 소유자가 지정한 기존 저장소인지 확인한다.
3. 프로젝트 루트의 무시되는 `.cloudflare.local.json`에 반환된 식별자를 넣는다.

   ```json
   { "accountId": "Cloudflare 계정 ID", "databaseId": "생성된 D1 ID" }
   ```

   자동화 환경에서는 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID` 환경 변수를 사용한다.
4. 새 Worker에 `.env.example`에 나온 세 네이버 값을 Secret으로 등록한다. 검색 비밀키는 저장소나 브라우저 번들에 넣지 않는다.
5. `npm run deploy:cloudflare`로 빌드, D1 스키마 적용, Worker 배포를 실행한다. 이 명령은 유료 요금제로 전환하지 않는다.
6. 실제 발급된 새 HTTPS 주소를 네이버 지도 Application의 허용 Web 서비스 URL에 추가한다. 지도와 검색, 계획 저장/불러오기를 새 주소에서 확인한다.

## 데이터와 편집 권한 이전

기존 D1의 계획은 새 계정으로 자동 이동하지 않는다. 기존 서비스 관리자 권한으로 백업/내보내기를 확보하고, 계획 ID와 비밀번호·편집 토큰의 해시를 보존해서 가져와야 한다. 공개 목록 API는 전체 백업 수단이 아니다. 내보낸 데이터는 `backups/` 등 Git에서 제외된 경로에 둔다.

편집 토큰과 초안은 브라우저의 기존 도메인 저장소에도 남아 있다. 새 도메인에서는 직접 접근할 수 없으므로, 기존 사이트에서 소유자가 내보내고 새 사이트에서 가져오는 절차가 필요하다. 데이터와 소유권 이전을 확인하기 전에는 기존 주소를 종료하지 않는다.

## 공개 운영 전 남은 점검

- 비밀번호 보호: 현재 salt + SHA-256 구현을 전용 비밀번호 해싱으로 보완하고, 열람 권한과 수정 권한을 명확히 분리할 것. 현재 코드는 비밀번호를 알면 수정도 가능하다.
- 검색·계획 생성·비밀번호 시도 횟수 제한과 네이버 API 사용량 알림을 적용할 것.
- DB 복구 절차, 정기 백업, 브라우저 변경 시 편집 권한 복구를 검증할 것.
- `npm run lint`의 기존 타입 및 접근성 오류를 정리할 것. 빌드 성공은 이 검사 통과를 뜻하지 않는다.
- 사용자가 제공한 계절 배경 사진의 공개 배포/상업적 사용 권한과 필요한 출처 표시를 확인할 것.

## GitHub 자동화

저장소 연결은 완료했다. GitHub CLI의 현재 OAuth 권한에는 `workflow`가 없어 Actions 업로드가 거절된 이력이 있다. 자동 빌드 검사 추가 시 `gh auth refresh -h github.com -s workflow`를 통해 소유자가 브라우저에서 권한을 승인한다. 배포 자동화에는 별도의 제한된 Cloudflare API 토큰을 GitHub Secrets에 등록한다. 개인 토큰을 코드에 저장하지 않는다.
