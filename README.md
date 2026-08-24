# They Call It Earth — Babylon.js Editor 2.5D Battle

이 저장소는 원본 React 게임의 캠페인 규칙과 화면 흐름을 Babylon.js Editor 기반 Next.js 프로젝트로 옮기고, 기존 3D 전술 도시를 고정 측면 2.5D 배틀로 재구성한 프로젝트다.

현재 실행 범위는 다음과 같다.

- 시작 화면, 새 캠페인, 이어하기, 로컬 저장 초기화
- 세계 지도, 국가·도시 선택, 미션 편성, 이동
- 결정적 흡수 지역, 접근 자동 탐지, 흡수·EMP·Plasma·Overdrive
- 실제 ORGANIC 시민 덩어리·잔량 표시, 화면 밖 목표 방향/거리, 능력 disabled·쿨다운 안내
- 자동 공중 방어와 곡선 비행형 지상 자폭드론 공격
- 생존 시간 해제형 탈출, 임무 포기 확인/35% 화물 회수, 모선 대파 수리비
- 디브리핑, 포로 배분, 코호트, 업그레이드
- save v5 도시 종류별 자원 풀·미션 배치 스냅샷, RAID/OCCUPATION 주둔 후보 처리
- 실제 Enemy/ground state ID에 동기화된 전투기·지상 시각 풀
- 한국어/영어 전환과 모바일 세로 화면 안내
- 엔진 비의존 캠페인·전투 규칙·월드 데이터·저장소 보존

배틀은 공통 Editor 씬과 맵별 2D 레이어를 사용한다. 기존 3D 도시 건물과 구형 도로 Nav는 이식하지 않으며, 시각 맵과 게임플레이 프로필을 분리한다. `?debug=battle&city=seoul`은 배틀 직접 검증 경로이고 `battle-fast=1`, `battle-debug=1`을 조합해 자동화할 수 있다.

## 개발 명령

```bash
npm install
npm run dev       # http://localhost:3000
npm run lint
npm run typecheck
npm run test
npm run build
npm run generate  # Babylon Editor public/scene 패키징
    npm run generate:battle  # 배틀 Editor 씬과 배틀 에셋까지 패키징
    npm run generate:battle:biomes  # River/Desert 마스터에서 2D 패럴랙스 레이어 재생성
npm run check     # typecheck + test + build
npm run test:e2e:side-view  # dev/prod 서버를 자동 기동해 side-view browser E2E 실행
npm run check:full # check + lint + side-view browser E2E
```

`test:e2e:side-view`는 Playwright 기본 Chromium을 사용한다. 로컬 Chrome을 명시하려면 `SIDE_VIEW_BROWSER_EXECUTABLE` 환경 변수에 실행 경로를 지정한다.

`npm run generate`는 `scripts/pack-editor.mjs`를 통해 Babylon Editor CLI의 ESM bin 문제를 우회하고, `assets/battlescene/`과 `assets/battlescene.scene/`을 임시 제외해 1차 public 산출물에 전투 그래픽이 들어가지 않도록 한다.

배틀씬을 실행하거나 웹 배포 산출물을 만들 때는 `npm run generate:battle`을 사용한다. 이 명령은 `assets/battlescene.scene/`과 `assets/battlescene/`을 `public/scene/`에 패키징하고, 맵 이미지 런타임 사본을 `public/assets/runtime/battlescene/`에 동기화한다.

Babylon.js Editor에서 `project.bjseditor`를 열면 마지막 씬이 `assets/battlescene.scene/`으로 지정되어 있다. Editor에서 배치·재질·모델을 수정한 뒤에는 `npm run generate:battle`을 다시 실행해 웹 패키지를 갱신한다. 게임 규칙과 좌우 이동은 `src/game/battle/runtime/`에서 유지하므로 Editor 수정과 런타임 로직을 분리할 수 있다.

## 문서

- [1차 마이그레이션 계획](docs/PHASE_1_MIGRATION_PLAN.md)
- [마이그레이션 이슈 기록](docs/MIGRATION_ISSUES.md)
- [전투 런타임 경계 ADR](docs/BATTLE_RUNTIME_BOUNDARY.md)
- [배틀 씬 개발계획](docs/battlescene/BATTLE_SCENE_DEVELOPMENT_PLAN.md)
- [전투 장면 후속 계획](docs/battlescene/BATTLE_SCENE_IMPLEMENTATION_PLAN.md)
- [2D 배틀 게임플레이 개발계획](docs/battlescene/BATTLE_2D_GAMEPLAY_DEVELOPMENT_PLAN.md)
- [2D 배틀 수정 전용 개발계획](docs/battlescene/BATTLE_2D_GAMEPLAY_CORRECTION_PLAN.md)

코드 작업 단위마다 계획서의 실행 현황과 이슈 문서를 함께 갱신한다. 해결되지 않은 이슈도 숨기지 않고 상태·근거·우회책·다음 조치를 기록한 뒤, 독립 작업은 중단하지 않고 계속 진행한다.
