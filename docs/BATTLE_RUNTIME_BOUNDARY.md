# 1차 전투 런타임 경계 ADR

## 결정

1차에서는 `src/game/battle/BattleGateway.ts`의 engine-neutral 계약만 실행 경로에 둔다. `UnavailableBattleGateway`는 전투 요청을 명시적으로 거부하고 화면에는 placeholder 안내만 남긴다.

`src/game/domain`에 남은 `TacticalMapBounds`, `TacticalRoadDefinition`, `TacticalUrbanPlan`은 기존 저장·순수 규칙 호환을 위한 legacy/provisional 타입이다. 이 타입은 새 전투 화면의 Nav, 카메라, 맵 생성 또는 에셋 로딩을 의미하지 않는다.

## 계약

- 시작 화면과 월드 맵은 Babylon 또는 전투 렌더러를 import하지 않는다.
- 월드 맵의 국가·도시 선택은 위도/경도 투영과 화면 팬·줌만 사용한다.
- 미래 전투 맵은 도로를 따라 이동하는 Nav 시스템을 요구하지 않는다.
- 전투 구현이 시작되면 새 좌표계·공간 질의·카메라 계약을 먼저 정의하고 `BattleGateway` 구현만 교체한다.
- legacy tactical 타입은 새 화면에서 사용하지 않으며, 규칙 회귀 검증이 끝난 뒤 별도 삭제/분리한다.

## 검증

`src/game/battle/BattleGateway.test.ts`는 1차 gateway가 unavailable 상태이고 요청 타입에 Babylon/도로/Nav 데이터가 포함되지 않는지 보장한다. `npm run check`와 M7 무반입 검색은 전투 renderer 직접 참조가 없음을 확인한다.
