# TheyCallItEarth GLB 자산·미리보기 기능 통합 개발계획서

작성일: 2026-08-24  
상태: 전체 catalog 1,281개 이전 및 브라우저 연결 진행 중, layout/JC mesh 검수 보류, 원본 삭제는 미수행

## 1. 문서 목적

이 문서는 게임 프로젝트 `TheyCallItEarth`에 임시로 구현된 GLB 카탈로그 탐색, 개별 GLB 미리보기, JC LP MegaCity 통합 씬 검수, SimpleTown 카탈로그 배치·pick 기능을 독립 도구 `3DMapperToolTest`로 이전·통합하고, 검증 완료 후 게임 프로젝트에서 이전된 기능과 자산을 제거하기 위한 실행 계획을 정의한다.

### 원본 프로젝트

`/Users/switch/Development/Game/WebGame/TheyCallItEarth`

### 대상 프로젝트

`/Users/switch/Development/Game/WebGame/3DMapperToolTest`

### 개발문서 위치

`/Users/switch/Development/Game/WebGame/3DMapperToolTest/docs`

이번 문서 작성 단계에서는 다음 작업을 수행하지 않는다.

- GLB 및 카탈로그 파일 복사·이동
- 원본 프로젝트 파일 삭제
- Git 커밋·푸시
- Vercel 또는 AWS 배포
- Git 이력 재작성

## 2. 통합 목표

`3DMapperToolTest`를 다음 기능의 단일 소유 프로젝트로 만든다.

- Unity에서 변환된 GLB 카탈로그 목록 검색·필터링
- 개별 GLB 선택 및 Babylon.js 미리보기
- 통합 씬 GLB 전체 로드 및 카메라 자동 프레이밍
- GLB 내부 TransformNode/mesh 계층 유지 및 씬 트리 표시
- mesh/node pick 및 선택 정보 표시
- `assetId`, `instanceId`, `category` 메타데이터 연결
- 선택 mesh의 재질 슬롯 및 텍스처 매핑 편집
- 위치·회전·스케일 편집과 향후 다중 오브젝트 공간 배치
- 프로젝트 JSON 저장, IndexedDB 복구, GLB 내보내기
- SimpleTown 및 JC LP MegaCity 배치 데이터를 편집기 샘플 프로젝트로 사용

최종적으로 `TheyCallItEarth`에는 위 개발용 도구 UI, 카탈로그 브라우저, 테스트 씬, 편집용 개별 GLB 카탈로그를 남기지 않는다.

## 3. 핵심 결정 사항

### 3.1 GLB 바이너리는 Git에 커밋하지 않는다

대상 프로젝트는 GLB를 Git LFS로도 추적하지 않는다. 모든 대용량 GLB는 다음 로컬 전용 루트에서 별도 자산으로 관리한다.

`/Users/switch/Development/Game/WebGame/3DMapperToolTest/local-assets/glb`

`.gitignore`에는 최소한 다음 규칙을 추가한다.

```gitignore
/local-assets/**/*.glb
/local-assets/**/*.bin
/local-assets/**/*.fbx
/local-assets/**/*.blend
```

카탈로그 JSON, 배치 JSON, 체크섬 manifest처럼 크기가 작은 메타데이터는 Git에 커밋할 수 있다. 실제 GLB 바이너리만 저장소와 일반 빌드 산출물에서 제외한다.

### 3.2 `public/` 아래에 대용량 GLB를 두지 않는다

`local-assets/`는 Vite의 `public/` 밖에 둔다. 이렇게 해야 `npm run build`가 2GB 이상의 GLB를 `dist/`로 복사하지 않는다.

개발 서버에서는 Vite 전용 middleware가 `local-assets/glb`를 읽기 전용 URL로 제공한다. 프로덕션 또는 원격 검수 환경에서는 환경변수로 S3/CloudFront 같은 외부 자산 URL을 지정한다.

예상 구성:

```text
로컬 개발: /__local_glb__/catalog/...
원격 환경:  ${VITE_GLB_ASSET_BASE_URL}/catalog/...
파일 편집:  브라우저 File API + IndexedDB
```

### 3.3 원본 경로와 런타임 URL을 분리한다

기존 카탈로그의 `glbPath`는 `TheyCallItEarth`의 `/assets/runtime/models/...` 경로에 고정되어 있다. 대상 프로젝트에서는 카탈로그 레코드의 논리 경로와 실제 자산 base URL을 분리한다.

```text
catalog asset key
  → asset source resolver
    → local-assets 개발 URL
    → S3/CloudFront URL
    → 사용자가 선택한 File/IndexedDB
```

카탈로그 JSON 전체를 환경별 URL로 다시 생성하지 않고, 하나의 resolver가 실행 환경에 맞는 URL을 만든다.

### 3.4 `City_Static.glb`는 이전·삭제 대상이 아니다

기존 게임 배경인 다음 파일은 게임 런타임 필수 자산으로 분류한다.

`/Users/switch/Development/Game/WebGame/TheyCallItEarth/public/assets/runtime/models/city/City_Static.glb`

이 파일은 복사·교체·삭제·수정하지 않는다. 자산 뷰어에서 이 파일을 미리보기하던 UI 참조만 제거한다. 게임에서 사용하는 기존 로딩 경로는 유지한다.

### 3.5 삭제는 검증 이후 별도 승인 단계에서 수행한다

이전은 먼저 복사하고 SHA-256을 검증하는 방식으로 진행한다. 원본 삭제 직전에 파일 단위 삭제 후보 목록과 현재 Git 상태를 다시 출력하고 사용자 승인을 받는다.

## 4. 현재 조사 결과

### 4.1 원본 프로젝트 상태

- 기준 브랜치: `main`
- 조사 시점 HEAD: `d24d56d`
- 기존 사용자 수정 문서와 카탈로그 manifest 수정이 남아 있다.
- `jc-lp-megacity` 개별 카탈로그와 배치 JSON은 Git 미추적 상태다.
- JC LP MegaCity 통합 GLB는 Git LFS 추적 상태다.

원본의 기존 사용자 변경은 이전 작업 커밋에 섞거나 되돌리지 않는다.

### 4.2 대상 프로젝트 상태

- 기준 브랜치: `master`
- 조사 시점 HEAD: `42e4f2a`
- Vite + React + TypeScript + Babylon.js 편집기가 이미 구현되어 있다.
- GLB 파일 선택·드래그 앤 드롭, IndexedDB 저장, 씬 트리, mesh 선택, 재질 슬롯, 텍스처 적용, UV 변환, Undo/Redo, GLB 내보내기를 지원한다.
- 조사 시점에 대상 프로젝트의 다수 파일이 Git 미추적 상태이므로, 통합 전에 현재 프로젝트 자체의 기준 커밋 또는 복구 지점을 먼저 확보해야 한다.

### 4.3 이전 후보 GLB 자산 규모

| 패키지/자산 | GLB 수 | 실제 바이트 | 현재 Git 상태 | 통합 방향 |
|---|---:|---:|---|---|
| `jc-lp-megacity` 개별 카탈로그 | 749 | 2,343,155,076 | 미추적 | 대상 로컬 자산으로 이전 |
| `simplepoly-city` | 138 | 8,074,012 | 추적 | 대상 로컬 자산으로 이전 |
| `simpletown-city` | 209 | 37,698,684 | 추적 | 대상 로컬 자산 및 샘플 배치로 이전 |
| `toon-city-pack` | 127 | 31,183,928 | 추적 | 대상 로컬 자산으로 이전 |
| `tooncars` | 4 | 13,072,344 | 추적 | 대상 로컬 자산으로 이전 |
| `toontown-animations` | 36 | 1,914,272 | 추적 | 대상 로컬 자산으로 이전 |
| `toontown-characters` | 18 | 130,277,432 | 추적 | 대상 로컬 자산으로 이전 |
| `catalog-excluded` 검수 자산 | 3 | 203,015 | 추적 | 격리된 검수 자산으로 이전 |
| `JC_LP_MegaCity_Demo_Static.glb` | 1 | 220,869,660 | Git LFS | 대상 통합 씬 자산으로 이전 |

카탈로그 exported 합계는 1,281개다. 제외 자산 3개와 통합 씬 1개까지 포함한 이전 후보는 총 1,285개 GLB이며, 전체 크기는 약 2.6GiB다.

JC LP MegaCity 배치 JSON도 함께 이전한다.

`/Users/switch/Development/Game/WebGame/TheyCallItEarth/public/assets/runtime/maps/jc-lp-megacity/LP_MegaCity_Demo.layout.json`

### 4.4 원본에 유지할 게임 자산

다음은 편집기 카탈로그가 아니라 게임 런타임 자산이므로 이전 후에도 원본 프로젝트에 유지한다.

- `public/assets/runtime/models/city/City_Static.glb`
- `public/assets/runtime/models/city/landmarks/`
- `public/assets/runtime/models/city/realistic/`
- `public/assets/runtime/models/city/shared/`
- 기존 카메라, 전투, 플레이어, 이동 및 공통 게임 자산 로더

## 5. 이전 대상 기능

### 5.1 Unity GLB 자산 뷰어

원본 파일:

- `src/presentation/screens/AssetPreviewScreen.tsx`
- `src/rendering/babylon/AssetPreviewScene.ts`
- `src/rendering/babylon/UnityAssetCatalog.ts`
- `src/rendering/babylon/UnityAssetCatalog.test.ts`
- `public/assets/runtime/manifests/unity-asset-catalog.json`
- 관련 메뉴, 화면 route, i18n, CSS

이 기능은 대상 프로젝트의 기존 `AssetLibrary`, `Viewport`, `SceneTree`, `buildingScene`에 흡수한다. 별도의 게임 스타일 화면을 그대로 복사하지 않는다.

### 5.2 JC LP MegaCity 통합 씬 검수

원본 파일:

- `src/presentation/screens/JcLpMegaCityDemoScreen.tsx`
- `src/rendering/babylon/JcLpMegaCityDemoScene.ts`
- `src/rendering/babylon/JcLpMegaCityDemoScene.test.ts`
- `public/assets/runtime/models/city/JC_LP_MegaCity_Demo_Static.glb`
- 관련 메뉴, 화면 route, i18n, CSS, `.gitattributes` LFS 규칙

통합 후에는 대상 편집기의 “Scene Asset” 모드에서 동일한 GLB를 로드한다. 전체 bounds 프레이밍, 로딩 오류 표시, node/mesh 계층 유지, pick 기능을 대상 Babylon 컨트롤러의 공통 기능으로 만든다.

### 5.3 SimpleTown 카탈로그 맵과 pick 메타데이터

원본 파일:

- `src/data/simpleTownMap.ts`
- `src/rendering/babylon/tactical/SimpleTownEnvironmentVisual.ts`
- `src/rendering/babylon/TacticalScene.ts`의 SimpleTown 분기와 pick 연결
- `src/rendering/babylon/tactical/TacticalEnvironmentVisual.ts`의 SimpleTown snapshot 타입
- `src/rendering/babylon/tactical/TacticalDebugSerializer.ts`의 SimpleTown debug 출력

현재 SimpleTown은 미리보기 전용이 아니라 서울 전투 씬에서 실제로 선택된다. 따라서 대상 프로젝트에서 샘플 씬으로 재현·검증한 뒤, 원본 게임의 서울 특례를 기존 공통 `TacticalEnvironmentVisual` 경로로 되돌려야 한다. 이 전환 검증 전에는 SimpleTown 코드나 GLB를 원본에서 제거하지 않는다.

### 5.4 검증 도구와 문서

이전 후보:

- `tools/validate-unity-asset-catalog.mjs`
- `package.json`의 `unity:assets:validate` 명령
- `docs/UNITY_ASSETS_TO_BABYLON_EXECUTION_PLAN.md`
- `docs/UNITY_GLB_CONVERSION_REGISTRY.md`

원본 문서 두 개는 현재 사용자 수정 상태이므로, 실행 시 현재 작업 트리 내용을 그대로 대상 프로젝트에 먼저 복사하고 체크섬을 기록한다. 대상에서 문서가 확인된 뒤에만 원본 문서 제거 여부를 승인받는다.

## 6. 대상 프로젝트 권장 구조

```text
3DMapperToolTest/
├─ local-assets/                         # Git 제외, build 제외
│  └─ glb/
│     ├─ catalog/
│     │  ├─ simplepoly-city/
│     │  ├─ simpletown-city/
│     │  ├─ jc-lp-megacity/
│     │  ├─ toon-city-pack/
│     │  ├─ tooncars/
│     │  ├─ toonpeople/
│     │  ├─ toontown-characters/
│     │  └─ toontown-animations/
│     ├─ catalog-excluded/
│     └─ scenes/
│        └─ jc-lp-megacity/
│           └─ JC_LP_MegaCity_Demo_Static.glb
├─ catalogs/                             # JSON 메타데이터, Git 추적 가능
│  └─ unity/
│     ├─ catalog-manifest.json
│     └─ packages/
├─ projects/
│  └─ samples/
│     ├─ simpletown-seoul.scene.json
│     └─ jc-lp-megacity-demo.scene.json
├─ scripts/
│  ├─ verify-external-glb-assets.mjs
│  ├─ build-glb-migration-manifest.mjs
│  └─ check-no-tracked-glb.mjs
├─ src/
│  ├─ domain/
│  │  ├─ assetCatalog.ts
│  │  ├─ assetInstance.ts
│  │  └─ sceneProjectSchema.ts
│  ├─ editor/
│  │  ├─ components/
│  │  │  ├─ CatalogBrowser.tsx
│  │  │  ├─ AssetLibrary.tsx
│  │  │  ├─ SceneTree.tsx
│  │  │  └─ Inspector.tsx
│  │  └─ state/
│  ├─ engine/babylon/
│  │  ├─ buildingScene.ts
│  │  ├─ assetSourceResolver.ts
│  │  ├─ catalogAssetLoader.ts
│  │  └─ sceneAssetController.ts
│  └─ config/
│     └─ assetSources.ts
└─ docs/
   ├─ THEY_CALL_IT_EARTH_GLB_TOOL_INTEGRATION_PLAN.md
   └─ THEY_CALL_IT_EARTH_GLB_MIGRATION_MANIFEST.md
```

## 7. 통합 설계

### 7.1 편집기 모드

하나의 Babylon 엔진과 Viewport를 유지하면서 작업 대상을 다음 세 모드로 구분한다.

1. `building`: 기존 6면 건물 텍스처 매핑
2. `asset`: 카탈로그에서 선택한 개별 GLB 편집·검수
3. `scene`: 통합 GLB 또는 여러 인스턴스가 배치된 씬 편집·검수

모드를 바꿀 때 이전 AssetContainer, Blob URL, mesh selection, 재질 참조를 명시적으로 dispose하여 메모리 누적을 막는다.

### 7.2 카탈로그 브라우저

- manifest와 패키지 catalog JSON만 먼저 읽는다.
- 1,281개 GLB 바이너리를 한꺼번에 요청하지 않는다.
- 패키지, category, asset ID, Unity source path로 검색한다.
- 목록에는 파일명, category, 크기, export 상태를 표시한다.
- 사용자가 선택한 GLB 하나만 지연 로드한다.
- 제외·실패 자산은 기본 목록과 분리된 검수 필터에서만 표시한다.

### 7.3 공통 GLB 로더

기존 대상 편집기의 `loadGlb(file: File)`을 다음 입력을 받는 공통 로더로 확장한다.

```ts
type GlbAssetSource =
  | { kind: 'file'; file: File }
  | { kind: 'catalog'; assetId: string; url: string }
  | { kind: 'scene'; sceneId: string; url: string }
  | { kind: 'indexed-db'; key: string };
```

공통 로더는 다음을 보장한다.

- GLB 내부 node/mesh 이름과 부모 계층 유지
- merge/flatten 금지
- 실제 mesh별 `isPickable = true`
- 전체 bounds 기반 카메라 자동 프레이밍
- 로딩 경로와 오류 원인 UI 표시
- 이전 로드 자산 완전 dispose
- 원본 material slot과 texture 정보 유지

### 7.4 씬 트리와 pick

현재 대상 프로젝트는 가져온 GLB mesh를 루트 아래 한 단계로 평탄하게 표시한다. 통합 시 Babylon TransformNode/mesh 부모 관계를 재귀적으로 읽어 씬 트리에 그대로 반영한다.

선택된 각 node/mesh에는 다음 편집기 메타데이터를 연결한다.

```ts
interface MapperAssetMetadata {
  assetId: string;
  instanceId: string;
  category: string;
  packageId?: string;
  sourcePath?: string;
  glbPath: string;
  nodeName: string;
}
```

Viewport pick, SceneTree 선택, Inspector 선택은 같은 `instanceId/nodeId`를 사용한다. 캔버스 클릭 시 콘솔 출력에 그치지 않고 Inspector에도 선택 정보를 표시한다.

### 7.5 개별 자산 편집

카탈로그 GLB를 선택하면 기존 편집 기능을 재사용한다.

- mesh 선택 및 bounding box 강조
- material/multi-material 슬롯 목록
- 텍스처 교체
- UV offset, scale, U/V flip
- 회전 및 카메라 프리셋
- GLB 다시 내보내기
- project JSON 저장 및 IndexedDB 복구

기존 `building` 모드의 6면 전용 데이터와 일반 GLB mesh 편집 데이터를 하나의 스키마에 억지로 넣지 않는다. `sceneProjectSchema`를 추가하고 기존 `projectSchema`와 명시적으로 버전·타입을 구분한다.

### 7.6 씬 편집

SimpleTown은 개별 GLB 인스턴스 배치 샘플로 변환한다.

- `assetId`, `instanceId`, `category`
- position, rotation, scale
- 건물, 도로, 차량, 소품 분류
- 인스턴스별 pick

JC LP MegaCity는 두 가지 검수 경로를 제공한다.

- 통합 씬 GLB: 원본 계층 및 전체 도시 검수
- 개별 GLB + layout JSON: 배치 편집 및 인스턴스 메타데이터 검수

두 경로는 서로 대체하거나 GLB를 다시 합치지 않는다. 각각 “통합 원본 씬 검수”와 “편집 가능한 개별 배치” 용도로 구분한다.

### 7.7 로컬 자산과 원격 자산

`assetSourceResolver`는 다음 우선순위를 사용한다.

1. 사용자가 브라우저로 직접 연 File/IndexedDB 자산
2. 로컬 개발용 `/__local_glb__/` URL
3. `VITE_GLB_ASSET_BASE_URL`로 지정된 S3/CloudFront URL

프로젝트 JSON에는 컴퓨터 절대 경로를 저장하지 않는다. 논리적 `assetId`와 상대 자산 경로만 저장한다.

## 8. 단계별 실행 계획

### 단계 0. 기준 상태와 복구 지점 확보

1. 원본과 대상 프로젝트의 Git 상태를 각각 기록한다.
2. 대상 프로젝트의 현재 미추적 파일을 검토하고 기준 커밋 또는 별도 복구 지점을 만든다.
3. 원본의 사용자 수정 파일을 이전 작업과 분리한다.
4. 이전 후보 전체의 파일 목록, 크기, SHA-256을 생성한다.
5. `City_Static.glb`의 SHA-256을 별도 보존 기준으로 기록한다.

완료 조건:

- 두 프로젝트의 시작 커밋과 dirty 상태가 문서에 기록된다.
- 이전 후보와 원본 유지 대상이 파일 단위로 구분된다.
- 삭제 전 복구 가능한 기준점이 존재한다.

### 단계 1. 대상 프로젝트 외부 자산 정책 구현

1. `local-assets/glb` 구조를 만든다.
2. GLB 복사 전에 `.gitignore`를 먼저 적용한다.
3. `check-no-tracked-glb.mjs`를 작성한다.
4. Vite 개발 전용 읽기 URL을 구현한다.
5. 원격 base URL 환경변수 resolver를 구현한다.
6. `npm run build`가 `local-assets`를 포함하지 않는지 테스트한다.

완료 조건:

- `git status`에 GLB가 나타나지 않는다.
- `git ls-files '*.glb'` 결과가 0개다.
- `dist/`에 GLB가 0개다.
- 로컬 개발 서버에서는 샘플 GLB 하나를 정상 로드한다.

### 단계 2. 비파괴 자산 복사

1. 카탈로그별 GLB를 대상 `local-assets/glb/catalog`로 복사한다.
2. 제외 자산은 `catalog-excluded`로 분리한다.
3. JC LP MegaCity 통합 GLB를 `scenes/jc-lp-megacity`로 복사한다.
4. 카탈로그 JSON과 전체 manifest를 대상 `catalogs/unity`로 복사·정규화한다.
5. JC layout JSON을 대상 샘플 프로젝트 입력으로 복사한다.
6. 원본·대상의 파일 수, 바이트, SHA-256을 비교한다.

완료 조건:

- 1,285개 GLB 후보의 이전 결과가 manifest에 기록된다.
- 복사 대상의 체크섬 불일치가 0개다.
- 원본 파일은 아직 삭제되지 않았다.

### 단계 3. 카탈로그·자산 소스 계층 통합

1. 원본의 Zod 카탈로그 스키마와 테스트를 대상 프로젝트로 포팅한다.
2. React 19/Babylon 8 코드를 그대로 복사하지 않고 대상의 React 18/Babylon 9 API에 맞춘다.
3. `assetSourceResolver`와 `catalogAssetLoader`를 구현한다.
4. 기존 File/IndexedDB GLB 로드 경로와 카탈로그 URL 로드 경로를 하나의 controller API로 통합한다.
5. 잘못된 GLB magic, 0바이트, catalog byte mismatch, 404를 사용자에게 표시한다.

완료 조건:

- 모든 catalog JSON 파싱 테스트가 통과한다.
- 로컬, IndexedDB, 원격 URL 입력이 동일한 씬 로더를 사용한다.
- 로더 오류에 assetId와 실제 요청 URL이 포함된다.

### 단계 4. 자산 뷰어를 편집기 UI에 통합

1. `AssetLibrary`에 Catalog 탭과 검색을 추가한다.
2. package/category별 그룹과 파일 크기를 표시한다.
3. 선택된 개별 GLB를 기존 Viewport에 로드한다.
4. mesh/정점 수와 로드 상태를 표시한다.
5. 기존 건물 4종 편집 흐름과 모드 전환 시 상태가 섞이지 않게 한다.

완료 조건:

- 기존 건물 매핑 기능이 그대로 동작한다.
- 카탈로그 자산은 선택한 것만 네트워크/파일에서 읽는다.
- 검색과 패키지/category 필터가 1,281개 레코드에서 동작한다.

### 단계 5. 계층·pick·메타데이터 통합

1. TransformNode와 mesh 계층을 재귀 SceneTree로 변환한다.
2. mesh pick과 SceneTree 선택을 양방향 동기화한다.
3. `assetId`, `instanceId`, `category` 메타데이터를 인스턴스 루트와 자식 mesh에 연결한다.
4. Inspector에 node name, parent, asset path, category, instance transform을 표시한다.
5. 편집 중 GLB node 이름과 계층을 merge/flatten하지 않는다.

완료 조건:

- 개별 건물, 도로, 차량, 소품 mesh가 pick 가능하다.
- 선택 정보가 Console, SceneTree, Inspector에서 동일하다.
- 같은 assetId를 여러 번 배치해도 instanceId가 서로 다르다.

### 단계 6. SimpleTown·JC LP MegaCity 샘플 씬 통합

1. `simpleTownMap.ts`의 배치를 `simpletown-seoul.scene.json`으로 변환한다.
2. JC layout JSON을 `jc-lp-megacity-demo.scene.json` 프로젝트로 변환한다.
3. JC 통합 GLB를 Scene Asset으로 등록한다.
4. 통합 GLB 전체 bounds 프레이밍을 적용한다.
5. 대용량 씬 로딩 중 진행 상태와 취소/교체 처리를 구현한다.
6. 씬 전환 시 AssetContainer와 GPU 자원을 dispose한다.

완료 조건:

- SimpleTown 개별 인스턴스를 이동·회전·스케일하고 저장할 수 있다.
- JC 개별 배치 프로젝트와 통합 GLB 검수 모드가 각각 열린다.
- JC 통합 GLB의 11,284개 pickable mesh와 내부 노드 선택을 기준 검수한다.
- 749개 개별 GLB를 한 번에 로드하지 않는다.

### 단계 7. 대상 프로젝트 검증

다음 명령을 통과시킨다.

```bash
npm run typecheck
npm run test
npm run build
npm run check
npm run assets:verify
npm run assets:check-untracked
```

브라우저에서는 다음을 확인한다.

- 기존 building-001~004 편집 기능
- File/drag-and-drop GLB 불러오기
- 새로고침 후 IndexedDB 복구
- 개별 카탈로그 검색·선택·로드
- node/mesh pick과 SceneTree 동기화
- 재질 슬롯 및 텍스처 편집
- GLB 내보내기와 재로드
- SimpleTown 샘플 씬 저장·다시 열기
- JC 통합 씬 로드, 자동 프레이밍, pick
- 누락 파일 오류에 경로와 원인이 표시되는지 확인
- `dist` 및 Git 추적 목록에 GLB가 없는지 확인

### 단계 8. 원본 게임에서 기능 연결 해제

1. 메인 메뉴의 Asset Preview 버튼과 JC LP MegaCity Demo 버튼을 제거한다.
2. `ASSET_PREVIEW`, `JC_LP_MEGACITY_DEMO` 화면 route를 제거한다.
3. 관련 화면, Babylon scene, 테스트, i18n, CSS를 제거한다.
4. 서울 전투 씬의 SimpleTown 특례를 제거하고 기존 공통 환경 경로를 사용한다.
5. SimpleTown 전용 pick/debug snapshot 필드를 제거한다.
6. 카탈로그 loader가 다른 게임 기능에서 사용되지 않는지 `rg`로 재검증한다.
7. `unity:assets:validate` 명령과 전용 검증 스크립트의 소유권을 대상 프로젝트로 이전한다.

완료 조건:

- 기존 게임 메인 메뉴와 캠페인 진입이 정상 동작한다.
- 서울을 포함한 기존 전투 씬이 공통 환경에서 정상 동작한다.
- 카메라, 전투, 플레이어, 이동 로직 테스트가 통과한다.
- 원본 코드에서 AssetPreview, JcLpMegaCityDemo, SimpleTown catalog 참조가 0개다.
- `City_Static.glb` 해시가 이전 전과 동일하다.

### 단계 9. 원본 자산 제거 승인 게이트

단계 0~8이 모두 통과한 뒤 다음 정보를 사용자에게 먼저 보고한다.

- 제거할 절대 경로 전체 목록
- 파일 수와 총 용량
- 대상 프로젝트 체크섬 검증 결과
- 대상 프로젝트 Git에 GLB가 추적되지 않았다는 결과
- 원본·대상 테스트 결과
- 추적 파일과 미추적 파일의 복구 방식

사용자 승인 후에만 다음을 제거한다.

- `public/assets/runtime/models/catalog/`의 이전 완료 패키지
- `public/assets/runtime/models/catalog-excluded/`의 이전 완료 검수 자산
- `public/assets/runtime/models/city/JC_LP_MegaCity_Demo_Static.glb`
- `public/assets/runtime/maps/jc-lp-megacity/`
- `public/assets/runtime/manifests/unity-asset-catalog.json`
- 이전 대상 화면·씬·카탈로그·SimpleTown 코드
- 관련 테스트, 메뉴, i18n, CSS
- `.gitattributes`의 JC 통합 GLB LFS 규칙
- `.vercelignore`의 더 이상 필요 없는 카탈로그 예외

`City_Static.glb`와 게임 전용 city 자산은 제거하지 않는다.

### 단계 10. 원본 게임 최종 회귀 검증

```bash
npm run typecheck
npm run lint
npm run test
npm run assets:validate
npm run build
```

추가 확인:

- `rg`로 제거 대상 참조가 남지 않았는지 검사
- `public/assets/runtime/models/catalog` 요청이 발생하지 않는지 브라우저 Network 검사
- JC LP MegaCity 통합 GLB 요청이 발생하지 않는지 검사
- 기존 `City_Static.glb` 기반 맵 로드 확인
- 기존 메뉴, 캠페인, 세계 지도, 전투, 복귀 흐름 확인
- 빌드 산출물과 배포 업로드 대상 용량 확인

## 9. 원본 제거 예상 파일 범위

### 완전 제거 후보

- `src/presentation/screens/AssetPreviewScreen.tsx`
- `src/rendering/babylon/AssetPreviewScene.ts`
- `src/presentation/screens/JcLpMegaCityDemoScreen.tsx`
- `src/rendering/babylon/JcLpMegaCityDemoScene.ts`
- `src/rendering/babylon/JcLpMegaCityDemoScene.test.ts`
- `src/data/simpleTownMap.ts`
- `src/rendering/babylon/tactical/SimpleTownEnvironmentVisual.ts`
- `src/rendering/babylon/UnityAssetCatalog.ts`
- `src/rendering/babylon/UnityAssetCatalog.test.ts`
- `tools/validate-unity-asset-catalog.mjs`
- `public/assets/runtime/manifests/unity-asset-catalog.json`
- 이전 완료된 catalog 및 catalog-excluded 자산
- JC 통합 GLB와 JC layout JSON

### 부분 수정 후보

- `src/app/App.tsx`
- `src/domain/types.ts`
- `src/presentation/screens/MainMenuScreen.tsx`
- `src/i18n/I18nProvider.tsx`
- `src/presentation/styles.css`
- `src/rendering/babylon/TacticalScene.ts`
- `src/rendering/babylon/tactical/TacticalEnvironmentVisual.ts`
- `src/rendering/babylon/tactical/TacticalDebugSerializer.ts`
- `package.json`
- `.gitattributes`
- `.vercelignore`

부분 수정 파일에서는 이전 기능과 관련된 import, route, UI, 타입, 스타일, debug 필드만 제거한다. 다른 게임 기능이나 사용자 변경은 보존한다.

## 10. Git 및 저장소 정리 정책

### 대상 프로젝트

- GLB는 일반 Git과 Git LFS 모두 사용하지 않는다.
- 커밋 전에 `git status --ignored`와 `git ls-files '*.glb'`를 검사한다.
- catalog JSON과 migration manifest만 커밋한다.
- 대용량 자산의 위치와 복구 방법은 README로 문서화한다.

### 원본 프로젝트

일반 `git rm`은 현재 브랜치와 향후 배포에서 파일을 제거하지만 과거 Git 이력의 바이너리까지 없애지는 않는다. 저장소 과거 이력까지 줄이려면 `git filter-repo`와 force push가 필요하며, 이는 이번 통합과 분리된 고위험 작업이다. 별도 명시적 승인 없이는 Git 이력 재작성이나 LFS 원격 객체 삭제를 수행하지 않는다.

권장 커밋 분리:

1. 대상 프로젝트 현재 상태 기준 커밋
2. 대상 외부 자산 인프라 및 Git 제외 규칙
3. 대상 카탈로그 브라우저·공통 GLB 로더
4. 대상 씬 편집·메타데이터·샘플 프로젝트
5. 대상 검증 문서와 migration manifest
6. 원본 게임 UI·코드 연결 해제
7. 사용자 승인 후 원본 자산 제거

## 11. 테스트 및 인수 기준

### 대상 프로젝트 인수 기준

- 기존 건물 매핑 기능에 회귀가 없다.
- 1,281개 catalog 레코드를 검색할 수 있다.
- 선택된 GLB만 지연 로드한다.
- GLB 내부 node/mesh 계층과 이름이 유지된다.
- mesh pick과 metadata 표시가 동작한다.
- SimpleTown 개별 인스턴스 배치를 편집·저장·복원할 수 있다.
- JC 통합 GLB가 자동 프레이밍되고 개별 mesh가 pick된다.
- GLB 누락·0바이트·404·loader 오류가 UI에 표시된다.
- 모든 자산 체크섬이 원본과 일치한다.
- Git 추적 GLB가 0개다.
- `dist` 포함 GLB가 0개다.
- typecheck, test, build, browser 검수가 통과한다.

### 원본 프로젝트 인수 기준

- 개발용 Asset Preview와 JC Demo 메뉴가 제거된다.
- 관련 route, i18n, CSS, 테스트, loader 참조가 제거된다.
- SimpleTown 특례 제거 후 서울 전투가 기존 공통 환경으로 동작한다.
- 카메라, 전투, 플레이어, 이동 로직이 이전과 동일하게 동작한다.
- 기존 `City_Static.glb`가 수정·삭제·교체되지 않는다.
- 게임 전용 city/landmarks/realistic/shared 자산이 보존된다.
- 카탈로그와 JC 통합 GLB가 빌드·배포 대상에 남지 않는다.
- typecheck, lint, test, assets validation, build가 통과한다.

## 12. 위험 요소와 대응

### 12.1 SimpleTown 제거로 서울 전투 배경이 달라질 수 있음

SimpleTown은 현재 실제 전투 분기에 연결되어 있다. 원본 제거 전에 서울을 공통 전투 환경으로 전환하고 브라우저 회귀 검수를 수행한다.

### 12.2 대상 프로젝트에 대용량 GLB가 실수로 커밋될 수 있음

GLB 복사 전에 ignore 규칙을 적용하고, `check-no-tracked-glb.mjs`를 `npm run check`에 포함한다.

### 12.3 `npm run build`가 로컬 GLB를 복사할 수 있음

자산을 `public/` 밖에 두고, 빌드 후 `dist`에서 `.glb` 파일이 0개인지 자동 검사한다.

### 12.4 221MB 통합 GLB의 브라우저 메모리 사용량

파일 크기보다 디코딩 후 CPU/GPU 메모리가 커질 수 있다. 통합 씬은 사용자 선택 시에만 로드하고, 다른 자산으로 전환할 때 AssetContainer, texture, material을 dispose한다.

### 12.5 Babylon/React 버전 차이

원본은 Babylon 8/React 19, 대상은 Babylon 9/React 18이다. 화면 코드를 파일 단위로 복사하지 않고 기능과 테스트를 대상 API에 맞게 포팅한다.

### 12.6 원본의 dirty 파일 손실

원본 문서와 manifest에는 기존 사용자 변경이 있다. 삭제 전 현재 파일을 대상에 복사하고 체크섬을 검증하며, 사용자 변경과 이전 커밋을 분리한다.

### 12.7 Git 이력 용량은 현재 파일 삭제만으로 줄지 않음

현재 브랜치에서 GLB를 제거하면 배포 대상과 새 checkout은 정리되지만 과거 커밋의 바이너리는 남는다. 이력 정리는 별도 승인 작업으로 남긴다.

## 13. 최종 보고 항목

통합 완료 시 다음을 보고한다.

- 원본과 대상 프로젝트 절대 경로
- 복사된 GLB 수와 총 용량
- 패키지별 원본/대상 경로
- SHA-256 검증 결과
- 대상 프로젝트에서 추가·수정한 파일 목록
- 대상 Git에 GLB가 추적되지 않은 결과
- 대상 `dist`에 GLB가 포함되지 않은 결과
- 대상 typecheck/test/build/browser 결과
- 원본에서 제거한 코드·자산 목록
- `City_Static.glb` 보존 및 해시 결과
- 원본 typecheck/lint/test/build 결과
- 남은 경고, 외부 자산 저장 위치 및 복구 방법

## 14. 권장 실행 순서 요약

```text
두 프로젝트 상태 기록
  → 대상 프로젝트 기준점 확보
  → GLB Git 제외 및 외부 자산 resolver 구현
  → GLB 비파괴 복사와 SHA-256 검증
  → 카탈로그 브라우저를 기존 AssetLibrary에 통합
  → 공통 GLB loader·SceneTree·pick·metadata 통합
  → SimpleTown·JC MegaCity 샘플 씬 편집 기능 통합
  → 대상 전체 테스트
  → 원본 게임의 개발용 UI와 SimpleTown 특례 연결 해제
  → 원본 게임 회귀 테스트
  → 삭제 후보 목록 재보고 및 사용자 승인
  → 원본의 이전 완료 자산·코드 제거
  → 양쪽 프로젝트 최종 검증 및 결과 보고
```

원본 파일을 먼저 삭제하지 않는다. 대상 프로젝트에서 기능·자산·체크섬·빌드가 모두 검증된 후에만 원본 정리를 수행한다.

## 15. 실행 진행 기록 — 2026-08-25

사용자 지시에 따라 SimpleTown 전투씬 제거와 자산 이전을 먼저 수행했다.

### 완료된 작업

- 원본 `simpletown-city` 디렉터리의 210개 파일을 대상 프로젝트로 복사했다.
- 대상 자산 경로:
  `/Users/switch/Development/Game/WebGame/3DMapperToolTest/local-assets/glb/catalog/simpletown-city`
- 이전 결과: 210/210 파일 일치, 37,863,748 bytes 일치, SHA-256 불일치 0개
- `catalog.json` SHA-256: `bfa7b5bcd36794e86bd14f22d44b56148513e500a1a106e028fe3545ce8e8032`
- 대상 `.gitignore`에 GLB·BIN·FBX·BLEND 외부 자산 제외 규칙을 추가했다.
- 원본 `TacticalScene`의 SimpleTown 환경 생성 분기를 제거했다.
- 원본 SimpleTown 전용 pick, `assetId/instanceId/category` 전투 snapshot 연결을 제거했다.
- 원본 SimpleTown 전용 지도 정의와 환경 visual adapter를 제거했다.
- 전체 카탈로그 manifest에서 `simpletown-city` 항목을 제거했다.
- 원본 `public/assets/runtime/models/catalog/simpletown-city/`를 삭제했다.

### 보존 확인

- 기존 `City_Static.glb`는 삭제·수정하지 않았다.
- 기존 City Static 로더와 공통 `TacticalEnvironmentVisual` 경로는 유지했다.
- SimpleTown 제거 후 모든 전투 도시는 공통 전투 환경을 사용하도록 변경했다.
- JC LP MegaCity, 기타 카탈로그, 사용자 수정 문서는 이번 작업에서 삭제하지 않았다.

### 현재 검증 결과

- `npm run typecheck`: 통과
- `npm run lint`: 통과
- SimpleTown 제거와 직접 관련된 `JcLpMegaCityDemoScene.test.ts`, `UnityAssetCatalog.test.ts`: 4개 테스트 통과
- 대상 `3DMapperToolTest` `npm run typecheck`: 통과
- 대상 `3DMapperToolTest` `npm test`: 7개 테스트 통과
- 대상 SimpleTown 복사본의 파일 수·바이트·SHA-256 검증: 통과
- 대상 GLB는 Git에서 무시되며 `catalog.json`만 메타데이터로 남아 있다.
- 원본 전체 `npm test`: 기존 SimpleTown과 무관한 2개 기준값 불일치로 실패
  - `domain.test.ts`: transit progress 기대값 불일치
  - `TacticalPerformanceController.test.ts`: LOW building budget 기대값 불일치
- 전체 `npm run unity:assets:validate`: 기존 JC LP MegaCity의 `fx_fountain_01` 무메시 catalog 레코드에서 실패
- 나머지 catalog 패키지 지정 검증: 323개 GLB 통과
- 대상 Vite build: Node 20.15가 Vite 요구 버전(20.19+)보다 낮고 transform 단계가 장시간 지속되어 완료 결과를 확정하지 못함

### 후속 작업

1. 대상 편집기에 SimpleTown catalog browser와 scene layout을 실제로 연결한다.
2. 대상 프로젝트의 Node 버전을 Vite 요구 버전 이상으로 맞춘 뒤 build를 재검증한다.
3. 원본의 기존 2개 테스트 기준값과 JC 무메시 catalog 레코드는 별도 이슈로 분리해 판단한다.
4. 원본에서 SimpleTown 문자열·URL·파일 참조가 0개인지 최종 검사한다.
5. 원본과 대상의 최종 변경 목록을 커밋 단위로 나눈다.

## 2026-08-25 구현 진행 기록

이번 작업에서는 원본 프로젝트를 삭제하거나 수정하지 않고 대상 편집기의 통합 기반을 구현했다.

### 반영 완료

- `local-assets/glb`의 GLB·BIN·FBX·BLEND를 Git과 Vite build에서 제외하는 정책을 적용했다.
- Vite 개발/preview 서버에 `/__local_glb__/...` 읽기 전용 GLB URL을 추가했다. 경로 탈출과 비-GLB 요청은 거부한다.
- `assets:verify-external`로 local-assets GLB의 `glTF` magic, 0바이트 여부를 검사한다.
- `assets:check-untracked`로 tracked GLB와 `dist` 내 GLB를 검사한다.
- `build-glb-migration-manifest.mjs`로 카탈로그의 `absoluteGlbPath`를 제거한 논리 메타데이터를 생성한다.
- 현재 대상에 준비된 `simpletown-city` 209개 catalog를 검색·package/category 필터 UI에 연결했다.
- File/catalog URL을 공통 `loadGlbSource`로 연결하고, catalog 선택 시 선택된 1개만 로드하도록 했다.
- GLB의 TransformNode/mesh parent 관계를 유지한 재귀 SceneTree와 `assetId`, `instanceId`, `category`, `glbPath` Inspector 표시를 추가했다.
- 카탈로그 자산 로드 후 bounds 기반 카메라 자동 프레이밍을 적용했다.
- JC LP MegaCity layout JSON을 `projects/samples/jc-lp-megacity-demo.scene.json`으로 복사하고 scene project schema 검증을 추가했다.
- Scene 모드에서 211MB 통합 GLB를 사용자 선택 시에만 읽도록 연결했다. 통합 GLB는 `local-assets/glb/scenes/jc-lp-megacity`에 Git 제외 상태로 보관한다.

### 아직 남은 단계

- JC LP MegaCity 통합 씬의 실제 브라우저 로드·11,284 pickable mesh 기준 검수
- SimpleTown layout 인스턴스 이동·회전·스케일·저장
- Node/Vite 버전 조건을 만족한 전체 build와 브라우저 검증
- 단계 7~10 검증 완료 및 사용자 승인 전 원본 삭제는 수행하지 않음

## 2026-08-25 전체 catalog 이전 진행 기록

사용자 우선순위 변경에 따라 전체 catalog 1,281개를 layout 인스턴스 편집과 JC 11,284 mesh 기준 검수보다 먼저 진행한다.

### 반영 완료

- 원본 catalog 7개 패키지의 정상 export GLB 1,072개를 대상 `local-assets/glb/catalog`로 비파괴 복사했다.
- 기존 SimpleTown 209개와 합쳐 대상 로컬 catalog GLB는 1,281개가 되었다.
- 전체 로컬 catalog 크기는 2,565,375,748 bytes이며, 바이너리는 Git에 추적하지 않는다.
- 원본 7개 catalog와 대상 복사본의 `rsync -rcn` checksum 비교에서 변경·누락 0개를 확인했다. SimpleTown 209개도 기존 SHA-256 비교에서 불일치 0개였다.
- 복사 과정에서 유입된 Unity `.meta` sidecar 758개는 대상 local-assets에서 제거했으며, 원본은 수정하지 않았다.
- 정규화 catalog index에 전체 패키지 metadata와 `absoluteGlbPath` 제거 결과를 반영했다.
- Asset 모드 검색·패키지·category 필터가 1,281개 정상 export 레코드를 대상으로 동작하도록 연결했다.
- catalog 목록을 첫 240개로 제한하지 않고 검색 결과 전체를 표시하도록 변경했다.
- 정상 GLB가 아닌 `toonpeople.phone` 실패 레코드는 metadata에 보존하되 로드 대상에서는 제외했다.

### 이번 단계에서 보류

- SimpleTown/JC layout 인스턴스 이동·회전·스케일·저장
- JC LP MegaCity 통합 GLB의 11,284 mesh 기준 검수
- 원본 프로젝트 파일 및 원본 catalog 자산 삭제
