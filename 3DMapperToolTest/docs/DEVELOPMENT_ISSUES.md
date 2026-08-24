# 단계 5 개발 이슈 기록

이 문서는 GLB/텍스처 드래그 앤 드롭, 씬 트리, Undo/Redo, 고급 UV 편집을 구현하면서 발견한 이슈와 조치 결과를 시간순으로 기록한다.

## 기록 규칙

- 구현 중 새 이슈를 발견하면 원인과 영향 범위를 먼저 기록한다.
- 수정 후 검증 결과를 같은 항목에 추가한다.
- 기존 단계에서 이미 해결된 문제는 이 문서에 소급해서 섞지 않고, 단계 5 이후 작업에서 새로 확인된 내용만 기록한다.

## 이슈 목록

### ISSUE-001 — 프로젝트 변경마다 Babylon 메시 전체를 재생성함

- 상태: 해결
- 증상: Inspector에서 UV 값 하나만 바꿔도 씬의 건물 자식 메시와 재질이 모두 폐기되고 다시 생성된다.
- 영향: 외부 GLB 루트와 씬 트리 선택 상태를 유지하기 어렵고, 편집이 잦을 때 불필요한 GPU/CPU 작업이 발생한다.
- 대응: 같은 건물의 프로젝트 변경에서는 패널 메시를 유지하고 재질·UV만 갱신한다. GLB 루트는 기본 건물 루트와 별도로 보존한다.

### ISSUE-002 — 기존 프로젝트 스키마가 기본 텍스처 이름만 허용함

- 상태: 해결
- 증상: 사용자가 이미지 파일을 드롭해도 `front` 같은 내장 텍스처 이름 외에는 프로젝트에 저장할 수 없다.
- 영향: 텍스처 파일 드래그 앤 드롭과 프로젝트 재저장이 연결되지 않는다.
- 대응: 텍스처 필드를 문자열로 확장하고, 내장 경로와 data URL을 각각 해석하도록 변경했다.

### ISSUE-003 — GLB 임포트 시 내장 건물 프리셋과 외부 모델의 표시 상태가 충돌함

- 상태: 해결
- 증상: 외부 GLB를 같은 씬에 추가하면 기본 박스 프리셋과 겹쳐 보이고, 씬 트리에서 어떤 모델을 편집 중인지 모호해진다.
- 영향: 모델 선택, 텍스처 적용, GLB 재내보내기 결과를 사용자가 예측하기 어렵다.
- 대응: 외부 GLB를 별도 루트 아래에 두고 기본 프리셋을 일시적으로 숨긴다. 내장 건물 선택 시 외부 루트를 해제하고 기본 프리셋을 복원한다.

### ISSUE-004 — UV 스케일/반전에는 텍스처 주소 모드가 필요함

- 상태: 해결
- 증상: UV 스케일을 1보다 크게 하거나 U/V를 반전하면 CLAMP 주소 모드에서 가장자리 픽셀이 고정되어 반복 매핑이 동작하지 않는다.
- 영향: 고급 UV 이동·스케일·반전 결과가 예상과 다르게 보인다.
- 대응: 편집 패널 텍스처를 WRAP 주소 모드로 전환하고, 반전 시 offset을 함께 보정했다.

### ISSUE-005 — Blob URL에는 GLB 확장자가 없어 Babylon 로더가 선택되지 않음

- 상태: 해결
- 증상: 파일 선택으로 만든 Blob URL을 `SceneLoader.ImportMeshAsync`에 그대로 전달하면 URL에 `.glb` 확장자가 없어 기본 Babylon 플러그인으로 잘못 해석된다.
- 영향: GLB 드래그 앤 드롭/파일 선택이 실패하고, 브라우저 콘솔에 “Unable to find a plugin to load ... files” 경고가 남는다.
- 대응: 임포트 호출에 `.glb` 플러그인 확장자를 명시했다. 수정 후 `building-001.glb`로 로드 성공과 씬 트리 메시 목록 생성을 확인했다.

### ISSUE-006 — GLB 로더를 포함한 초기 번들 크기 경고

- 상태: 부분 해결, 추적 중
- 증상: production build는 성공하지만 Babylon core 청크가 약 6.50MB(gzip 약 1.43MB)로 생성된다.
- 영향: 첫 로딩 시간이 늘어날 수 있다. 현재 기능 동작에는 영향이 없다.
- 대응: GLB loader/serializer를 동적 import하고 Rollup manual chunks를 적용했다. 앱 진입 청크는 약 114KB(gzip 약 29KB)로 줄었지만 Babylon core 자체의 대형 청크는 남아 있어 추적한다.

### ISSUE-007 — 외부 GLB 프로젝트 저장 후 바이너리 복원 경로 필요

- 상태: 해결
- 증상: `project.json`에 브라우저 Blob URL만 저장하면 새로고침 후 외부 GLB를 다시 읽을 수 없다.
- 영향: 씬 트리와 외부 메시 편집 상태가 프로젝트 저장 이후 복원되지 않는다.
- 대응: 외부 GLB 파일은 IndexedDB에 보관하고 project에는 저장 키와 원본 파일명을 저장한다. 새로고침 시 IndexedDB에서 파일을 복구한 뒤 Babylon 씬과 씬 트리를 다시 구성한다.

### ISSUE-008 — Babylon Editor 패키지 출력 범위

- 상태: 부분 해결, 추적 중
- 증상: 현재 브라우저 다운로드는 GLB와 Editor 패키지 메타데이터 JSON을 각각 생성하며, 두 파일을 하나로 묶은 압축 패키지는 생성하지 않는다.
- 영향: Babylon.js Editor에서 바로 전달할 단일 패키지 파일은 추가 작업이 필요하다.
- 대응: `*.babylon-editor-package.json`에 대상 Editor, 단위, 축, GLB 파일명, project 설정을 명시했다. 실제 ZIP/asset bundle 생성은 별도 후속 범위로 남긴다.

### ISSUE-009 — 원본 카탈로그의 절대 GLB 경로가 대상 프로젝트에 남을 위험

- 상태: 해결
- 증상: 원본 catalog JSON에는 Unity export 머신의 `absoluteGlbPath`가 포함되어 있어 대상 프로젝트에 그대로 복사하면 다른 환경에서 사용할 수 없다.
- 영향: 로컬 개발 경로와 원격 CDN 경로를 교체할 수 없고, 사용자 컴퓨터 경로가 저장소에 노출된다.
- 대응: catalog migration script에서 절대 경로를 제거하고 논리 `glbPath`만 보존한다. `assetSourceResolver`가 로컬 `/__local_glb__/` 또는 `VITE_GLB_ASSET_BASE_URL`로 URL을 해석한다.

### ISSUE-010 — 기존 GLB 로더가 결과 mesh를 한 단계로 평탄화함

- 상태: 해결
- 증상: 기존 `loadGlb`가 모든 mesh를 `ImportedGLB` 바로 아래로 재부모화하여 TransformNode 계층과 parent 정보가 씬 트리에 남지 않는다.
- 영향: 카탈로그 자산의 원본 계층 검수와 node pick이 불가능하다.
- 대응: URL/File 공통 `loadGlbSource`를 추가하고 Babylon `transformNodes`와 `meshes`의 기존 parent 관계를 유지한다. 씬 트리는 재귀적으로 node/mesh를 생성하며 metadata를 Inspector까지 전달한다.

### ISSUE-011 — Scene 모드의 layout 인스턴스 편집은 후속 단계

- 상태: 사용자 지시에 따라 보류
- 증상: 현재 Scene 모드는 JC LP MegaCity 통합 GLB를 on-demand로 로드하고 layout JSON을 검증하지만, 4,160개 layout object를 개별 Babylon 인스턴스로 생성·이동·회전·스케일하는 기능은 아직 연결하지 않았다.
- 영향: 통합 씬 검수는 가능하지만 개별 배치 편집 샘플은 아직 저장·복원할 수 없다.
- 대응: layout JSON을 `sceneProjectSchema`로 고정하고 `projects/samples/jc-lp-megacity-demo.scene.json`으로 보존했다. 다음 단계에서 assetId resolver와 인스턴스 transform controller를 연결한다.

### ISSUE-012 — 전체 catalog 이전 시 usable GLB와 실패 metadata 레코드 수가 다름

- 상태: 해결
- 증상: 원본 catalog metadata의 전체 asset record는 1,282개지만 정상 export GLB는 1,281개다. `toonpeople.phone`은 export 실패로 1,327 bytes의 유효하지 않은 GLB 경로만 남아 있다.
- 영향: metadata 전체를 그대로 UI 로드 대상으로 사용하면 실패 자산을 선택할 수 있고, catalog 수와 실제 GLB 수가 어긋나 보인다.
- 대응: 원본 7개 패키지의 정상 GLB 1,072개를 기존 SimpleTown 209개와 함께 대상 `local-assets/glb/catalog`로 복사했다. UI와 `catalogExportedAssets`는 정상 export 1,281개만 표시·로드하고, 실패 record는 오류 상태 metadata로만 보존한다.
- 검증: catalog GLB 1,281개, JC 통합 씬 포함 전체 외부 GLB 1,282개, Git 추적 GLB 0개, `npm run assets:verify-external` 통과.

### ISSUE-013 — catalog 복사 시 Unity `.meta` sidecar가 함께 유입됨

- 상태: 해결
- 증상: 원본 catalog 디렉터리를 그대로 동기화하면서 GLB와 무관한 Unity `.meta` 파일 758개가 대상 `local-assets`에 들어왔다.
- 영향: 외부 자산 캐시에 불필요한 파일이 생기고 Git 상태에서 local-assets 디렉터리가 untracked로 표시될 수 있었다.
- 대응: 대상 프로젝트의 복사본에서 `.meta` sidecar 758개를 제거했다. 원본 프로젝트의 `.meta`와 원본 catalog는 수정하지 않았다.
- 검증: 대상 `.meta` 0개, catalog GLB 1,281개, `assets:verify-external` 통과.

## 검증 메모

검증 명령과 브라우저 확인 결과는 개발이 진행되는 각 단계의 완료 시점에 이 문서 하단에 누적한다.

## 2026-08-24 검증 결과

- `npm run typecheck` 통과
- `npm test` 통과: 10개 테스트
- `npm run build` 통과
- build 최적화 확인: 앱 진입 청크 114.13KB(gzip 28.75KB), Babylon core 청크 6.50MB(gzip 1.43MB); 잔여 경고는 ISSUE-006으로 추적
- 브라우저에서 Undo → Redo 회전 상태 복원 확인
- 브라우저에서 Advanced UV의 Offset U, Scale V, Flip U 입력 반영 확인
- 브라우저에서 씬 트리의 `FacePanel · L-04` 선택 및 Inspector 활성 면 변경 확인
- 브라우저에서 `building-001.glb` 파일 선택 임포트, GLB 배지 및 메시 목록 생성 확인
- 브라우저에서 정면·후면·좌·우·상·하 카메라 프리셋 버튼 6개와 선택 상태 확인
- 브라우저에서 재질 슬롯 선택 및 Babylon Editor 패키지 메타데이터 JSON 다운로드 확인
- 브라우저 새로고침 후 IndexedDB에 저장한 외부 GLB와 씬 트리 복원 확인
- 외부 GLB 정책 확인: tracked GLB 0개, dist GLB 0개, local-assets GLB 210개(카탈로그 209 + 통합 씬 1)
- catalog metadata에서 absoluteGlbPath 제거 및 local/remote URL resolver 단위 테스트 확인

## 2026-08-25 전체 catalog 이전 검증 결과

- 원본 catalog 7개 패키지에서 정상 export 1,072개를 대상에 추가하고, 기존 SimpleTown 209개와 합쳐 catalog GLB 1,281개를 확인했다.
- `npm run typecheck`: 통과
- `npm test -- --run`: 4개 파일, 10개 테스트 통과
- `npm run assets:verify-external`: catalog 1,281개, 전체 외부 GLB 1,282개(보류 중인 JC 통합 씬 1개 포함) 통과
- `npm run assets:check-untracked`: tracked GLB 0개, dist GLB 0개, local GLB 1,282개 통과
- 원본 7개 catalog와 대상 복사본 `rsync -rcn` checksum 비교: 변경·누락 0개. SimpleTown 209개는 기존 이전 검증에서 SHA-256 불일치 0개를 확인했다.
- 대상 외부 자산 캐시의 Unity `.meta` sidecar 758개 제거 후 대상 `.meta` 0개를 확인했다.
- `npm run build`: 통과. Babylon core 6.50MB(gzip 1.43MB) 대형 청크 경고는 ISSUE-006으로 유지한다.
- Playwright + 설치된 Chrome fallback 브라우저 검증: Asset 모드 전체 목록 1,281개, `simplepoly-city` package 필터 138개, `building` 검색 40개, 개별 GLB 선택 후 SceneTree 3개 노드와 Inspector asset metadata 표시를 확인했다.
- 이번 단계에서는 layout 인스턴스 이동·회전·스케일 편집과 JC 11,284 mesh 기준 검수를 실행하지 않았다.
