# They Call It Earth — Babylon.js Editor 1차 이식

이 저장소는 원본 React 게임의 시작 화면과 월드 맵 선택 흐름을 Babylon.js Editor 기반 Next.js 프로젝트로 옮긴 1차 마이그레이션이다.

1차 실행 범위는 다음과 같다.

- 시작 화면, 새 캠페인, 이어하기, 로컬 저장 초기화
- 세계 지도, 국가·도시 선택, 확대/축소·팬, 도시 상세 패널
- 한국어/영어 전환과 모바일 세로 화면 안내
- 엔진 비의존 캠페인·전투 규칙·월드 데이터·저장소 보존

전투 화면은 새 카메라·맵·에셋으로 다시 만들 예정이므로 1차 실행 경로에서 로드하지 않는다. 전투 버튼은 `BattleGateway` placeholder로 남겨 두며 GLB와 구형 도로 Nav는 이식하지 않는다.

## 개발 명령

```bash
npm install
npm run dev       # http://localhost:3000
npm run lint
npm run typecheck
npm run test
npm run build
npm run generate  # Babylon Editor public/scene 패키징
npm run check     # typecheck + test + build
```

`npm run generate`는 `scripts/pack-editor.mjs`를 통해 Babylon Editor CLI의 ESM bin 문제를 우회하고, `assets/battlescene/`을 임시 제외해 1차 public 산출물에 전투 그래픽이 들어가지 않도록 한다.

## 문서

- [1차 마이그레이션 계획](docs/PHASE_1_MIGRATION_PLAN.md)
- [마이그레이션 이슈 기록](docs/MIGRATION_ISSUES.md)
- [전투 런타임 경계 ADR](docs/BATTLE_RUNTIME_BOUNDARY.md)
- [배틀 씬 개발계획](docs/battlescene/BATTLE_SCENE_DEVELOPMENT_PLAN.md)
- [전투 장면 후속 계획](docs/battlescene/BATTLE_SCENE_IMPLEMENTATION_PLAN.md)

코드 작업 단위마다 계획서의 실행 현황과 이슈 문서를 함께 갱신한다. 해결되지 않은 이슈도 숨기지 않고 상태·근거·우회책·다음 조치를 기록한 뒤, 독립 작업은 중단하지 않고 계속 진행한다.
