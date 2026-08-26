# 흡수 광선 V2 구현 계획서

- 작성일: 2026-08-26
- 대상 프로젝트: `TheyCallItEarthBabEditor`
- 상태: 구현 완료, 1280×720·900×500·640×360 브라우저 검증 통과
- 핵심 범위: 흡수 광선 자체의 시각 효과
- 참조 이미지: [absorption-beam-impact-reference.png](../reference_images/absorption-beam-impact-reference.png)

## 0. 구현 결과

| 단계 | 상태 | 결과 |
|---|---|---|
| B0 | 완료 | 기존 60메시 원통·rod 구조와 반복 재전개 동작 확인 |
| B1 | 완료 | `BattleAbsorptionVfx` 분리 및 `BattleCombatVfx` 위임 |
| B2 | 완료 | 셰이더 기반 외곽 체적광 Plane 3개 구현 |
| B3 | 완료 | 모선 흡입구, 지면 halo/ring, 전용 GlowLayer 구현 |
| B4 | 완료 | 결정적 내부 shaft 12개와 중심 core 2개 구현 |
| B5 | 완료 | `IGNITING → SUSTAINED → FADING → OFF` 상태 구현 |
| B6 | 완료 | 총 24메시, 검색광 경쟁 제거, 렌더 순서·과노출 튜닝 |
| B7 | 완료 | 전용 Playwright 검증과 3개 뷰포트 시각 검증 통과 |

최종 구현 파일:

```text
src/game/battle/runtime/BattleAbsorptionVfx.ts
src/game/battle/runtime/BattleCombatVfx.ts
src/game/battle/runtime/createBattleRuntime.ts
scripts/verify-absorption-beam-v2.mjs
```

최종 구현값:

```text
외곽 체적광             3개
내부 shaft             12개
중심 core               2개
전체 흡수 전용 메시     24개
모선 쪽 반폭            4.2
지면 쪽 반폭            6.5
점화 시간               0.45초
종료 페이드             0.22초
상승 오브젝트           0개
```

흡수 시작 시 기존 탐색광을 정리하고 흡수 중에는 새 탐색광을 생성하지 않도록 해 대표 효과끼리 겹치지 않게 했다. 기존 V1 원통·rod 구현은 V2 브라우저 검증 후 제거했다.

## 1. 문서 목적

흡수는 이 게임의 대표 행동이며, 전투 화면에서 가장 강한 시각적 인상을 남겨야 한다. 현재 구현은 기능적으로 흡수 위치와 모선을 연결하지만, 가는 원통과 다수의 단단한 막대로 구성되어 체적광보다는 레이저 다발처럼 보일 수 있다.

이 계획의 목적은 현재 게임플레이 규칙을 변경하지 않고 흡수 광선을 다음 형태로 재구성하는 것이다.

- 모선 하부의 넓고 밝은 흡입구
- 지면까지 이어지는 넓은 청록색 체적광
- 체적광 내부에서 서로 다른 밝기로 움직이는 부드러운 광선층
- 지면에 퍼지는 타원형 발광과 옅은 안개
- 켜짐, 유지, 꺼짐이 구분되는 짧고 강한 연출
- 낮 배경에서도 대상과 도시 실루엣이 보이는 투명도

이번 단계에서는 사람, 차량, 잔해 등 실제로 빨려 올라가는 매개체를 구현하지 않는다.

## 2. 시각 기준 분석

참조 이미지의 흡수광은 하나의 원뿔이 아니라 여러 층의 빛으로 보인다.

1. 모선 하부의 원형 발광부가 거의 흰색에 가까운 시안으로 빛난다.
2. 넓고 옅은 체적광이 전체 영역을 채운다.
3. 내부에 폭과 밝기가 다른 세로 광선들이 겹친다.
4. 중심부는 외곽보다 밝지만 하나의 가는 레이저처럼 보이지 않는다.
5. 지면 쪽으로 내려갈수록 광선 폭이 조금 넓어진다.
6. 배경 건물과 광선 안의 물체가 실루엣으로 계속 보인다.
7. 광선 전체가 꺼졌다 켜지지 않고, 내부 밝기와 노이즈만 계속 움직인다.

따라서 목표는 실제 볼류메트릭 라이트를 계산하는 것이 아니라, 고정 측면 카메라에 맞춘 반투명 레이어로 같은 인상을 만드는 것이다.

## 3. 현재 구현 진단

현재 흡수광은 `BattleCombatVfx.ts` 내부에 직접 구현되어 있다.

### 3.1 현재 구성

```text
중심 beam 원통             1개
중심 core 원통             1개
funnel 원뿔                1개
지면 torus ring            1개
방사형 rod                 28개
각 rod의 밝은 core         28개
--------------------------------
총 메시                    약 60개
```

주요 현재 값은 다음과 같다.

```ts
const BEAM_RADIUS = 6.5;
const ABSORPTION_ROD_COUNT = 28;

beam diameter = 0.56;
core diameter = 0.17;
funnel diameterTop = BEAM_RADIUS * 2;
funnel diameterBottom = 0.56;
```

### 3.2 현재 표현의 한계

- 중심 빔 지름이 너무 작아 넓은 체적광보다 가는 레이저로 읽힌다.
- 원뿔 끝이 `0.56`까지 좁아져 참조 이미지보다 지나치게 뾰족하다.
- 28개의 원통과 28개의 코어가 화면에서 단단한 봉 또는 철창처럼 보일 수 있다.
- 모든 광선이 원통 메시이므로 가장자리 페이드와 내부 안개를 표현하기 어렵다.
- `elapsed % 0.85` 진행률로 funnel이 반복해서 접혔다 펼쳐진다.
- 비활성화 시 메시가 즉시 폐기되어 자연스러운 종료 페이드가 없다.
- 현재 모선 `GlowLayer`는 보라색 모선 메시만 포함하므로 흡수광은 별도 글로우 계약이 필요하다.

## 4. 목표와 비목표

### 4.1 목표

- 참조 이미지와 유사한 넓은 청록색 체적광을 만든다.
- 광선 시작부가 모선 하부 흡입구 전체에서 나오는 것처럼 보이게 한다.
- 광선은 지면 방향으로 약간 넓어지는 절두원뿔 실루엣을 사용한다.
- 내부 광선은 단단한 원통이 아니라 부드러운 리본으로 표현한다.
- 생산설비, 차량, 배경 건물은 광선 안에서도 실루엣이 보여야 한다.
- 흡수 시작과 종료에 짧은 페이드 상태를 둔다.
- 동일 전투 seed와 실행 시간에서 같은 광선 배치를 재현한다.
- 현재보다 적은 메시와 예측 가능한 draw call을 사용한다.

### 4.2 비목표

- 사람, 차량, 건물 조각, 잔해의 상승 애니메이션
- 흡수 대상 물리 시뮬레이션
- 흡수량, 에너지 소비, 사거리 등 게임플레이 밸런스 변경
- 모선 모델 또는 배경 레이어 재작업
- 흡수 전용 사운드와 화면 진동
- 모바일 UI 변경

## 5. V2 시각 구조

V2는 다음 여섯 레이어로 구성한다.

| 레이어 | 구성 | 블렌딩 | 역할 |
|---|---:|---|---|
| 흡입구 halo | Disc 2개 | Additive | 모선 하부 광원 |
| 흡입구 ring | Torus 2개 | Additive | 회전하는 동심원 |
| 바깥 체적광 | 사다리꼴 Plane 3개 | Alpha combine | 넓은 안개와 광선 외곽 |
| 내부 shaft | 가는 사다리꼴 Plane 10~14개 | Additive | 밝기와 폭이 다른 내부 광선 |
| 중심 core | 부드러운 Plane 2개 | Additive | 중앙 고휘도 영역 |
| 지면 접점 | Disc 2개 + Torus 1개 | Combine + Additive | 바닥 발광과 잔광 |

권장 1차 메시 수는 약 `22~24개`다. 현재 약 60개보다 적다.

## 6. 클래스 분리 설계

`BattleCombatVfx.ts`는 이미 여러 전투 효과를 담당하므로 흡수광 V2를 별도 파일로 분리한다.

신규 파일:

```text
src/game/battle/runtime/BattleAbsorptionVfx.ts
```

권장 공개 API:

```ts
export type AbsorptionPhase = 'OFF' | 'IGNITING' | 'SUSTAINED' | 'FADING';

export interface BattleAbsorptionVfxSnapshot {
  phase: AbsorptionPhase;
  active: boolean;
  elapsedSeconds: number;
  outerLayerCount: number;
  shaftCount: number;
  sourceHalfWidth: number;
  groundHalfWidth: number;
}

export class BattleAbsorptionVfx {
  setTarget(source: Vector3, target: Vector3): void;
  begin(source: Vector3, target: Vector3): void;
  end(): void;
  update(dt: number, elapsedSeconds: number, source: Vector3): void;
  getSnapshot(): BattleAbsorptionVfxSnapshot;
  dispose(): void;
}
```

`BattleCombatVfx`는 도메인 상태를 읽어 다음만 위임한다.

```text
activeAbility === beam && target exists
  -> absorptionVfx.begin 또는 setTarget

beam 종료 또는 target 고갈
  -> absorptionVfx.end
```

초기 계획에서는 V1/V2 플래그를 두는 방안을 검토했다. 실제 구현에서는 V2가 타입·단위·브라우저 검증을 통과한 뒤 기존 `AbsorptionVisual`, rod, funnel 코드를 제거했다. 문제가 생기면 Git 이력의 V1 구현으로 되돌릴 수 있다.

## 7. 좌표와 형태 계약

### 7.1 광선 시작점

```ts
source = mothershipRoot.getAbsolutePosition()
  + new Vector3(0, -0.5, 0);
```

흡입구 halo와 ring은 source 주변에 배치한다. 모선 이동 중 매 프레임 source를 다시 읽는다.

### 7.2 광선 목표점

```ts
target = new Vector3(
  absorbableTarget.center.x,
  GROUND_ABSORPTION_TARGET_Y,
  absorbableTarget.center.z,
);
```

기존 게임플레이 목표 좌표와 동일한 값을 사용한다.

### 7.3 권장 폭

```text
모선 쪽 반폭       4.0~4.5
지면 쪽 반폭       6.2~6.8
중심 core 반폭     0.8~1.1
지면 glow 반경     6.5 전후
```

현재처럼 한쪽 끝이 `0.28` 반경까지 좁아지는 구조는 사용하지 않는다.

### 7.4 사다리꼴 Plane

고정 측면 카메라에 맞춰 네 정점으로 구성된 카메라 정면 사다리꼴 메시를 사용한다.

```text
sourceLeft  ---- sourceRight
     \              /
      \            /
groundLeft ---- groundRight
```

source와 target이 수평으로 어긋나도 네 정점을 월드 좌표로 다시 계산해 광선이 정확히 목표를 향하게 한다.

매 프레임 갱신하는 정점 수가 적으므로 `updateVerticesData`를 사용할 수 있다. update 루프에서는 새 배열과 `Vector3`를 반복 생성하지 않고 버퍼를 재사용한다.

## 8. 외곽 체적광 셰이더

바깥 체적광은 `ShaderMaterial`을 사용한다. 실제 볼류메트릭 샘플링은 하지 않고 UV 기반 페이드와 간단한 노이즈로 체적감을 만든다.

필수 uniform:

```text
time
baseAlpha
edgeSoftness
noiseScale
noiseSpeed
verticalFade
colorInner
colorOuter
```

개념적인 alpha 계산:

```glsl
float x = abs(vUV.x * 2.0 - 1.0);
float edge = 1.0 - smoothstep(0.55, 1.0, x);
float topFade = smoothstep(0.0, 0.08, vUV.y);
float bottomFade = 1.0 - smoothstep(0.90, 1.0, vUV.y);
float noise = layeredNoise(vUV * noiseScale + vec2(0.0, time * noiseSpeed));
float alpha = edge * topFade * bottomFade * baseAlpha * mix(0.72, 1.18, noise);
```

재질 설정:

```text
alpha mode       ALPHA_COMBINE
depth write      false
backface culling false
fog              비활성 또는 낮은 영향
```

외곽 체적광을 Additive로 만들면 낮 배경에서 전체가 흰색으로 날아가기 쉬우므로 사용하지 않는다.

## 9. 내부 광선 리본

기존 원통형 rod 28개와 core 28개는 제거한다.

### 9.1 개수와 배치

```text
shaft 수          12개 기본
중앙부             7개
외곽부             5개
```

각 shaft는 생성 시 seed로 다음 값을 한 번만 결정한다.

```ts
interface AbsorptionShaftSeed {
  sourceOffset: number;
  groundOffset: number;
  width: number;
  alpha: number;
  phase: number;
  speed: number;
}
```

프레임마다 랜덤값을 생성하지 않는다.

### 9.2 표시 규칙

- 중앙 shaft는 넓고 밝게 한다.
- 외곽 shaft는 가늘고 투명하게 한다.
- 모든 shaft가 동시에 최대 밝기가 되지 않는다.
- 폭은 약 `0.15~0.8` 범위에서 결정한다.
- 밝기는 `0.06~0.28` 범위를 사용한다.
- 완전히 불투명한 흰 막대는 만들지 않는다.
- UV 노이즈와 alpha가 위쪽으로 천천히 이동한다.

내부 shaft는 `ALPHA_ADD`를 사용하되 총 밝기가 과도하지 않게 재질을 3단계 강도로 공유한다.

```text
soft shaft material
medium shaft material
core shaft material
```

## 10. 흡입구와 지면 접점

### 10.1 흡입구

모선 하부에 다음을 배치한다.

```text
넓은 cyan Disc       1개
작은 white-cyan Disc 1개
굵은 Torus           1개
얇은 Torus           1개
```

두 Torus는 서로 반대 방향으로 느리게 회전한다. 모선 보라색 발광과 섞여도 흡수광의 청록색 중심이 구분되어야 한다.

### 10.2 지면 접점

```text
넓은 soft Disc       Alpha combine
작은 bright Disc     Additive
얇은 pulse Torus     Additive
```

지면 Disc는 화면에서 타원으로 읽히도록 X축을 넓게, Y축을 얇게 스케일한다. 외곽이 단단한 원으로 보이지 않도록 alpha gradient를 적용한다.

## 11. 글로우와 렌더 순서

### 11.1 전용 GlowLayer

기존 `MothershipPurpleGlowLayer`는 시간에 따라 보라색 발광 강도가 변하고, 모선의 특정 메시만 포함한다. 흡수광을 여기에 추가하면 청록색 빛도 같은 주기로 맥동하므로 별도 레이어를 사용한다.

권장 설정:

```ts
new GlowLayer('AbsorptionGlowLayer', scene, {
  mainTextureRatio: 0.25,
});

blurKernelSize = 32;
intensity = 0.55;
setExcludedByDefault(true);
```

포함 대상:

- 흡입구 core Disc
- 중심 core Plane
- 지면 bright Disc
- 지면 Torus

바깥 체적광은 GlowLayer에 포함하지 않는다.

흡수 비활성 상태에서는 GlowLayer를 비활성화해 추가 렌더 비용을 줄인다.

### 11.2 alpha 정렬

권장 `alphaIndex`:

```text
outer volume     -30
inner shafts     -20
target sprite      0
core/rings        10
```

이 순서를 사용하면 생산설비와 차량이 외곽 체적광 안에서 실루엣으로 보이고, 밝은 중심광만 대상 앞에 겹친다.

모든 반투명 메시의 `disableDepthWrite`를 활성화하되 depth test 자체는 유지한다.

## 12. 상태와 시간 연출

### 12.1 상태 전이

```text
OFF
  -> IGNITING 0.45초
  -> SUSTAINED 무기한
  -> FADING 0.22초
  -> OFF
```

### 12.2 IGNITING

```text
0.00~0.12초  흡입구 halo와 ring 점등
0.08~0.32초  바깥 체적광 빠르게 전개
0.18~0.45초  중심 core와 내부 shaft 증가
```

전체 크기는 `easeOutCubic`을 사용한다. 현재처럼 `0.85초`마다 광선 전체가 다시 접히지 않는다.

### 12.3 SUSTAINED

- 외곽 체적광 크기는 최대 ±4%만 천천히 호흡한다.
- 내부 shaft는 서로 다른 phase로 밝기가 변한다.
- 노이즈 UV는 지면에서 모선 방향으로 이동한다.
- 흡입구 ring은 서로 반대 방향으로 회전한다.
- 지면 ring은 약 `1.2Hz`로 약하게 맥동한다.

### 12.4 FADING

```text
0.00~0.10초  중심 core와 shaft 감소
0.04~0.18초  흡입구 ring 감소
0.08~0.22초  외곽 체적광과 지면 안개 감소
```

`setAbsorption(false)`에서 즉시 dispose하지 않는다. FADING 완료 후 메시를 숨기거나 정리한다.

대상이 고갈되어 생산설비 스프라이트가 즉시 사라져도 광선은 `0.22초` 동안 자연스럽게 사라질 수 있다.

## 13. 파일 변경 계획

### 신규 파일

```text
src/game/battle/runtime/BattleAbsorptionVfx.ts
scripts/verify-absorption-beam-v2.mjs
docs/reference_images/absorption-beam-impact-reference.png
```

### 수정 파일

```text
src/game/battle/runtime/BattleCombatVfx.ts
src/game/battle/runtime/createBattleRuntime.ts
src/game/battle/BattleScreen.tsx 또는 runtime snapshot 타입 위치
package.json
progress.md
```

외부 이미지 텍스처 없이 셰이더로 구현하는 것을 기본으로 한다. 셰이더 품질이 충분하지 않을 때만 다음 자산을 추가한다.

```text
public/assets/runtime/vfx/absorption-beam-gradient.webp
public/assets/runtime/vfx/absorption-noise.webp
```

## 14. 단계별 구현 순서

### B0. 기준선 고정

- 현재 흡수 시작, 유지, 종료 화면을 1280×720에서 캡처한다.
- 현재 메시 수와 draw call을 기록한다.
- 생산설비를 흡수해 `remainingAmount=0`까지 도달하는 흐름을 기록한다.
- `npm run typecheck`, `npm test`, `git diff --check` 기준선을 확보한다.

완료 조건:

- 현재 상태의 스크린샷과 수치가 저장되어 있다.
- 기존 잔상 제거가 유지되는지 확인할 수 있다.

### B1. V2 클래스 연결

- `BattleAbsorptionVfx` 클래스를 추가한다.
- 상태 전이와 snapshot만 먼저 구현한다.
- `BattleCombatVfx`에서 흡수 상태를 V2 클래스로 위임한다.
- V2 연결 후 기존 V1 코드는 브라우저 검증 완료 시 제거한다.

완료 조건:

- V2 시작, 목표 갱신, 종료, dispose가 누수 없이 동작한다.

### B2. 바깥 체적광 구현

- 카메라 정면 사다리꼴 메시 생성기를 추가한다.
- 외곽 Plane 3개를 생성한다.
- UV 기반 edge/vertical fade 셰이더를 적용한다.
- 모선 쪽과 지면 쪽 폭을 조정한다.

완료 조건:

- 단단한 원뿔 외곽선이 보이지 않는다.
- 배경과 대상이 체적광 내부에서 읽힌다.
- 광선 전체가 반복적으로 접히지 않는다.

### B3. 흡입구와 지면 접점 구현

- 흡입구 Disc와 Torus를 추가한다.
- 지면 soft Disc와 pulse ring을 추가한다.
- source/target 이동을 매 프레임 동기화한다.
- 전용 GlowLayer를 연결한다.

완료 조건:

- 빛이 모선 하부 구조에서 시작하는 것처럼 보인다.
- 지면에서 갑자기 잘리지 않고 빛이 퍼진다.
- 보라색 모선 글로우와 청록색 흡수 글로우가 독립적으로 동작한다.

### B4. 내부 shaft와 중심 core 구현

- 결정적 seed로 shaft 12개를 생성한다.
- 중앙/외곽 밀도를 분리한다.
- shaft 폭, alpha, phase, 속도를 한 번만 생성해 저장한다.
- 중심 core Plane 2개를 추가한다.

완료 조건:

- 원통 막대나 철창처럼 보이지 않는다.
- 참조 이미지처럼 밝기가 다른 광선층이 보인다.
- 낮 배경에서도 완전히 흰색으로 뭉개지지 않는다.

### B5. 시간 연출과 종료 페이드

- `IGNITING`, `SUSTAINED`, `FADING`을 구현한다.
- 현재 `elapsed % 0.85` 전체 재전개를 제거한다.
- 목표가 고갈될 때 0.22초 종료 페이드를 적용한다.
- 연속 목표 전환 시 기존 광선을 즉시 폐기하지 않고 0.15초 보간한다.

완료 조건:

- 시작 순간이 강하게 읽힌다.
- 유지 중에는 안정적인 광선 몸체와 내부 움직임이 공존한다.
- 종료 시 팝이나 한 프레임 잔상이 없다.

### B6. 렌더 순서와 성능 조정

- alphaIndex와 renderingGroup을 확정한다.
- 흡수 대상이 외곽 체적광 뒤에서 실루엣으로 보이는지 확인한다.
- 메시, 재질, GlowLayer 수를 기록한다.
- update 루프의 매 프레임 할당을 제거한다.

완료 조건:

- 흡수 전용 메시 `24개 이하`
- 흡수 전용 재질 `4개 이하`
- 브라우저 프레임 누적과 잔상이 없다.
- 흡수 전후 메모리와 메시 수가 원래 값으로 돌아온다.

### B7. 브라우저 검증과 V1 제거

- 전용 Playwright 검증을 추가한다.
- 사용자 검토용 시작/유지/종료 스크린샷을 만든다.
- 검증 통과 후 V1 rod/funnel 코드를 제거한다.
- 계획서와 `progress.md`를 구현 상태로 갱신한다.

완료 조건:

- 참조 체크리스트를 통과한다.
- 회귀 테스트가 통과한다.
- V1 코드가 제거되고 V2 검증 결과가 문서에 기록된다.

## 15. 자동 검증 계획

신규 스크립트:

```text
scripts/verify-absorption-beam-v2.mjs
```

검증 흐름:

1. `?debug=battle&city=seoul&battle-fast=1`로 진입한다.
2. 가까운 `MACHINERY` 목표를 확인한다.
3. 흡수 직전 화면을 캡처한다.
4. 흡수 시작 후 `0.15초` 화면을 캡처한다.
5. `0.55초` 유지 화면을 캡처한다.
6. `1.5초` 유지 화면을 캡처한다.
7. 목표를 고갈시키고 종료 직후 화면을 캡처한다.
8. 종료 `0.3초` 후 메시와 광선이 사라졌는지 확인한다.
9. 콘솔 오류, WebGL 오류, 4xx 응답을 확인한다.

runtime snapshot에 다음을 추가한다.

```json
{
  "absorptionVfx": {
    "phase": "SUSTAINED",
    "active": true,
    "outerLayerCount": 3,
    "shaftCount": 12,
    "sourceHalfWidth": 4.2,
    "groundHalfWidth": 6.5
  }
}
```

화면 크기:

```text
1280×720  기본 시각 검증
900×500   중간 브라우저
640×360   최소 지원 화면
```

## 16. 시각 승인 체크리스트

- [ ] 흡수구가 모선 하부 전체에서 빛나는 것처럼 보인다.
- [ ] 광선이 한 점에서 시작하는 레이저처럼 보이지 않는다.
- [ ] 지면 방향으로 폭이 조금 넓어진다.
- [ ] 넓은 체적광 내부에 밝기가 다른 광선층이 보인다.
- [ ] 단단한 원통 외곽과 철창 형태가 보이지 않는다.
- [ ] 낮 도시 배경과 대상 실루엣이 광선 안에서 읽힌다.
- [ ] 외곽은 청록색, 중심은 백색에 가까운 시안이다.
- [ ] 광선 전체가 주기적으로 꺼졌다 켜지지 않는다.
- [ ] 시작과 종료가 각각 짧고 명확하다.
- [ ] 대상 고갈 후 투명한 대상 잔상이 남지 않는다.
- [ ] 빨려 올라가는 사람, 차량, 잔해는 생성되지 않는다.
- [ ] EMP, 플라즈마, 오버드라이브 PostProcess와 함께 사용해도 프레임 잔상이 없다.

## 17. 성능 예산

```text
흡수 전용 메시         24개 이하
흡수 전용 재질          4개 이하
추가 GlowLayer           1개, 흡수 중에만 활성
외부 파티클              0개
상승 오브젝트            0개
매 프레임 랜덤 생성      0회
매 프레임 배열 생성      0회 목표
```

모바일에서 전용 GlowLayer가 부담이 되면 다음 순서로 낮춘다.

1. `mainTextureRatio`를 `0.25`에서 `0.125`로 낮춘다.
2. blur kernel을 `32`에서 `24`로 낮춘다.
3. 외곽 Plane을 3개에서 2개로 낮춘다.
4. shaft를 12개에서 8개로 낮춘다.

중심 core와 흡입구 ring은 마지막까지 유지한다.

## 18. 주요 위험과 대응

### alpha 정렬 오류

증상: 생산설비가 광선 뒤에서 완전히 사라지거나 광선이 대상 뒤로 잘못 들어간다.

대응: outer, shaft, target, core의 `alphaIndex`를 명시하고 거리 정렬에만 의존하지 않는다.

### 낮 배경 과노출

증상: 청록색 광선이 흰색 덩어리로 보인다.

대응: 외곽 체적광은 Alpha combine을 사용하고 Additive는 core와 일부 shaft에만 사용한다.

### 셰이더 컴파일 실패

증상: 특정 브라우저에서 광선이 표시되지 않는다.

대응: WebGL2 호환 GLSL만 사용하고 복잡한 반복문과 동적 분기를 피한다. 실패 시 Git 이력의 V1 구현으로 복구한다.

### 프레임 누적 잔상

증상: 이동 중 이전 광선 위치가 화면에 남는다.

대응: scene과 PostProcess의 `autoClear` 계약을 기존 frame-ghosting 검증에 포함한다.

### 종료 시 팝

증상: 대상 고갈과 동시에 광선 전체가 한 프레임에 사라진다.

대응: 게임플레이 beam 종료와 VFX `FADING`을 분리하고 0.22초 후 시각 객체를 비활성화한다.

## 19. 완료 정의

다음 조건을 모두 만족하면 흡수 광선 V2 구현 완료로 본다.

- 참조 이미지의 넓은 체적광, 내부 광선층, 흡입구, 지면 발광이 모두 표현된다.
- 빨려 올라가는 매개체 없이도 흡수가 게임의 주요 임팩트로 읽힌다.
- 생산설비와 차량이 흡수 중에는 광선 안에서 보이고, 고갈 후에는 완전히 사라진다.
- 흡수광 시작, 유지, 종료 상태가 자연스럽게 이어진다.
- 메시와 재질 수가 성능 예산 안에 있다.
- 1280×720, 900×500, 640×360 화면에서 UI를 침범하지 않는다.
- TypeScript와 전체 Vitest가 통과한다.
- 전용 Playwright 흡수 검증과 기존 side-view E2E가 통과한다.
- 콘솔 오류, WebGL 오류, 4xx 에셋 요청이 없다.
- 사용자 추가 검토에서 필요한 경우 색상·폭·투명도만 후속 튜닝할 수 있다.
