# They Call It Earth → Babylon.js Editor 1차 마이그레이션 계획서

- 작성일: 2026-08-23
- 원본: `/Users/switch/Development/Game/WebGame/TheyCallItEarth`
- 대상: `/Users/switch/Development/Game/WebGame/TeyCAllItEarthBabEdittor`
- 상태: 1차 구현 완료, 후속 전투 개편 대기
- 1차 완료 지점: 게임 시작 화면 → 새 게임/이어하기 → 월드 맵 표시 → 국가·도시 선택 및 상세 정보 확인

## 실행 현황

| 단계 | 상태 | 최신 결과 |
|---|---|---|
| M0 기준선·보호 장치 | 완료 | Git `main` 초기화, `.gitignore`, 기준선 커밋 완료 |
| M1 Next.js 게임 셸·3D 지연 로드 경계 | 완료 | 예제 Babylon/Havok 자동 로드 제거, React 게임 셸 연결 |
| M2 규칙·월드 데이터·저장소 | 완료 | 순수 domain/world/save 이식, `zod`·Vitest 추가 및 10개 테스트 통과 |
| M3 공통 UI·국제화·스타일 | 완료 | i18n·모바일 guard·스타일 이식, 한영 키 정책 및 fallback 폰트 적용 |
| M4 게임 시작 화면 | 완료 | Editor 데모 버튼 제거, 새 게임·이어하기·삭제 연결 |
| M5 월드 맵 선택 | 완료 | 2D 지도 자산, 국가·도시 선택, 상세 패널, 줌/팬 연결 |
| M6 전투 경계·구형 Nav 차단 | 완료 | `BattleGateway` 추가, 전투 3D/구형 Nav 런타임 참조 차단 |
| M7 통합 검증·인수 | 완료 | lint/typecheck/test/build/generate 및 데스크톱·모바일 Playwright QA 통과 |

## 1. 목적

원본 게임의 시작 화면과 월드 맵 선택 경험을 현재 Babylon.js Editor 기반 Next.js 프로젝트로 최대한 빠르게 옮긴다. 전투의 규칙과 캠페인 상태처럼 다시 사용할 가능성이 높은 순수 TypeScript 코드는 넓게 보존하되, 기존 3D 전투 장면·카메라·도시 구성·그래픽 자산은 가져오지 않는다.

1차 결과물은 완성된 전투 게임이 아니라 다음 개발을 위한 안정적인 전면부와 게임 규칙 기반이다.

```text
MAIN_MENU
  ├─ 새 게임 ───────────────┐
  └─ 이어하기 ──────────────┼─> WORLD_MAP ─> 국가/도시 선택 ─> 도시 상세
                            │                                  └─> 전투 진입 경계(미구현)
                            └─ 저장 초기화

Babylon Editor scene / 3D battle runtime: 1차에서는 로드하지 않음
```

## 2. 핵심 결정

### 2.1 화면 구현 방식

원본의 `MainMenuScreen`과 `WorldMapScreen`은 Babylon GUI나 Babylon Scene이 아니라 React DOM/SVG 화면이다. 따라서 1차 이식은 다음 방식으로 진행한다.

- Next.js App Router의 클라이언트 컴포넌트로 게임 셸을 구성한다.
- 시작 화면과 월드 맵은 React DOM/SVG로 이식한다.
- Babylon.js Editor가 생성한 프로젝트 구조, `project.bjseditor`, `assets/`, `src/scripts.ts`는 보존한다.
- 현재 `src/app/page.tsx`가 시작하자마자 예제 Babylon Scene과 Havok을 로드하는 동작은 제거한다.
- 향후 전투 진입 시점에만 Babylon 런타임을 지연 로드할 수 있도록 경계를 둔다.

이 결정은 Babylon Editor를 버리는 것이 아니다. 1차 전면부는 React가 담당하고, 이후 새 3D 전투 화면은 Editor scene과 Babylon 런타임이 담당하는 구조다.

### 2.2 빠른 이식 우선 원칙

- 애매한 순수 TypeScript 규칙은 우선 복사하고 나중에 정리한다.
- 원본의 폴더 구조와 import 관계를 가능한 한 유지한다.
- 화면에 실제 필요한 수정만 하고, 대규모 이름 변경과 상태 관리 재설계는 하지 않는다.
- 죽은 CSS와 당장 사용하지 않는 순수 규칙은 1차에서 허용한다.
- 3D 파일과 구형 전투 렌더러는 애매하면 제외한다. 이 부분만큼은 복사 우선 원칙의 예외다.
- 1차 완료 후 새 전투 설계가 확정되면 전투 타입, 좌표계, 밸런스 단위를 다시 리팩터링한다.

### 2.3 1차 화면 범위의 정확한 끝

월드 맵에서 다음 기능까지 동작하면 1차 완료로 본다.

- 세계 지도 렌더링
- 확대/축소, 드래그, 국가 선택
- 도시 마커 표시와 도시 선택
- 선택 도시의 이름, 국가, 인구, 방어·자원·기술 수치, 캠페인 상태 표시
- 새 게임 생성, 저장, 이어하기, 저장 초기화
- 언어 전환과 모바일 가로 화면 안내

다음 화면으로 실제 이동하는 것은 1차 범위가 아니다.

- 미션 편성
- 도시 간 이동 시뮬레이션
- 업그레이드
- 전투 로딩 및 전투
- 전투 결과·자원 배분

도시 상세의 행동 버튼은 크래시하거나 빈 화면으로 이동하지 않게 한다. 1차에서는 버튼 클릭을 `BattleGateway`의 “전투 시스템 개편 중” placeholder 경계로 전달하고 실제 화면 전환은 하지 않는다. 어느 쪽이든 `TacticalScreen`을 import하지 않는다.

### 2.4 사용자 노출 문자열의 한·영 대응 규칙

1차부터 화면에 표시되는 모든 텍스트는 한·영 대응을 갖는 것을 원칙으로 한다. JSX나 게임 로직 안에 한국어 또는 영어 문장을 직접 하드코딩하지 않는다.

- 버튼, 제목, 설명, 상태, 오류, 빈 상태, 로딩 문구는 `I18nProvider`의 `t('key')`를 통해 표시한다.
- 도시·국가·업그레이드·enum·전투 상태명은 `gameContent.ts`의 표시 함수 또는 동일한 다국어 데이터 구조를 사용한다.
- 새로운 번역 키는 반드시 `ko`와 `en` 값을 함께 추가한다. 한 언어만 작성한 키를 완료로 취급하지 않는다.
- `aria-label`, `title`, `alt`처럼 사용자에게 노출될 수 있는 보조 문자열도 동일한 규칙을 따른다. 장식 이미지의 빈 `alt`처럼 의도적으로 비워 두는 경우는 예외다.
- 저장 키, 내부 ID, 로그용 식별자, CSS class명, 테스트 fixture 값은 번역 대상이 아니다.
- 도메인에는 표시용 문장을 넣지 않고 상태/ID를 유지하며, 언어 선택은 presentation/i18n 계층에서 처리한다.
- 번역 누락 시 조용히 다른 언어 문장을 섞지 말고, 개발 환경에서 누락 키를 식별할 수 있게 한다.

따라서 새 화면·새 기능을 추가할 때부터 한·영 키 쌍을 함께 만드는 방식으로 진행한다.

### 2.5 개발 중 이슈 기록·무중단 진행 규칙

개발 중 발견되는 모든 이슈는 계획서에 흩어 쓰지 않고 [`docs/MIGRATION_ISSUES.md`](./MIGRATION_ISSUES.md)에 별도 기록한다. 사소한 경고, 임시 우회, 원본과의 동작 차이, 검증 실패도 재현 가능하거나 후속 판단이 필요하면 기록 대상이다.

- 이슈를 발견한 즉시 ID, 발견 단계, 증상, 재현 절차, 영향 범위, 근거 로그/스크린샷, 현재 우회책, 다음 조치를 기록한다.
- 일반적인 코드 오류나 테스트 실패 때문에 작업 전체를 멈추지 않는다. 영향이 제한된 경우 fallback, 임시 adapter, 최소 fixture를 사용해 다음 독립 작업을 계속 진행한다.
- 해결하지 못한 이슈는 숨기거나 삭제하지 않고 `OPEN`, `WORKAROUND`, `BLOCKED`, `RESOLVED` 상태로 남긴다. 임시 해결은 해결 완료로 표시하지 않는다.
- 한 단계가 막혀도 데이터 조사, 문서화, 테스트 보강, 다른 독립 단계처럼 안전하게 진행할 수 있는 작업을 계속한다.
- 외부 권한이 필요하거나, 파괴적 변경이 필요하거나, 사용자의 제품 결정을 반드시 받아야 하는 경우에만 해당 이슈를 명확히 표시하고 필요한 질문을 남긴다. 그 경우에도 가능한 후속 작업은 계속한다.

### 2.6 작업 단위별 문서 갱신 규칙

코드를 수정할 때마다 같은 작업 단위 안에서 문서를 갱신한다. 문서 갱신을 나중에 몰아서 하지 않는다.

1. 작업 시작 시 `PHASE_1_MIGRATION_PLAN.md`의 해당 단계 상태와 이번 작업 목표를 갱신한다.
2. 작업 중 이슈가 생기면 즉시 `MIGRATION_ISSUES.md`에 추가한다.
3. 작업 종료 시 변경 파일, 실행한 검증 명령, 결과, 알려진 제한, 다음 작업을 문서에 반영한다.
4. 커밋 단위마다 관련 문서 변경을 함께 포함한다. 코드 커밋과 문서 커밋을 분리해야 한다면 두 커밋을 같은 작업 단위로 연결한다.
5. 해결된 이슈는 해결 커밋, 검증 결과, 재발 방지 조치를 이슈 항목에 추가하고 상태를 `RESOLVED`로 변경한다.

이 규칙의 목적은 이슈가 생겼다는 이유로 마이그레이션을 중단하는 것이 아니라, 이슈와 임시 판단을 남긴 상태로 1차 완료까지 계속 진행하는 것이다.

## 3. 조사 결과와 현재 기준선

### 3.1 원본 프로젝트

- Vite + React 19 + TypeScript 5.9
- Babylon.js 8.x
- UI는 React, 전투 렌더링은 Babylon.js로 분리되어 있다.
- `src/domain`은 Babylon import가 없는 순수 TypeScript다.
- `WorldMapScreen.tsx`는 SVG와 HTML로 지도를 렌더링한다.
- 월드 데이터는 생성된 JSON 약 1.1 MB와 런타임 변환 코드로 구성된다.
- 전체 3D 모델 자산은 약 2.6 GB이며 1차 대상이 아니다.

### 3.2 대상 프로젝트

- Babylon.js Editor 5.1.1 프로젝트
- Next.js 16 + React 18 + TypeScript 5.9
- Babylon.js 9.12.1 및 Editor Tools 5.4.2
- 현재는 `example.babylon`과 Havok을 첫 페이지에서 즉시 로드하는 기본 템플릿이다.
- 대상 폴더는 현재 Git 저장소가 아니다. 구현 전에 별도 백업 또는 Git 초기화를 권장한다.

### 3.3 호환성 주의점

- 원본의 React 화면 코드는 React 18에서도 사용할 수 있는 API만 사용한다.
- 원본 저장소 검증은 `zod` 4.x에 의존하므로 대상 `package.json`에 `zod`를 추가해야 한다.
- 원본의 `import.meta.env`는 1차에 가져오지 않는다. Next.js에서 필요해질 경우 `process.env.NEXT_PUBLIC_*`로 별도 변환한다.
- `window`, `localStorage`, `screen.orientation`을 쓰는 모듈은 반드시 클라이언트 컴포넌트 아래에서만 실행한다.
- 기존 Vite 개발 서버와 Next.js 개발 서버는 origin이 다르므로 브라우저의 기존 로컬 저장은 자동으로 보이지 않을 수 있다. 1차는 저장 스키마 호환을 유지하되, 과거 브라우저 저장 자동 이전은 별도 작업으로 둔다.
- 원본의 Google Fonts CSS import는 네트워크가 없어도 fallback 글꼴로 동작한다. 폰트 자체 호스팅은 후속 최적화다.

## 4. 복사·수정·제외 인벤토리

### 4.1 그대로 또는 최소 수정으로 가져올 코드

대상에서는 충돌을 줄이기 위해 아래 코드를 `src/game/` 아래에 원본과 같은 하위 구조로 둔다.

| 원본 | 대상 | 이유 |
|---|---|---|
| `src/domain/*.ts` | `src/game/domain/*.ts` | 캠페인·전투·군단·미션·물류·변환 규칙 보존 |
| `src/data/cities.ts` | `src/game/data/cities.ts` | 월드 맵과 캠페인 생성에 필요 |
| `src/data/playableCities.ts` | `src/game/data/playableCities.ts` | 선택 가능한 도시 판정 |
| `src/data/world/index.ts` | `src/game/data/world/index.ts` | 월드 데이터 런타임 변환 |
| `src/data/world/generated/*.json` | 동일 상대 경로 | 국가 도형과 도시 데이터 |
| `src/i18n/I18nProvider.tsx` | `src/game/i18n/I18nProvider.tsx` | 한·영 UI와 언어 상태 |
| `src/i18n/gameContent.ts` | `src/game/i18n/gameContent.ts` | 도시·국가·enum 표시명 |
| `src/infrastructure/persistence/saveRepository.ts` | `src/game/infrastructure/persistence/saveRepository.ts` | 캠페인 저장·복구·구버전 보정 |
| `src/presentation/MobileLandscapeGuard.tsx` | `src/game/presentation/MobileLandscapeGuard.tsx` | 모바일 가로 모드 안내 |
| `src/presentation/components/LanguageSwitcher.tsx` | 동일 상대 경로 | 언어 전환 |
| `src/presentation/screens/MainMenuScreen.tsx` | 동일 상대 경로 | 시작 화면 |
| `src/presentation/screens/WorldMapScreen.tsx` | 동일 상대 경로 | 맵 선택 화면 |
| `src/presentation/styles.css` | 동일 상대 경로 | 빠른 시각 동일성 확보 |

`src/domain`은 현재 약 2,900줄이며 전투 코드도 포함한다. 1차에서 실행하지 않더라도 다음 이유로 통째로 가져온다.

- `createNewCampaign`은 미션·군단 규칙과 타입에 연결되어 있다.
- 캠페인 저장 스키마가 전투 전후 상태 타입을 참조한다.
- 전투 규칙은 Babylon Scene, Mesh, Camera, GLB에 의존하지 않는다.
- 부분 추출보다 전체 보존이 빠르고 이후 규칙 회귀를 줄인다.

단, 복사된 전투 규칙은 “새 전투 설계에 채택 확정”이 아니라 “호환성 보관” 상태로 표시한다.

### 4.2 가져오되 수정할 코드

#### 게임 앱 셸

원본 `src/app/App.tsx`를 그대로 복사하지 않고 `src/game/GameApp.tsx`로 축소 이식한다.

- 허용 화면 상태: `MAIN_MENU`, `WORLD_MAP`
- `createNewCampaign`, `loadCampaign`, `saveCampaign`, `clearCampaign` 연결
- `MainMenuScreen`, `WorldMapScreen`만 import
- `TACTICAL_*`, `MISSION_LOADOUT`, `TRAVEL`, `UPGRADE`, `DEBRIEF_*` 분기 제거
- `window.advanceTime`, 전투 디버그 bridge, asset manifest preload 제거
- 맵 뷰 디버그 직렬화는 필요하면 유지하되 전투 bridge와 분리

#### 시작 화면

원본의 사용자용 버튼은 유지하고 개발용 버튼은 제거한다.

- 유지: 새 캠페인, 이어하기, 저장 삭제
- 제외: Asset Lab, JC LP MegaCity Demo
- 새 게임은 즉시 캠페인을 만들고 월드 맵으로 이동
- 이어하기는 1차 지원 상태만 월드 맵으로 복구
- 저장 데이터에 `plannedMission`, `activeTransit`, `pendingDebrief`가 있더라도 1차에서는 월드 맵으로 안전하게 귀착하고 원본 저장을 파괴하지 않는다.

#### 월드 맵

원본 화면을 최대한 유지하되 전투 자산과 후속 화면 연결을 끊는다.

- `onMove`, `onEngage`, `onOpenUpgrades`를 1차용 콜백으로 변경하거나 비활성화
- 구형 우주선 전투 텍스처 기반 맵 마커는 단순 SVG/CSS 마커로 교체
- 전투용 스캔 오버레이 이미지는 제거하고 기존 SVG grid/glow만 유지
- 도시 선택, 국가 선택, 줌, 드래그, 도시 상세 패널은 유지
- 원본의 `getCampaignVictoryProgress`, `lonLatToNormalized` 사용은 유지
- 지도 이미지 로드 실패 시 기존 절차형 국가 도형 fallback을 유지

#### Next.js 진입점

- `src/app/page.tsx`: Babylon 예제 Scene 초기화를 제거하고 `GameApp`을 렌더링하는 얇은 클라이언트 진입점으로 변경
- `src/app/layout.tsx`: 게임 metadata, locale, 전역 스타일 연결
- `src/app/globals.css`: Tailwind base와 게임 스타일 간 충돌을 정리하고 전체 화면 body 규칙 지정
- Babylon Scene 초기화 코드는 삭제하지 않고 향후 `src/game/battle/` 또는 별도 route에서 재사용할 수 있게 이동

### 4.3 1차에 가져올 그래픽 자산

3D 전투 자산이 아니라 시작·맵 선택 화면에서 직접 보이는 2D 자산만 복사한다.

| 자산 | 용도 | 대략 크기 |
|---|---|---:|
| `public/assets/runtime/cards/main-menu-key-art.webp` | 시작 화면 배경 | 218 KB |
| `public/assets/runtime/maps/world-map.webp` | 월드 맵 베이스 | 126 KB |
| `public/assets/runtime/sprites/world-map-cities-5x2.webp` | 도시 클러스터 마커 | 67 KB |
| `public/assets/runtime/cards/city-coastal-card.webp` | 도시 상세 카드 | 101 KB |
| `public/assets/runtime/cards/city-river-card.webp` | 도시 상세 카드 | 97 KB |
| `public/assets/runtime/cards/city-desert-card.webp` | 도시 상세 카드 | 118 KB |

예상 복사량은 약 0.8 MB 미만이다. 자산 경로는 원본과 동일하게 유지해 화면 코드 변경을 줄인다.

### 4.4 명시적으로 가져오지 않을 코드

- `src/rendering/babylon/**`
- `src/presentation/screens/TacticalScreen.tsx`
- `src/presentation/screens/AssetPreviewScreen.tsx`
- `src/presentation/screens/JcLpMegaCityDemoScreen.tsx`
- `src/presentation/screens/MissionLoadoutScreen.tsx`
- `src/presentation/screens/UpgradeScreen.tsx`
- `src/presentation/screens/DebriefScreen.tsx`
- `src/presentation/screens/DebriefAllocationScreen.tsx`
- `src/data/tacticalPresets.ts`
- `src/data/simpleTownMap.ts`
- `src/infrastructure/assets/assetManifest.ts`
- 도시/Unity 자산 생성기와 다운로드 도구
- 원본 Vite 진입점, 설정, 배포 산출물

미션 편성·업그레이드·결과 화면은 3D가 아니지만 1차 완료 지점 이후이므로 실행 UI에서는 제외한다. 관련 규칙은 `src/game/domain`에 보존한다.

### 4.5 명시적으로 가져오지 않을 자산

- 모든 `.glb`, `.gltf`, `.bin`
- 모든 `.fbx`, `.obj`, `.mtl`, Babylon binary mesh data
- 전투 도시 모델, 랜드마크 모델, 캐릭터, 차량, 모선 모델
- 전투 지면·도시 PBR 텍스처, VFX atlas, 전투 sprite
- `public/assets/runtime/models/**`
- `public/assets/kenney-city/**`
- `art-source/**`, Blender 산출물과 원본
- 구형 전투 맵 layout JSON과 Unity asset catalog
- `mothership-saucer-atlas.png`, `mothership-decal.png`
- `tactical-scan-overlay.webp`

마지막 세 자산은 월드 맵에서도 장식적으로 사용되지만 전투 표현 자산과 중복된다. 1차에서는 SVG/CSS 표현으로 대체하여 “구형 전투 그래픽 무반입” 경계를 명확히 한다.

## 5. 게임 규칙과 Nav 처리 방침

### 5.1 보존할 규칙

다음은 순수 TypeScript이므로 1차에 보존한다.

- 캠페인 생성과 도시 상태
- 저장 스키마와 마이그레이션
- 전역 위협도, 도시 파괴도, 점령 상태
- 자원, 모선 스탯, 업그레이드 정의
- 미션 결과·보상·흡수·변환 규칙
- 능력 사용, 에너지, 실드, 피해, 추출 규칙
- 코호트 편성·전투·회수·주둔 규칙
- 물류 비용과 도시 간 거리 계산
- 밸런스 상수

### 5.2 구형 맵/Nav 관련 결론

코드 조사 결과, 현재 도메인 이동은 도로를 따라가는 NavMesh 방식이 아니다.

- 모선 이동: 목표 좌표까지 직접 가속·회전·직선 이동
- 코호트 이동: 목표 좌표까지 2D 직선 보간
- 전술 경계: 고정 사각형 좌표 clamp

도로 의존은 주로 다음 구형 전투 표현과 맵 데이터에 있다.

- `tacticalPresets.ts`의 `urbanPlan.roads`
- `PedestrianVisual`의 도로 기반 보행자 경로
- `TacticalUrbanSurfaceVisual`과 `urbanSurfaceGeometry`의 도로 메시 생성
- `TacticalEnvironmentVisual`의 도로 회피 건물 배치 및 차량 배치
- `TacticalTerrainSampler`의 도로 평탄화

따라서 위 데이터와 렌더링 구현은 복사하지 않는다. `domain/types.ts` 안의 `TacticalRoadDefinition`과 `TacticalUrbanPlan`은 파일을 빠르게 통째로 보존하기 위해 1차에는 남겨도 되지만, 새 전투 맵 계약에서는 사용 금지/폐기 예정 타입으로 표시한다.

### 5.3 새 전투를 위한 경계

1차에 다음과 같은 엔진 중립 계약만 만든다.

```ts
export interface BattleLaunchRequest {
  campaignId: string;
  cityId: string;
  missionId?: string;
}

export interface BattleGateway {
  isAvailable(): boolean;
  launch(request: BattleLaunchRequest): Promise<void>;
}
```

1차 구현은 항상 unavailable을 반환한다. 이후 새 전투에서는 이 경계 뒤에 다음을 새로 설계한다.

- Babylon Editor scene 로드
- 새 카메라와 입력
- 새 맵 포맷과 공간 질의
- 지형/장애물 기반 이동 정책
- 새 에셋 manifest와 로딩 정책

도메인 규칙은 Babylon의 `Vector3`, `Mesh`, `Scene`을 직접 참조하지 않는다. 좌표 변환과 시각 동기화는 gateway/adapter가 맡는다.

## 6. 목표 폴더 구조

```text
TeyCAllItEarthBabEdittor/
├─ assets/                         # Babylon Editor 원본 구조 보존
├─ public/
│  ├─ scene/                       # Editor pack 산출물, 1차에서 미로딩
│  └─ assets/runtime/
│     ├─ cards/                    # 시작/도시 카드만
│     ├─ maps/                     # world-map.webp만
│     └─ sprites/                  # world-map-cities-5x2.webp만
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx
│  │  ├─ page.tsx
│  │  └─ globals.css
│  ├─ game/
│  │  ├─ GameApp.tsx
│  │  ├─ battle/
│  │  │  └─ BattleGateway.ts
│  │  ├─ data/
│  │  │  ├─ cities.ts
│  │  │  ├─ playableCities.ts
│  │  │  └─ world/
│  │  ├─ domain/
│  │  ├─ i18n/
│  │  ├─ infrastructure/persistence/
│  │  └─ presentation/
│  ├─ scripts.ts                   # Editor 생성 파일 보존
│  └─ scripts/                     # Editor component scripts 보존
├─ docs/
└─ project.bjseditor
```

## 7. 단계별 실행 계획

### M0 — 작업 기준선과 보호 장치

목표: 대상 템플릿의 기존 Editor 프로젝트를 잃지 않고 변경을 시작한다.

작업:

1. 대상 폴더 전체 백업 또는 Git 저장소 초기화 및 최초 커밋
2. 현재 `npm run build` 결과 기록
3. `npm run generate` 결과와 `public/scene/` 생성 여부 기록
4. 원본·대상의 Node/npm 버전 기록
5. 복사 금지 확장자 검사 스크립트 또는 명령 준비

완료 조건:

- 변경 전 상태로 돌아갈 수 있다.
- Editor의 `example.scene`을 여전히 열 수 있다.
- 기존 빌드 실패가 있다면 마이그레이션 실패와 구분해 기록되어 있다.

권장 커밋: `chore: establish editor migration baseline`

### M1 — Next.js 게임 셸과 3D 지연 로드 경계

목표: 첫 접속 시 Babylon/Havok/예제 scene을 로드하지 않는 React 게임 셸을 만든다.

작업:

1. `src/game/GameApp.tsx` 생성
2. `src/app/page.tsx`를 게임 셸 진입점으로 변경
3. `src/app/layout.tsx` metadata와 언어 설정 변경
4. 기존 Babylon 초기화 코드를 향후 battle 모듈용 참고 코드로 분리
5. `BattleGateway` unavailable 구현 추가
6. `src/scripts.ts`와 Editor 자산 구조는 수정하지 않음

완료 조건:

- `/` 접속 시 빈 캔버스가 아니라 게임 셸이 표시된다.
- 네트워크 탭에 `example.babylon`, Havok, GLB 요청이 없다.
- Editor pack 명령은 기존과 동일하게 실행 가능하다.

권장 커밋: `feat: add client game shell without eager battle runtime`

### M2 — 게임 규칙·월드 데이터·저장소 이식

목표: 화면보다 먼저 캠페인 상태의 기준을 옮긴다.

작업:

1. `src/domain/*.ts`를 `src/game/domain/`으로 복사
2. 월드 데이터, 도시 목록, 플레이 가능 도시 목록 복사
3. `saveRepository.ts` 복사
4. `zod` 4.x 의존성 추가
5. import 경로만 새 루트에 맞게 수정
6. 원본 domain/data/persistence 테스트 중 엔진 비의존 테스트를 복사하되, 구형 `TACTICAL_PRESETS`를 쓰는 전투 테스트는 도로가 없는 최소 테스트 fixture로 분리
7. 대상에 `typecheck`, `test` 스크립트 추가

완료 조건:

- 새 캠페인을 생성할 수 있다.
- 직렬화 후 다시 읽은 캠페인의 핵심 필드가 동일하다.
- 잘못된 저장 데이터는 안전하게 거부된다.
- domain 모듈 어디에도 `@babylonjs/*` import가 없다.
- 전투 규칙 테스트는 렌더러 없이 실행된다.

권장 커밋: `feat: migrate engine-agnostic campaign and combat rules`

### M3 — 공통 UI·국제화·스타일 이식

목표: 원본 화면을 렌더링할 공통 기반을 만든다.

작업:

1. `I18nProvider`, `gameContent`, `LanguageSwitcher` 복사
2. `MobileLandscapeGuard` 복사
3. `styles.css`를 우선 전체 복사해 시각 회귀를 최소화
4. Next/Tailwind의 body, button, SVG 기본 스타일 충돌 보정
5. 화면에 존재하지 않는 CSS asset URL은 요청되지 않는지 확인
6. 기존 문자열을 `t(...)`, `displayCityName(...)`, `displayEnum(...)` 등으로 치환
7. 새 번역 키는 `ko`/`en` 쌍으로 추가하고 누락 키 개발 경고를 확인
8. 전투 CSS 정리는 1차 완료 후로 미룸

완료 조건:

- 한글/영문 전환이 새로고침 후에도 정상이다.
- 화면의 버튼·패널·상태·접근성 문자열이 언어별로 바뀌고, JSX에 사용자용 문장 리터럴이 남아 있지 않다.
- 데스크톱과 모바일 가로 화면에서 전체 화면 레이아웃이 깨지지 않는다.
- 화면에 렌더링되지 않는 전투용 이미지 요청이 발생하지 않는다.

권장 커밋: `feat: migrate shared game presentation shell`

### M4 — 게임 시작 화면 이식

목표: 첫 사용자 흐름과 저장 동작을 완성한다.

작업:

1. `MainMenuScreen` 복사
2. Asset Lab과 MegaCity Demo 버튼·props 제거
3. 새 게임, 이어하기, 저장 삭제 연결
4. 메인 메뉴 key art 복사
5. 이어하기가 없는 경우 버튼 비활성 상태 검증
6. 기존 저장이 후속 화면 상태를 담고 있어도 월드 맵으로 안전하게 복구

완료 조건:

- 새 게임 클릭 시 캠페인이 만들어지고 월드 맵으로 이동한다.
- 이어하기는 저장이 있을 때만 활성화된다.
- 저장 삭제 후 새로고침해도 새 게임 상태다.
- 개발용 3D 데모 진입점이 사용자 메뉴에 없다.

권장 커밋: `feat: migrate main menu and campaign entry flow`

### M5 — 월드 맵 선택 화면 이식

목표: 1차 사용자 가시 범위를 완성한다.

작업:

1. `WorldMapScreen` 복사
2. 월드 JSON과 2D 지도 자산 복사
3. 줌, 팬, 국가/도시 선택, 상세 패널 연결
4. 전투 출처의 우주선 marker와 scan overlay를 SVG/CSS로 대체
5. 미션 이동·교전·업그레이드 버튼을 1차 상태로 처리
6. 메뉴 복귀 연결
7. 선택한 도시가 캠페인의 `selectedCityId` 상태로 일관되게 유지되는지 검증

완료 조건:

- 최초 줌에서 주요 국가와 플레이 가능 도시가 보인다.
- 지도 드래그와 휠/버튼 줌이 정상이다.
- 국가를 선택하면 해당 국가 정보가 표시된다.
- 플레이 가능 도시와 잠긴 도시가 시각적으로 구분된다.
- 도시 상세 패널을 열고 닫을 수 있다.
- 전투 관련 버튼을 눌러도 3D scene이 로드되거나 빈 화면이 되지 않는다.

권장 커밋: `feat: migrate interactive world map selection`

### M6 — 전투 경계 고정과 구형 Nav 차단

목표: 다음 개발자가 실수로 기존 전투 구현을 다시 연결하지 않게 한다.

작업:

1. `BattleGateway`와 플레이스홀더 UX 확정
2. 구형 `TACTICAL_PRESETS` 미복사 확인
3. `TacticalRoadDefinition`, `TacticalUrbanPlan`, 고정 `TACTICAL_MAP_BOUNDS`에 provisional/legacy 주석 또는 별도 문서 표시
4. 새 전투 맵은 도로 기반 Nav를 요구하지 않는다는 계약 테스트/ADR 추가
5. 게임 셸에서 렌더러 직접 import가 없는지 검사

완료 조건:

- `src/game/presentation`에서 `src/rendering` 또는 Babylon을 import하지 않는다.
- 구형 도로/도시 프리셋이 런타임 bundle에 들어가지 않는다.
- 전투 진입 요청은 단일 gateway를 통해서만 발생한다.

권장 커밋: `refactor: isolate future battle runtime boundary`

### M7 — 통합 검증과 1차 인수

목표: 기능·용량·무반입 조건을 함께 검증한다.

자동 검증:

```bash
npm run typecheck
npm run test
npm run build
npm run generate

find public src/game -type f \
  \( -iname '*.glb' -o -iname '*.gltf' -o -iname '*.bin' \
     -o -iname '*.fbx' -o -iname '*.obj' -o -iname '*.mtl' \)

rg -n "TacticalScreen|TACTICAL_PRESETS|SimpleTown|AssetPreview|MegaCity" \
  src/app src/game

rg -n "@babylonjs|babylonjs-editor-tools" src/game/domain src/game/data
```

수동 검증:

1. 저장 없음 → 새 게임 → 월드 맵
2. 도시 선택 → 상세 열기/닫기
3. 국가 선택 → 국가 상세
4. 확대/축소·마우스/터치 드래그
5. 메뉴 복귀 → 이어하기
6. 저장 삭제 → 이어하기 비활성
7. 한국어/영어 전환
8. 모바일 세로 경고와 가로 레이아웃
9. 지도 이미지 강제 실패 시 SVG 국가 도형 fallback
10. 전투 관련 행동에서 플레이스홀더만 표시되고 Babylon 자산 요청 없음
11. 각 화면에서 언어를 바꿔 버튼·패널·상태·aria-label·플레이스홀더가 모두 번역되는지 확인

완료 조건:

- 자동 검증 전체 통과
- 위 수동 시나리오 통과
- 복사 대상에 3D 확장자 0개
- 브라우저 콘솔의 미처리 예외 0개
- 시작 화면과 맵 선택 화면에서 404 asset 요청 0개

권장 커밋: `test: verify phase one migration boundary`

### M7 실행 결과 (2026-08-23)

자동 검증 결과:

```text
npm run lint       PASS
npm run typecheck  PASS
npm run test       PASS (4 files / 10 tests)
npm run build      PASS (Next static generation 4/4)
npm run generate   PASS (assets, example.scene, scripts)
```

`npm run generate`는 `scripts/pack-editor.mjs`를 통해 Babylon Editor CLI의 ESM 실행 경계를 우회한다. 이때 `assets/battlescene/`을 임시 제외하므로 1차 `public/scene/` 산출물에 전투 2D 그래픽이 포함되지 않는다. Editor 산출물(`public/scene/`)과 `docs/`는 Git 추적 대상으로 유지한다.

무반입 검사 결과:

- `src/game/`와 1차 runtime asset 경로에 `.glb`, `.gltf`, `.bin`, `.fbx`, `.obj`, `.mtl` 없음
- `src/game/presentation`에서 `src/rendering`, Babylon, 구형 전투 화면 직접 import 없음
- `src/game/domain`, `src/game/data`에서 `@babylonjs/*`, `babylonjs-editor-tools` import 없음
- `TacticalScreen`, `TACTICAL_PRESETS`, `SimpleTown`, `AssetPreview`, `MegaCity` 실행 경로 참조 없음
- 전투 진입은 `BattleGateway`의 unavailable placeholder만 사용

브라우저 QA 결과:

- 시스템 Chrome + `playwright-core` fallback으로 1440×900 메뉴/맵, 390×844 세로 모바일, 900×500 가로 모바일을 확인했다.
- 새 캠페인 → 서울 선택 → 도시 상세 → 전투 버튼 placeholder, 한·영 전환, 메뉴 복귀 → 이어하기를 통과했다.
- 세로 모바일에서는 가로 전환 guard가 표시되고, 가로 모바일에서는 guard가 숨겨진 맵이 표시됐다.
- 지도 이미지 요청을 의도적으로 abort한 fallback QA에서 절차형 SVG 국가 도형의 `visibility="visible"`을 확인했다(이 시나리오의 `ERR_FAILED`는 의도된 요청 차단 로그다).
- 콘솔 error/warning과 page error는 0건이었다. Browser/IAB 도구 부재와 외부 폰트 fallback은 [`MIGRATION_ISSUES.md`](./MIGRATION_ISSUES.md)의 MIG-004에 기록했다.

알려진 제한:

- `npm audit` 전체 11개 및 `npm audit --omit=dev` 런타임 높음 3개가 남아 있으며, 버전 강제 업그레이드는 후속 작업으로 미뤘다(MIG-003).
- 현재 Node `v20.15.0`이 일부 전이 패키지 권장 범위 `>=20.19.0`보다 낮다(MIG-005).
- 전투 화면, 전투 2D/3D 자산, 도로 기반 Nav는 의도적으로 1차 범위에서 제외했다.

## 8. 테스트 전략

### 8.1 우선 보존할 단위 테스트

- `domain.test.ts`의 캠페인·물류·전투 규칙 케이스. 단, 파일을 그대로 복사하면 제외 대상인 `TACTICAL_PRESETS`를 import하므로 테스트를 분리하고 `urbanPlan.roads: []`인 최소 synthetic preset을 사용
- `playableCities.test.ts`
- `worldData.test.ts`
- `saveRepository.test.ts`
- 캠페인 생성과 승리 진행도 관련 케이스
- 전투 규칙의 기존 순수 함수 테스트

테스트 파일이 `src` 안에 있으면 Next typecheck 대상이 될 수 있으므로 Vitest 의존성을 함께 추가하거나 대상의 별도 `tests/` 폴더로 옮긴다. 테스트를 복사만 하고 실행 환경을 누락하지 않는다.

### 8.2 1차 UI 통합 테스트

최소 브라우저 테스트는 다음 data-testid 또는 접근성 role을 기준으로 작성한다.

- 새 캠페인 버튼
- 이어하기 버튼
- 저장 삭제 버튼
- 지도 stage
- 국가 marker
- 플레이 가능 도시 marker
- 도시 상세 panel
- 메뉴 복귀
- 전투 미구현 안내

기존 Playwright 전체 설정을 통째로 가져오기보다, 대상 Next 개발 서버용 최소 설정부터 만든다.

## 9. 위험과 대응

| 위험 | 영향 | 1차 대응 |
|---|---|---|
| 원본 `App.tsx`를 통째로 복사해 전투 import가 딸려옴 | Babylon 8/9 충돌, 대형 bundle | 축소된 `GameApp`을 새로 구성 |
| `src/domain` 전체 복사로 구형 좌표 타입이 남음 | 이후 새 맵 설계와 혼동 | 보존 상태를 명시하고 gateway 밖에서 사용 금지 |
| `WorldMapScreen`의 전투 이미지 참조 누락 | 404와 깨진 marker | SVG/CSS marker로 명시적 교체 |
| React 19 원본과 React 18 대상 차이 | 타입 또는 hydration 문제 | 클라이언트 경계 유지, React 19 전용 API 미사용 확인 |
| `zod` 누락 | 저장소 빌드 실패 | M2에서 버전 고정 설치 |
| 로컬 저장 origin 차이 | 기존 이어하기가 보이지 않음 | 스키마 유지, 자동 이전은 별도 과제로 기록 |
| 전체 CSS 복사 | 죽은 스타일 증가 | 빠른 이식을 위해 허용, 2차 리팩터링에서 제거 |
| Next 첫 화면에서 Editor scene 동시 로드 | 불필요한 3D 요청과 초기화 비용 | 전투 gateway 뒤로 지연 로드 |
| 원본 저장이 미션/전투 중 상태 | 1차 셸이 해당 화면을 표시하지 못함 | 저장 파괴 없이 월드 맵으로 안전 귀착 |
| 대상이 Git 저장소가 아님 | 되돌리기 어려움 | M0 완료 전 구현 시작 금지 |

## 10. 1차 범위 밖 후속 백로그

다음은 이 계획의 완료를 막지 않는다.

- 미션 편성 화면 이식 여부 재결정
- 업그레이드·디브리프 UI 이식
- 기존 브라우저 저장 export/import 도구
- `domain/types.ts` 분리와 legacy tactical 타입 삭제
- 고정 `TACTICAL_MAP_BOUNDS` 대체
- 새 전투 맵 데이터 포맷
- 도로 비의존 이동/공간 질의 설계
- Babylon Editor 기반 새 전투 scene
- 새 카메라·입력·HUD
- 새 전투 에셋 manifest와 스트리밍
- 전투 규칙 밸런스 재검증
- 전체 CSS와 i18n 키 정리
- React/Next/Babylon 버전 통합 정책

## 11. 1차 최종 산출물

1. Next.js에서 실행되는 시작 화면
2. 새 게임·이어하기·저장 초기화
3. 상호작용 가능한 월드 맵 선택 화면
4. 화면에 필요한 최소 2D 자산
5. 엔진 비의존 게임 규칙과 저장 스키마
6. 전투 미구현 gateway와 명확한 3D 경계
7. 단위/통합 테스트와 3D 자산 무반입 검사
8. 후속 전투 개편을 위한 legacy/provisional 목록

## 12. 실행 우선순위 요약

가장 빠른 안전 경로는 다음 순서다.

```text
대상 백업
→ 예제 3D 자동 로드 제거
→ 순수 domain/data/save 복사
→ i18n/CSS 공통 기반 복사
→ 시작 화면 연결
→ 월드 맵 연결
→ 전투 자산 참조를 SVG/CSS로 제거
→ BattleGateway로 진입 차단
→ 빌드·테스트·3D 무반입 검사
```

이 순서에서는 구형 3D 전투를 한 번도 실행 경로에 연결하지 않으면서도, 향후 재사용할 게임 규칙을 초기에 확보할 수 있다.
