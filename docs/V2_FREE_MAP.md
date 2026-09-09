# v2 무료 지도 구조

## 목표

v2의 해외 여행 모드는 결제 계정이나 API 키 없이 사용할 수 있는 `Leaflet + OpenStreetMap` 조합을 기본으로 한다. v1의 네이버 지도와 Google Maps 연결 코드는 남겨 두어 나중에 지도 공급자를 다시 바꿀 수 있다.

## 구성

- 지도 화면: Leaflet 1.9.4
- 지도 타일: OpenStreetMap 표준 타일
- 장소·주소 검색: 서버 프록시를 거친 Nominatim 검색
- 상세보기: 선택한 장소의 OpenStreetMap 링크
- 거리뷰: Google Maps URL로 외부 페이지를 여는 방식이며 Google API 호출은 하지 않음
- 저장: 계획의 `map_provider`와 장소별 `mapProvider`를 함께 저장

## 무료 운영 원칙

Nominatim은 공용 서비스이므로 자동완성 대신 사용자가 엔터를 누른 뒤에만 검색하고, 요청 사이에 최소 1초 지연·서버 캐시·Cloudflare 요청 제한을 적용한다. 공개 이용자가 급격히 늘거나 검색량이 많아지면 공용 Nominatim과 OpenStreetMap 타일이 요청을 거부할 수 있다. 이 경우 유료 API로 자동 전환하지 않고 지도 검색을 실패 상태로 남긴다.

OpenStreetMap 타일은 화면에 출처를 표시한다. 대량 다운로드, 오프라인 저장, 타일 프록시 운영은 하지 않는다. 장기적으로 대중 사용량이 커지면 별도 무료 호스팅 정책을 가진 타일 공급자 또는 자체 타일 서버를 검토해야 한다.

운영 기준은 [OpenStreetMap 타일 이용 정책](https://operations.osmfoundation.org/policies/tiles/)과 [Nominatim 이용 정책](https://operations.osmfoundation.org/policies/nominatim/)을 따른다. 두 공용 서비스 모두 무제한·무중단을 보장하는 API가 아니므로 사용량이 커지면 공급자를 교체할 수 있게 구성했다.

## v1로 되돌리기

계획 데이터의 `map_provider` 값은 `naver`, `google`, `osm` 중 하나다. 기존 계획은 값이 없거나 알 수 없는 값이면 네이버 지도로 읽는다. v2 무료 모드로 새 계획을 만들면 `osm`으로 저장되고, 코드에서 새 계획의 기본값 또는 설정 선택지만 `naver`·`google`로 되돌려 v1 방식으로 복귀할 수 있다. 기존 Google 연동 코드도 삭제하지 않았다.

## 현재 한계

OpenStreetMap 타일 자체는 네이버·Google처럼 사업장 POI 정보를 제공하지 않으므로 지도 빈 공간을 클릭해 장소 정보를 읽는 기능은 제공하지 않는다. 검색 후보 핀, 일정 핀, 동선, 임의 핀, 주소 자동 변환은 제공한다. 장소의 공식 상세 정보와 거리뷰는 외부 링크로 연다.
