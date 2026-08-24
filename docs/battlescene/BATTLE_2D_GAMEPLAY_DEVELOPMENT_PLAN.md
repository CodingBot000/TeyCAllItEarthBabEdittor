# 2D Battle Gameplay 개발계획서

- 작성일: 2026-08-24
- 대상 프로젝트: `TheyCallItEarthBabEditor`
- 대상 범위: Babylon.js Editor 기반 2.5D 배틀의 실제 게임플레이와 원본 캠페인 루프 복구
- 문서 상태: 구현 기준안
- 관련 문서:
  - [Battle Scene 개발계획서](./BATTLE_SCENE_DEVELOPMENT_PLAN.md)
  - [Battle Scene 구현안](./BATTLE_SCENE_IMPLEMENTATION_PLAN.md)
  - [1차 전투 런타임 경계 ADR](../BATTLE_RUNTIME_BOUNDARY.md)
  - [2D Battle Gameplay 수정 전용 개발계획서](./BATTLE_2D_GAMEPLAY_CORRECTION_PLAN.md)

## 1. 목적과 문서 권위

이 문서는 기존 `TheyCallItEarth`의 캠페인·흡수·전투 후 처리 규칙을 현재 2.5D 횡스크롤 배틀에 맞게 연결하기 위한 개발 순서와 완료 기준을 정의한다.

기존 배틀 문서가 Editor 씬, 카메라, 패럴랙스, 에셋 패키징을 다룬다면 이 문서는 다음 항목의 기준이 된다.

- 플레이어가 실제로 수행하는 배틀 조작
- 흡수 대상 지역의 생성과 영구 상태
- 자동 공중전과 자동 지상전
- 생존 시간과 탈출
- 모선 대파와 수리 비용
- 코호트 AI와 도시 점령
- 전투 전후 캠페인 화면 연결
- Coastal, River, Desert의 2D 게임플레이 차별화

표현 방식이 충돌할 때 Editor 노드와 에셋 배치는 기존 배틀 문서를 따르고, 게임 규칙과 화면 흐름은 이 문서를 따른다.

### 1.1 구현 현황

| 단계 | 상태 | 구현 결과 |
|---|---|---|
| G0 | 완료 | 회귀 기준선, `render_game_to_text`, 결정적 `advanceTime` |
| G1 | 완료 | Coastal/River/Desert 게임플레이 프로필과 결정적 흡수 지역 |
| G2 | 완료 | X축 이동, 접근 자동 SCAN, 근거리 흡수 |
| G3 | 완료 | 자동 방공 레이저, EMP, Plasma, Overdrive |
| G4 | 완료 | 곡선 비행형 지상 자폭드론 무리와 실제 피해 |
| G5 | 완료 | 시간 기반 탈출, 실패, 수리비 상한과 긴급 복구 |
| G6 | 완료 | 코호트 자동 배치·공격·분산 점령·후퇴 AI와 시각화 |
| G7 | 완료 | River/Desert 마스터와 재현 가능한 WebP 레이어 제작·등록 |
| G8 | 완료 | 편성·이동·배틀·디브리핑·배분·업그레이드 전체 흐름 |
| G9 | 완료 | 640×360/900×500 모바일, 실패·점령, 결정적 10분 soak QA |

## 2. 확정된 제품 결정

| 항목 | 결정 |
|---|---|
| 배틀 화면 | 고정 측면 시점의 2.5D |
| 일반 이동 | 모선과 지상 유닛은 X축 중심으로 이동 |
| 플레이어 직접 조작 | 모선 이동, 흡수 시작·중단, EMP, Plasma, Overdrive, 탈출 |
| SCAN | 별도 버튼 없이 모선 접근 시 자동 탐지 |
| 공중 공격 | 기존 자동 방공 레이저 발사 조건을 유지 |
| 지상 공격 | 작은 자폭드론형 투사체 무리가 자동으로 지상 적을 공격 |
| 코호트 | 출격 전에 편성하고 전투 중에는 AI가 자동 운용 |
| 탈출 | 일정 생존 시간 이후 버튼을 노출하고 플레이어가 실행 |
| 실패 | 탈출 전 모선 대파 시 임무 실패 및 수리 비용 발생 |
| 흡수 대상 | 출격 시작 시 전체 맵에 결정적으로 생성된 유한한 지역 단위 |
| 맵 구성 | Coastal, River, Desert마다 독립된 2D 배경 레이어 사용 |
| 프리셋 구조 | 시각 맵과 게임플레이 프로필을 분리 |
| 기존 3D 도시 | 건물, 도로 Nav, 기존 3D 시설 배치를 사용하지 않음 |

## 3. 목표 플레이 루프

```text
월드맵에서 도시 선택
  → RAID 또는 OCCUPATION 선택
  → 코호트와 Overcharge Cell 편성
  → 도시 이동
  → 2.5D 배틀 진입
  → 자동 탐지되는 흡수 지역으로 이동
  → 흡수하면서 자동 전투를 버팀
  → 필요할 때 EMP / Plasma / Overdrive 사용
  → 생존 시간 달성
  → 탈출 실행
  → 임무 결과 확인
  → 포로·자원·코호트·주둔 처리
  → 업그레이드 또는 다음 도시 선택
```

전투 중 플레이어의 판단은 다음 네 가지에 집중한다.

1. 어느 흡수 지역으로 이동할 것인가
2. 얼마나 오래 흡수할 것인가
3. 제한된 능력을 언제 사용할 것인가
4. 탈출 가능 시점에 즉시 나갈 것인가 더 욕심낼 것인가

## 4. 흡수 대상 지역

### 4.1 생성 원칙

흡수 대상은 전투 도중 무작위로 계속 나타나는 오브젝트가 아니라, 출격 시작 시 전체 맵에 배치되어 해당 출격 동안 고정되는 지역이다.

- 초기 화면 안에 최소 1개를 보장한다.
- 초기 화면 바깥의 좌측과 우측에 각각 최소 1개를 보장한다.
- 지역 사이에 최소 간격을 둔다.
- 모선 이동 경계와 빔 판정 범위 안에만 배치한다.
- 서로 겹치는 지역은 하나의 복합 지역으로 합치거나 다시 배치한다.
- 맵 길이와 화면 비율이 달라도 동일한 월드 좌표를 사용한다.
- 전투 재시작이나 저장 재로드로 배치를 다시 뽑을 수 없게 한다.

생성 시드는 최소 다음 값을 조합한다.

```text
campaign.seed + cityId + city.visits + missionId + gameplayProfile.version
```

같은 출격은 항상 같은 배치를 생성하고, 다음 방문에서는 도시 상태와 방문 횟수에 따라 새로운 배치를 만들 수 있다.

### 4.2 게임플레이 데이터

시각 오브젝트와 분리된 지역 상태를 둔다.

```ts
interface BattleAbsorbableCluster {
  id: string;
  x: number;
  radius: number;
  kind: AbsorbableKind;
  initialAmount: number;
  remainingAmount: number;
  discovered: boolean;
  status: AbsorbableStatus;
  yieldPerThousand: MissionYieldPerThousand;
  energyCostMultiplier: number;
  alertMultiplier: number;
  requirement: AbsorbableRequirement;
  linkedDefenseId?: string;
}
```

`id`는 저장에 사용되므로 화면 위치나 배열 순서만으로 만들지 않는다. 예시는 `seoul:visit-2:cluster-03`이다.

### 4.3 접근과 자동 탐지

모선과 지역의 X축 거리가 자동 탐지 범위에 들어오면 `discovered = true`가 된다.

```text
abs(ship.x - cluster.x) <= autoScanRange + cluster.radius
```

자동 탐지 시 다음 피드백을 제공한다.

- 바닥 지역 강조
- 자원 종류와 남은 양 표시
- 화면 밖 지역 방향 표시
- 흡수 가능 거리 진입 시 흡수 버튼 활성화
- 잠금 조건이 있으면 EMP 필요, Plasma 필요, 방어 제거 필요 등을 표시

기존 `scanner-array` 업그레이드는 자동 탐지 범위를 늘리는 효과로 유지한다.

### 4.4 흡수 판정

모선이 지역 위에 있고 대상이 사용 가능할 때 흡수를 시작할 수 있다.

```text
abs(ship.x - cluster.x) <= beamRange + cluster.radius
```

여러 지역이 겹치면 모선과 가장 가까운 사용 가능 지역을 자동 선택한다. 플레이어가 흡수 버튼을 다시 누르거나 이동 범위를 벗어나면 흡수를 중단한다.

다음 기존 규칙은 보존한다.

- 유한한 대상량
- 화물칸 제한
- 빔 열과 과열 회복
- 흡수 중 이동 성능 저하
- 흡수 종류별 Captives, Biomass, Alloy, Intel, Core Charge 보상
- 흡수 시간과 활성 레이더에 따른 경보 증가
- 시설 상태에 따른 잠금과 해제
- 전투 후 남은 대상량 저장

## 5. 자동 전투

### 5.1 공중전

기존 도메인의 적 웨이브, 전투기, SAM 발사체, 모선 피해, 자동 방공 레이저 조건을 우선 보존한다.

자동 방공 레이저는 다음 조건을 모두 만족할 때 가장 가까운 공중 적을 공격한다.

- 적이 사거리 안에 있음
- 발사 쿨다운이 끝남
- 필요한 Tactical Energy가 있음
- 모선이 파괴되지 않음

피해 판정은 도메인에서 수행하고 Babylon 런타임은 발사선과 피격 VFX를 표시한다.

### 5.2 플레이어 능력

EMP, Plasma, Overdrive는 화면 버튼으로 유지한다.

- `EMP`: 현재 모선 주변 또는 현재 전투 구역의 방어 시설과 투사체를 일시 무력화한다.
- `Plasma`: 현재 선택된 자동 목표 또는 모선과 가장 가까운 유효 지상 목표를 공격한다.
- `Overdrive`: 즉시 발동하여 일정 시간 모선 피해를 감소시킨다.

2D 배틀에서는 지면 좌표를 직접 클릭하지 않으므로 EMP와 Plasma의 목표 선택 규칙을 명시적으로 자동화한다.

기본 목표 우선순위:

```text
플레이어가 보고 있는 화면 안의 유효 목표
  → 모선과 가장 가까운 유효 목표
  → 현재 흡수 지역을 잠그고 있는 방어 시설
  → 목표 없음
```

버튼에는 에너지, Overcharge Cell, 쿨다운, 목표 없음 상태를 표시한다.

### 5.3 자동 지상 자폭드론 공격

지상 공격은 작은 투사체 무리가 목표를 향해 선회하다 충돌하는 방식으로 구현한다.

#### 도메인 규칙

- 일정 쿨다운마다 지상 목표를 자동 선택한다.
- 한 번에 3~6개의 투사체를 발사한다.
- 개별 투사체는 같은 목표를 향하지만 출발 지연, 속도, 선회량을 다르게 가진다.
- 충돌 시 단일 피해 또는 작은 반경 피해를 적용한다.
- 목표가 먼저 파괴되면 가까운 다른 목표를 재탐색하거나 안전하게 소멸한다.
- 공격 횟수, 피해, 에너지 비용, 쿨다운은 밸런스 상수로 관리한다.

#### 시각 규칙

- 직선 보간 대신 베지어 곡선 또는 제한된 steering을 사용한다.
- 출발 직후 좌우로 퍼지고 중간부터 목표 방향으로 수렴한다.
- 각 투사체에 약한 트레일을 붙인다.
- 충돌 시 작은 다중 폭발을 표시한다.
- 화면 밖 목표를 공격하더라도 투사체 수와 효과 수에 상한을 둔다.

도메인은 목표, 위치, 속도, 피해, 충돌 결과를 소유하고 런타임은 해당 상태를 시각화한다. VFX만 존재하고 실제 피해가 없는 구현은 완료로 보지 않는다.

## 6. 생존 시간, 탈출, 임무 결과

### 6.1 탈출 상태

기존 위치 기반 `EXIT_ZONES`는 2D 배틀 실행 경로에서 사용하지 않는다.

```text
LOCKED
  → survivalUnlockSeconds 경과
AVAILABLE
  → 플레이어가 탈출 버튼 선택
IN_PROGRESS
  → extractionChannelSeconds 경과
COMPLETE
```

- `LOCKED` 상태에는 남은 생존 시간을 표시한다.
- `AVAILABLE`이 되면 탈출 버튼을 노출한다.
- `IN_PROGRESS`가 시작되면 흡수를 중단한다.
- 이탈 준비 중에도 적 공격은 계속된다.
- 모선 대파 시 즉시 `FAILED`가 된다.

### 6.2 결과 판정

단순 대기만 하는 것이 최선의 전략이 되지 않도록 생존과 흡수 성과를 함께 판정한다.

- `SUCCESS`: 생존 시간 달성, 핵심 임무 조건 달성, 탈출 완료
- `PARTIAL`: 생존 시간 달성, 핵심 임무 조건 일부 미달, 탈출 완료
- `FAILED`: 탈출 완료 전 모선 대파

RAID의 핵심 조건은 목표 흡수량 또는 목표 가치 달성으로 둔다. OCCUPATION의 핵심 조건은 필수 방어 제거, 필수 점령 지점 확보, 주둔 가능 코호트 생존으로 둔다.

## 7. 모선 대파와 수리 비용

모선 Hull이 0이 되면 완전 소멸이 아니라 긴급 회수된 대파 상태로 처리한다.

- 임무 결과는 `FAILED`다.
- 회수 가능한 화물만 남긴다.
- 생존 코호트도 회수 거리와 회수 보정에 따라 손실될 수 있다.
- 전투 후 수리 비용을 계산한다.
- 수리 완료 후 다음 출격이 가능하다.

수리 비용은 별도 결과 데이터로 계산한다.

```ts
interface RepairAssessment {
  hullDamageRatio: number;
  biomassCost: number;
  alloyCost: number;
  unpaidBiomass: number;
  unpaidAlloy: number;
}
```

소프트락 방지 규칙:

- 수리비는 보유 자원의 일정 비율을 넘지 않게 상한을 둔다.
- 자원이 부족하면 최소 비행 가능 상태까지 긴급 수리한다.
- 미납 수리비는 최대 Hull 감소, 다음 보상 감소 또는 수리 부채 중 하나로 표현한다.
- 정확한 패널티 방식은 밸런스 단계에서 확정하되 캠페인을 진행할 수 없는 상태는 허용하지 않는다.

## 8. 코호트 AI와 점령

### 8.1 출격 전 편성

원본 미션 편성 화면에서 플레이어가 다음을 선택한다.

- RAID 또는 OCCUPATION
- 투입할 코호트
- Overcharge Cell 수량

코호트 수는 Drop Capacity와 Command Bandwidth를 따른다. 전투 중에는 플레이어가 코호트를 직접 선택하거나 명령하지 않는다.

### 8.2 자동 행동 상태

코호트는 다음 AI 상태를 가진다.

```text
RESERVE
  → 자동 투입 조건 달성
DEPLOYING
  → 지상 도착
ADVANCING
  → 가까운 지상 방어 또는 점령 목표로 이동
ASSAULTING / SECURING
  → 공격 또는 점령
RETREATING
  → 탈출 시 모선 회수 구역으로 이동
RECOVERED / GARRISON_CANDIDATE / LOST
```

### 8.3 RAID 행동

- 가까운 지상 방어를 우선 공격한다.
- 방어가 없으면 흡수 지역을 잠그는 시설을 공격한다.
- 탈출 시작 시 회수 위치로 후퇴한다.
- 회수 시간 안에 도착하지 못하면 손실 또는 부분 회수 판정을 받는다.

### 8.4 OCCUPATION 행동

- 필수 방어 제거를 우선한다.
- 방어 제거 후 필수 Control Node에 자동 분산한다.
- 필수 지점을 확보하면 `occupationReady`가 된다.
- 탈출 완료 시 현장에 남은 생존 코호트는 `GARRISON_CANDIDATE`가 된다.
- 디브리핑 배분 화면에서 실제 주둔 코호트를 확정한다.

기존 코호트의 Strength, Cohesion, Control, Experience, Recovery, Garrison, Lost 상태는 유지한다. 수동 `MOVE`, `ASSAULT`, `SECURE`, `RETREAT` 명령 UI만 AI 정책으로 교체한다.

## 9. 맵과 게임플레이 프로필 분리

### 9.1 시각 맵 계약

`BattleMapDefinition`은 다음 항목만 소유한다.

- Sky
- Clouds
- City Far
- City Middle
- City Near
- Ground
- Foreground Atmosphere
- 카메라와 패럴랙스
- 전체 맵 폭과 시각 기준점

Coastal, River, Desert는 각각 독립된 2D 레이어 패키지를 사용한다. 기존 3D 건물, 도로, 시설 메시를 새 맵 계약으로 가져오지 않는다.

### 9.2 게임플레이 프로필 계약

```ts
interface BattleGameplayProfile {
  id: string;
  version: number;
  clusterCountRange: [number, number];
  clusterSpacing: number;
  autoScanRange: number;
  survivalUnlockSeconds: number;
  extractionChannelSeconds: number;
  absorbableWeights: Record<AbsorbableKind, number>;
  defenseWeights: Record<FacilityKind, number>;
  enemyPressureMultiplier: number;
  groundPressureMultiplier: number;
  rewardMultiplier: number;
  occupationNodeCount: number;
}
```

초기 성향:

| 프로필 | 주요 자원 | 방어 성향 | 점령 성향 |
|---|---|---|---|
| Coastal | Captives, Vehicle, Alloy | 균형형 공중·지상 방어 | 기본 난이도 |
| River | Machinery, Power, Captives | 양쪽 지상 레인 압박 | 분산 점령 목표 |
| Desert | Power, Data, Relic | 강한 지상 방어와 연구 시설 | 높은 위험·높은 보상 |

기존 River/Desert의 3D 좌표와 건물 배치는 사용하지 않지만 자원 성향, 방어 강도, 목표 난이도는 이 프로필로 재설계한다.

## 10. 원본에서 보존할 캠페인 시스템

다음 기능은 2D 전환과 무관하므로 원본과 같은 흐름으로 복구한다.

- 미션 편성 화면
- 도시 간 이동과 Core Charge 소비
- 비상 Core Charge 충전
- RAID / OCCUPATION 게이트
- 포로와 물리 화물 회수
- 디브리핑 결과 화면
- 포로의 코호트·Biomass·예비 인원 배분
- 코호트 생성, 손실, 경험치, 회수, 주둔
- 도시 Breach, Resistance, Control State
- 업그레이드 구매
- 캠페인 승리 진행도
- 저장과 이어하기

전투 종료는 단순 `applyCombatResult`가 아니라 `stageMissionResult → Debrief → DebriefAllocation → finalizeDebriefAllocation` 흐름을 사용한다.

## 11. 코드 구조 계획

### 11.1 도메인

수정 대상:

- `src/game/domain/types.ts`
  - 시간 기반 탈출 상태
  - 흡수 지역 상태
  - 지상 자폭드론 투사체
  - 수리비 결과
  - 코호트 AI 상태
- `src/game/domain/balance.ts`
  - 생성, 생존 시간, 탈출 채널, 자동 지상 공격, 수리비 상수
- `src/game/domain/combatRules.ts`
  - 자동 탐지
  - X축 흡수 판정
  - 시간 기반 탈출
  - 자동 목표 선택
  - 지상 자폭드론 상태와 충돌
- `src/game/domain/cohortRules.ts`
  - 수동 명령을 유지한 채 자동 AI 정책을 추가
- `src/game/domain/missionRules.ts`
  - 시간 기반 탈출과 자동 점령 결과 판정
- `src/game/domain/campaignRules.ts`
  - 수리비 평가와 적용

결정적 생성 규칙은 Babylon 타입에 의존하지 않는 별도 순수 모듈로 둔다.

권장 파일:

```text
src/game/battle/gameplay/
├─ BattleGameplayProfile.ts
├─ battleGameplayProfiles.ts
├─ generateAbsorbableClusters.ts
├─ selectAutomaticTarget.ts
├─ tickGroundSwarm.ts
└─ tickCohortAi.ts
```

### 11.2 런타임

- `createBattleRuntime.ts`
  - 도메인 상태를 시각 노드에 동기화
  - 플레이어 X축 이동
  - 자동 탐지 피드백
  - 자동 공격 VFX
  - 시간 기반 탈출 완료 통지
- `BattleCombatVfx.ts`
  - 자폭드론 무리와 충돌 효과
  - 자동 탐지와 흡수 지역 효과
- Editor 씬
  - 흡수 지역, 지상 목표, 투사체 풀을 담을 고정 Root만 제공
  - 실제 생성 수와 게임 상태는 TypeScript가 소유

### 11.3 React와 캠페인 셸

- `BattleScreen.tsx`
  - Hull, Shield, Energy, Cargo, Alert, 생존 타이머 HUD
  - 흡수, EMP, Plasma, Overdrive 버튼
  - 조건부 탈출 버튼
  - 목표 및 자동 탐지 정보
- `GameApp.tsx`
  - 미션 편성, 이동, 전투, 디브리핑, 배분, 업그레이드 화면 상태 복구
  - 저장 복구 시 `plannedMission`, `activeTransit`, `pendingDebrief` 우선 처리
- 원본 기반 복구 화면
  - `MissionLoadoutScreen`
  - `DebriefScreen`
  - `DebriefAllocationScreen`
  - `UpgradeScreen`

### 11.4 저장 호환성

- 기존 v4 저장을 읽을 수 있어야 한다.
- 기존 River/Desert 흡수 대상 ID를 새 지역 ID로 직접 재사용하지 않는다.
- 구형 대상 진행도를 보존할 수 없으면 명시적 마이그레이션 버전과 보상 정책을 둔다.
- 생성 프로필 버전을 저장해 패치 후 기존 진행도가 재배치되지 않게 한다.
- 진행 중 전투 저장은 1차 범위에서 제외할 수 있지만 출격 전·전투 후 상태는 원자적으로 저장한다.

## 12. 구현 단계

### G0 — 기준선과 회귀 테스트 복구

작업:

- 현재 전투 진입 경로와 저장 상태를 고정한다.
- 원본 `domain.test.ts`에서 렌더링 비의존 테스트를 현재 프로젝트로 이식한다.
- 기존 위치 기반 탈출 테스트와 새 시간 기반 탈출 테스트를 분리한다.
- 현재 회색상자 단축키와 실제 플레이 입력을 구분한다.

완료 조건:

- 기존 저장·월드 데이터 테스트 통과
- 이식한 캠페인·전투 규칙 테스트 통과
- 디버그 단축키가 실제 게임 결과를 우발적으로 변경하지 않음

### G1 — 2D 게임플레이 계약과 결정적 지역 생성

작업:

- `BattleGameplayProfile` 정의
- Coastal 기본 프로필 작성
- 결정적 흡수 지역 생성기 구현
- 초기 화면, 좌측, 우측 최소 지역 보장
- 안정적인 지역 ID와 저장 매핑 구현

완료 조건:

- 같은 시드와 미션은 같은 배치를 생성
- 다른 방문 횟수는 유효한 다른 배치를 생성
- 모든 지역이 이동·흡수 가능 범위 안에 존재
- 생성 결과에 중복 ID와 과도한 겹침이 없음

### G2 — 이동, 자동 SCAN, 흡수 루프

작업:

- 모선 X 좌표와 도메인 판정 좌표 통일
- 접근 자동 탐지
- 지역 강조와 화면 밖 방향 표시
- 가장 가까운 지역 자동 선택
- 기존 빔 열·화물·에너지·보상 규칙 연결
- 흡수 시작·중단 버튼과 키보드·모바일 입력 구현

완료 조건:

- 초기 화면과 화면 밖 지역을 이동해 모두 발견 가능
- 지역 위에서만 흡수 가능
- 지역 잔량과 화물칸이 유한함
- 과열, 이동 이탈, 화물 가득 참, 대상 고갈 시 정확히 중단

### G3 — 자동 공중전과 능력 버튼

작업:

- 기존 적 웨이브와 자동 방공 레이저 검증
- EMP, Plasma 자동 목표 선택기 구현
- Overdrive 즉시 발동 연결
- 버튼 상태와 실패 이유 표시
- 공중 적, 미사일, 모선 피격 VFX 동기화

완료 조건:

- 적 공격과 자동 방공 레이저가 실제 도메인 피해를 발생
- EMP와 Plasma가 유효 목표가 있을 때만 자원을 소비
- Overdrive가 도메인 피해 감소에 반영
- 쿨다운과 Overcharge Cell이 중복 소비되지 않음

### G4 — 자동 지상 자폭드론 공격

작업:

- 지상 목표 우선순위 구현
- 투사체 무리 상태, 선회, 충돌, 피해 구현
- Babylon 투사체 풀과 트레일·폭발 VFX 구현
- 화면 밖 투사체 정리와 최대 개수 제한

완료 조건:

- 지상 적이 실제로 피해를 받고 파괴됨
- 투사체가 직선이 아닌 선회 궤적으로 목표에 도달
- 목표가 사라져도 오류나 영구 투사체가 남지 않음
- 장시간 전투에서 투사체 수와 메모리가 제한됨

### G5 — 생존 시간, 탈출, 대파, 수리비

작업:

- 시간 기반 탈출 상태 구현
- 생존 타이머와 조건부 탈출 버튼 구현
- 이탈 준비 중 공격과 실패 처리
- SUCCESS, PARTIAL, FAILED 결과 판정
- 수리비 평가와 소프트락 방지 구현

완료 조건:

- 최소 생존 시간 전에는 탈출 불가
- 최소 생존 시간 이후 버튼으로 탈출 가능
- 이탈 준비 중 모선이 파괴되면 FAILED
- 무흡수 대기는 SUCCESS가 되지 않음
- 자원 부족 상태에서도 캠페인 진행 가능

### G6 — 코호트 AI와 점령

작업:

- 출격 전 코호트 편성 복구
- 자동 투입, 진격, 공격, 점령, 후퇴 정책 구현
- RAID 회수와 OCCUPATION 주둔 후보 판정 구현
- 디브리핑 주둔 선택 연결

완료 조건:

- 편성하지 않은 코호트는 전투에 등장하지 않음
- 코호트 손실과 경험치가 저장됨
- RAID에서는 자동 회수 판정이 적용됨
- OCCUPATION은 방어 제거와 필수 지점 확보 없이는 성공하지 않음
- 주둔 코호트가 도시와 중복 연결되지 않음

### G7 — River / Desert 2D 맵과 프로필

작업:

- River 2D 레이어 패키지 제작 및 manifest 등록
- Desert 2D 레이어 패키지 제작 및 manifest 등록
- 각 맵의 게임플레이 프로필 작성
- 도시의 전술 프리셋 ID를 시각 맵 ID와 게임플레이 프로필 ID로 분리

완료 조건:

- 세 맵 모두 동일 공통 씬에서 로드
- 3D 도시 건물과 도로 Nav 없이 동작
- 각 맵의 자원 구성과 적 압력이 수치상 구별됨
- 맵 재진입과 맵 전환 후 이전 에셋과 상태가 남지 않음

### G8 — 캠페인 전체 루프 복구

작업:

- 미션 편성 화면 복구
- 이동 시뮬레이션 복구
- `stageMissionResult` 기반 종료 처리
- 디브리핑·포로 배분·주둔 복구
- 업그레이드 화면 복구
- 이어하기 상태 복구

완료 조건:

```text
새 캠페인
→ 도시 선택
→ 미션 편성
→ 이동
→ 전투
→ 탈출 또는 실패
→ 디브리핑
→ 배분
→ 업그레이드
→ 저장
→ 새로고침 후 이어하기
```

위 전체 흐름이 중단 없이 동작한다.

### G9 — 모바일, 성능, 밸런스, 최종 QA

작업:

- 모바일 가로 화면 버튼과 이동 입력
- 자동 탐지·능력·탈출 접근성
- 전투 장시간 soak와 반복 진입
- 지역 수, 생존 시간, 적 압력, 수리비 튜닝
- 낮·밤·River·Desert 전환 검증

완료 조건:

- 모바일 가로 화면에서 모든 필수 조작 가능
- 10분 soak에서 적·투사체·VFX 수가 상한 유지
- 5회 이상 반복 진입 후 Canvas와 이벤트 리스너 중복 없음
- 주요 게임 상태를 텍스트 직렬화로 검증 가능
- 콘솔 오류와 필수 에셋 404 없음

## 13. 테스트 전략

### 13.1 단위 테스트

- 결정적 지역 생성
- 지역 간 최소 간격과 맵 경계
- 자동 탐지 범위
- 자동 목표 선택 우선순위
- 흡수량·화물·열·에너지 불변식
- 시간 기반 탈출 전이
- 결과 판정
- 수리비 상한과 소프트락 방지
- 자폭드론 재탐색·충돌·정리
- 코호트 AI 전이와 회수
- River/Desert 프로필 차별화

### 13.2 런타임 통합 테스트

- 도메인 투사체와 Babylon VFX ID 동기화
- 화면 밖 흡수 지역 방향 표시
- 능력 버튼의 성공·실패 피드백
- 이탈 준비 중 피격과 실패
- 씬 dispose 후 이벤트·투사체·타이머 정리

### 13.3 E2E 테스트

- 새 캠페인부터 첫 RAID 완료
- 자동 SCAN 후 화면 밖 지역 이동과 흡수
- 생존 시간 전 탈출 버튼 비노출
- 생존 시간 후 탈출 성공
- 모선 대파 후 수리비 적용
- EMP, Plasma, Overdrive 사용
- 코호트 편성 후 자동 전투와 회수
- OCCUPATION과 주둔 확정
- 업그레이드 구매와 다음 전투 반영
- 저장 후 각 중간 상태 이어하기

## 14. 초기 밸런스 설정값

다음 값은 코드에 하드코딩하지 않고 프로필 또는 `BALANCE`에서 조정한다.

| 설정 | 초기 권장 범위 | 확정 시점 |
|---|---:|---|
| 흡수 지역 수 | 4~7 | G1 플레이테스트 |
| 지역 최소 간격 | 화면 폭의 25~40% | G1 |
| 자동 SCAN 거리 | 화면 폭의 20~30% | G2 |
| 최소 생존 시간 | 60~120초 | G5 |
| 이탈 준비 시간 | 2~4초 | G5 |
| 자폭드론 한 묶음 | 3~6발 | G4 |
| 지상 공격 쿨다운 | 3~7초 | G4 |
| 기본 수리비 상한 | 보유 자원의 25~50% | G5 |
| RAID 성공 흡수량 | 화물칸의 50~75% | G5 |

## 15. 명시적 제외 범위

- 기존 3D 도시 건물 이식
- 도로 기반 Nav 또는 NavMesh
- 지면 클릭식 자유 X/Z 이동
- 전투 중 코호트 수동 마이크로 조작
- 기존 모서리 좌표 기반 탈출 구역
- 매 프레임 비결정적으로 생성되는 흡수 대상
- 배경 이미지에 게임 판정 데이터를 직접 결합하는 구조

## 16. 주요 위험과 방지책

| 위험 | 방지책 |
|---|---|
| 재로드로 좋은 지역 배치를 다시 뽑음 | 결정적 시드와 프로필 버전 저장 |
| River/Desert가 배경만 다르고 플레이는 동일 | 독립 Gameplay Profile과 수치 테스트 |
| 자동 전투가 플레이어에게 불투명함 | 목표선, 발사 상태, 피해 피드백, HUD 로그 제공 |
| 생존만 하고 아무것도 하지 않는 전략 | SUCCESS에 흡수 또는 점령 목표 요구 |
| 실패 수리비로 캠페인 소프트락 | 비용 상한과 긴급 수리 |
| 자동 코호트가 잘못된 목표에 고착 | 목표 유효성 재검사와 제한 시간 재탐색 |
| 투사체와 VFX가 누적됨 | 상태 ID, 개수 상한, 풀링, dispose 테스트 |
| 기존 저장 대상 ID 충돌 | 저장 마이그레이션과 프로필 버전 분리 |

## 17. 최종 완료 기준

다음 조건을 모두 만족하면 2D 배틀 게임플레이 이식을 완료로 본다.

- 3D 도시 오브젝트 없이 Coastal, River, Desert 전투가 동작한다.
- 흡수 지역은 전체 맵에 결정적으로 배치되고 접근 시 자동 탐지된다.
- 플레이어는 이동, 흡수, EMP, Plasma, Overdrive, 탈출을 사용할 수 있다.
- 공중 방공 레이저와 지상 자폭드론 공격이 자동으로 실제 피해를 준다.
- 생존 시간 전에는 탈출할 수 없고 이후 버튼으로 탈출할 수 있다.
- 모선 대파 시 실패와 수리비가 캠페인에 반영된다.
- 코호트는 출격 전 편성되고 전투 중 AI가 운용한다.
- RAID, OCCUPATION, 주둔, 포로 변환, 업그레이드가 전투 전후로 연결된다.
- 저장과 이어하기가 미션 편성, 이동, 디브리핑 상태를 보존한다.
- 단위·통합·E2E·장시간 테스트가 통과한다.
