# 1차 마이그레이션 이슈 기록

- 대상 계획서: [PHASE_1_MIGRATION_PLAN.md](./PHASE_1_MIGRATION_PLAN.md)
- 기록 파일: `docs/MIGRATION_ISSUES.md`
- 기록 원칙: 이슈를 숨기지 않고, 해결 전까지 상태와 다음 조치를 유지한다.

## 상태 정의

- `OPEN`: 확인되었지만 해결 또는 우회가 아직 없음
- `WORKAROUND`: 임시 우회로 개발을 계속하지만 근본 해결이 아님
- `BLOCKED`: 현재 단계의 특정 작업은 막혔지만 독립적인 작업은 계속 진행
- `RESOLVED`: 수정과 검증이 완료됨

## 기록 템플릿

새 이슈는 아래 형식으로 추가한다.

```md
## MIG-000 — 제목

- 상태: `OPEN`
- 심각도: `S1`(중요) / `S2`(일반) / `S3`(낮음)
- 발견 단계: `M0` ~ `M7`
- 발견일: YYYY-MM-DD
- 관련 커밋: <commit 또는 미정>
- 관련 파일: `<absolute or repository-relative path>`

### 증상

<!-- 무엇이 잘못되었는지 사용자 관점과 기술 관점으로 기록 -->

### 재현 절차

1. 

### 근거

<!-- 콘솔 로그, 테스트 결과, 스크린샷 경로, 네트워크 요청 등 -->

### 영향 범위

<!-- 현재 단계와 이후 단계에 미치는 영향 -->

### 우회 또는 계속 진행 방법

<!-- 개발을 멈추지 않기 위해 적용한 fallback/adapter/범위 축소 -->

### 다음 조치

<!-- 담당 작업, 필요한 결정, 검증 명령 -->

### 해결 기록

<!-- 해결 시 수정 내용, 검증 결과, 재발 방지 조치와 상태 변경 -->
```

## 현재 이슈

## MIG-001 — 대상 TypeScript ES5 target과 순수 규칙의 이터러블 충돌

- 상태: `RESOLVED`
- 심각도: `S2`
- 발견 단계: `M1`
- 발견일: 2026-08-23
- 관련 커밋: `678954b`
- 관련 파일: `tsconfig.json`, `src/game/domain/cohortRules.ts`

### 증상

Next production build의 TypeScript 단계에서 `Set<string>`을 spread하는 코드가 `--downlevelIteration` 없이 컴파일될 수 없다는 오류가 발생했다. 대상 템플릿은 기본 target이 `es5`였고, 이식한 순수 도메인 코드는 ES2015 이상 이터러블 동작을 전제로 한다.

### 재현 절차

1. `npm run build` 실행
2. `src/game/domain/cohortRules.ts`의 `new Set(cohortIds)` spread 오류 확인

### 근거

첫 빌드 로그: `Type 'Set<string>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.`

### 영향 범위

화면 렌더링 이전에 production build가 중단된다. 전투 렌더러와는 무관하다.

### 우회 또는 계속 진행 방법

`tsconfig.json`의 target을 `es2022`로 올렸다. 현재 브라우저 대상과 원본 Vite 설정의 ES2022 기준에도 맞는다.

### 다음 조치

`npm run typecheck`, `npm run build` 재실행.

### 해결 기록

target 변경 후 `npm run typecheck`와 `npm run build`가 통과했다. ES2022 target을 유지해 순수 규칙의 Set/이터러블 사용이 다시 downlevel 오류를 만들지 않게 했다.

## MIG-002 — Next.js workspace root 자동 추론 경고

- 상태: `RESOLVED`
- 심각도: `S3`
- 발견 단계: `M1`
- 발견일: 2026-08-23
- 관련 커밋: `678954b`
- 관련 파일: `next.config.js`

### 증상

상위 `/Users/switch/package-lock.json` 때문에 Next.js가 프로젝트 외부를 workspace root로 자동 선택하고, 현재 프로젝트의 `package-lock.json`을 추가 lockfile로 경고한다.

### 영향 범위

현재 빌드는 진행되지만 모노레포가 아닌 프로젝트에서 경로 추론이 불필요하게 넓어진다.

### 우회 또는 계속 진행 방법

`turbopack.root: __dirname`을 설정해 대상 프로젝트를 명시적인 root로 지정했다. 상위 lockfile은 사용자 환경 자산이므로 삭제하지 않는다.

### 다음 조치

없음. 다음 Next.js major/minor 업그레이드 때 `turbopack.root` 동작을 재확인한다.

### 해결 기록

`turbopack.root: __dirname` 적용 후 `npm run build` 로그에서 workspace root 자동 추론 경고가 재현되지 않았다. 상위 lockfile은 삭제하지 않고 프로젝트 경계를 설정하는 방식으로 해결했다.

## MIG-003 — npm audit 취약점 보고

- 상태: `OPEN`
- 심각도: `S2`
- 발견 단계: `M2`
- 발견일: 2026-08-23
- 관련 커밋: `678954b`
- 관련 파일: `package-lock.json`

### 증상

`zod`와 `vitest` 설치 후 전체 의존성 감사에서 11개 취약점(중간 5, 높음 4, 치명적 2)이 보고됐다. 런타임 의존성만 분리한 `npm audit --omit=dev`에서도 Next.js/PostCSS/sharp 관련 높음 3개가 남는다.

### 영향 범위

현재 화면 기능과 빌드 실행 여부를 즉시 막지는 않지만, 배포 전 의존성 보안 검토가 필요하다.

### 근거

- `npm audit --json`: total 11 (moderate 5 / high 4 / critical 2)
- `npm audit --omit=dev`: high 3 (`next`, 내장 `postcss`, 내장 `sharp`)
- 자동 수정 제안은 `next@16.3.2` 설치를 위해 현재 고정 범위를 벗어나는 `--force`를 요구한다.

### 우회 또는 계속 진행 방법

자동 `npm audit fix --force`는 Next/Babylon 버전을 바꿀 수 있으므로 실행하지 않고 개발을 계속한다.

### 다음 조치

전투 화면 개편 전 의존성 업그레이드 묶음에서 Next.js 보안 패치 범위, Babylon Editor CLI의 `fast-xml-parser`, Vitest 개발 서버 취약점을 함께 검토한다. 이번 단계에서는 버전 강제 변경을 하지 않는다.

## MIG-004 — 앱 브라우저 도구 부재 및 오프라인 폰트 검증 우회

- 상태: `WORKAROUND`
- 심각도: `S3`
- 발견 단계: `M7`
- 발견일: 2026-08-23
- 관련 커밋: `678954b`
- 관련 파일: `src/game/presentation/styles.css`, `package.json`

### 증상

현재 작업 환경에는 계획서가 권장한 Browser/IAB 자동화 도구가 노출되지 않았다. 첫 Playwright 스크린샷은 외부 Google Fonts 응답을 기다리며 시간 초과했다.

### 재현 절차

1. Browser/IAB 도구 목록을 확인한다.
2. `http://localhost:3000/`에서 외부 폰트 import가 있는 상태로 스크린샷을 요청한다.

### 근거

Browser 도구를 사용할 수 없어 `playwright-core@1.54.2`와 시스템 Chrome(`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`)을 fallback으로 사용했다. 외부 `@import`를 제거한 뒤 데스크톱·세로 모바일·가로 모바일 스크린샷과 상호작용 검증이 완료됐다. 결과 이미지: `/tmp/phase1-menu-qa2.png`, `/tmp/phase1-map-qa2.png`, `/tmp/phase1-map-seoul.png`, `/tmp/phase1-mobile-portrait-qa.png`, `/tmp/phase1-mobile-landscape-map-qa.png`.

### 영향 범위

제품 기능은 막히지 않는다. 네트워크가 없는 환경에서도 fallback 글꼴로 레이아웃을 검증할 수 있지만, Google Fonts 원본과 글자 폭이 다를 수 있다.

### 우회 또는 계속 진행 방법

폰트 선언은 동일한 순서의 로컬/시스템 fallback을 유지하고 외부 import만 제거했다. Playwright로 메뉴·맵·도시 패널·언어 전환·전투 경계 알림·저장 이어하기와 모바일 가로 guard를 검증했다.

### 다음 조치

Browser/IAB 도구가 제공되면 동일 시나리오를 한 번 더 실행한다. 폰트 자체 호스팅은 후속 최적화로 별도 계획한다.

## MIG-005 — 현재 Node 런타임과 eslint-visitor-keys 엔진 범위 불일치

- 상태: `OPEN`
- 심각도: `S3`
- 발견 단계: `M7`
- 발견일: 2026-08-23
- 관련 커밋: `678954b`
- 관련 파일: `package-lock.json`, 개발 환경 Node 버전

### 증상

`npm install` 시 `eslint-visitor-keys` 전이 패키지가 Node `>=20.19.0`을 요구하지만 현재 런타임은 `v20.15.0`이라는 `EBADENGINE` 경고가 출력된다.

### 영향 범위

현재 `npm run lint`, typecheck, test, build는 모두 실행되지만, 향후 패키지 업데이트에서 설치 실패 또는 런타임 비호환이 될 가능성이 있다.

### 우회 또는 계속 진행 방법

패키지 버전을 억지로 낮추지 않고 현재 검증을 계속한다. CI/개발 머신은 Node 20.19 이상으로 올리는 것을 권장한다.

### 다음 조치

전투 화면 개편 시작 전에 Node 버전 고정 파일(`.nvmrc` 또는 `engines`) 도입 여부를 결정하고 CI에서 동일 버전을 사용한다.

## MIG-006 — Babylon Editor CLI bin의 CommonJS/ESM 실행 경계

- 상태: `RESOLVED`
- 심각도: `S2`
- 발견 단계: `M7`
- 발견일: 2026-08-23
- 관련 커밋: `678954b`
- 관련 파일: `package.json`, `node_modules/babylonjs-editor-cli/bin/babylonjs-editor-cli.js` (외부 패키지)

### 증상

기본 `babylonjs-editor-cli pack` 명령이 패키지의 `.js` bin 파일을 CommonJS로 해석해 `import` 구문 오류로 중단됐다. 패키지 `package.json`에 `type: module`이 없지만 bin은 ESM 구문을 사용한다.

### 근거

기본 실행 결과: `SyntaxError: Cannot use import statement outside a module`. 패키지의 `build/src/index.mjs`를 ESM 동적 import로 직접 실행하면 `Packing assets`, `Packing example.scene`, `Collecting scripts`가 모두 성공했다.

### 영향 범위

Editor pack 자체는 가능하지만, 기본 npm script를 그대로 사용하면 M7 자동 검증이 실패한다.

### 우회 또는 계속 진행 방법

`scripts/pack-editor.mjs`가 패키지 내부의 ESM `pack` 함수를 직접 호출한다. 실행 중 `assets/battlescene/`을 임시로 프로젝트 밖으로 이동해 1차 public 산출물에 전투 2D 자산이 들어가지 않도록 하고, 완료 후 원위치한다. 외부 패키지 파일은 수정하지 않았다.

### 다음 조치

Editor CLI가 bin 실행 경계를 수정한 버전으로 올라가면 npm script를 공식 bin 호출로 되돌릴 수 있는지 확인한다.

### 해결 기록

변경된 `npm run generate`가 scaled texture, `example.scene`, scripts 수집을 모두 완료했고 `public/scene/assets-list.json`에 `battlescene` 경로가 남지 않는 것을 확인했다. 생성된 `public/scene/`은 Git 추적 대상으로 유지한다.

## 작업 종료 점검

- [ ] 이번 작업에서 발견한 이슈를 모두 기록했는가?
- [ ] 우회한 항목을 `WORKAROUND`로 남겼는가?
- [ ] 막힌 항목이 있어도 가능한 독립 작업을 계속했는가?
- [ ] 계획서의 단계 상태·검증 결과·다음 조치를 갱신했는가?
- [ ] 관련 문서 변경이 코드 작업 커밋에 포함되었는가?
