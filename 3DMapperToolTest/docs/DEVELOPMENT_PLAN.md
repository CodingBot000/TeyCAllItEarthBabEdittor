# 3D Mapper Tool 개발 및 이전 계획서

## 1. 문서 목적

이 문서는 현재 게임 프로젝트인 `TeyCAllItEarthBabEdittor` 안에서 임시로 구현한 건물 텍스처 매핑·검수 기능과 관련 자산을 별도 프로젝트 `3DMapperToolTest`로 안전하게 이전하고, 이후 독립적인 3D 매핑 및 공간 배치 도구로 확장하기 위한 실행 계획을 정의한다.

이 문서 작성 단계에서는 다음 작업을 수행하지 않는다.

- 새 Vite 프로젝트 생성 및 패키지 설치
- 기존 소스와 자산의 복사 또는 이동
- 기존 게임 프로젝트의 코드·자산 삭제
- Blender 모델 생성 또는 GLB 내보내기

## 2. 결정 사항 요약

- 대상 프로젝트 위치: `/Users/switch/Development/Game/WebGame/3DMapperToolTest`
- 기술 기반: Vite + React + TypeScript + Babylon.js
- 3D 교환 형식: glTF 2.0 / GLB
- 모델링과 기본 UV unwrap: Blender 담당
- 웹툴 담당 범위: 모델 불러오기, 면 식별, 텍스처 배정, UV 보정, 회전 검수, 설정 저장, GLB 내보내기, 향후 공간 배치
- Babylon.js Editor: 도구의 기반이 아니라 최종 결과물을 가져가 게임 씬에 배치하는 후속 도구로 사용
- 기존 게임 프로젝트 정리: 새 프로젝트에서 이전 결과가 검증된 이후에만 수행

## 3. 목표

### 3.1 1차 목표

현재 구현된 건물 매핑 프로토타입을 새 프로젝트에서 동일하게 재현한다.

- 건물 4종 선택 및 표시
- 면별 텍스처 매핑
- 마우스 드래그 궤도 회전 및 휠 줌
- 상·하·좌·우 90도 회전 버튼
- 바닥 및 기준 방향 표시
- 면 식별자 표시
- 최종 회전값 JSON 출력 및 복사
- 건물별 크기, 매핑, UV 회전값 저장
- 생성 원본 PNG, 런타임 WebP, atlas, manifest 보존

### 3.2 2차 목표

Blender에서 만든 실제 GLB 모델을 불러와 편집할 수 있도록 확장한다.

- GLB 드래그 앤 드롭
- 메시 및 재질 슬롯 목록
- 메시·면 선택과 강조
- 텍스처 파일 배정
- UV 회전, 이동, 스케일, U/V 반전
- 변경 전후 비교
- Undo/Redo
- 프로젝트 파일 저장 및 다시 열기
- 수정 결과 GLB 내보내기

### 3.3 장기 목표

- 여러 오브젝트를 실제 공간에 배치
- 이동·회전·스케일 기즈모
- 그리드 및 스냅
- 복제, 삭제, 계층 구조
- 바닥, 조명, 환경 설정
- 충돌용 프록시 및 배치 메타데이터
- Babylon.js Editor용 에셋 패키지 생성
- Blender 자동화 스크립트 또는 로컬 브리지 연동
- AI 이미지 생성 및 텍스처 생성 파이프라인 연동

## 4. 범위에서 제외할 항목

초기 버전에서는 다음 기능을 구현하지 않는다.

- Blender 수준의 버텍스·엣지·폴리곤 모델링
- 복잡한 자동 UV unwrap
- 스컬프팅
- 리깅 및 애니메이션 편집
- Blender `.blend` 파일 자체를 브라우저에서 직접 편집
- 게임 로직 및 전투 씬 기능

복잡한 모델 수정과 UV unwrap은 Blender에서 수행하고, 웹툴은 텍스처 배정·보정·검수·배치에 집중한다.

## 5. 현재 구현 상태 조사 결과

### 5.1 현재 존재하는 건물 자산

| ID | 설명 | 크기 X×Y×Z | 상태 |
|---|---|---:|---|
| `building-001` | Brown Mid-rise Texture Test | 6×11×5 | 면별 생성 원본 및 런타임 자산 존재 |
| `building-002` | Foreground Light Office Tower | 6×12×5 | 생성 atlas 및 면별 자산 존재 |
| `building-003` | Warm Brown Balcony Mid-rise | 8×8×5 | 생성 atlas 및 면별 자산 존재 |
| `building-004` | White and Brown Stepped Apartments | 8×9×6 | 생성 atlas 및 면별 자산 존재 |

현재 자산 규모는 다음과 같다.

- 아트 원본: 38개 파일, 약 68MB
- 런타임 자산 원본: 32개 파일, 약 2.8MB
- `public` 런타임 복제본: 32개 파일, 약 2.8MB

### 5.2 현재 모델 파일 상태

현재 매핑 프로토타입과 관련된 `.blend`, `.glb`, `.gltf`, `.obj`, `.fbx` 파일은 존재하지 않는다.

현재 3D 모델은 Babylon.js 런타임에서 `MeshBuilder.CreateBox`로 생성한 직육면체이다. 따라서 “모델링 파일 전체 이전”은 다음 두 단계로 처리한다.

1. 현재 박스의 크기와 면 매핑을 새 프로젝트에서 동일하게 재현한다.
2. 재현된 건물 4종을 GLB로 내보내 실제 모델 파일로 영구 저장한다.

### 5.3 검증된 공통 면 매핑 프리셋

| 식별자 | 물리적 면 | 텍스처 | UV 회전 |
|---|---|---|---:|
| `F-01` | 앞면 | `front` | 0° |
| `B-02` | 뒷면 | `back` | 0° |
| `R-03` | 오른쪽 | `right` | 0° |
| `L-04` | 왼쪽 | `left` | -90° |
| `T-05` | 윗면 | `roof` | 0° |
| `D-06` | 아랫면 | `bottom` | 0° |

기본 오브젝트 회전은 `{ "x": 0, "y": 0, "z": 0 }`이다.

### 5.4 이전 대상 파일

#### 아트 원본과 생성 이미지

- `art-source/battlescene/maps/city-day/buildings/building-001/`
- `art-source/battlescene/maps/city-day/buildings/building-002/`
- `art-source/battlescene/maps/city-day/buildings/building-003/`
- `art-source/battlescene/maps/city-day/buildings/building-004/`
- `docs/reference_images/thetcall_inbattle_2d_day.png`

`~/.codex/generated_images`에 있는 생성 결과를 런타임 의존 경로로 사용하지 않는다. 필요한 생성 결과는 이미 `art-source` 아래에 보존되어 있으므로 이를 새 프로젝트의 정식 원본으로 사용한다.

#### 런타임 텍스처와 manifest

- `assets/battlescene/maps/city-day/buildings/`
- `public/assets/runtime/battlescene/maps/city-day/buildings/`

두 런타임 폴더의 중복 파일은 SHA-256으로 동일성을 확인한다. 동일한 파일은 새 프로젝트에서 한 벌만 정식 런타임 자산으로 보관하고, 중복 제거 사실을 이전 manifest에 기록한다.

#### 생성 및 변환 스크립트

- `scripts/generate-building-test-assets.mjs`
- `scripts/import-building-atlas-assets.mjs`

현재 `import-building-atlas-assets.mjs`는 사용자 홈의 Codex 생성 이미지 절대 경로를 포함한다. 이전할 때 입력을 새 프로젝트의 `art-source` 상대 경로로 바꾸어 재현 가능하게 만든다.

#### 프로토타입 UI 및 Babylon 런타임

- `src/game/battle/BuildingTextureTestScreen.tsx`
- `src/game/battle/runtime/createBuildingTextureTestScene.ts`
- `src/game/battle/runtime/buildingTextureMappingPreset.ts`
- `src/game/battle/BattleScreen.tsx`의 `building-test` 진입 코드
- `src/game/presentation/styles.css`의 `building-test-*`, `building-debug-*`, `building-face-*` 스타일
- `src/game/battle/runtime/createBattleRuntime.ts`의 초기 건물 테스트 코드
- `docs/battlescene/building_texture_mapping_preset.json`

### 5.5 현재 코드에서 이전 시 수정할 알려진 문제

- `createBuildingTextureTestScene.ts`의 텍스처 루트가 `building-001`로 고정되어 있다.
- 건물 선택 UI가 다른 ID를 선택해도 텍스처 경로는 건물 ID를 기준으로 동적으로 만들어져야 한다.
- 초기 테스트 코드가 `createBattleRuntime.ts`와 전용 테스트 씬 양쪽에 중복되어 있다.
- `assets`와 `public/assets/runtime`에 동일 런타임 파일이 중복 보관된다.
- 모델이 런타임에서만 생성되며 GLB 결과물이 없다.
- UV 보정값은 TypeScript와 JSON 양쪽에 중복 정의되어 있다.

새 프로젝트에서는 프로젝트 문서 모델을 단일 진실 공급원으로 사용하여 위 중복을 제거한다.

## 6. 새 프로젝트 기술 구성

### 6.1 기본 구성

```text
Vite
React
TypeScript
Babylon.js
```

### 6.2 권장 패키지

#### 런타임

- `@babylonjs/core`
- `@babylonjs/loaders`
- `@babylonjs/serializers`
- `@babylonjs/materials`
- `react`
- `react-dom`
- `zustand`
- `zod`

#### 개발 및 검증

- `vite`
- `@vitejs/plugin-react`
- `typescript`
- `eslint`
- `vitest`
- `@playwright/test`
- `sharp`: 원본 이미지 변환 및 atlas 빌드 스크립트에만 사용

### 6.3 좌표계와 단위

- Babylon 씬은 오른손 좌표계로 통일한다.
- 프로젝트 단위는 `1 unit = 1 meter`로 정한다.
- Blender에서 GLB를 내보낼 때 변환 적용, UV 포함, 재질 포함을 기본 규칙으로 사용한다.
- 가져온 모델은 루트 노드 아래에 배치하고 원본 변환과 사용자 보정 변환을 분리한다.

## 7. 목표 프로젝트 구조

```text
3DMapperToolTest/
├─ docs/
│  ├─ DEVELOPMENT_PLAN.md
│  ├─ ASSET_FORMAT.md
│  └─ MIGRATION_MANIFEST.md
├─ art-source/
│  ├─ references/
│  └─ buildings/
│     ├─ building-001/
│     ├─ building-002/
│     ├─ building-003/
│     └─ building-004/
├─ public/
│  └─ assets/
│     └─ buildings/
├─ projects/
│  └─ samples/
├─ scripts/
│  ├─ build-building-assets.mjs
│  ├─ migrate-building-assets.mjs
│  └─ verify-migration.mjs
├─ src/
│  ├─ app/
│  ├─ editor/
│  │  ├─ components/
│  │  ├─ state/
│  │  └─ commands/
│  ├─ engine/
│  │  └─ babylon/
│  ├─ features/
│  │  ├─ asset-import/
│  │  ├─ face-mapping/
│  │  ├─ uv-transform/
│  │  ├─ viewport/
│  │  ├─ project-save/
│  │  ├─ glb-export/
│  │  └─ scene-layout/
│  ├─ domain/
│  └─ styles/
├─ tests/
└─ package.json
```

## 8. 프로젝트 문서 데이터 형식

편집 상태는 GLB 내부 데이터와 별도로 `project.json`에 저장한다. 초기 스키마 예시는 다음과 같다.

```json
{
  "schemaVersion": 1,
  "id": "building-001",
  "displayName": "Brown Mid-rise Texture Test",
  "model": {
    "source": "models/building-001.glb",
    "dimensions": { "x": 6, "y": 11, "z": 5 },
    "rotationDeg": { "x": 0, "y": 0, "z": 0 }
  },
  "faces": {
    "front": { "id": "F-01", "texture": "front", "rotationDeg": 0, "offset": [0, 0], "scale": [1, 1], "flipU": false, "flipV": false },
    "back": { "id": "B-02", "texture": "back", "rotationDeg": 0, "offset": [0, 0], "scale": [1, 1], "flipU": false, "flipV": false },
    "right": { "id": "R-03", "texture": "right", "rotationDeg": 0, "offset": [0, 0], "scale": [1, 1], "flipU": false, "flipV": false },
    "left": { "id": "L-04", "texture": "left", "rotationDeg": -90, "offset": [0, 0], "scale": [1, 1], "flipU": false, "flipV": false },
    "roof": { "id": "T-05", "texture": "roof", "rotationDeg": 0, "offset": [0, 0], "scale": [1, 1], "flipU": false, "flipV": false },
    "bottom": { "id": "D-06", "texture": "bottom", "rotationDeg": 0, "offset": [0, 0], "scale": [1, 1], "flipU": false, "flipV": false }
  }
}
```

## 9. 단계별 실행 계획

### 단계 0. 이전 전 상태 고정

1. 현재 게임 프로젝트의 변경 상태를 기록한다.
2. 매핑 관련 파일 목록과 SHA-256 체크섬을 생성한다.
3. 기존 사용자의 다른 변경과 매핑 프로토타입 변경을 분류한다.
4. 삭제 전에 복구 가능한 Git 커밋 또는 별도 백업 지점을 만든다.
5. 원본 참조 이미지가 게임 프로젝트에서도 필요한지 소유권을 분류한다.

완료 조건:

- `MIGRATION_MANIFEST.md`에 원본 경로, 크기, 체크섬, 대상 경로가 기록되어 있다.
- 삭제 대상과 유지 대상이 명시적으로 분리되어 있다.

### 단계 1. Vite 프로젝트 생성

대상 폴더에서 React TypeScript 템플릿을 생성한다.

```bash
npm create vite@latest . -- --template react-ts
npm install
```

이후 Babylon.js 관련 패키지와 상태 관리·검증 패키지를 설치한다.

완료 조건:

- 개발 서버 실행 성공
- 타입 검사 성공
- 기본 테스트 성공
- 빈 Babylon 씬 렌더링 성공

### 단계 2. 자산 이전

1. `art-source`의 건물 4종 원본을 새 프로젝트로 복사한다.
2. 참조 이미지를 `art-source/references`로 복사한다.
3. 런타임 WebP와 manifest를 `public/assets/buildings`로 복사한다.
4. `assets`와 `public`의 중복 파일 체크섬을 비교한다.
5. 생성 스크립트를 새 프로젝트 상대 경로 기준으로 수정한다.
6. 모든 생성 자산을 스크립트만으로 다시 만들 수 있는지 검증한다.

주의:

- 복사와 검증이 완료되기 전에는 원본을 이동하거나 삭제하지 않는다.
- Codex 홈 폴더의 절대 경로를 새 프로젝트 코드나 manifest에 남기지 않는다.

### 단계 3. 현재 프로토타입 재현

1. Babylon 엔진, 씬, 카메라, 조명을 초기화한다.
2. 건물 정의에 따라 박스 모델을 생성한다.
3. 건물 ID를 포함한 동적 텍스처 경로를 사용한다.
4. 6개 면에 개별 텍스처를 매핑한다.
5. `L-04`에 -90° UV 회전을 적용한다.
6. 면 식별 라벨을 표시한다.
7. 궤도 카메라, 휠 줌, 90도 회전 버튼을 구현한다.
8. 바닥과 받침대를 표시한다.
9. 최종 회전값 JSON 출력과 복사를 구현한다.
10. 건물 선택 UI로 4종을 전환한다.

완료 조건:

- 건물 4종이 각각 자신의 텍스처를 사용한다.
- 새 건물을 선택했을 때 `building-001` 텍스처가 나타나는 경로 고정 문제가 없다.
- 기존 프로토타입과 동일한 방향으로 모든 면을 확인할 수 있다.
- `L-04`가 현재 검증된 방향으로 표시된다.

### 단계 4. 모델 파일 생성 및 GLB 파이프라인

1. 건물 4종의 직육면체 모델을 실제 메시 자산으로 생성한다.
2. 면별 UV와 재질 슬롯을 만든다.
3. Babylon serializer를 통해 건물별 GLB를 생성한다.
4. 생성된 GLB를 새 프로젝트에서 다시 불러온다.
5. Blender에서 열어 크기, 방향, UV, 텍스처를 확인한다.
6. Blender에서 다시 내보낸 GLB를 Babylon.js Editor에서 확인한다.

완료 조건:

- `building-001.glb`부터 `building-004.glb`까지 존재한다.
- 런타임 생성 박스 없이 GLB만으로 동일한 결과가 표시된다.
- GLB 왕복 후에도 면 방향과 `L-04` 보정이 유지된다.

### 단계 5. 전문 매핑 도구 기능 구현

1. GLB 및 텍스처 드래그 앤 드롭
2. 씬 트리와 메시 목록
3. 선택 메시 하이라이트
4. 면·재질 슬롯 매핑 패널
5. UV 회전, 이동, 확대·축소, 반전
6. 정면·후면·좌·우·상·하 카메라 프리셋
7. Undo/Redo 명령 스택
8. 자동 저장과 수동 저장
9. `project.json` 가져오기·내보내기
10. GLB 및 Babylon Editor용 패키지 내보내기

#### 단계 5 현재 반영 상태 (2026-08-24)

| 항목 | 상태 | 구현 메모 |
|---|---|---|
| GLB 드래그 앤 드롭·파일 선택 | 완료 | `.glb` Blob URL에 로더 확장자를 명시하고 외부 모델 루트로 로드 |
| 텍스처 드래그 앤 드롭 | 완료 | 이미지 파일을 data URL로 읽어 활성 면과 선택 GLB 메시 재질에 적용 |
| 씬 트리·메시 목록 | 완료 | 기본 프리셋 및 가져온 GLB 메시를 별도 트리로 표시 |
| 선택 메시 하이라이트 | 완료 | 기본 면 emissive 강조, 외부 메시 bounding box 강조 |
| UV 이동·스케일·반전 | 완료 | Inspector 입력값을 재질 텍스처의 offset/scale/address mode에 반영 |
| Undo/Redo | 완료 | 최대 50개 프로젝트 상태 스택, 툴바 버튼 및 Cmd/Ctrl+Z 단축키 |
| 면·재질 슬롯 매핑 패널 | 완료 | 기본 6면 패널과 선택 GLB 메시의 단일·다중 재질 슬롯 조회/선택/텍스처 적용 제공 |
| 카메라 프리셋 | 완료 | 정면·후면·좌·우·상·하 방향으로 ArcRotateCamera 위치와 타깃을 전환 |
| 자동 저장·수동 저장 | 완료 | Zustand localStorage에 프로젝트를 보존하고 외부 GLB 바이너리는 IndexedDB에 저장하여 새로고침 후 복원 |
| Babylon Editor용 패키지 내보내기 | 완료(메타데이터) | GLB 파일명과 project 설정을 포함한 `*.babylon-editor-package.json` 생성; 실제 압축 패키징은 후속 범위 |
| 번들 최적화 | 부분 완료 | GLB loader/serializer 동적 import와 Babylon manual chunk를 적용했으며 Babylon core 대형 청크는 후속 추적 |

단계 5의 남은 기능 구현은 위 표와 같이 기존 코드·참조 문서 범위에서 완료했다. 별도 개발계획서를 추가하지 않고, 잔여 성능 이슈와 실제 Editor 압축 패키징만 이 문서 및 이슈 기록에서 추적한다.

구현 중 발견한 이슈와 수정 이력은 [`DEVELOPMENT_ISSUES.md`](./DEVELOPMENT_ISSUES.md)에 계속 누적한다.

### 단계 6. 이전 결과 검증

검증은 다음 순서로 수행한다.

1. 원본과 대상의 파일 목록 비교
2. 원본 자산과 대상 자산의 SHA-256 비교
3. 4개 건물 육안 검수
4. UV 회전값 검수
5. GLB 재로드 검수
6. 브라우저 새로고침 후 프로젝트 복구 검수
7. 타입 검사, 단위 테스트, 프로덕션 빌드
8. Babylon.js Editor 가져오기 검수

### 단계 7. 기존 게임 프로젝트 정리

이 단계는 1~6단계가 모두 통과한 후에만 실행한다.

#### 삭제 대상

- `art-source/battlescene/maps/city-day/buildings/`
- `assets/battlescene/maps/city-day/buildings/`
- `public/assets/runtime/battlescene/maps/city-day/buildings/`
- `scripts/generate-building-test-assets.mjs`
- `scripts/import-building-atlas-assets.mjs`
- `src/game/battle/BuildingTextureTestScreen.tsx`
- `src/game/battle/runtime/createBuildingTextureTestScene.ts`
- `src/game/battle/runtime/buildingTextureMappingPreset.ts`
- `docs/battlescene/building_texture_mapping_preset.json`

#### 코드에서 제거할 부분

- `BattleScreen.tsx`의 `BuildingTextureTestScreen` import
- `BattleScreen.tsx`의 `building-test` 쿼리 분기
- `createBattleRuntime.ts`의 건물 테스트 상수, 쿼리 처리, 메시 생성, 포인터 처리 및 관련 helper
- `styles.css`의 건물 테스트 전용 스타일만 제거

#### 기본 유지 대상

- `docs/reference_images/thetcall_inbattle_2d_day.png`
- 게임 프로젝트에서 원래 사용하던 Babylon.js 및 Next.js 의존성
- 매핑 작업과 관계없는 사용자 변경 파일
- `docs/reference_images/cozy_horizon_sky_layers/` 등 다른 작업 자산

참조 이미지는 새 프로젝트에 복사하되, 게임 프로젝트에서 기존부터 사용되던 자료일 가능성이 있으므로 기본적으로 원본을 유지한다. 삭제가 필요하면 소유권 확인 후 별도 승인 단계에서 처리한다.

#### 정리 완료 조건

- `rg` 검색에서 `building-test`, `BuildingTextureTest`, `BUILDING_TEXTURE_MAPPING_PRESET` 참조가 남지 않는다.
- 게임 프로젝트 타입 검사와 테스트 및 빌드가 통과한다.
- 전투 씬과 기존 게임 동작에 회귀가 없다.
- 새 프로젝트의 자산과 GLB가 삭제 전 체크섬 및 육안 검증을 통과한다.

## 10. 테스트 전략

### 10.1 단위 테스트

- 건물 정의 및 manifest 파싱
- 면 ID와 텍스처 이름 매핑
- UV 회전 각도 정규화
- 90도 회전 스냅
- 프로젝트 JSON 검증
- 자산 경로 생성

### 10.2 통합 테스트

- 건물 선택 시 올바른 자산 로드
- 텍스처 교체 후 씬 갱신
- 저장한 프로젝트 다시 열기
- GLB 내보내기 후 재로드
- Undo/Redo 상태 복원

### 10.3 브라우저 테스트

- 드래그로 전체 방향 관찰
- 휠 줌
- 90도 회전 버튼
- 건물 선택
- 파일 드래그 앤 드롭
- 다운로드 결과 확인

### 10.4 시각 검수 체크리스트

- `F-01`은 앞면이다.
- `B-02`는 뒷면이다.
- `R-03`은 오른쪽이다.
- `L-04`는 왼쪽이며 -90° 보정되어 있다.
- `T-05`는 지붕이다.
- `D-06`은 바닥이다.
- 텍스처가 뒤집히거나 90도 어긋나지 않는다.
- 건물 비율이 manifest의 크기와 일치한다.

## 11. 삭제 안전장치와 복구 전략

- 새 프로젝트로 먼저 복사하고 검증한 뒤 기존 프로젝트를 정리한다.
- 삭제 직전에 현재 게임 프로젝트의 Git 상태를 다시 확인한다.
- 사용자 소유의 관련 없는 변경은 절대 되돌리거나 삭제하지 않는다.
- 디렉터리 단위 삭제 전 삭제 목록을 파일 단위로 출력한다.
- 체크섬 불일치 파일이 하나라도 있으면 삭제 단계를 중단한다.
- 새 프로젝트 빌드 또는 Babylon.js Editor 가져오기가 실패하면 삭제 단계를 중단한다.
- 정리 작업은 하나의 독립 커밋으로 만들어 되돌릴 수 있게 한다.

## 12. 최종 완료 기준

다음 조건이 모두 충족되어야 전체 이전 작업을 완료로 판정한다.

- `3DMapperToolTest`가 독립적으로 설치·실행된다.
- 건물 4종의 모든 원본 이미지와 런타임 텍스처가 보존된다.
- 건물 4종을 선택하고 모든 면을 회전하여 확인할 수 있다.
- 현재 검증된 공통 매핑 프리셋이 동일하게 적용된다.
- 건물 4종의 GLB 모델 파일이 생성된다.
- 프로젝트 설정을 JSON으로 저장하고 다시 열 수 있다.
- 내보낸 GLB를 Blender와 Babylon.js Editor에서 열 수 있다.
- 이전 manifest와 체크섬 검증이 통과한다.
- 기존 게임 프로젝트에서 임시 매핑 코드와 생성 자산이 제거된다.
- 기존 게임 프로젝트의 타입 검사, 테스트, 빌드가 통과한다.

## 13. 권장 실행 순서 요약

```text
현 상태 기록
  → 새 Vite 프로젝트 생성
  → 자산 복사 및 체크섬 확인
  → 현재 프로토타입 재현
  → 동적 건물 경로 문제 수정
  → 건물별 GLB 생성
  → Blender/Babylon Editor 왕복 검증
  → 전문 UV 편집 기능 추가
  → 최종 회귀 테스트
  → 기존 게임 프로젝트의 임시 코드·자산 삭제
```

이 순서를 변경하여 기존 프로젝트의 파일을 먼저 삭제하지 않는다.
