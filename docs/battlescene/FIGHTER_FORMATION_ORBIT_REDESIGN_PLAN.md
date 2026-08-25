# 전투기 편대 3축 원운동 및 전투 연출 개선 개발계획

## 1. 문서 목적

현재 전투기 편대가 우주선 아래쪽에서 좌우로 이동하는 것처럼 보이는 문제를 개선한다.

최종 목표는 전투기들이 우주선을 중심으로 서로 다른 반경·각도·속도·고도를 가진 자연스러운 원운동을 수행하고, 측면 카메라에서도 편대 전체가 읽히는 것이다.

이 계획은 다음 기존 문서를 구현 단계로 확장한다.

- [전투기 편대·제트분사·꼬리연기 이식 분석서](/Users/switch/Development/game/webgame/TheyCallItEarth/docs/FIGHTER_COMBAT_VISUAL_TRANSFER_GUIDE.md)

## 2. 현재 문제와 원인

현재 전투 규칙은 이미 편대 단위 생성과 steering 기반 궤도 이동을 사용한다.

- 편대별 `squadId`, `formationSlot`, `orbitDirection`, `orbitRadius`, `orbitPhase`가 존재한다.
- `flyFighterFormation()`이 목표 위치를 계산하고 속도·가속도 제한으로 이동시킨다.
- `heading`은 velocity에서 계산되고 `bank`는 실제 선회율을 따라간다.

하지만 측면 화면 표현에서 다음 문제가 발생한다.

1. 전투기 고도가 `fighterAltitude = 24` 주변에 고정되어 우주선 아래쪽에 모인다.
2. 원래 quarter-view용 `z` 좌표가 화면 깊이로만 축소되어 원운동이 좌우 이동처럼 보인다.
3. 편대 슬롯의 `trailing = -row * 4`와 `fighterAttackRunDepth = 5.5`가 측면 카메라 기준으로 재튜닝되지 않았다.
4. 전투기 미사일은 전투기 상태 위치에서 생성되므로 시각적인 노즐 위치와 발사점이 어긋날 수 있다.
5. TrailMesh와 smoke는 본체의 시각 depth와 별도로 과거 위치를 유지할 수 있다.

주요 현재 구현 위치:

- 전투기 생성/비행: `src/game/domain/combatRules.ts`
- 전투기 밸런스: `src/game/domain/balance.ts`
- 전투기 화면 투영 및 VFX: `src/game/battle/runtime/BattleEntityVisuals.ts`
- 전투기 미사일 VFX: `src/game/battle/runtime/BattleCombatVfx.ts`
- 전투 런타임 연결: `src/game/battle/runtime/createBattleRuntime.ts`

## 3. 설계 원칙

### 3.1 프레임별 완전 랜덤 금지

매 프레임 새 랜덤값을 생성하지 않는다. 그러면 전투기가 떨리고, 편대가 분해되며, 재현 가능한 테스트가 불가능해진다.

대신 `campaign seed + squadId + formationSlot`을 기반으로 편대 생성 시 한 번만 변형값을 결정한다.

```text
fighterSeed = hash(campaignSeed, squadId, formationSlot)
```

동일한 전투를 다시 실행하면 같은 편대 모양과 같은 궤도 변형이 재현되어야 한다.

### 3.2 도메인 좌표와 화면 좌표 분리

전투 판정은 기존 `x/z` 좌표를 유지한다. 화면 표현에서만 다음 축으로 변환한다.

```text
screen axis  = 화면 좌우
altitude axis = 화면 상하
camera depth = 화면 앞/뒤 및 가림 계산
```

실제 공격 판정·체력·미사일 생성은 원래 CombatState를 사용하고, 가림 보정은 시각 위치에만 적용한다.

### 3.3 steering 기반 이동 유지

원운동 목표점을 매 프레임 계산하되, 전투기를 목표 위치로 순간이동시키지 않는다.

```text
desiredPosition
  → desiredVelocity
  → max steering
  → velocity 적분
  → position 갱신
```

## 4. 목표 동작

전투기 편대는 다음 흐름을 반복한다.

```text
우주선 위쪽 통과
  → 우측 선회
  → 아래쪽 공격 접근
  → 좌측 선회
  → 우주선 위쪽 복귀
```

편대 전체는 같은 원운동 계열을 유지하지만 개별 기체에는 다음 변형을 준다.

- 서로 다른 시작 각도
- 서로 다른 궤도 반경
- 서로 다른 각속도
- 서로 다른 고도 진폭
- 작은 타원 편심
- 슬롯별 phase 지연
- 공격 run 시작 지연

## 5. 데이터 모델 변경

### 5.1 EnemyState 확장

현재 `EnemyState`의 편대 필드에 아래 변형값을 추가한다.

```ts
interface EnemyState {
  // existing
  squadId: number;
  formationSlot: number;
  orbitDirection: -1 | 1;
  orbitRadius: number;
  orbitPhase: number;

  // new
  orbitAngularSpeed: number;
  orbitEccentricity: number;
  orbitVerticalAmplitude: number;
  orbitDepthAmplitude: number;
  orbitWobblePhase: number;
  attackRunPhase: number;
  attackRunStrength: number;
}
```

기체별 값을 저장하는 이유는 각 프레임의 랜덤 흔들림을 막고, 편대 이동을 재현 가능하게 유지하기 위해서다.

### 5.2 결정적 변형값 범위

초기 튜닝값은 아래 범위에서 시작한다.

| 항목 | 초기 범위 | 목적 |
|---|---:|---|
| `orbitRadius` | 16 ~ 28 | 우주선 주변 원 크기 다양화 |
| `orbitPhase` | 0 ~ 2π | 시작 각도 분산 |
| `orbitAngularSpeed` | 0.25 ~ 0.65 rad/s | 선회 속도 다양화 |
| `orbitEccentricity` | 0.05 ~ 0.22 | 완전한 원이 아닌 타원감 |
| `orbitVerticalAmplitude` | 3 ~ 8 | 우주선 위/아래 고도 변화 |
| `orbitDepthAmplitude` | 0.4 ~ 1.2 | 측면 깊이 변화 |
| `orbitWobblePhase` | 0 ~ 2π | 기체별 미세 궤도 차이 |
| `attackRunPhase` | 0 ~ 1.5초 | 동시 공격 방지 |

## 6. 3축 원운동 목표점 계산

### 6.1 기본 궤도

각 기체의 현재 궤도각은 다음과 같이 계산한다.

```text
angle = orbitPhase + elapsedSeconds * orbitAngularSpeed * orbitDirection
```

타원 편심과 완만한 wobble을 포함한 반경:

```text
radius = orbitRadius
       * (1 + orbitEccentricity * cos(angle + orbitWobblePhase))
```

### 6.2 화면 좌우 좌표

```text
screenX = mothership.x
        + cos(angle) * radius
        + formationScreenOffset
```

`formationScreenOffset`는 편대 슬롯 간 최소 간격만 담당한다. 큰 trailing 값을 화면 깊이로 보내지 않는다.

### 6.3 고도 좌표

현재 고정된 `fighterAltitude = 24` 대신 모선 기준 고도를 사용한다.

```text
altitude = mothership.baseAltitude
         + sin(angle + verticalPhase) * orbitVerticalAmplitude
         + formationAltitudeOffset
```

이렇게 하면 일부 기체가 우주선 위쪽을 통과하고, 일부는 아래쪽으로 내려와 공격 접근을 수행한다.

### 6.4 카메라 깊이

```text
depth = sin(angle + depthPhase) * orbitDepthAmplitude
```

깊이는 화면의 앞/뒤를 표현하는 값으로만 사용한다. 편대 전체가 같은 깊이에 머물지 않도록 기체별 `depthPhase`를 분산한다.

## 7. 편대 슬롯 배치

완전한 랜덤 궤도를 주면 편대가 흩어지므로 공통 궤도와 슬롯 변형을 분리한다.

### 공통 값

- `squadId`별 orbit center
- `squadId`별 orbit direction
- `squadId`별 base radius
- `squadId`별 angular speed 범위

### 슬롯별 값

- phase 지연
- 작은 radius jitter
- 화면 좌우 offset
- 고도 offset
- 공격 순서

권장 phase 분포:

```text
slot 0: basePhase + 0.00
slot 1: basePhase + 0.45
slot 2: basePhase + 0.90
slot 3: basePhase + 1.35
```

5~6대 편대에서는 같은 규칙을 이어서 적용하되, 반대 방향의 작은 jitter를 추가한다.

## 8. 자연스러운 공격 run

현재 모든 기체가 같은 시점에 비슷한 반경으로 접근하지 않도록 공격 run을 분산한다.

### 역할 순서

```text
slot 0: 우측 접근
slot 1: 위쪽 접근
slot 2: 좌측 접근
slot 3: 아래쪽 접근
```

### 공격 run 중 변화

```text
desiredRadius 감소
verticalAmplitude 소폭 증가
orbitAngularSpeed 소폭 증가
attackRunPhase 적용
```

공격 run이 끝나면 원래 `orbitRadius`와 고도 중심으로 부드럽게 복귀한다.

## 9. heading과 bank

현재 velocity 기반 `heading`과 실제 선회율 기반 `bank` 계산은 유지한다.

다만 측면 카메라 표현에서는 별도 visual scale을 둔다.

```text
visualBank = bank * sideViewBankScale
```

초기 `sideViewBankScale`은 0.18~0.28에서 시작하고, 편대가 과도하게 기울어지면 낮춘다.

## 10. 미사일 발사점 정렬

### 문제

현재 전투기 미사일의 실제 판정 시작점과 화면에서 보이는 전투기 노즐 위치가 다를 수 있다.

### 설계

전투기별 시각 노즐 위치를 계산한다.

```text
muzzle = fighterVisualPosition
       - normalize(screenVelocity) * muzzleOffset
```

미사일에는 다음 두 좌표를 분리해 둔다.

- `simulationOrigin`: 실제 전투 판정용 EnemyState 위치
- `visualOrigin`: 화면에 표시할 노즐 위치

미사일 이동·충돌은 `simulationOrigin` 계약을 유지하고, VFX의 시작점만 `visualOrigin`으로 연결한다.

## 11. 측면 카메라 depth guard

### 값

전투기별로 다음 상태를 관리한다.

```text
maxHiddenDepth
hiddenGraceSeconds
hiddenElapsed
depthClamped
```

### 동작

1. 실제 전투기 위치를 카메라 기준 depth로 변환한다.
2. 우주선 뒤쪽이고 허용 깊이를 넘었는지 검사한다.
3. `hiddenGraceSeconds` 동안은 원래 위치를 유지한다.
4. grace 이후에는 시각 depth만 `maxHiddenDepth` 안쪽으로 clamp한다.
5. TrailMesh의 과거 vertex와 smoke puff에도 같은 제한을 적용한다.
6. 실제 전투 판정과 EnemyState 위치는 변경하지 않는다.

현재 구현된 단순 depth guard는 다음 단계에서 궤도 목표점 계산과 통합한다. 목표점 자체가 우주선 뒤쪽으로 과도하게 생성되지 않게 만들어 시각 clamp 의존도를 낮춘다.

## 12. Trail과 smoke 전역 예산

현재 전투기별 smoke budget은 존재하지만 편대 전체 예산과 trail history 제한을 추가한다.

### 권장 예산

```text
MAX_FIGHTER_TRAIL_HISTORY = 14 segments per fighter
MAX_FIGHTER_SMOKE_PER_FIGHTER = 10
MAX_FIGHTER_SMOKE_TOTAL = 120
MAX_FIGHTER_EXPLOSIONS = 6
```

### 정리 우선순위

1. 우주선 뒤쪽 depth를 초과한 trail vertex
2. `hiddenGraceSeconds`를 초과한 smoke puff
3. 수명이 끝난 puff와 explosion
4. 총량 초과 시 가장 오래된 효과

편대 20대가 동시에 존재해도 mesh가 무한히 증가하지 않아야 한다.

## 13. 구현 단계

### F0. 기준선 고정

- 현재 전투기 78초 visual-sync 결과 보존
- 기존 `EnemyState` ID/slot/position 검증 유지
- 현재 미사일 피해 및 방공 동작 회귀 기준 확보

### F1. 결정적 궤도 파라미터

- `EnemyState` 확장
- seed 기반 변형값 생성기 추가
- 기존 편대 슬롯과 저장/복제 호환성 확인

### F2. 3축 궤도 목표점

- `flyFighterFormation()`을 3축 목표점 계산으로 전환
- 고도 중심을 `mothership.baseAltitude` 기준으로 변경
- radius/eccentricity/phase/speed 변형 적용
- steering과 가속도 제한은 유지

### F3. 공격 run 분산

- 기체별 attack phase 추가
- 접근 방향을 슬롯별로 분산
- 공격 후 원래 orbit으로 복귀

### F4. 미사일 visual origin

- 전투기 노즐 위치 계산
- 미사일 상태의 simulation/visual origin 분리
- `BattleCombatVfx`에서 visual origin 사용

### F5. depth와 VFX 통합

- 본체 depth guard와 trail/smoke depth guard 통합
- 전역 smoke/trail/explosion budget 추가
- disabled 상태에서 engine VFX 정지 유지

### F6. 검증 및 튜닝

- 편대 4/5/6대 시나리오
- 우주선 좌우 이동 중 편대 유지
- 우주선 앞/뒤 통과 장면 캡처
- 공격 run과 미사일 시작점 확인
- 장시간 mesh 증가·정리 확인

## 14. 검증 계획

### 상태 검증

- 같은 seed에서 같은 squad/slot 변형 재현
- 편대별 `formationSlot` 중복 없음
- 기체별 radius와 phase가 모두 같지 않음
- `bank`가 선회 시 0이 아닌 값을 가짐
- 고도가 우주선 위·아래 양쪽으로 분포
- 공격 run이 슬롯별로 시간 분산

### 시각 검증

최소한 다음 장면을 캡처한다.

1. 우주선 위쪽을 통과하는 편대
2. 우주선 우측·좌측을 도는 편대
3. 우주선 아래쪽으로 공격 접근하는 기체
4. 우주선 뒤쪽을 짧게 통과하는 기체
5. grace 시간을 넘긴 뒤 depth가 clamp된 기체
6. 선회 중 bank와 제트분사 방향 변화
7. 미사일이 노즐에서 시작하는 장면
8. disabled 상태에서 분사·연기가 꺼진 장면
9. 피격 flash와 폭발 장면

### 자동화 기준

기존 `scripts/verify-side-view-visual-sync.mjs`에 다음 검사를 추가한다.

- enemy ID와 visual ID 일치
- 실제 x/y/z 위치와 시각 위치 차이 허용범위 검증
- bank 값 생성 여부
- `depthClamped` 이후 depth 상한 유지
- 하나 이상의 `trailVisible` 확인
- smoke puff 수가 전역 예산을 넘지 않음
- visual fighter 수가 enemy 수와 일치
- 콘솔 오류 0건

## 15. 완료 기준

- 전투기 편대가 우주선 아래쪽 좌우 이동처럼 보이지 않는다.
- 전투기들이 우주선 주변의 서로 다른 크기·각도의 궤도를 자연스럽게 반복한다.
- 일부 기체는 우주선 위, 일부는 아래, 일부는 좌우를 통과한다.
- 편대가 흩어지지 않고 슬롯 간격을 유지한다.
- 공격 run이 기체별로 순차 발생한다.
- 미사일이 전투기 노즐에서 발사되는 것처럼 보인다.
- Trail/smoke가 본체와 같은 depth 규칙을 따른다.
- 편대 20대에서도 효과 mesh가 무한히 증가하지 않는다.
- 기존 전투기 ID·피해·미사일·방공 회귀 테스트가 통과한다.
- TypeScript, Vitest, visual-sync, 브라우저 화면 검수가 모두 통과한다.

## 16. 남은 리스크

- 측면 카메라 전용 전투기 아틀라스가 없으면 기존 top-down 4×2 자산이 화면 방향과 완전히 일치하지 않을 수 있다.
- 실제 모선 모델의 화면 depth와 fighter depth 기준은 카메라/스케일 튜닝 후 최종 확정해야 한다.
- `TrailMesh`의 과거 vertex를 정밀하게 depth clipping하려면 Babylon 커스텀 ribbon 또는 짧은 particle chain으로 교체할 수 있다.
- 랜덤성은 시각적 변형에만 사용하고, 전투 판정·미사일 충돌·피해 결과에는 결정적 seed와 기존 CombatState 계약을 유지해야 한다.
