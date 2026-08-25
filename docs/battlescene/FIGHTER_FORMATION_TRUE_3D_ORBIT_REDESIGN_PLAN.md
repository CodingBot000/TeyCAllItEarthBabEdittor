# 전투기 편대 실제 3D 궤도 및 모선 안전거리 재설계 개발계획

작성일: 2026-08-26
상태: 구현 완료, 1차 브라우저·10분 soak 검증 통과

## 1. 문서 목적

현재 전투기 편대는 `x/z` 평면 원운동과 별도 고도 사인파를 사용하지만, 화면에서는 깊이를 축소하고 제한한다. 이 때문에 전투기가 모선 가까이 붙어 회전하고, 공격 접근과 steering 오버슈트 중 모선 모델을 관통해 보인다.

이 문서는 전투기 이동을 모선과 동일한 실제 3D 공간 기준으로 재구성하고 다음 결과를 달성하기 위한 구현 계획이다.

- 전투기가 모선의 실제 외곽을 절대로 통과하지 않는다.
- 전투기가 모선에서 충분히 떨어진 `34~46` 유닛 거리의 전투 궤도를 사용한다.
- 공격 중에도 최소 안전 반경 `30`을 유지한다.
- 전투기가 모선의 앞·뒤·위·아래를 실제 3D 좌표로 선회한다.
- 모선 뒤쪽 전투기는 실제 깊이 판정에 따라 모선에 자연스럽게 가려진다.
- 전투기 본체, 미사일, 노즐, TrailMesh, 연기가 같은 월드 좌표 계약을 사용한다.

기존 문서 [FIGHTER_FORMATION_ORBIT_REDESIGN_PLAN.md](./FIGHTER_FORMATION_ORBIT_REDESIGN_PLAN.md)는 이전 구현의 설계·이력으로 보존한다. 본 문서는 해당 구현에서 확인된 모선 관통과 근접 선회 문제를 교정하는 V2 계획이다.

## 2. 현재 구현 진단

### 2.1 현재는 완전한 3D 궤도가 아니다

현재 `EnemyState`는 다음처럼 구성된다.

```ts
interface EnemyState {
  position: Vec2; // x, z
  velocity: Vec2; // x, z
  altitude: number;
}
```

따라서 값은 세 축을 표현하지만 이동 적분은 `x/z` 평면에서 수행하고, `altitude`만 별도로 목표값을 따라간다.

```text
x/z       = 평면 원운동 + steering
altitude  = 별도 사인파 보간
```

이는 3축 데이터를 가진 2.5D 이동이며, 모선의 실제 3D 외곽과 같은 좌표계에서 충돌을 회피하는 구조는 아니다.

### 2.2 렌더링에서 깊이가 다시 축소된다

현재 전투기 렌더링은 다음 변환을 사용한다.

```text
visualX = enemy.position.x
visualY = mothershipWorldY + (enemy.altitude - baseAltitude) * 0.22
visualZ = enemy.position.z * 0.12
```

`z`가 `0.12`로 축소되므로 도메인에서 앞·뒤로 충분히 이동하더라도 화면에서는 모선과 거의 같은 깊이에 붙어 보인다. 일정 시간 뒤에는 `FIGHTER_MAX_HIDDEN_DEPTH`로 강제 제한되어 실제 깊이 관계도 사라진다.

### 2.3 현재 반경은 실제 모선보다 충분히 크지 않다

모선 외곽 트림의 원본 반경과 현재 스케일은 다음과 같다.

```text
원본 외곽 반경       = 14.6 / 2 = 7.3
Editor X/Z 스케일    = 1.55
런타임 추가 스케일   = 1.5
실제 외곽 반경       = 7.3 * 1.55 * 1.5 ≈ 16.97
```

현재 전투기 값은 다음과 같다.

```text
기본 궤도 반경       = 19
공격 접근 감소량     = 최대 약 3.8
공격 중 중심 반경    = 약 15.2 + 편대/편심 보정
전투기 sprite 반폭   = 약 2.7
```

기본 선회에서도 실제 여유가 매우 작고, 공격 접근 시 전투기 중심이 모선 외곽 반경 안으로 들어갈 수 있다. 현재 현상은 렌더링 착시만이 아니라 수치상 가능한 관통이다.

### 2.4 충돌·공격 거리도 높이를 고려하지 않는다

현재 전투기와 모선의 거리는 `Vec2` 거리로 계산된다.

```text
distance2D = sqrt(dx² + dz²)
```

따라서 전투기가 모선보다 충분히 위나 아래에 있더라도 공격·흡수·방공 우선순위는 같은 평면 거리로 처리된다. 시각 위치와 게임 판정이 일치하지 않는다.

### 2.5 관통을 막는 안전 부피가 없다

현재 `desiredPosition`과 실제 적분 위치에는 다음 보호 장치가 없다.

- 모선 외곽 안전 타원체
- 이전 위치에서 다음 위치까지의 swept 교차 검사
- 모선 방향 속도 제거
- steering 오버슈트 후 위치 보정

궤도 목표점이 안전하더라도 높은 속도나 큰 `dt`에서 모선 내부를 통과할 수 있다.

## 3. 목표와 비목표

### 3.1 목표

- 전투기 상태를 실제 3D 위치·속도로 통일한다.
- 모선 중심 기준의 결정적 3D 궤도 셸을 만든다.
- 모든 상태에서 모선 keep-out 타원체를 침범하지 않는다.
- 일반 선회는 모선 중심에서 `34~46` 거리로 유지한다.
- 공격은 최소 `30` 거리의 접선형 pass로 수행한다.
- 모선 이동 중 궤도 중심이 자연스럽게 추적된다.
- 동일 seed에서 동일 궤도와 공격 순서를 재현한다.
- 현재 전투기 아틀라스, 제트분사, 꼬리연기, 피격·폭발 효과는 유지한다.

### 3.2 비목표

- 전투기 sprite를 3D 모델로 교체하지 않는다.
- 모선 자체의 이동·충돌 모델을 다시 설계하지 않는다.
- 전투기 무기 피해량과 스폰 수를 크게 변경하지 않는다.
- 배경 패럴랙스와 지상 유닛 좌표계를 변경하지 않는다.

## 4. 핵심 설계 원칙

### 4.1 논리 좌표와 시각 좌표의 상대 오프셋을 동일하게 유지한다

도메인 모선 중심은 다음으로 정의한다.

```text
mothershipCombatCenter = {
  x: state.mothership.position.x,
  y: BALANCE.mothership.baseAltitude,
  z: state.mothership.position.z
}
```

렌더링에서는 하드코딩된 월드 Y를 사용하지 않고 `MothershipGameplayRoot.getAbsolutePosition()`을 기준으로 상대 오프셋을 적용한다.

```text
relative = fighter.position3D - mothershipCombatCenter
fighterWorld = mothershipGameplayRoot.absolutePosition + relative
```

이 계약을 사용하면 씬에서 모선 루트 Y가 변경되어도 전투기·미사일·VFX가 함께 이동한다.

### 4.2 프레임별 랜덤값을 생성하지 않는다

궤도 반경, 궤도면 기울기, 시작 phase, 회전 방향, 공격 순서는 생성 시 한 번 결정해 `EnemyState`에 저장한다.

```text
fighterSeed = hash(combatSeed, squadId, formationSlot)
```

### 4.3 모선 안전 부피가 궤도보다 우선한다

궤도 목표점, steering, 공격 pass보다 keep-out 판정을 우선한다. 어떤 이동 결과도 안전 부피 안에 남을 수 없다.

### 4.4 공격은 반경 축소가 아니라 접선형 통과로 표현한다

현재처럼 모선 중심을 향해 반경을 줄이지 않는다. 공격 상태에서는 외곽 궤도의 접선 방향을 따라 속도를 높이고, 사격 후 외곽 궤도로 복귀한다.

## 5. 데이터 모델 변경

### 5.1 Vec3 추가

```ts
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
```

### 5.2 EnemyState를 실제 3D 위치로 전환

```ts
export type FighterFlightMode = 'ORBIT' | 'ATTACK_PASS' | 'RECOVER';

export interface EnemyState {
  id: string;
  kind: 'fighter';

  position: Vec3;
  velocity: Vec3;

  heading: number;
  pitch: number;
  bank: number;

  squadId: number;
  formationSlot: number;
  orbitDirection: -1 | 1;

  orbitRadius: number;
  orbitVerticalRadius: number;
  orbitDepthRadius: number;
  orbitPlaneTilt: number;
  orbitPhase: number;
  orbitAngularSpeed: number;
  orbitEccentricity: number;
  orbitWobblePhase: number;

  flightMode: FighterFlightMode;
  attackRunPhase: number;
  attackRunStrength: number;
  attackRunElapsed: number;

  health: number;
  attackCooldown: number;
  disabledUntil: number;
  absorptionStatus: EnemyAbsorptionStatus;
}
```

기존 `position: Vec2 + altitude` 구조는 제거한다. `CombatState`의 적 전투기는 전투 중 생성되는 일시 상태이므로 저장 데이터 migration은 필요하지 않다.

### 5.3 공통 3D 도우미

다음 순수 함수를 추가한다.

```ts
fighterRelativePosition(enemy, mothership): Vec3
distance3D(a, b): number
length3D(value): number
normalize3D(value): Vec3
projectOutsideMothershipKeepOut(position, center, envelope): Vec3
segmentIntersectsMothershipKeepOut(previous, next, center, envelope): boolean
```

`Vec2` 기반 지상전 규칙과 혼합하지 않도록 전투기 전용 3D 함수로 분리한다.

## 6. 모선 안전 타원체

### 6.1 안전 반경 산정

전투기 중심이 지켜야 할 최소 안전 부피는 모선 외곽, 전투기 sprite 반폭, 시각 여유를 합쳐 계산한다.

```text
모선 실제 외곽 반경    ≈ 16.97
전투기 sprite 반폭     ≈ 2.70
최소 시각 여유          = 8.00
권장 X/Z 안전 반경      = ceil(27.67) = 28
```

Y축은 모선 상·하단, 전투기 반높이, 여유를 포함해 시작값 `9`를 사용한다.

```ts
fighterKeepOutRadiusX: 28,
fighterKeepOutRadiusY: 9,
fighterKeepOutRadiusZ: 28,
```

### 6.2 타원체 판정

모선 중심과 전투기 중심의 상대 위치를 다음과 같이 정규화한다.

```text
metric =
  (dx / keepOutRadiusX)²
  + (dy / keepOutRadiusY)²
  + (dz / keepOutRadiusZ)²
```

- `metric >= 1`: 안전
- `metric < 1`: 모선 안전 부피 침범

### 6.3 관통 방지 순서

매 시뮬레이션 스텝에서 다음 순서로 적용한다.

1. 궤도 또는 공격 pass 목표점을 계산한다.
2. 목표점이 keep-out 내부면 외곽 표면으로 투영한다.
3. 3D steering과 속도를 계산한다.
4. 이전 위치에서 다음 위치까지 swept segment를 검사한다.
5. 교차하면 충돌 직전 위치 또는 외곽 표면으로 보정한다.
6. 속도에서 모선 안쪽을 향하는 법선 성분을 제거한다.
7. 작은 접선 속도를 남겨 모선 표면을 따라 미끄러지듯 복귀시킨다.

이중 보정을 사용해 큰 `dt`, 높은 배속, 자동화 `advanceTime()`에서도 터널링을 막는다.

## 7. 원거리 실제 3D 궤도 셸

### 7.1 초기 밸런스 범위

| 항목 | 현재 | 재설계 시작값 |
|---|---:|---:|
| 일반 궤도 반경 | 19 | 34 ~ 46 |
| 공격 중 최소 반경 | 약 15.2 | 30 |
| X/Z keep-out 반경 | 없음 | 28 |
| 수직 궤도 반경 | 8 ~ 16 | 8 ~ 14 |
| 실제 깊이 반경 | 화면상 0.48 ~ 1.2 | 34 ~ 42 |
| 궤도 각속도 | 0.32 ~ 0.68 | 0.20 ~ 0.38 rad/s |
| 궤도면 기울기 | 없음 | 8° ~ 20° |

반경이 커지므로 기존 각속도를 유지하면 선속도가 과도하게 증가한다. 각속도를 낮추고 최고 속도와 가속도는 별도로 재튜닝한다.

### 7.2 3D 타원 궤도 계산

기체별 궤도각:

```text
theta = orbitPhase
      + elapsedSeconds * orbitAngularSpeed * orbitDirection
```

기체별 반경:

```text
radius = orbitRadius
       * (1 + orbitEccentricity * cos(theta + orbitWobblePhase))
```

모선 중심 기준 3D 로컬 목표점:

```text
localX = cos(theta) * radius
localZ = sin(theta) * orbitDepthRadius
localY = sin(theta + orbitPlaneTilt) * orbitVerticalRadius
```

`orbitPlaneTilt`은 이름과 달리 단순 화면 흔들림이 아니라 궤도면의 결정적 기울기를 만든다. 구현에서는 미리 계산한 직교 basis를 사용하는 형태로 확장할 수 있다.

```text
target = mothershipCombatCenter
       + orbitBasisU * cos(theta) * majorRadius
       + orbitBasisV * sin(theta) * minorRadius
       + orbitNormal * wobble
       + formationOffset3D
```

최종 목표점은 항상 keep-out 외부로 투영한다.

### 7.3 편대 슬롯

편대 전체는 같은 orbit family를 공유하되 각 기체는 다음 차이를 가진다.

- phase 간격 `0.42~0.58 rad`
- 반경 차이 `±2~4`
- 궤도면 기울기 차이 `±3°`
- 수직 오프셋 `±1.5~3`
- 공격 순서 지연 `0.35~0.6초`

formation offset을 적용한 뒤에도 중심 반경이 최소 공격 반경 아래로 내려가지 않게 한다.

## 8. 공격 pass 상태 머신

### 8.1 상태

```text
ORBIT
  → ATTACK_PASS
  → RECOVER
  → ORBIT
```

### 8.2 ORBIT

- 기본 반경 `34~46` 유지
- 편대 간격 유지
- 미사일 쿨다운과 공격 순서를 준비

### 8.3 ATTACK_PASS

- 모선 중심을 향해 직선 돌진하지 않는다.
- 현재 궤도의 접선 방향으로 속도를 높인다.
- 반경은 `max(baseRadius - attackOffset, 30)`으로 제한한다.
- 기체별로 앞·뒤·위·아래 공격 lane을 배정한다.
- 3D 거리 `30~52`에서 미사일을 발사한다.

권장 lane:

```text
slot 0: 카메라 앞쪽 + 우측 접선
slot 1: 모선 위쪽 + 후방 접선
slot 2: 카메라 뒤쪽 + 좌측 접선
slot 3: 모선 아래쪽 + 전방 접선
```

### 8.4 RECOVER

- 공격 lane에서 기본 궤도 반경으로 `1.2~2.0초` 동안 복귀한다.
- 반경 보간은 smoothstep을 사용한다.
- 복귀 중에도 keep-out과 swept segment 검사를 유지한다.

## 9. 3D steering과 자세

### 9.1 속도·가속도

현재 `x/z` steering을 `x/y/z` 벡터로 확장한다.

```text
desiredVelocity = mothershipVelocity3D
                + orbitTangent3D * orbitSpeed
                + (desiredPosition - currentPosition) * correctionGain

steer = clampLength(
  desiredVelocity - currentVelocity,
  fighterAcceleration * dt
)
```

### 9.2 heading, pitch, bank

```text
heading = atan2(velocity.x, velocity.z)
pitch   = atan2(velocity.y, hypot(velocity.x, velocity.z))
bank    = lateralTurnRate 기반 감쇠값
```

현재 2D 측면 아틀라스는 카메라를 계속 바라보게 유지하되 `heading`, `pitch`, `bank`로 다음을 선택한다.

- 좌/우 진행 frame
- 상승/하강 frame
- sprite roll
- 노즐과 제트 방향

## 10. 렌더링 좌표와 깊이

### 10.1 실제 월드 좌표 변환

기존 `FIGHTER_DEPTH_SCALE = 0.12`와 `FIGHTER_MAX_HIDDEN_DEPTH` 기반 clamp를 제거한다.

```text
mothershipWorldCenter = mothershipGameplayRoot.getAbsolutePosition()
combatRelative = fighter.position - mothershipCombatCenter
fighterWorldPosition = mothershipWorldCenter + combatRelative
```

X/Y/Z 상대 오프셋은 동일한 비율 `1:1:1`로 적용한다. 화면 구도상 수직 범위가 과하면 궤도 수직 반경을 조정하며, Y축만 렌더 단계에서 다시 축소하지 않는다.

### 10.2 앞·뒤 가림

- 모선과 전투기 본체는 같은 3D depth buffer를 사용한다.
- fighter sprite는 alpha-test/depth pre-pass 방식으로 불투명 픽셀만 depth에 참여시킨다.
- 모선 뒤쪽 전투기는 모선 메시가 먼저 기록한 depth에 의해 가려진다.
- Trail과 smoke는 투명 효과이므로 depth test는 사용하되 depth write는 하지 않는다.
- 수동 depth clamp로 전투기를 모선 평면에 끌어오지 않는다.

투명 sprite의 정렬 한계가 남는 경우에만 보조 판정을 사용한다.

```text
behindMothership
&& projectedInsideMothershipSilhouette
→ fighter body/trail/smoke visibility 보정
```

이 보조 판정은 위치를 변경하지 않고 표시 여부만 조정한다.

### 10.3 원근 크기

실제 Z를 사용하면 카메라 앞쪽 전투기는 조금 커지고 뒤쪽 전투기는 작아진다. 원근 차이가 과하면 다음 순서로 조정한다.

1. `orbitDepthRadius` 축소
2. 카메라 FOV 미세 조정
3. sprite 크기 보정 상한 적용

위치 Z 자체를 다시 압축하는 방식은 사용하지 않는다.

## 11. 미사일과 VFX 동기화

### 11.1 전투기 노즐

노즐 방향은 실제 3D 속도의 반대 방향으로 계산한다.

```text
nozzleWorld = fighterWorld
            - normalize(velocity3D) * nozzleOffset
```

### 11.2 전투기 미사일

- 시뮬레이션 시작점: `EnemyState.position: Vec3`
- 시각 시작점: 노즐의 실제 absolute position
- 목표점: 모선 gameplay root absolute position
- 이동·충돌 거리: 3D 거리

### 11.3 TrailMesh와 smoke

- 실제 3D 노즐을 generator로 사용한다.
- depth clamp 전환 시 trail을 reset하던 로직을 제거한다.
- keep-out 보정이 발생하면 직전 trail segment를 reset해 모선 내부를 가로지르는 선이 남지 않게 한다.
- smoke 전역 상한 `120`, 기체별 상한 `10`은 유지한다.
- 모선 뒤쪽 VFX는 depth test 또는 보조 가림 판정을 따른다.

## 12. 전투 판정 변경

### 12.1 공격 거리

전투기 공격 범위는 3D 거리로 변경한다.

```text
fighterMinAttackRange3D = 30
fighterAttackRange3D = 52
```

공격 최소 거리는 keep-out 반경보다 커야 한다.

### 12.2 방공 레이저

가장 가까운 전투기 선택도 3D 거리로 변경한다. 레이저 목표 높이는 별도 `altitude`가 아니라 전투기 `position.y`를 사용한다.

### 12.3 EMP, Plasma, 흡수

- 기존 지상·2D 목표 판정은 유지한다.
- 전투기 대상 판정에만 3D 거리 헬퍼를 사용한다.
- UI에 표시되는 거리와 실제 판정 거리의 기준을 일치시킨다.

## 13. 밸런스 초안

```ts
fighterOrbitRadiusMin: 34,
fighterOrbitRadiusMax: 46,
fighterOrbitDepthRadiusMin: 34,
fighterOrbitDepthRadiusMax: 42,
fighterOrbitVerticalRadiusMin: 8,
fighterOrbitVerticalRadiusMax: 14,
fighterOrbitPlaneTiltMin: degrees(8),
fighterOrbitPlaneTiltMax: degrees(20),
fighterOrbitAngularSpeedMin: 0.20,
fighterOrbitAngularSpeedMax: 0.38,

fighterKeepOutRadiusX: 28,
fighterKeepOutRadiusY: 9,
fighterKeepOutRadiusZ: 28,

fighterAttackPassRadiusMin: 30,
fighterAttackRange3D: 52,
fighterAttackPassSpeedMultiplier: 1.18,
fighterRecoverDurationMin: 1.2,
fighterRecoverDurationMax: 2.0,
```

이 값은 1차 시작점이다. 실제 화면에서 모선과 전투기 사이의 빈 공간, 카메라 원근, 전투기 sprite 크기를 확인한 뒤 한 항목씩 조정한다.

## 14. 구현 영향 파일

| 파일 | 변경 내용 |
|---|---|
| `src/game/domain/types.ts` | `Vec3`, 3D `EnemyState`, 비행 상태 추가 |
| `src/game/domain/balance.ts` | 원거리 궤도, keep-out, 3D 공격 범위 추가 |
| `src/game/domain/combatRules.ts` | 스폰, 3D 궤도, steering, swept keep-out, 공격 상태 머신 |
| `src/game/battle/gameplay/sideViewBattleRules.ts` | 전투기 대상 거리 계약 점검 |
| `src/game/battle/runtime/BattleEntityVisuals.ts` | 실제 월드 좌표, depth, 자세, VFX 동기화 |
| `src/game/battle/runtime/BattleCombatVfx.ts` | 전투기 미사일 3D 시작점·목표점 |
| `src/game/battle/runtime/createBattleRuntime.ts` | 스냅샷과 모선 world center 연결 |
| `src/game/battle/gameplay/sideViewBattleRules.test.ts` | 결정적 궤도와 최소 거리 테스트 |
| `scripts/verify-side-view-visual-sync.mjs` | 3D 위치·keep-out·가림 자동 검증 |

## 15. 구현 단계

### T0. 기준선과 관통 재현

- 현재 커밋에서 모선 관통 장면을 캡처한다.
- `render_game_to_text`에 현재 전투기 상대 거리와 depth를 기록한다.
- 기존 78초 visual-sync 결과를 회귀 기준으로 보존한다.
- 모선 외곽 반경과 현재 최소 전투기 거리의 차이를 자동 기록한다.

완료 조건:

- 현재 관통을 숫자와 화면으로 재현할 수 있다.
- 변경 전 전투기 ID, 피해, 미사일, VFX 기준이 저장된다.

### T1. 3D 도메인 좌표 도입

- `Vec3`와 3D 벡터 헬퍼를 추가한다.
- `EnemyState.position/velocity`를 `Vec3`로 변경한다.
- `altitude` 참조를 `position.y`로 이전한다.
- 상태 스냅샷에 `x/y/z`, `vx/vy/vz`를 노출한다.

완료 조건:

- 동일 seed에서 생성된 모든 3D 위치가 재현된다.
- 기존 TypeScript와 단위 테스트가 새 타입으로 통과한다.

### T2. 원거리 3D 궤도 셸

- 반경 `34~46`의 3D 궤도 목표점을 구현한다.
- 기체별 깊이 반경, 수직 반경, 궤도면 기울기를 결정적으로 생성한다.
- 3D steering과 heading/pitch/bank를 적용한다.
- 모선 좌우 이동 중 궤도 중심을 추적한다.

완료 조건:

- 전투기들이 모선에서 눈에 띄게 떨어져 선회한다.
- 전투기들이 앞·뒤·위·아래 위치를 모두 사용한다.

### T3. Keep-out과 터널링 방지

- 목표점 투영을 구현한다.
- swept segment 교차 검사를 구현한다.
- 실제 위치 보정과 안쪽 속도 제거를 구현한다.
- 자동 배속에서도 최소 안전거리 위반이 없게 한다.

완료 조건:

- 모든 프레임에서 keep-out metric이 `1` 이상이다.
- 10분 결정적 시뮬레이션에서 관통이 0건이다.

### T4. 접선형 공격 pass

- `ORBIT → ATTACK_PASS → RECOVER` 상태를 구현한다.
- 반경을 `30` 미만으로 줄이는 기존 공격 접근을 제거한다.
- lane과 공격 시간을 슬롯별로 분산한다.
- 3D 공격 거리와 미사일 발사를 연결한다.

완료 조건:

- 공격 기체가 모선으로 직선 돌진하지 않는다.
- 사격 후 외곽 궤도로 부드럽게 복귀한다.

### T5. 실제 깊이 렌더링

- `FIGHTER_DEPTH_SCALE`, hidden grace, depth clamp를 제거한다.
- 모선 gameplay root 기준 3D 상대 좌표를 적용한다.
- fighter sprite alpha/depth 동작을 정리한다.
- 앞쪽/뒤쪽 전투기 가림을 캡처로 확인한다.

완료 조건:

- 모선 뒤쪽 전투기가 모선 위에 덧그려지지 않는다.
- 위치를 강제로 동일 depth로 끌어오는 로직이 없다.

### T6. 미사일·Trail·smoke 통합

- 실제 3D 속도로 노즐을 배치한다.
- 미사일 시각 시작점을 실제 노즐 absolute position으로 사용한다.
- Trail과 smoke가 전투기와 동일한 depth·keep-out 결과를 따른다.
- disabled 상태와 제거 시 기존 정리 규칙을 유지한다.

완료 조건:

- 미사일이 항상 전투기 꼬리/무장 위치에서 출발한다.
- 모선 내부를 가로지르는 trail 잔상이 없다.

### T7. 튜닝과 회귀 검증

- 4/5/6대 편대와 최대 20대 상황을 검증한다.
- 모선 정지·좌우 이동·급반전 상황을 검증한다.
- 78초 전투와 10분 soak를 실행한다.
- 실제 캔버스 스크린샷과 `render_game_to_text`를 함께 검토한다.

완료 조건:

- 전체 자동화와 브라우저 검증이 통과한다.
- 화면상 선회 거리가 충분하고 전투기가 너무 작아지지 않는다.

## 16. 자동 테스트 계획

### 16.1 단위 테스트

- 같은 seed에서 같은 3D 궤도 파라미터가 생성된다.
- 서로 다른 슬롯의 phase와 반경이 분산된다.
- 모든 스폰 위치가 keep-out 외부다.
- 목표점이 keep-out 내부면 외부로 투영된다.
- 빠른 이동 segment가 타원체를 통과하지 않는다.
- 보정 후 모선 안쪽 속도 성분이 제거된다.
- 공격 pass의 최소 반경이 `30` 이상이다.
- 방공·미사일 공격 범위가 3D 거리로 계산된다.
- 모선 이동 후에도 상대 궤도 반경이 유지된다.
- 동일한 총 시간에 대해 작은 `dt`와 큰 자동화 step 결과가 허용 오차 안에서 일치한다.

### 16.2 런타임 스냅샷

`render_game_to_text`의 fighter 항목에 다음 값을 추가한다.

```json
{
  "id": "fighter-101",
  "position": { "x": 0, "y": 0, "z": 0 },
  "velocity": { "x": 0, "y": 0, "z": 0 },
  "relativeDistance3D": 38.2,
  "keepOutMetric": 1.84,
  "flightMode": "ORBIT",
  "behindMothership": false,
  "occluded": false,
  "trailVisible": true,
  "smokePuffCount": 8
}
```

### 16.3 Playwright 시나리오

1. 모선 정지 상태에서 편대 스폰
2. 전투기 전방 통과
3. 전투기 후방 통과와 모선 가림
4. 모선 위·아래 통과
5. 접선형 공격 pass와 미사일 발사
6. 공격 후 외곽 궤도 복귀
7. 모선 좌우 이동 중 편대 추적
8. 모선 급반전 중 keep-out 유지
9. EMP disabled 상태에서 엔진 VFX 정지
10. 피격·폭발·제거 후 mesh 정리
11. 20대 최대 편대
12. 10분 결정적 soak

각 시나리오는 짧은 입력 burst 뒤 의도적인 pause를 두고 스크린샷, 상태 JSON, 콘솔 오류를 함께 검사한다.

## 17. 완료 기준

- 전투기 중심이 모선 keep-out 타원체 내부로 들어가는 프레임이 0건이다.
- 전투기 trail과 smoke가 모선 내부를 가로지르는 장면이 없다.
- 일반 궤도 중심 거리가 `34~46` 범위에 분포한다.
- 공격 중 중심 거리가 `30` 아래로 내려가지 않는다.
- 전투기들이 모선의 앞·뒤·위·아래를 실제 3D 좌표로 사용한다.
- 뒤쪽 전투기는 모선에 자연스럽게 가려진다.
- 모선 이동과 급반전 중에도 관통이 발생하지 않는다.
- 전투기 미사일이 실제 노즐 위치에서 발사된다.
- 동일 seed의 움직임과 공격 순서가 재현된다.
- 20대·10분 soak에서 fighter/VFX 수가 상한을 유지한다.
- TypeScript, Vitest, ESLint, visual-sync, 실제 브라우저 캡처가 통과한다.
- 브라우저 콘솔 오류와 에셋 4xx 응답이 0건이다.

## 18. 리스크와 대응

### 18.1 실제 Z 사용 시 원근 변화가 커질 수 있음

대응 순서:

1. 깊이 반경을 `34~42` 안에서 조정한다.
2. 카메라 FOV를 미세 조정한다.
3. sprite 화면 크기 보정에 상한을 둔다.

Z 좌표를 임의 배율로 다시 축소하지 않는다.

### 18.2 투명 sprite와 모선 depth 정렬

fighter sprite는 alpha-test/depth pre-pass를 우선 사용한다. 불가피할 때만 투영 실루엣 기반 보조 가림을 적용한다.

### 18.3 반경 증가로 공격 빈도가 감소할 수 있음

공격 범위를 `52`까지 늘리고, 접선형 pass에서 미사일 발사 시점을 분산한다. 피해량은 우선 유지한다.

### 18.4 모선 이동 중 편대가 뒤처질 수 있음

desired velocity에 모선 현재 속도를 더하고, 보정 gain은 궤도 복귀에만 사용한다. 순간이동은 하지 않는다.

### 18.5 큰 자동화 step에서 터널링 가능

`window.advanceTime()`의 내부 60Hz 적분을 유지하고 swept segment 교차 검사를 추가한다. 자동화 배속에서도 keep-out을 최종 보장한다.

## 19. 구현 시 고정 결정사항

- 기존 계획서는 수정하지 않고 이 문서를 V2 기준으로 사용한다.
- 전투기 상태는 `Vec3` 위치·속도로 전환한다.
- 일반 궤도 반경 시작값은 `34~46`이다.
- 공격 최소 중심 반경은 `30`이다.
- 모선 X/Z keep-out 시작값은 `28`, Y는 `9`다.
- 공격은 접선형 pass로 구현하며 모선 중심 돌진을 금지한다.
- 실제 월드 Z를 사용하고 `z * 0.12` depth 축소를 제거한다.
- 모선 world center는 `getAbsolutePosition()`을 단일 기준으로 사용한다.
- 관통 방지는 목표점 투영과 swept segment 보정을 모두 적용한다.
- 랜덤 변형은 seed 기반으로만 생성한다.
- 코드 구현 후 스크린샷을 직접 확인하기 전에는 완료로 처리하지 않는다.

## 20. 2026-08-26 구현 결과

- `EnemyState.position/velocity`를 `Vec3`로 전환하고 `pitch`, 3D 궤도 반경, 비행 상태, keep-out 보정 상태를 추가했다.
- 일반 궤도 반경 `34~46`, 실제 depth 반경 `34~42`, 수직 반경 `8~14`, 각속도 `0.20~0.38`을 적용했다.
- `ORBIT → ATTACK_PASS → RECOVER` 상태와 공격 최소 중심 거리 `30`을 적용했다.
- 모선 keep-out 타원체와 중심 거리 구면 하한, swept segment 교차 검사, 안쪽 속도 제거를 구현했다.
- 기존 `z * 0.12`, hidden grace, depth clamp를 제거하고 모선 절대 위치에 3D 상대 좌표를 그대로 합산하도록 변경했다.
- fighter sprite에 depth pre-pass와 alpha-test/blend를 적용하고 노즐·TrailMesh·smoke를 실제 3D 속도에 연결했다.
- 전투기 미사일과 방공 레이저가 실제 전투기 노즐 월드 위치를 사용하도록 연결했다.
- 런타임 snapshot에 3D 위치·속도, 상대 거리, keep-out metric, 비행 상태, 앞뒤/가림 상태를 추가했다.
- 10분 결정적 단위 soak에서 최대 20대, keep-out metric `>= 0.999`, 중심 거리 `>= 29.9`를 검증했다.
- 78초 visual-sync에서 전투기 5대의 상태/시각 ID와 3D 좌표가 일치했고, 최저 중심 거리 `30.205`, 최저 keep-out metric `1.363`, 브라우저 오류 0건을 확인했다.
- TypeScript, Vitest 48/48, 대상 ESLint, `git diff --check`를 통과했다.
