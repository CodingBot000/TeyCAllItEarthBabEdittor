# 2D Battle Gameplay 수정 전용 개발계획서

- 작성일: 2026-08-24
- 대상 프로젝트: `TheyCallItEarthBabEditor`
- 문서 상태: 구현 대기
- 목적: 2D 배틀 1차 구현 이후 확인된 플레이 차단·저장 지속성·점령·표현 동기화·검증 누락 수정
- 상위 기준: [2D Battle Gameplay 개발계획서](./BATTLE_2D_GAMEPLAY_DEVELOPMENT_PLAN.md)
- 시각 기준: [Battle Scene 구현안](./BATTLE_SCENE_IMPLEMENTATION_PLAN.md)

## 1. 문서 권위와 수정 원칙

이 문서는 2D 배틀 1차 구현을 폐기하지 않고, 현재 구현에서 확인된 누락과 잘못 연결된 부분만 수정하기 위한 실행 계획이다.

다음 항목에서는 이 문서가 기존 완료 표기보다 우선한다.

- 모바일 배틀 조작
- 디버그 기능의 프로덕션 차단
- 전투 포기와 실패 처리
- 도시별 흡수 자원 지속성
- ORGANIC 구역의 임시 시민 표현
- 자동 SCAN과 업그레이드 연결
- 능력 버튼 상태
- 코호트 철수와 점령 주둔
- River/Desert 게임플레이 프로필 적용
- 전투 판정 객체와 시각 객체 동기화
- E2E·회귀 테스트와 CI

수정 과정에서도 기존 3D 도시 건물, 도로 Nav, 자유 X/Z 이동은 다시 도입하지 않는다.

## 2. 확정된 제품 결정

| 항목 | 확정안 |
|---|---|
| 시민 임시 표현 | ORGANIC 구역마다 시민 덩어리 표시 1개와 현재 시민 수를 표시 |
| 시민 개별 스프라이트 | 현재 고정 시민 18명은 제거하고 최종 시민 이미지 제작 때 별도 어댑터로 교체 |
| 도시 재방문 | 지역 위치는 다시 생성할 수 있지만 도시 전체 잔존 자원은 유지 |
| 전투 중 뒤로 가기 | 확인 후 임무 포기·실패로 처리하고 전투 전 상태로 무료 복귀하지 않음 |
| OCCUPATION 코호트 | 점령 완료 후 필수 노드에 남아 주둔 후보가 됨 |
| RAID 코호트 | 탈출 시작 시 모선으로 후퇴하고 회수 거리로 생존 판정 |
| 모바일 이동 | 화면 왼쪽의 좌우 홀드 버튼을 기본 입력으로 사용 |
| 자동 SCAN | 프로필 기본 거리와 Scanner Array 보너스를 합산 |
| 화면 밖 목표 | 가장 가까운 미고갈 목표의 방향과 거리를 HUD에 표시 |
| 디버그 기능 | 개발 환경에서만 허용하고 실제 캠페인 저장을 변경하지 않음 |
| River/Desert | 흡수 가중치뿐 아니라 방어·적 압력·점령 노드 수까지 독립 적용 |
| 전투 시각 객체 | CombatState 엔티티 ID와 1:1 또는 명시적 풀 매핑 |

## 3. 수정 우선순위

| 우선순위 | 수정 항목 | 영향 |
|---|---|---|
| P0 | 모바일 좌우 이동 | 모바일에서 핵심 플레이 불가 |
| P0 | 프로덕션 디버그 쿼리 차단 | 생존 시간·셀·진행 상태 조작 가능 |
| P0 | BACK TO MAP 임무 포기 처리 | 실패·수리비 회피와 무제한 재시작 가능 |
| P0 | 도시 자원 지속성 | 도시 재방문 무한 파밍 가능 |
| P0 | OCCUPATION 코호트 잔류 | 성공했지만 주둔 후보가 사라질 수 있음 |
| P1 | 시민 덩어리와 ORGANIC 수량 표시 | 판정 위치와 시민 표현 불일치 |
| P1 | 자동 SCAN 업그레이드·방향 표시 | Scanner 업그레이드 무효, 이동 정보 부족 |
| P1 | 능력 버튼 가용 상태 | 셀·에너지·쿨다운·목표 상태가 불명확 |
| P1 | 프로필 미사용 필드 적용 | River/Desert 방어 플레이가 Coastal과 유사 |
| P1 | 적·시설·시민 시각 동기화 | 보이는 위치·개수와 실제 판정 불일치 |
| P2 | E2E·원본 회귀 테스트 CI 연결 | 자동 검사에서 브라우저 회귀 탐지 불가 |
| P2 | River/Desert 레이어 최종 분리 | 1차 마스터 분할에 깊이 중복이 남음 |
| P2 | 과거 문서 정리 | 현재 런타임과 placeholder 문서 충돌 |

## 4. ORGANIC 시민 덩어리 수정

### 4.1 표현 단위

개별 시민을 생성하지 않는다. `kind === 'ORGANIC'`인 흡수 지역마다 하나의 시민 덩어리 표시를 만든다.

```ts
interface OrganicClusterPresentation {
  targetId: string;
  x: number;
  initialPopulation: number;
  remainingPopulation: number;
  remainingRatio: number;
  status: AbsorbableStatus;
  discovered: boolean;
  active: boolean;
}
```

임시 표시 구성:

```text
시민 덩어리 실루엣 또는 원형 군집 표시
└─ 중앙 숫자: 현재 남은 시민 수
└─ 하단 또는 외곽 링: 잔량 비율
└─ 잠김/흡수 중/고갈 상태 색상
```

### 4.2 표시 규칙

- 자동 탐지 전에는 약한 신호만 표시한다.
- 탐지 후 시민 덩어리와 숫자를 표시한다.
- 숫자는 `remainingAmount`를 반올림해 표시한다.
- 큰 수는 언어별 축약 표현을 사용한다. 예: `14.2K`, `1.3M`, `1.4만`.
- 흡수 중에는 숫자와 덩어리 크기가 실시간 감소한다.
- 크기는 완전히 0이 되기 전까지 최소 가독 크기를 유지한다.
- 고갈 시 `0` 또는 `고갈` 상태를 짧게 표시한 뒤 흐리게 유지한다.
- ORGANIC이 아닌 지역에는 시민 숫자를 표시하지 않는다.

### 4.3 교체 가능한 시각 어댑터

최종 시민 이미지가 제작되면 도메인 규칙을 변경하지 않고 표현만 교체할 수 있어야 한다.

```ts
interface OrganicClusterVisualAdapter {
  sync(cluster: OrganicClusterPresentation): void;
  dispose(): void;
}
```

1차 어댑터는 Babylon GUI 또는 DynamicTexture 텍스트와 단순 군집 메시를 사용한다. 후속 어댑터는 시민 Sprite Pool이나 Flipbook을 사용할 수 있다.

### 4.4 제거 대상

- `BattleCombatVfx.createCivilians()`의 고정 18명 생성
- `-28 + (index % 9) * 7` 고정 위치
- 실제 ORGANIC 목표와 무관한 `civilian.home`
- 모든 흡수 종류에서 동일 시민 애니메이션을 재생하는 동작

## 5. 도시 자원 지속성과 저장 v5

### 5.1 현재 문제

현재 흡수 대상 ID에 방문 횟수가 들어가므로 다음 방문에서는 이전 대상 잔량을 조회하지 못한다.

```text
seoul:visit-1:cluster-01
seoul:visit-2:cluster-01
```

위치는 방문마다 바뀔 수 있지만 도시의 총 자원은 다시 채워지면 안 된다.

### 5.2 도시 자원 풀

`CityState`에 위치와 독립적인 자원 풀을 추가한다.

```ts
interface CityAbsorbablePoolState {
  initialAmount: number;
  remainingAmount: number;
  destroyedAmount: number;
}

interface CitySideViewResourceState {
  profileId: string;
  profileVersion: number;
  pools: Record<AbsorbableKind, CityAbsorbablePoolState>;
}
```

생성 규칙:

1. 새 도시 상태 생성 시 도시 인구·자원·기술 수치와 프로필 가중치로 종류별 총량을 만든다.
2. 출격 시작 시 해당 종류의 `remainingAmount` 범위 안에서 여러 지역으로 분배한다.
3. 한 출격의 지역 총량은 도시 풀 잔량을 초과하지 않는다.
4. 전투 종료 시 흡수량과 파괴량을 도시 풀에서 차감한다.
5. 다음 방문에서는 남은 풀만 새 위치에 다시 분배한다.
6. 풀 잔량이 0인 종류는 더 이상 생성하지 않는다.

### 5.3 미션 배치 스냅샷

`MissionLoadout` 또는 별도 `PlannedBattleSetup`에 다음을 저장한다.

```ts
interface PlannedBattleSetup {
  missionId: string;
  mapId: string;
  gameplayProfileId: string;
  gameplayProfileVersion: number;
  layoutSeed: number;
}
```

저장 재로드와 코드 업데이트 후에도 같은 미션은 같은 배치를 사용한다.

### 5.4 스키마 마이그레이션

- `CampaignState.schemaVersion`을 5로 올린다.
- v4 저장은 도시별 기존 `absorbables`를 가능한 종류별 풀로 합산한다.
- River/Desert의 구형 namespaced ID도 종류별 풀로 합산한다.
- 종류 판별이 불가능한 ID는 파기하지 않고 migration backup에 보존한다.
- 마이그레이션 전 원본 저장을 기존 방식대로 별도 키에 백업한다.

## 6. 모바일 이동

### 6.1 입력 API

런타임에 DOM과 키보드에서 공통으로 사용할 이동 입력을 추가한다.

```ts
interface BattleRuntime {
  setMovementInput(direction: -1 | 0 | 1, source?: 'keyboard' | 'pointer'): void;
}
```

키보드와 터치 입력을 합산하되 서로의 입력을 임의로 해제하지 않는다.

### 6.2 화면 버튼

- 모바일 가로 화면 왼쪽 하단에 `◀`, `▶` 버튼을 표시한다.
- `pointerdown` 동안 계속 이동한다.
- `pointerup`, `pointercancel`, 포인터 캡처 상실 시 반드시 0으로 복구한다.
- 두 버튼 동시 입력은 0으로 처리한다.
- 버튼 영역은 최소 44×44 CSS px을 확보한다.
- 능력 버튼과 겹치지 않는다.
- 데스크톱에서도 터치 입력 장치라면 표시할 수 있다.

### 6.3 검증

- 640×360, 900×500에서 양 방향 이동
- 버튼을 누른 상태에서 능력 버튼 동시 사용
- pointercancel 후 이동이 고착되지 않음
- 모바일 세로 화면 Guard 이후 가로 전환 시 입력 정상화

## 7. 전투 포기와 디버그 격리

### 7.1 임무 포기

현재 `BACK TO MAP`을 다음 흐름으로 교체한다.

```text
임무 포기 선택
→ 확인 모달
→ 취소: 전투 계속
→ 확인: active beam 중단, result=FAILED, endReason=ABORTED
→ 회수율·코호트 손실·수리 판정
→ Debrief
```

새 종료 원인:

```ts
type CombatEndReason = 'EXTRACTED' | 'MOTHERSHIP_DISABLED' | 'ABORTED';
```

`ABORTED`는 Hull 대파 수리비를 그대로 적용하지 않고 별도 철수 비용 또는 낮은 화물 회수율을 적용한다. 비용 수치는 `BALANCE`에 둔다.

### 7.2 디버그 기능

다음 쿼리는 개발 환경에서만 동작한다.

- `debug=battle`
- `battle-fast=1`
- `battle-debug=1`
- 강제 피격·추락 키

구현 기준:

```ts
const battleDebugEnabled = process.env.NODE_ENV !== 'production';
```

- 프로덕션에서는 쿼리를 무시한다.
- 개발용 직접 진입은 실제 SAVE_KEY를 덮어쓰지 않는다.
- 인메모리 캠페인 또는 별도 debug save key를 사용한다.
- debug 상태가 정상 캠페인 `currentCityId`, 자원, 미션 상태를 변경하지 않는다.

## 8. 자동 SCAN과 목표 안내

### 8.1 탐지 거리

```text
effectiveAutoScanRange
= gameplayProfile.autoScanRange
+ combatState.modifiers.scanRangeBonus
```

기존 수동 SCAN 에너지 비용과 쿨다운은 2D 자동 SCAN에서 사용하지 않는다. Scanner Array는 탐지 거리만 증가시킨다.

### 8.2 화면 밖 안내

HUD는 다음 우선순위의 목표를 안내한다.

1. 발견됐지만 아직 고갈되지 않은 가장 가까운 지역
2. 미발견 지역 중 가장 가까운 신호
3. 모든 지역 고갈

표시 정보:

- 좌/우 방향 화살표
- 모선에서 목표까지 거리
- 발견된 경우 종류와 남은 수량
- 잠금 조건
- 현재 흡수 가능 여부

### 8.3 능력 버튼 상태

EMP, Plasma, Overdrive 버튼은 Snapshot에 가용 상태를 포함한다.

```ts
interface AbilityAvailability {
  enabled: boolean;
  reason?: 'NO_CELLS' | 'LOW_ENERGY' | 'COOLDOWN' | 'NO_TARGET' | 'COMBAT_OVER';
  cooldownRemaining: number;
  energyCost: number;
  cellCost: number;
}
```

버튼은 `enabled`가 false면 비활성화하고 짧은 이유를 표시한다. 성공할 수 없는 입력은 자원을 소비하지 않는다.

## 9. 코호트 AI 수정

### 9.1 RAID

- 자동 배치
- 가장 가까운 지상 방어 공격
- 탈출 시작 시 모선으로 후퇴
- 회수 반경 진입 시 `RECOVERED`
- 도착 실패 시 `LOST`

### 9.2 OCCUPATION

- 자동 배치와 방어 제거
- 서로 다른 필수 Control Node로 분산
- `occupationReady` 이후 필수 노드에서 대기
- 탈출 시작 시 후퇴 명령을 내리지 않음
- 노드에 남은 생존 코호트를 `GARRISON_CANDIDATE`로 처리
- 선택되지 않은 후보만 전투 후 Reserve로 복귀

### 9.3 후보 판정 수정

OCCUPATION에서는 회수 반경보다 점령 노드 점유를 먼저 판정한다.

```text
FAILED 또는 전멸 → LOST
OCCUPATION 성공 + 점령 노드 잔류 → GARRISON_CANDIDATE
모선 회수 반경 → RECOVERED
그 외 → LOST
```

## 10. River/Desert 프로필 실적용

### 10.1 미사용 필드 연결

- `enemyPressureMultiplier`: 적 웨이브 수, 공격 간격 또는 경보 임계 압력에 적용
- `defenseWeights`: 시설·지상 방어 생성 구성에 적용
- `occupationNodeCount`: 필수 Control Node 생성 수에 적용
- `groundPressureMultiplier`: 기존 자폭드론 피해뿐 아니라 지상 적 피해·체력에도 적용 여부를 명시
- `rewardMultiplier`: 현재와 같이 흡수 보상에 적용

### 10.2 Coastal 복제 제거

River/Desert가 Coastal 프리셋을 namespaced clone으로 사용하는 임시 구조를 제거한다.

2D 전용 생성 데이터:

```text
BattleGameplayProfile
├─ 흡수 종류 가중치
├─ 시설 종류 가중치
├─ 지상 방어 종류와 수
├─ 적 압력
├─ 점령 노드 수
├─ 보상 배율
└─ 생존·탈출 시간
```

3D 건물 좌표나 도로 데이터는 포함하지 않는다.

## 11. 전투 상태와 시각 객체 동기화

### 11.1 공중 적

- `EnemyState.id` 기준 전투기 시각 풀 생성
- 상태의 position, altitude, heading, bank, health를 매 프레임 동기화
- 상태에서 제거된 적 시각 객체를 풀로 반환
- 현재 독립적으로 움직이는 전투기 프로토타입 3대는 debug 전용으로 제한

### 11.2 지상 적과 시설

- `GroundDefenderState.id`, `CombatFacilityState.id` 기준 시각 객체 생성
- 실제 X 위치, 체력, disabledUntil, destroyed 상태 동기화
- 자폭드론 충돌 위치와 보이는 목표 위치 일치
- 고정 `GroundTurretPrototype1~3`은 fallback/debug 전용으로 제한

### 11.3 시민과 흡수 지역

- ORGANIC은 시민 덩어리 어댑터 사용
- 나머지 종류는 단순 종류 아이콘·잔량 표시 유지
- 빔 연출은 실제 active target의 시각 객체를 향함
- 고갈된 대상은 숫자·크기·색상이 상태와 일치

### 11.4 렌더 풀 불변식

- 도메인 active ID 수와 시각 active ID 수가 일치
- dispose 후 Map과 TrailMesh가 비어 있음
- 반복 진입 후 이전 전투 ID가 남지 않음
- 최대 적·투사체·VFX 수가 `BALANCE` 상한을 넘지 않음

## 12. 테스트와 CI

### 12.1 원본 도메인 회귀 테스트 복구

다음 원본 테스트 범주를 현재 구조에 맞게 이식한다.

- 빔 열·과열·재시작
- 대상 유한량과 화물 용량
- EMP/Plasma 잠금 해제
- 자동 방공 레이저
- 적 웨이브와 미사일 상한
- 업그레이드 효과
- 실패 화물 회수
- 도시 재방문 자원 지속성
- 코호트 손실·회수·주둔
- RAID와 OCCUPATION 결과

### 12.2 신규 단위 테스트

- 시민 덩어리 숫자와 remainingAmount 일치
- 도시 풀 합계가 출격 지역 합계를 초과하지 않음
- 재방문 후 도시 풀이 복구되지 않음
- Scanner Array가 자동 탐지 거리를 증가
- 프로필 버전 저장·복구
- OCCUPATION 코호트가 철수하지 않고 후보가 됨
- ABORTED 결과와 비용
- 프로덕션 디버그 쿼리 무효화

### 12.3 브라우저 E2E

- 데스크톱 정상 RAID
- 기본 75초 생존 후 탈출
- 모바일 좌우 이동과 흡수
- 능력 버튼 disabled/쿨다운
- 전투 포기 확인과 Debrief
- 모선 대파 수리비
- 코호트 포함 RAID 회수
- OCCUPATION 주둔 확정
- 도시 재방문 후 자원 잔량 감소 확인
- River/Desert 프로필 차이 확인
- 디버그 쿼리 프로덕션 무효화

### 12.4 npm 명령

권장 명령:

```json
{
  "test:e2e:side-view": "node scripts/verify-side-view-flow.mjs && node scripts/verify-side-view-failure.mjs && node scripts/verify-side-view-mobile.mjs",
  "check:full": "npm run check && npm run lint && npm run test:e2e:side-view"
}
```

CI에서는 Playwright 브라우저 경로를 고정하지 않고 설치된 Chromium 또는 환경 변수 경로를 사용한다.

## 13. 문서 수정

구현 완료 시 다음 과거 문서를 현재 상태에 맞게 갱신한다.

- `docs/BATTLE_RUNTIME_BOUNDARY.md`
  - `UnavailableBattleGateway`와 placeholder 검증을 역사 기록으로 명시
- `docs/battlescene/BATTLE_SCENE_DEVELOPMENT_PLAN.md`
  - HUD 제외와 실제 전투 UI 남음 항목 갱신
- `docs/battlescene/BATTLE_SCENE_IMPLEMENTATION_PLAN.md`
  - 1차 렌더링 범위와 현재 게임플레이 구현 범위 구분
- `README.md`
  - 모바일 입력, 임무 포기, save v5, E2E 명령 추가
- `progress.md`
  - 수정 단계별 결과와 남은 튜닝 기록

## 14. 파일별 작업 계획

| 파일/경로 | 수정 내용 |
|---|---|
| `src/game/domain/types.ts` | save v5, 도시 자원 풀, 종료 원인, 능력 가용 상태 |
| `src/game/domain/balance.ts` | 포기 비용, 모바일 이동, 프로필 압력 상수 |
| `src/game/domain/campaignRules.ts` | 도시 풀 차감, ABORTED 결과, 수리·회수 적용 |
| `src/game/infrastructure/persistence/saveRepository.ts` | v4→v5 마이그레이션과 profile version 저장 |
| `src/game/battle/gameplay/generateAbsorbableClusters.ts` | 도시 풀 기반 지역 분배 |
| `src/game/battle/gameplay/sideViewBattleRules.ts` | Scanner 보너스, 목표 방향, 능력 가용 상태 |
| `src/game/battle/gameplay/cohortAiRules.ts` | 임무별 철수/잔류 분기 |
| `src/game/battle/gameplay/BattleGameplayProfile.ts` | 실제 사용 필드만 유지하고 생성 규칙 연결 |
| `src/game/battle/runtime/BattleCombatVfx.ts` | 고정 시민 제거, 상태 기반 시각 동기화 |
| `src/game/battle/runtime/createBattleRuntime.ts` | 모바일 이동 API, debug gate, entity visual sync |
| `src/game/battle/runtime/BattleAbsorbableRegions.ts` | 시민 덩어리와 숫자 표시 또는 어댑터 연결 |
| `src/game/battle/BattleScreen.tsx` | 모바일 이동, 포기 모달, 목표 안내, 능력 disabled |
| `src/game/GameApp.tsx` | debug save 격리, ABORTED→Debrief 흐름 |
| `scripts/verify-side-view-*.mjs` | 프로덕션 debug·재방문·점령 E2E 추가 |
| `package.json` | `test:e2e:side-view`, `check:full` 명령 추가 |

## 15. 구현 단계

### C0 — 기준선 고정

작업:

- 현재 정상 RAID, 대파, River, Desert 스크린샷과 상태 JSON 보존
- 기존 26개 테스트와 production build 통과 확인
- 수정 전 save v4 fixture 추가

완료 조건:

- 수정 전 동작을 재현할 수 있음
- 신규 실패가 기존 문제인지 수정 회귀인지 구분 가능

### C1 — 모바일·디버그·포기 P0 수정

작업:

- 모바일 좌우 홀드 입력
- debug 쿼리 개발 환경 제한
- debug 캠페인 저장 격리
- 전투 포기 확인 모달과 ABORTED 종료

완료 조건:

- 모바일에서 대상까지 이동·흡수 가능
- 프로덕션 쿼리로 시간·셀·도시 상태 변경 불가
- 뒤로 가기로 실패와 수리비를 회피할 수 없음

### C2 — save v5와 도시 자원 풀

작업:

- 도시 종류별 자원 풀 추가
- 위치와 재고 분리
- 프로필 ID·버전·레이아웃 시드 저장
- v4→v5 마이그레이션

완료 조건:

- 같은 미션 재로드 배치 동일
- 다음 방문 위치 변경 가능
- 도시 총 자원은 복구되지 않음
- 기존 v4 저장 손실 없음

### C3 — 시민 덩어리·목표 HUD

작업:

- 고정 시민 18명 제거
- ORGANIC 덩어리와 숫자 표시
- 자동 SCAN 업그레이드 적용
- 화면 밖 목표 방향·거리 표시

완료 조건:

- 시민 표시 위치가 ORGANIC 목표 X와 일치
- 숫자와 remainingAmount가 일치
- 흡수 중 숫자·크기 감소
- Scanner 업그레이드별 탐지 거리 차이 검증

### C4 — 능력 버튼과 프로필 적용

작업:

- 능력 Availability Snapshot
- 버튼 disabled·쿨다운·실패 이유
- enemyPressure, defenseWeights, occupationNodeCount 적용
- Coastal clone 의존 제거

완료 조건:

- 불가능한 능력 입력이 자원을 소비하지 않음
- River/Desert의 적·방어·점령 구성이 수치상 다름

### C5 — 코호트 점령 수정

작업:

- RAID 후퇴 유지
- OCCUPATION 노드 잔류
- GARRISON_CANDIDATE 우선 판정
- 실제 배분·주둔 E2E

완료 조건:

- OCCUPATION 성공 후 요구 수 이상의 후보 존재
- 선택한 코호트만 도시 주둔
- 미선택 후보는 Reserve 복귀

### C6 — 전투 시각 동기화

작업:

- EnemyState 전투기 풀
- Defender/Facility 지상 시각 풀
- 시민 덩어리 어댑터
- 프로토타입 debug 격리

완료 조건:

- 화면 객체 위치·개수·파괴 상태가 `render_game_to_text`와 일치
- 반복 진입과 10분 soak에서 누적 없음

### C7 — 자동 검증과 문서 정리

작업:

- 원본 도메인 테스트 복구
- 브라우저 E2E npm 명령 연결
- CI용 Chromium 경로 처리
- 과거 문서 갱신

완료 조건:

- `npm run check:full` 한 번으로 정적 검사·단위·build·E2E 통과
- 현재 코드와 문서의 상태 설명이 일치

### C8 — River/Desert 최종 레이어 마감

작업:

- 현재 마스터 마스크 분할을 개별 투명 원본으로 교체
- Far/Middle/Near/Ground 깊이 중복 제거
- 실제 카메라 이동에서 패럴랙스 이음새 확인

완료 조건:

- 수직·수평 이음새 없음
- 레이어 중복 실루엣 없음
- 세 맵의 가독성과 게임 판정 표시 대비 유지

## 16. 최종 완료 기준

- 데스크톱과 모바일에서 동일한 핵심 조작이 가능하다.
- 디버그 쿼리가 프로덕션 캠페인을 변경하지 않는다.
- 전투 포기는 반드시 결과·비용·코호트 판정을 남긴다.
- 도시를 재방문해도 흡수 자원이 무한 복구되지 않는다.
- 같은 미션은 저장 재로드 후 동일한 배치를 사용한다.
- 시민 덩어리 위치와 숫자가 ORGANIC 도메인 상태와 일치한다.
- Scanner Array가 자동 탐지 범위를 실제로 증가시킨다.
- 능력 버튼 상태가 도메인 사용 가능 여부와 일치한다.
- River/Desert의 방어·적 압력·점령 목표가 실제로 다르다.
- RAID 코호트는 회수되고 OCCUPATION 코호트는 주둔 후보가 된다.
- 보이는 전투기·지상 적·시민 대상이 CombatState와 일치한다.
- 기존 v4 저장이 v5로 안전하게 마이그레이션된다.
- `npm run check:full`이 통과한다.
- River/Desert 최종 레이어에 이음새와 중복 실루엣이 없다.

## 17. 구현 후 남길 튜닝 항목

다음 값은 수정 완료를 막지 않으며 플레이테스트에서 조정한다.

- 시민 덩어리 최소·최대 크기
- 시민 숫자 축약 표기
- 모바일 이동 버튼 크기·위치
- ABORTED 화물 회수율과 비용
- 도시 종류별 초기 자원 총량
- Scanner Array 레벨별 추가 탐지 거리
- River/Desert 적 압력 배율
- OCCUPATION 코호트 잔류 거리
- 능력 버튼 쿨다운 표시 방식
