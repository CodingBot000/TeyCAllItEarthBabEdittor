# 1차 전투 런타임 경계 ADR

- 상태: 1차 결정 이행 완료
- 후속 작업: [Battle Scene 개발계획서](./battlescene/BATTLE_SCENE_DEVELOPMENT_PLAN.md)
- 전환 시점: 앞단 시작화면·월드맵 구현 완료 후 B0~B6 배틀 런타임 개발

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

## 후속 전환

이 ADR은 1차 완료 당시의 경계를 보존하는 역사 기록이다. 앞단 구현이 완료됐으므로 새 배틀 개발에서는 엔진 중립 계약을 유지한 채 `BattleLaunchRequest`에 `mapId`를 추가하고, `UnavailableBattleGateway`를 실제 Babylon 배틀 런타임 구현으로 교체한다.

전환 작업은 `BATTLE_SCENE_DEVELOPMENT_PLAN.md`의 B0 계약 단계와 B6 앱 통합 단계에서 수행한다. 새 전투 구현은 legacy tactical 도로/Nav 타입을 다시 활성화하지 않는다.
