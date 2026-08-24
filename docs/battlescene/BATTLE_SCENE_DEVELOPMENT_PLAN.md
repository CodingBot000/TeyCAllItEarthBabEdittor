# Battle Scene 개발계획서

- 작성일: 2026-08-23
- 대상 프로젝트: `TeyCAllItEarthBabEdittor`
- 대상 기능: Babylon.js Editor 기반 2.5D 배틀 화면
- 작업 브랜치: `feature/battle-scene-editor-first`
- 현재 상태: 앞단 1차 개발 완료, 배틀 회색상자 런타임·도메인 전투 루프·앱 진입·다중 맵 샘플 구현 완료
- 개발 방식: 완료된 시작화면·맵선택 기반 위에서 배틀 기능을 순차 통합

관련 상세 문서:

- [Battle Scene 구현안](./BATTLE_SCENE_IMPLEMENTATION_PLAN.md)
- [2D Battle Gameplay 개발계획서](./BATTLE_2D_GAMEPLAY_DEVELOPMENT_PLAN.md)
- [2D Battle Gameplay 수정 전용 개발계획서](./BATTLE_2D_GAMEPLAY_CORRECTION_PLAN.md)
- [Battle Scene 신규 에셋 제작 목록](./ASSET_PRODUCTION_LIST.md)

## 1. 목표

하나의 공통 Babylon 배틀 씬에서 모선과 전투 유닛은 재사용하고, 맵별 2D 이미지 패키지만 교체할 수 있는 전투 화면을 구현한다.

첫 번째 검증 대상은 `city-day` 맵이다. 이 맵에서 카메라, 좌우 이동, 패럴랙스, 투명 레이어, 웹 성능과 리소스 해제를 검증한 뒤 같은 계약으로 `city-night`, `desert-day` 등 후속 맵을 추가한다.

```text
공통 Battle Scene
├─ 공통 카메라·입력·전투 로직
├─ 공통 3D 모선·전투기·드론·지상 유닛
└─ 선택된 map manifest
   ├─ sky
   ├─ far
   ├─ middle
   ├─ near
   ├─ ground
   └─ foreground atmosphere
```

## 2. 확정 사항

| 항목 | 결정 |
|---|---|
| 화면 방식 | 고정 측면 시점의 2.5D |
| 카메라 | 좁은 FOV의 원근 카메라, X축 이동만 허용 |
| 맵 폭 | 초기 화면 기준 좌우 약 ±100%, 전체 약 3화면 |
| 모선 | 3D, 일반 조작은 X축만 이동 |
| 전투기·드론 | 3D, 평상시 XY 전투 평면 사용 |
| 지상 유닛 | 2D 또는 3D, 차체 이동은 X축만 허용 |
| 도시 | 여러 개의 투명 2D 패럴랙스 레이어 |
| 맵 교체 | 공통 씬을 유지하고 map manifest와 이미지 경로만 교체 |
| HUD | Babylon scene 밖 React DOM HUD 구현 완료; 최종 HUD 아트는 별도 튜닝 범위 |
| 물리 | 초기에는 Havok 없이 단순 판정 사용 |
| 웹 포맷 | WebP fallback, 이후 KTX2 GPU 압축 추가 |
| 1차 아트 | 2D 에셋만 제작 완료, 3D 최종 에셋은 후속 |

## 3. 현재 기준선

### 완료

- 시작화면·월드맵 1차 구현 및 최종 검증 커밋 완료
- 앞단 완료 커밋 시점의 `main` 작업트리 clean 상태 확인
- 배틀 씬 기술 및 렌더링 구조 문서화
- `city-day` 맵의 2D 배경 6종 제작
- 모선 표면 매핑 이미지 3종 제작
- PNG 제작 원본과 WebP 런타임본 분리
- 형제 프로젝트의 검증된 VFX WebP를 현재 런타임에 임시 참조 자산으로 복사
- `city-day/map.manifest.json` 생성
- `city-night` 배경 6종과 동일 manifest 계약 등록
- 맵별 에셋과 공통 에셋 폴더 분리
- 엔진 중립 `BattleGateway` 경계 존재

### 1차 구현 완료

- `assets/battlescene.scene/`에 Editor 회색상자 씬과 고정 노드 계층 생성
- Babylon `BattleScreen`의 씬 로드, WebGL 캔버스, dispose와 로드 실패 fallback 구현
- `BattleMapDefinition` 검증 계약과 `city-day` 카탈로그 구현
- 2D 배경 6레이어, 좌우 패럴랙스, X축 카메라 추적 구현
- 모선·전투기·드론·지상 포탑 회색상자와 좌우 입력 구현
- 시작화면 → 월드맵 → 배틀 진입과 맵 복귀 연결
- `npm run generate:battle` 배틀 전용 Editor 패킹 경로 구현
- sibling 전투기 구현을 기준으로 `fighter-8way.webp` 4×2 Billboard Plane 매핑 구현
- 전투기 후방 2중 `TrailMesh` 엔진 트레일과 수명·확대·페이드 연기 퍼프 구현
- 3대 greybox 전투기의 제한된 3D 비행 경로를 연결해 트레일과 연기 화면 검증
- sibling 전투 연출을 기준으로 방어막 피격과 선체 피격 VFX 구현
- EMP·플라즈마 발사체/충격 링·폭발/연기 flipbook VFX 구현
- 인간 흡입용 시민 Billboard, 흡입 빔·코어·퍼널·목표 링 구현
- 도메인 `CombatState`와 `mothershipHits`, 미사일, 방공 레이저 이벤트를 VFX에 연결
- EMP·플라즈마·흡입·방공 레이저 발동 결과를 실제 도메인 규칙에서 구동
- 모선 회피 원호와 추락 cinematic, 실패 결과 및 월드맵 복귀 연결
- Coastal/River/Desert 전술 프리셋을 모두 런타임 계약에 연결
- 현재 greybox 검증용 단축키 연결: `1` 방어막 피격, `2` 선체 피격, `E` EMP, `P` 플라즈마, `B` 인간 흡입 토글, `Q` 회피, `C` 추락, `X` 추출

### 남은 구현

- Editor에서 실제 3D 모선·전투기·드론 모델로 교체하고 소켓/LOD 정리
- `BattleCombatVfx`의 제한된 effect cap을 고정 배열/재사용 풀로 확장
- 맵 manifest를 정적 카탈로그에서 외부 manifest lazy loader로 확장
- KTX2/Basis 압축 생성 도구 설치 후 실제 산출물·브라우저 fallback 검증
- 최종 3D 유닛 아트 교체, 성능 프로파일링과 최종 QA

### 현재 제약

시작화면·맵선택 개발에 따른 병렬 작업 제약은 해제됐다. 배틀 개발에서 `GameApp`, `BattleGateway`, 패키지 스크립트와 생성 산출물을 필요한 시점에 수정할 수 있다.

남은 구조적 제약은 `scripts/pack-editor.mjs`가 1차 메뉴·맵 빌드에 전투 자산이 들어가지 않도록 `assets/battlescene/`과 `assets/battlescene.scene/`을 의도적으로 제외한다는 점이다. 배틀 빌드는 별도 `generate:battle` 패킹 경로를 사용한다.

### 3.1 Editor-first hybrid 결정

사용자가 개발 완료 후 Babylon.js Editor에서 직접 배치와 외형을 수정할 수 있어야 하므로, 배틀 씬은 처음부터 Editor에 회색상자로 만들고 코드와 Editor의 책임을 분리한다. 완성 후에 코드로 만든 씬을 Editor 씬으로 옮기는 방식은 노드 이름, 계층, 카메라 기준이 이미 런타임에 결합된 뒤라 변환 비용과 회귀 위험이 커진다.

#### Editor가 소유하는 값

- 씬 계층, 고정 노드 이름, Transform과 배치
- 카메라 FOV·초기 위치, 배경 Plane과 렌더링 그룹
- 재질·조명·텍스처 연결, 모선·유닛의 시각 모델
- 무기/드론 소켓, 지상 레인 앵커, 충돌 프록시, LOD·Animation Group
- 반복 조정할 수치의 Inspector 노출값

#### TypeScript가 소유하는 값

- 입력, 모선·카메라의 X축 이동과 월드 경계
- 패럴랙스 계산, AI·풀링·충돌·발사체·전투 상태
- map manifest 선택과 맵별 텍스처 교체
- 씬 로드/재진입/dispose, React와의 연결, 테스트 가능한 계약

Editor 씬은 정적 배치의 기준으로 유지하고 런타임 스크립트가 매 프레임 그 Transform을 덮어쓰거나 정적 배경을 재생성하지 않는다. 따라서 사용자가 Editor에서 바꾼 배치가 유지되면서도, 같은 공통 씬에 다른 map manifest를 주입해 여러 맵을 운영할 수 있다.

초기 씬의 최소 계층과 이름은 `BattleSceneRoot`, `CameraRig/BattleCamera`, `EnvironmentRoot/*LayerRoot`, `MothershipGameplayRoot/MothershipVisualRoot`, `WeaponSockets`, `DroneSpawnSockets`, `GroundLaneDefinitions`로 고정한다. 이 이름은 Editor 스크립트의 참조 계약이므로 최종 모델을 넣은 뒤에도 변경하지 않는다.

이 결정은 **Editor-only 개발**을 뜻하지 않는다. Editor에서는 눈으로 확인할 수 있는 배치와 튜닝을 하고, 재현·테스트·맵 교체가 필요한 규칙은 코드와 manifest에 둔다.

## 4. 개발 경계와 공유 파일

### 배틀 세션 전용 경로

다음 경로는 배틀 세션이 소유한다.

```text
assets/battlescene/**
art-source/battlescene/**
docs/battlescene/**
src/game/battle/**
src/scripts/battlescene/**
assets/battlescene.scene/**
```

### 통합 단계 공유 경로

앞단 작업이 완료됐으므로 다음 경로도 배틀 통합에 필요한 범위에서 수정할 수 있다. 다만 B0~B5 회색상자 개발 중에는 변경을 최소화하고, 실제 앱 연결은 B6에서 한 작업 단위로 수행한다.

```text
src/app/**
src/game/GameApp.tsx
src/game/presentation/**
src/game/i18n/**
src/app/globals.css
package.json
package-lock.json
scripts/pack-editor.mjs
public/scene/**
```

### Git 작업 방식

앞단 개발과 검증이 커밋된 clean 기준선에서 이 작업 폴더로 바로 이어서 개발할 수 있다. 배틀 변경을 별도 브랜치로 관리하려면 다음 명령을 선택적으로 사용한다.

```bash
git switch -c feature/battle-scene-editor-first
```

별도 worktree는 더 이상 필수 조건이 아니다. 작업 중에는 배틀 전용 파일을 우선 수정하고, 공유 파일 변경은 B6 앱 통합 커밋에 모아 회귀 범위를 명확하게 유지한다.

## 5. 목표 구조

```text
assets/
├─ battlescene.scene/                         # 공통 Editor 씬
└─ battlescene/
   ├─ shared/
   │  ├─ mothership/
   │  │  ├─ mapping/
   │  │  └─ models/                          # 2차 이후
   │  ├─ units/                              # 2차 이후
   │  └─ vfx/
   └─ maps/
      ├─ city-day/
      │  ├─ map.manifest.json
      │  └─ backgrounds/
      └─ <next-map-id>/

src/game/battle/
├─ BattleGateway.ts                           # 기존 엔진 중립 경계
├─ BattleScreen.tsx                           # 앱 통합 단계에서 추가
├─ contracts/
│  ├─ BattleLaunchRequest.ts
│  └─ BattleMapDefinition.ts
├─ maps/
│  ├─ battleMapCatalog.ts
│  ├─ battleMapManifestSchema.ts
│  └─ battleMapLoader.ts
├─ runtime/
│  ├─ battleSceneLoader.ts
│  ├─ battleSceneLifecycle.ts
│  └─ battleAssetUrl.ts
└─ tests/

src/scripts/battlescene/
├─ battleSceneController.ts
├─ horizontalCameraController.ts
├─ mothershipController.ts
├─ mothershipCinematicController.ts
├─ parallaxController.ts
├─ groundLaneController.ts
├─ airUnitPoolController.ts
├─ projectilePoolController.ts
└─ battleDebugController.ts
```

Editor가 생성하는 `src/scripts.ts`는 직접 수동 편집하지 않고 Editor 패킹 시 자동 생성되게 한다.

## 6. 런타임 계약

### 배틀 시작 요청

기존 `BattleLaunchRequest`에 `mapId`를 추가하는 것을 목표 계약으로 한다.

```ts
export interface BattleLaunchRequest {
  campaignId: string;
  cityId: string;
  missionId?: string;
  mapId: string;
}
```

앞단 개발이 완료됐으므로 B0 계약 작업에서 `mapId` 추가와 호출부 영향 범위를 함께 반영할 수 있다. 실제 화면 전환은 B6에서 연결하되, 타입 계약은 초기에 확정한다.

### 맵 manifest

각 맵은 동일한 필수 슬롯을 제공한다.

```ts
interface BattleMapDefinition {
  id: string;
  version: number;
  backgrounds: {
    sky: string;
    far: string;
    middle: string;
    near: string;
    ground: string;
    foregroundAtmosphere?: string;
  };
  camera: {
    viewportSpanScreens: number;
    travelScreensFromStart: number;
    fovDegrees: number;
  };
  parallax: {
    sky: number;
    far: number;
    middle: number;
    near: number;
    ground: number;
    foregroundAtmosphere?: number;
  };
}
```

manifest 경로에는 `/scene/assets/`를 저장하지 않는다. 런타임 로더가 공통 prefix를 붙인다.

## 7. 개발 마일스톤

| 단계 | 목표 | 선행 조건 | 상태 |
|---|---|---|---|
| B0 | 배틀 전용 기반과 테스트 가능한 순수 계약 | 앞단 완료 | 완료 |
| B1 | 2D 레이어와 카메라 회색상자 | B0 | 완료 |
| B2 | 모선 primitive 이동과 카메라 추적 | B1 | 완료 |
| B3 | 공중·지상 유닛 prototype과 판정 | B2 | 도메인·발사체·VFX 연결 완료 |
| B4 | 회피·추락 cinematic prototype | B2 | 완료 |
| B5 | 신규 3D 아트와 VFX 통합 | B3~B4 | 원본 런타임 모선의 Editor 메시 전환 완료, 신규 유닛/최종 GLB 대기 |
| B6 | React 앱·BattleGateway·패킹 연결 | B1 이상 | 1차 연결 완료 |
| B7 | 다중 맵, 웹 최적화와 최종 QA | B5~B6 | city-night·WebP 완료, KTX2/최종 QA 진행 |

## 8. 단계별 작업

### B0 — 배틀 기반과 계약

작업:

- `BattleMapDefinition` 타입과 런타임 validation 구현
- `city-day/map.manifest.json` 검증 테스트
- asset key를 `/scene/assets/` URL로 변환하는 순수 함수 구현
- 맵 카탈로그와 알 수 없는 map ID 오류 처리
- 배틀 씬 lifecycle 상태 정의
- 배틀 전용 이슈 기록 방식 추가
- Editor에서 `battlescene.scene` 회색상자 생성
- 고정 노드 계층·이름, 카메라, 6개 레이어 Plane, 모선/지상 레인 앵커 배치
- Inspector에서 조정할 값과 TypeScript에서만 변경할 값을 구분

완료 기준:

- 잘못된 manifest가 명확한 오류로 거부된다.
- 모든 asset URL이 동일한 규칙으로 생성된다.
- React와 Babylon import 없이 manifest 테스트가 실행된다.
- 기존 시작화면·맵선택 테스트가 계속 통과한다.

### B1 — Editor 회색상자와 2D 레이어

작업:

- B0에서 만든 `assets/battlescene.scene`의 계층·이름 계약 고정
- 임시 Plane에 `city-day` 6개 레이어 연결
- 렌더링 그룹과 Z 범위 확정
- alpha blend/alpha test 정책 적용
- 16:9, 18:9, 20:9 표시 검증

완료 기준:

- 모든 배경 레이어가 의도한 순서로 표시된다.
- 하늘이나 Plane 사이에 빈 영역이 보이지 않는다.
- 투명 경계의 검은 halo와 checkerboard가 없다.
- 카메라 이동 중 투명 정렬 순서가 바뀌지 않는다.

### B2 — 모선 이동과 카메라

작업:

- primitive 모선으로 `GameplayRoot`/`VisualRoot` 분리
- 모선 X축 입력과 월드 경계 구현
- 카메라 dead zone 및 smooth follow 구현
- 초기 화면 기준 좌우 ±100% 이동 범위 적용
- resize 시 frustum과 경계 재계산
- 패럴랙스 적용

완료 기준:

- 사용자 조작으로 모선의 Y/Z가 변경되지 않는다.
- 카메라는 X축 외의 이동·회전을 하지 않는다.
- 프레임률이 달라도 이동 속도와 추적 감각이 동일하다.
- 맵 끝에서 배경 밖이 노출되지 않는다.

### B3 — 전투 유닛 prototype

작업:

- primitive 전투기·드론 pool
- XY 공중 전투 평면과 제한된 Z 연출 lane
- 지상 유닛 ground lane과 X축 이동 제한
- 단순 sphere/AABB hit volume
- 발사체 상태 배열과 화면 밖 회수, bounded projectile mesh 관리
- debug hit volume과 동시 개체 수 표시

완료 기준:

- 지상 차체는 X축 외로 이동하지 않는다.
- 반복 spawn/despawn에서 객체 수와 observer가 누적되지 않는다.
- Havok 없이 기본 피격과 발사체 회수가 동작한다.

### B4 — 모선 특수 연출

작업:

- `Gameplay`, `EvasionCinematic`, `CrashCinematic` 상태 분리
- 회피 원호와 roll/pitch/yaw 조합
- 추락 시 Y 하강, Z 카메라 접근, pitch/roll 적용
- 입력·판정·카메라 추적 잠금 정책 구현
- 연출 완료 후 Transform 정규화

완료 기준:

- 회피 종료 후 정상 조작 위치와 회전으로 복귀한다.
- 추락 중 near clipping plane을 통과하기 전에 종료된다.
- 일반 이동과 cinematic이 동일 Transform 값을 경쟁하지 않는다.
- `C` 추락 완료 시 도메인 결과가 `FAILED`가 되고 월드맵으로 복귀한다.

### B5 — 신규 3D 에셋과 VFX

작업:

- 신규 모선 GLB와 LOD 통합
- 모선 base color, normal/height, ORM, emissive 적용
- 신규 전투기·드론·지상 유닛 통합
- instance/thin instance 적용
- 엔진 trail, 폭발, 연기, 에너지 발사체 VFX
- 실시간 그림자 생성자 제한
- WebP fallback과 KTX2 도구 감지 스크립트(`npm run check:battle:compression`)

완료 기준:

- 3D 모델 교체가 이동·카메라 코드 변경 없이 가능하다.
- 반복 유닛은 공통 material과 instance를 사용한다.
- WebP fallback이 동작하고, KTX2는 외부 encoder 설치 전까지 명시적으로 비활성화된다.
- 3D와 2D 배경의 광원 방향과 색감이 일치한다.

2026-08-24에는 원본 `TheyCallItEarth/src/rendering/babylon/tactical/MothershipVisual.ts`의 절차형 모선을 `MothershipVisualRoot` 아래 59개 실제 Editor 메시로 전환했다. 원본 1254×1254 atlas, 메시 치수, UV 영역, 재질색, 발광색, 루트 스케일을 그대로 사용하며 상판·하판·돔·동심 링·장갑 패널·반응로·하부 emitter를 Editor에서 개별 선택할 수 있다. Editor 계층은 `MothershipModelRoot` 아래 Hull/Ring/Armor/Reactor/Emitter `TransformNode` 그룹으로 접을 수 있게 정리하고, Weapon/Drone/VFX 소켓은 `MothershipVisualRoot`의 별도 child로 유지한다. 이는 최종 신규 GLB가 아니라 기존 플레이 모선의 Editor-visible 기준 모델이다.

### B6 — 앱 통합

앞단 구현과 검증이 완료됐으므로 외부 세션 의존 없이 수행할 수 있다. B1 회색상자 로딩이 안정화되면 최종 3D 에셋을 기다리지 않고 조기 통합할 수 있다.

작업:

- `BattleLaunchRequest.mapId` 연결
- `BattleGateway` 실제 구현 추가
- `BattleScreen`과 canvas lifecycle 연결
- 전투 진입·로딩·실패·종료 상태 구현
- `generate:battle` 패킹 경로 추가
- 기존 `npm run generate`의 1차 경계 유지 여부 결정
- 전투 종료 후 월드맵 복귀 연결

완료 기준:

- 월드맵에서 선택한 도시와 map ID로 전투가 열린다.
- 전투를 반복 진입·이탈해도 canvas, observer, texture가 누적되지 않는다.
- 전투 로딩 실패 시 월드맵이 깨지지 않고 복구 가능하다.
- 시작화면과 월드맵 회귀 테스트가 통과한다.

### B7 — 다중 맵과 최적화

작업:

- 두 번째 테스트 맵 `city-night` package 제작
- 동일 배틀 씬에서 map ID만 바꿔 이미지 교체 검증
- 선택된 맵만 네트워크 요청하는지 확인
- desktop/mobile 품질 등급 적용
- texture와 GLB 캐시 및 해제 정책 검증
- 장시간 전투와 반복 진입 성능 측정

완료 기준:

- 씬 복제 없이 두 개 이상의 맵이 실행된다.
- 사용하지 않은 맵의 이미지 요청이 발생하지 않는다.
- 맵 전환 후 이전 맵 texture가 필요 이상으로 메모리에 남지 않는다.

현재 카탈로그에는 `city-day`와 `city-night`이 등록되어 있으며, 공통 씬은 `BattleMapDefinition`의 이미지 경로만 교체한다. River/Desert는 동일한 전투 규칙·전술 프리셋 계약으로 먼저 연결했고, 전용 배경 패키지는 후속 맵 아트 작업으로 분리한다.

## 9. 웹 성능 목표

| 항목 | 초기 목표 |
|---|---:|
| 데스크톱 | 60 FPS |
| 지원 모바일 | 30 FPS 이상 |
| 현재 `city-day` WebP 전체 | 약 2.13 MiB |
| 모바일 최초 전투 표시 다운로드 | 12 MiB 이하 권장 |
| 데스크톱 최초 전투 표시 다운로드 | 25 MiB 이하 권장 |
| 일반 2D texture | 2048px 이하 |
| 모바일 공통 4K texture | 원칙적으로 금지 |
| 8K texture | 금지 |

측정 항목:

- frame time과 FPS
- draw calls
- active meshes와 triangles
- texture 메모리
- 동시 발사체·유닛·particle 수
- 전투 최초 표시 시간
- 전투 진입 전후 JS/GPU 메모리

## 10. 테스트 계획

### 단위 테스트

- manifest 정상/오류 schema
- map ID 조회와 fallback
- asset URL 조합
- 카메라 X 경계 계산
- 화면 비율별 viewport world width
- 패럴랙스 이동량
- ground lane X clamp
- cinematic 상태 전환

### 통합 테스트

- `city-day` manifest → texture load → Plane 적용
- 전투 씬 load → start → dispose
- 같은 전투 씬 재진입
- map ID 교체 후 texture 교체
- WebP fallback과 KTX2 선택(현재는 encoder 미설치로 WebP 경로만 검증)

### 수동 시각 검증

- 16:9, 18:9, 20:9
- 데스크톱과 모바일 가로 화면
- 카메라 좌측 끝, 중앙, 우측 끝
- 투명 레이어 halo와 정렬
- 모선과 도시의 스케일·광원 일치
- 회피와 추락 시 카메라 clipping

### 병합 전 전체 검증

```bash
npm run typecheck
npm run test
npm run build
npm run generate
```

배틀 패킹 명령이 추가되면 별도로 실행한다. `public/scene`은 수동 편집하지 않고 패킹 결과로만 갱신한다.

## 11. 위험과 대응

| 위험 | 대응 |
|---|---|
| 앞단 화면 회귀 | B0~B5는 배틀 전용 경로 우선, 공유 파일 변경은 B6에 모아 전체 테스트 수행 |
| 투명 Plane 정렬 오류 | Z 범위와 `renderingGroupId`를 초기에 고정 |
| 맵 추가 시 씬 복제 | map manifest 필수 슬롯 계약 유지 |
| 모든 맵 이미지 선로드 | 선택된 manifest만 fetch하고 texture lazy load |
| 대형 이미지의 GPU 메모리 | 2K 기본, KTX2, 품질 등급, 사용하지 않는 texture dispose |
| 3D 최종 모델이 카메라와 불일치 | primitive 회색상자로 화면 크기와 FOV 먼저 확정 |
| Editor 생성 파일 충돌 | `src/scripts.ts`, `public/scene`은 패킹 단계에서만 갱신 |
| 전투 종료 후 메모리 누수 | lifecycle 소유권과 dispose 통합 테스트 필수 |
| 기존 `npm run generate`가 배틀 제외 | B6에서 별도 `generate:battle` 또는 제외 정책 변경 |

## 12. 문서 및 이슈 관리

각 작업 단위에서 다음 문서를 함께 갱신한다.

- 이 계획서: 단계 상태와 검증 결과
- `BATTLE_SCENE_IMPLEMENTATION_PLAN.md`: 기술 설계 변경
- `ASSET_PRODUCTION_LIST.md`: 신규·교체 에셋과 용량

배틀 전용 이슈는 `docs/battlescene/BATTLE_SCENE_ISSUES.md`에 기록한다. 시작화면·맵선택 마이그레이션 이슈와 분리하되, 공통 빌드나 앱 통합에 영향을 주는 문제만 상위 `docs/MIGRATION_ISSUES.md`에도 연결한다.

## 13. 첫 실행 순서

앞단 완료 상태에서 바로 시작할 순서다.

1. 배틀 전용 이슈 기록 파일과 B0 상태 갱신
2. `BattleMapDefinition`과 manifest validator 작성
3. `city-day` manifest 단위 테스트 작성
4. asset URL resolver 작성
5. `BattleLaunchRequest.mapId` 계약 반영
6. 배틀 scene lifecycle 인터페이스 작성
7. `battlescene.scene` 회색상자 생성
8. 2D 배경 Plane과 렌더링 그룹 구성
9. primitive 모선과 카메라 X 이동 구현
10. 배틀 패킹과 React 조기 연결

## 14. 1차 플레이 가능 완료 기준

다음 조건을 모두 만족하면 첫 배틀 화면 prototype을 완료로 본다.

- [ ] `city-day`가 공통 map manifest 계약으로 로드된다.
- [ ] 6개 2D 레이어가 정상 합성된다.
- [ ] 모선 primitive를 좌우로 조작할 수 있다.
- [ ] 카메라가 좌우 약 ±100% 범위에서 모선을 추적한다.
- [ ] 지상 prototype 유닛이 X축으로만 이동한다.
- [x] 회피 원호와 추락 prototype을 실행할 수 있다.
- [x] React HUD와 canvas가 독립 레이어로 실행된다.
- [x] 같은 전투를 세 번 이상 재진입해도 리소스가 누적되지 않는다.
- [ ] 데스크톱 60 FPS 또는 목표 기기 기준 성능 결과가 기록된다.
- [ ] 시작화면·맵선택 파일과 회귀 동작에 영향이 없다.

## 15. 최종 완료 기준

- [x] 공통 배틀 씬 하나로 두 개 이상의 맵을 실행한다.
- [ ] 맵별 이미지 교체에 배틀 코드 수정이 필요 없다.
- [ ] 최종 신규 모선과 전투 유닛 3D 에셋이 적용된다.
- [ ] WebP fallback과 KTX2 빌드가 검증된다.
- [ ] 모바일과 데스크톱 성능 목표를 만족한다.
- [x] 전투 진입·추출·포기·대파 실패·Debrief 복구가 모두 동작한다.
- [ ] 전체 typecheck, test, production build와 Editor pack이 통과한다.

## 16. 2026-08-24 2D 게임플레이 이행 상태

- 시민 덩어리, 자동 SCAN, 능력 availability, 시간 기반 철수, 임무 포기, save v5 도시 자원 풀, RAID/OCCUPATION 코호트 분기와 상태 기반 적/지상 visual pool을 구현했다.
- River/Desert는 3D Coastal clone 대신 `sideViewBiomeCatalog`과 프로필로 2D 전투 데이터를 생성한다.
- `npm run test:e2e:side-view`는 정상 RAID·대파·모바일 900/640·포기·visual sync·production debug을 실행한다. 최종 3D 모델·KTX2·성능 예산은 아직 후속 범위다.
