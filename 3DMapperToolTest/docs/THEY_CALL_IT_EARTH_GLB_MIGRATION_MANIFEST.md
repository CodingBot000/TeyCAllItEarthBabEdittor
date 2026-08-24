# TheyCallItEarth GLB Migration Manifest

이 문서는 대상 편집기에 연결된 외부 GLB 메타데이터와 로컬 자산 검증 기준을 기록한다. 실제 GLB 바이너리는 Git에 포함하지 않는다.

## Current local asset snapshot

| Package | Catalog assets | Local GLB files | Bytes | Storage |
|---|---:|---:|---:|---|
| `jc-lp-megacity` | 749 | 749 | 2,343,155,076 | `local-assets/glb/catalog/jc-lp-megacity/` |
| `simplepoly-city` | 138 | 138 | 8,074,012 | `local-assets/glb/catalog/simplepoly-city/` |
| `simpletown-city` | 209 | 209 | 37,698,684 | `local-assets/glb/catalog/simpletown-city/` |
| `toon-city-pack` | 127 | 127 | 31,183,928 | `local-assets/glb/catalog/toon-city-pack/` |
| `tooncars` | 4 | 4 | 13,072,344 | `local-assets/glb/catalog/tooncars/` |
| `toontown-animations` | 36 | 36 | 1,914,272 | `local-assets/glb/catalog/toontown-animations/` |
| `toontown-characters` | 18 | 18 | 130,277,432 | `local-assets/glb/catalog/toontown-characters/` |
| **합계** | **1,281** | **1,281** | **2,565,375,748** | `local-assets/glb/catalog/` |
| `jc-lp-megacity` scene | 1 | 1 | 220,869,660 | `local-assets/glb/scenes/jc-lp-megacity/` |

정규화된 catalog metadata는 [`src/data/catalogs/catalog-index.json`](../src/data/catalogs/catalog-index.json)에 저장한다. 원본 Unity export의 `absoluteGlbPath`는 제거하고 논리적 `glbPath`만 유지한다.

`toonpeople`의 `phone` 레코드는 원본 export 실패 상태(`GLB header length is zero`)이므로 1,281개 사용 가능 catalog에는 포함하지 않는다. 실패 레코드는 정규화 metadata에 상태와 오류를 보존한다.

## Runtime resolution

- 기본 로컬 개발 URL: `/__local_glb__/catalog/...`
- 원격 환경: `VITE_GLB_ASSET_BASE_URL` + 논리 상대 경로
- 사용자가 직접 연 파일: File API와 IndexedDB

Vite 개발 서버는 `local-assets/glb`를 읽기 전용으로만 제공하며, `..` 경로 탈출과 `.glb` 이외 요청을 허용하지 않는다.

## Verification

```bash
npm run assets:verify-external
npm run assets:check-untracked
```

두 명령은 GLB magic header/0바이트 여부, Git 추적 여부, `dist` 포함 여부를 검사한다. 원본 프로젝트의 파일 삭제는 이 manifest 검증만으로 수행하지 않으며, 계획서의 별도 승인 게이트를 따른다.

원본 7개 catalog와 대상 복사본은 `rsync -rcn` checksum 비교에서 변경·누락 0개였다. SimpleTown 209개는 기존 이전 검증에서 SHA-256 불일치 0개를 확인했다.

대상 local-assets에는 GLB와 catalog JSON만 보관하며, 동기화 과정에서 유입된 Unity `.meta` sidecar 758개는 제거했다. 원본 프로젝트는 수정하지 않았다.
