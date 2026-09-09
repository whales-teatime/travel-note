# v2 무료 지도 구조

## 목표

v2의 해외 여행 모드는 `MapLibre GL JS + OpenFreeMap` 조합을 기본으로 한다. 장소 검색과 주소 변환은 Geoapify를 우선 사용하고, Geoapify 키가 없거나 일시적으로 응답하지 않으면 기존 Nominatim 검색으로 자동 전환한다. v1의 네이버 지도와 Google Maps 연결 코드는 남겨 두어 나중에 지도 공급자를 다시 바꿀 수 있다.

## 구성

- 지도 화면: MapLibre GL JS
- 지도 스타일·벡터 타일: OpenFreeMap Liberty 스타일. 공급자가 제공하는 영문·라틴명과 현지명 조합을 표시하고, OpenStreetMap.de OSM 타일을 보조 배경으로 사용한다.
- 장소·주소 검색: 서버 프록시를 거친 Geoapify 우선 검색, Nominatim 자동 대체
- 검색 캐시: 동일 검색은 Cloudflare D1에서 먼저 조회. 검색은 30일, 좌표의 주소 변환은 90일 보관
- 상세보기: 선택한 장소를 Google Maps 검색 링크로 열며 Google API는 호출하지 않음
- 거리뷰: Google Maps URL로 외부 페이지를 여는 방식이며 Google API 호출은 하지 않음
- 저장: 계획의 `map_provider`와 장소별 `mapProvider`를 함께 저장
- 동선: 일정 순서대로 직선을 표시하며 별도의 routing API는 사용하지 않음

## 무료 운영 원칙

Geoapify는 `GEOAPIFY_API_KEY`를 Worker secret으로만 읽으며 브라우저에는 노출하지 않는다. 한국어·영어 설정은 검색 요청의 `lang` 값에 반영된다. 동일한 언어·여행지·검색어는 D1 캐시를 먼저 사용하므로 반복 검색은 API 사용량을 소모하지 않는다. Geoapify가 한도에 닿거나 장애가 생기면 Nominatim으로 자동 전환한다.

Nominatim은 공용 서비스이므로 자동 대체 경로에만 사용한다. 요청 사이에 최소 1초 간격, Worker 인스턴스별 요청 제한과 Cloudflare 검색 요청 제한을 적용한다. 공개 이용자가 급격히 늘면 Geoapify 일일 한도와 공용 Nominatim 정책에 닿을 수 있지만, 결제가 자동으로 발생하는 공급자는 연결하지 않는다.

OpenFreeMap 벡터 스타일은 공급자가 제공하는 영문·라틴명과 현지명 조합을 우선 표시한다. 벡터 타일이 늦거나 일부 지명에 번역 데이터가 없을 때는 영문 지명이 포함된 OpenStreetMap.de OSM 배경이 보조로 보인다. 번역된 지명이 없는 장소는 원어 표기로 남을 수 있다. 화면에는 OpenStreetMap.de, OpenFreeMap, OpenStreetMap 출처를 표시한다. 대량 다운로드, 오프라인 저장, 타일 프록시 운영은 하지 않는다. 장기적으로 대중 사용량이 커지면 별도 무료 호스팅 정책을 가진 타일 공급자 또는 자체 타일 서버를 검토해야 한다.

운영 기준은 [OpenStreetMap 타일 이용 정책](https://operations.osmfoundation.org/policies/tiles/)과 [Nominatim 이용 정책](https://operations.osmfoundation.org/policies/nominatim/)을 따른다. 두 공용 서비스 모두 무제한·무중단을 보장하는 API가 아니므로 사용량이 커지면 공급자를 교체할 수 있게 구성했다.

## v1로 되돌리기

계획 데이터의 `map_provider` 값은 `naver`, `google`, `osm` 중 하나다. 기존 계획은 값이 없거나 알 수 없는 값이면 네이버 지도로 읽는다. v2 무료 모드로 새 계획을 만들면 `osm`으로 저장되고, 코드에서 새 계획의 기본값 또는 설정 선택지만 `naver`·`google`로 되돌려 v1 방식으로 복귀할 수 있다. 기존 Google 연동 코드도 삭제하지 않았다.

## 현재 한계

OpenFreeMap 지도 자체는 네이버·Google처럼 사업장 POI 정보를 제공하지 않으므로 지도 빈 공간을 클릭해 장소 정보를 읽는 기능은 제공하지 않는다. 검색 후보 핀, 일정 핀, 동선, 임의 핀, 주소 자동 변환은 제공한다. 장소의 공식 상세 정보와 거리뷰는 외부 링크로 연다.
