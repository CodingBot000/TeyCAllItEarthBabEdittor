Original prompt: 우주선 모형이 지금 엉망진창인데 /Users/switch/Development/game/webgame/TheyCallItEarth/ 여기서 사용한 모선 을 그대로 가져와서 적용해봐

## 2026-08-26 — 지상 사격 위치 AI 구현 완료

- 요청: `GROUND_UNIT_ATTACK_POSITIONING_AI_PLAN.md`에 따라 공통 AI와 실제 FACILITY/SAM 이동 전투를 구현한다.
- 기준선: 기존 Vitest 57개와 typecheck 통과. 전체 lint는 기존 BattleScreen set-state-in-effect 오류 1건과 img 경고 2건.
- 공통 공간 변환(전투 Y - 16.5), 17 기준속도, 좌우 소켓 pose, 실제 실드/선체 접촉체적을 분리했다. Editor GroundBattleRoot의 변환은 항등, SAM 소켓의 실제 Z는 1.1 - 1 = 0.1임을 확인했다.
- 각도/타원 단면/거리 교차와 좌우 위치 구간, 접근·이격·재배치·진입·대기 AI를 추가했다. 새 순수 규칙 테스트 27개 통과.
- SAM 발사 직전 AI 실행, 연사 재검사/취소, EMP 정지, 초기 발사 방향/좌표 보존, 선분 충돌을 연결했다. 일반 RAF와 advanceTime을 공통 60Hz 적분기로 통일했다.
- 다른 작업에서 추가 중인 GroundShadow 및 그림자 에셋 변경은 보존한다.
- 최종 typecheck, Vitest 95/95, production build, 변경 파일 ESLint, diff check 통과. 전체 lint는 위 기존 1오류/2경고만 남아 있다.
- 전용 `test:e2e:ground-positioning` 통과: 1280×720/900×500/640×360, 좌우 발사, 속도·소켓·탄 좌표, 접근/이격/반대편 재배치/카메라/리사이즈/공간 부족/EMP/일시정지/파괴. 오류 0건, 결과는 `output/ground-unit-positioning`.
- 기본 16:9 레이아웃에서는 세로 viewport만으로 월드 가시 폭이 줄지 않는다. 공간 부족은 테스트 페이지에만 실제 캔버스 폭 360px CSS를 적용해 검증한다. 제품 CSS와 숫자 AI 경계는 변경하지 않았다.
- 기존 visual-sync, mobile 900/640, abort, failure, full-flow 브라우저 회귀 통과. 결과는 `output/ground-positioning-regression`.
- 최종 production-debug 검증도 통과했다(debug query 무시/저장 유지/오류 0). 직접 시작한 3011 임시 서버는 종료했고 기존 3000 서버는 유지했다.
- 기존 full-flow의 낡은 도시 버튼 선택자/문구, abort의 잘못된 VICTORY 기대를 현재 UI에 맞췄다. 흡수 전 이동은 현재 가속/감속을 계산해 정지 후 수행하도록 검증 스크립트를 보정했다.
- 이번 기능의 남은 TODO는 없다. 차량끼리 겹치지 않게 하는 점유/충돌 정책과 다른 유닛 적용은 계획상 후속 범위다.

## 2026-08-26 — 파괴 이미지 파편 VFX 추가

- 기존 폭발 플립북·코어·링은 유지하고, 파괴되는 전투기와 지상 유닛의 현재 2D 텍스처 프레임을 5×2 총 10개 독립 Plane으로 분할했다.
- 각 파편은 원본 UV 영역과 좌우 반전을 유지하며 결정적인 속도/회전값, 중력, 페이드, 1.15초 수명을 적용한다. 매 파괴 시 별도 파편 텍스처와 재질을 정리해 누수를 방지한다.
- `render_game_to_text`의 `visuals.effects`에 `explosionCount`, `shatterCount`, `shatterPieceCount`를 추가했다.
- 실제 Babylon 브라우저에서 지상 유닛 파괴 시 `explosionCount=1`, `shatterPieceCount=10`, 전투기 파괴 후 각 효과가 동시에 살아 있고 파편 20개(각 대상 10개)인 상태를 확인했다.
- Node NullEngine은 `OffscreenCanvas`가 없어 GUI 포함 렌더 테스트에 사용할 수 없었으므로, 브라우저 E2E 진단으로 대체했다. 해당 검증은 콘솔/페이지/네트워크 오류 0건으로 통과했다.
- 최종 검증은 `npm run check`(typecheck, Vitest 95/95, production build), 변경 파일 ESLint, `git diff --check`, 표준 develop-web-game 클라이언트까지 통과했다. 실제 캡처는 `output/ground-unit-positioning/ground-shatter.png`, `fighter-shatter.png`에 보존했다.

## 2026-08-26 — 흡입광선 내부 가상 오브젝트 VFX 추가

- 사용자가 제공한 `docs/reference_images/absorption-beam-impact-reference.png`는 분위기·배치 참고로만 사용하고, 실제 흡수 대상이나 게임 상태 위치는 변경하지 않았다.
- `BattleAbsorptionVfx` 안에 10개 풀의 어두운 사람형 가상 실루엣을 추가했다. `public/assets/runtime/sprites/absorption-virtual-human-silhouettes-5x1.webp`의 5종 투명 스프라이트를 사용하며, 모두 VFX 전용 Babylon TransformNode라 실제 `AbsorbableTargetState`나 월드 오브젝트를 이동시키지 않는다.
- 흡입광선이 켜져 있는 동안 0.12초 간격으로 재사용 오브젝트를 생성한다. 지면 쪽에서 모선 흡입구 방향으로 `t³` ease-in 이동하고 도달 시간은 정확히 0.8초다. 회전·미세 흔들림·페이드도 포함한다.
- 흡입광선 종료 시 신규 생성은 멈추고 남은 가상 오브젝트를 정리한다. `visuals.absorptionVfx`에 풀 수, 활성 수, 개별 진행률, 가속 모션 진행률을 노출했다.
- 기존 `outerLayerCount=3`, `shaftCount=12`, `meshCount=24` 계약은 유지했다. 추가 오브젝트는 별도 풀로 관리한다.
- `scripts/verify-absorption-virtual-objects.mjs`를 추가해 IGNITING/SUSTAINED/FADING/OFF, 0.8초 이동, `t³` 가속, 풀 재사용, 종료 정리를 브라우저에서 검증한다.
- 1280×720 실제 브라우저 검증 통과: 첫 오브젝트 progress 0.146→0.625, motionProgress 0.003→0.244, IGNITING 활성 1개, SUSTAINED 활성 5개, OFF 활성 0개, 콘솔/4xx 오류 0건. `01-ignition.png`, `02-sustained.png`, `03-arrival.png`에서 화면도 직접 확인했다.
- 최종 `npm run typecheck`, production build, 관련 파일 ESLint, `git diff --check`, 표준 web-game client를 다시 통과했다. 가상 오브젝트 전용 E2E도 통과했고 `result.json`에서 0.8초 travel, t³ 가속, 빔 종료 후 0개를 확인했다.
- ImageGen으로 만든 원본 실루엣은 `$CODEX_HOME/generated_images/...`에 보존하고, 프로젝트에는 320×128 투명 WebP(7,588 bytes)로 복사했다. 실제 E2E에서 스프라이트 기반 사람형 실루엣과 0.8초 이동을 확인했다.
- 사람 실루엣 렌더 크기를 `0.45~1.1`에서 `0.9~2.1`로 키우고, 대상 흡수율에 `durationMultiplier=3`을 적용했다. 개별 실루엣 상승 시간 0.8초는 유지하고 대상 전체 흡수 시간만 3배로 늘렸다.
- 전체 Vitest는 현재 병행 작업 반영 후 103/103, typecheck와 production build도 통과했다. 1280×720 흡수 E2E에서 확대 크기, 흡수 진행, 콘솔/4xx 오류 0건을 확인했다.
- 전체 Vitest는 병행 중인 보호시설 작업의 `shelterRules.test.ts` 1건이 `discovered=true` 수동 변경 뒤 상태를 갱신하지 않아 `HIDDEN`/`LOCKED` 불일치로 실패한다(94/95). 흡입광선 관련 테스트 및 이번 변경 파일은 통과했다.
- 이번 변경 파일 typecheck/ESLint/diff 검사는 통과했다. 전체 Vitest는 병행 작업 중인 `shelterRules.ts`의 기존 보호시설 테스트 1건이 `HIDDEN`/`LOCKED` 상태 불일치로 실패해 94/95이며 흡입광선 테스트와 무관하다. 해당 병행 변경은 보존했다.

## 2026-08-24

- 원본 모선은 GLB가 아니라 `src/rendering/babylon/tactical/MothershipVisual.ts`에서 Babylon 메시를 절차적으로 조립하는 구현임을 확인했다.
- 현재 Editor 씬은 `MothershipModel` 원반과 `MothershipRim`만 있어 원본의 상판, 돔, 장갑 패널, 발광 링, 하부 반응로가 빠져 있다.
- 목표: 원본 런타임 모선을 동일한 개별 메시 계층으로 `assets/battlescene.scene`에 생성해 Babylon Editor에서 선택·수정 가능하게 만들고, 패키징된 웹 씬에서도 사용되도록 한다.
- 원본과 SHA-256이 동일한 `mothership-saucer-atlas.png`를 `assets/battlescene/shared/mothership/mapping/`에 추가했다.
- 씬 생성기를 원본 `MothershipVisual.ts`와 동일한 치수/재질/UV/스케일로 교체했고 Editor 씬을 재생성했다.
- `MothershipVisualRoot` 아래에 상판·하판·돔·외곽 트림·상단 링 4개·장갑 패널/라이트 각 16개·반응로·하부 이미터를 포함한 59개 메시가 생성되며 모두 parent 계약을 가진다.
- `npm run generate:battle`, `npm run typecheck`, 16개 Vitest 테스트가 통과했다.
- 서울 전투에 진입해 1280×720 WebGL 캔버스를 확인했고, 우측 이동 시 59개 부품이 루트와 함께 이동했다.
- Editor fighter 미리보기 텍스처도 씬 공유 에셋으로 패키징해 기존 `/scene/assets/runtime/...` 404를 제거했다. 최종 브라우저 검증은 콘솔 오류와 4xx 응답이 모두 0건이다.
- 검증 캔버스를 `assets/battlescene.scene/preview.png`로 갱신했고 씬 생성기가 기존 preview를 보존하도록 했다.
- Editor 기하 데이터는 JSON 인라인 대신 77개 `babylonbinarymeshdata`로 외부화했다. 패키징된 씬 본문은 약 5.5 MiB에서 357 KiB로 줄었고 모선 59개 메시의 Editor 선택 가능성은 유지된다.
- 최종 `npm run check`가 통과했다: typecheck 성공, Vitest 16/16, Next production build 성공.

## TODO

- 후속 요청: Unity의 빈 GameObject처럼 모선 59개 메시를 Editor에서 접고 펼칠 수 있는 TransformNode 계층으로 정리한다.
- 계획 계층: `MothershipVisualRoot/MothershipModelRoot/{MothershipHullGroup,MothershipRingGroup,MothershipArmorGroup,MothershipReactorGroup,MothershipEmitterGroup}`. 기존 Weapon/Drone/VFX 소켓은 `MothershipVisualRoot`의 별도 child로 유지한다.
- 계층화 구현 및 `npm run generate:battle` 패키징 완료. `MothershipVisualRoot`의 직접 child는 `MothershipModelRoot`, `WeaponSockets`, `DroneSpawnSockets`, `MothershipVfxSockets` 4개로 축소됐다.
- 59개 메시가 Hull 7개, Ring 4개, Armor 32개, Reactor 4개, Emitter 12개 그룹으로 모두 분류되는지 source/public 씬 양쪽에서 확인했다.
- 서울 전투 로드와 우측 이동을 다시 검증했다. 화면 형태 변화 없이 전체 모선이 함께 이동하며 콘솔 오류와 4xx 응답은 0건이다.
- 사용자 작업 중이던 배경 Plane Editor pickable 설정과 런타임 pick 차단 변경을 보존했다.
- 남은 TODO 없음. Babylon Editor에서는 `MothershipModelRoot`를 접어 전체 모델을 한 줄로 관리하고, 전체 소켓까지 함께 옮길 때는 상위 `MothershipVisualRoot`를 선택한다.

## 2026-08-24 — 2D 배틀 게임플레이 개발 시작

- 추가 사용자 요청: `docs/battlescene/BATTLE_2D_GAMEPLAY_DEVELOPMENT_PLAN.md`에 확정한 2D 배틀 게임플레이를 실제로 구현한다.
- 확정 조작: 모선 좌우 이동, 흡수, EMP, Plasma, Overdrive, 시간 해제형 탈출.
- 확정 자동화: 접근 시 자동 SCAN, 기존 조건의 자동 방공 레이저, 선회하는 자폭드론형 자동 지상 공격, 출격 전 편성한 코호트의 전투 중 AI 운용.
- 확정 맵 방향: 기존 3D 도시 배치를 사용하지 않고 Coastal/River/Desert의 2D 레이어와 게임플레이 프로필을 분리한다.
- 진행 순서: G0 회귀 기준선 → G1 결정적 흡수 지역 → G2 자동 탐지·흡수 → 시간 기반 탈출과 실제 HUD 순으로 작은 단위 검증을 반복한다.
- G0 기준선: 기존 Vitest 16/16과 TypeScript 검사가 통과했다.
- G1 순수 규칙 구현: Coastal/River/Desert용 `BattleGameplayProfile`, 결정적 흡수 지역 생성기, 2D 전투 세션 어댑터를 추가했다.
- 같은 시드·도시·방문·미션은 같은 배치를 만들며, 초기 화면과 좌우 바깥 화면에 흡수 지역을 보장한다.
- 접근 자동 탐지는 Tactical Energy를 소비하지 않고 기존 대상 잠금 상태를 갱신한다.
- 위치 기반 탈출과 분리된 `LOCKED → AVAILABLE → IN_PROGRESS → COMPLETE` 시간 탈출 규칙을 추가했다.
- 신규 단위 테스트 4개를 포함해 Vitest 20/20과 TypeScript 검사가 통과했다.
- G2/G3/G5 런타임 연결: 2D 지역 표시, 접근 자동 탐지, 근거리 자동 대상 흡수, EMP·Plasma 자동 목표, Overdrive 버튼, 생존 HUD와 조건부 탈출 버튼을 구현했다.
- `window.render_game_to_text`는 모선·화물·대상·쿨다운·탈출·지상 투사체 상태를 반환하고, `window.advanceTime`은 60Hz 결정적 스텝으로 동작한다.
- G4 자동 지상 공격: 4발 자폭드론형 묶음이 서로 다른 곡률로 선회해 지상 목표에 충돌하고 실제 체력 피해와 충돌 이벤트를 발생시킨다.
- 자동 지상 공격 단위 테스트를 추가해 Vitest 21/21과 TypeScript 검사가 통과했다.
- G8 캠페인 셸 1차 복구: 미션 편성, 이동, 전투 완료 스테이징, 디브리핑, 포로 배분, 업그레이드 화면을 현재 Next.js 앱에 다시 연결했다.
- 정상 흐름 E2E가 `새 캠페인 → 서울 → 미션 편성 → 이동 → 2D 배틀 흡수/자동 지상전 → 탈출 → 디브리핑 → 배분 → 업그레이드`를 통과했고 브라우저 오류가 없었다.
- Playwright 검증을 위해 `playwright@1.54.2`를 dev dependency로 추가했다. 설치 시 기존 의존성을 포함한 audit 경고 12개(중간 5, 높음 5, 치명적 2)가 보고됐으며 강제 수정은 수행하지 않았다.
- G5 실패 경제: 모선 대파 시 Hull 손상률 기반 수리비를 계산하고 보유 자원의 45% 상한 안에서 즉시 차감한다. 초기 자원 완파 검증값은 Biomass 54, Alloy 36이며 긴급 복구 Hull 50%를 보장한다.
- G6 코호트 AI: 편성 코호트가 자동 배치되고 RAID에서는 방어를 공격한 뒤 철수 시 후퇴한다. OCCUPATION에서는 방어 제거 후 서로 다른 필수 노드를 확보하고 주둔 후보로 스테이징한다.
- G7 2D 맵: built-in ImageGen으로 River/Desert 마스터 파노라마를 생성해 `art-source/battlescene/maps/`에 보존했다.
- River 마스터: `art-source/battlescene/maps/river/river-metropolis-master-v1.png`.
- Desert 마스터: `art-source/battlescene/maps/desert/desert-tech-hub-master-v1.png`.
- 생성 프롬프트 핵심: 고정 측면 2.5D 횡스크롤 환경, 3화면 폭, 전경/중경/원경/하늘 분리 가능 실루엣, 캐릭터·우주선·UI·텍스트 없음. River는 양안 메가시티·수력 제어탑·교량, Desert는 태양광 연구 성채·열 저장 시설·사막 산맥을 지정했다.
- `npm run generate:battle:biomes`가 두 마스터에서 각 7개의 2048×724 WebP 패럴랙스 레이어와 manifest를 재생성한다.
- `river-day`와 `desert-day`를 맵 카탈로그에 등록했고 Shanghai는 River, Dubai/Cairo는 Desert 맵을 자동 선택한다.
- G9 검증: 900×500 및 640×360 배틀 HUD가 뷰포트 안에 유지되고, 결정적 10분 soak에서 전투기·미사일·지상 투사체 수가 상한을 지켰다.
- 최종 브라우저 검증: 정상 전체 흐름, 대파 수리비 흐름, River/Desert 직접 진입 모두 오류 0건.

## 다음 튜닝 후보

## 2026-08-27 — 테스트용 배경음악 임시 비활성화

- `BackgroundMusic`에 `BACKGROUND_MUSIC_ENABLED = false` 스위치를 추가해 메뉴/전투 BGM만 임시로 끄도록 했다.
- 전투 효과음 `BattleSoundEffects`는 별도 컴포넌트라 그대로 유지된다.
- 테스트가 끝나면 해당 변수만 `true`로 바꾸면 BGM을 다시 켤 수 있다.

## 2026-08-27 — 실드 방어음 제거

- `sfx-spaceship-barrier-defend.mp3` 에셋을 삭제했다.
- `BattleSoundEffects`의 실드 피격 방어음 생성·재생·정리 로직과 전용 테스트를 제거했다.
- 실드 피격 이벤트와 시각 이펙트, 다른 효과음 재생은 유지했다.

## 2026-08-27 — 전투 효과음 기본 음량 조정

- 실드 방어음 기본 음량을 `0.38`로 조정했다.
- 폭발음 기본 음량을 `0.34`로 조정했다.
- 레이저음 기본 음량을 `0.32`로 조정했다.

## 2026-08-27 — 스테이지 시간 순서 변경

- 전역 `completedBattles + 1` 기준은 유지하고, 1·3·5… 스테이지를 `city-night`, 2·4·6… 스테이지를 도시별 DAY 맵으로 변경했다.
- 단위 테스트와 실제 브라우저에서 첫 스테이지 NIGHT, 두 번째 스테이지 DAY 전환을 확인했다.

## 2026-08-26 — 전투 기본 상태 및 디버그 UI 임시 비노출

- 전투 시간 흐름 기본값을 `NORMAL`로 명시하고, 함선 무적과 유닛 무적 기본값을 모두 `false`로 변경했다.
- `SHOW_IN_BATTLE_DEBUG_CONTROLS = false` 단일 변수로 배경 정렬/충돌 오버레이, 요격빔 차단, 함선·유닛 무적, NORMAL/ENDLESS 디버그 버튼을 일괄 비노출한다.
- 디버그 상태·핸들러·단축키 코드는 삭제하지 않고 유지했으며, 해당 변수를 `true`로 바꾸면 UI를 다시 표시할 수 있다.
- 브라우저에서 `NORMAL / invincibility=false / unitInvincibility=false`, 디버그 버튼 0개, 일반 전투 액션 버튼 6개, 콘솔 오류 0건을 확인했다.
- 전체 Vitest 103/103, TypeScript, production build, `git diff --check`를 통과했다. 변경 파일 lint는 기존 `BattleScreen.tsx`의 set-state-in-effect 1건으로만 실패했다.

## 2026-08-26 — 스테이지 낮/밤 교차 규칙

- 다음 전투 번호(`completedBattles + 1`)를 스테이지 번호의 단일 기준으로 사용했다.
- 1, 3, 5… 스테이지는 `city-night` 맵을 사용하고 2, 4, 6… 스테이지는 도시별 DAY 맵을 사용하도록 정의했다.
- 미션 예약, 저장된 미션 재개, 월드맵 즉시 진입, 디버그 기본 진입과 맵 ID 생략형 Battle Gateway 요청이 같은 `battleMapIdForStage` 규칙을 사용한다.
- 낮/밤 시퀀스, 바이옴 낮 맵 보존, 다음 캠페인 스테이지 매핑 단위 테스트를 추가했다.
- 전용 테스트 7/7, 전체 Vitest 102/102, TypeScript, production build, `git diff --check`를 통과했다.
- 실제 브라우저에서 새 캠페인 1스테이지 `city-day`와 `completedBattles=1` 재진입 2스테이지 `city-night`을 순차 확인했고 콘솔 오류는 0건이다.

## 2026-08-26 — 차량 스프라이트 좌우 방향

- 우측 방향 원본만 있는 지상 차량(DEFENDER/SAM)과 흡수 대상 VEHICLE을 모선 위치 기준으로 좌우 반전하도록 연결했다.
- 차량이 모선 왼쪽에 있으면 오른쪽, 오른쪽에 있으면 왼쪽을 바라보며, 레이더·공군기지·전력시설 같은 비차량 시설은 반전하지 않는다.

## 2026-08-25 — 흡수 광선 방사형 3D VFX

- 흡수 광선을 단일 원통 중심 구조에서 28개 방사형 3D 막대와 중앙 코어/깔때기 조합으로 확장했다.
- 중앙 막대는 더 굵고 밝게 겹치며, 외곽 막대는 얇고 투명도가 낮아지는 형태로 배치했다.
- `B ABSORB` 입력 후 실제 흡수량 증가와 활성 빔 상태를 Playwright 캔버스 검증으로 확인했다.
- 캡처 결과에서 우주선 하부의 청록색 방사형 광선 다발과 넓은 지상 깔때기가 표시되며 콘솔 오류는 없었다.

## 2026-08-25 — 한글 IME 전투키 입력 보정

- `event.key`가 한글 문자로 변해도 `event.code`의 `KeyE/KeyP/KeyB/KeyS`를 우선 사용하도록 전투 키 입력을 정규화했다.
- 이동키, 디버그 숫자키, Q/C/X/Escape도 같은 물리 키 코드 매핑을 적용했다.
- 한글 IME 매핑 테스트를 추가했고 전체 Vitest 39/39, TypeScript, Next production build가 통과했다.

## 2026-08-25 — Cairo/Dubai/Paris 배경 임시 통일

- Cairo, Dubai, Paris의 기존 River/Desert 배경 에셋은 삭제하지 않고 보존했다.
- `battleMapIdForCity`에서 세 도시의 배경 맵만 London과 같은 `city-day`로 연결했다.
- 도시별 전술 프로필과 게임플레이 규칙은 그대로 유지한다.
- 전용 테스트 2개를 추가했고 전체 Vitest 41/41, TypeScript, Next production build가 통과했다.

## 2026-08-25 — 지상공격 충돌 위치 및 무기 체력바 조정

- 지상 투사체/충돌 이펙트의 고정 도착점이 실제 SAM 이미지보다 약 8.3 위(`Y=-4.2`)에 있던 문제를 확인했다.
- `battleVisualCoordinates.ts`에 지상 무기 공통 좌표를 모으고, 투사체와 충돌 이펙트를 지상 SAM 이미지 중심(`Y=-12.5`)까지 관통하도록 조정했다.
- SAM 체력바를 이미지 상단(`Y=6.4`)에서 실제 텍스처 하단 직하(`Y=-1.42`, 루트 기준)로 이동했다.
- 기존 사용자 변경(`BattleCombatVfx` 빔 방향, 배틀 화면 고정 16:9 레이아웃)은 보존했다.

- River/Desert의 1차 마스터 분할 레이어는 기능과 분위기 검증용이다. 최종 아트 단계에서 레이어별 투명 원본을 개별 제작하면 깊이 중복과 안개 경계를 더 정교하게 조정할 수 있다.
- 75초 기본 생존 시간, 자폭드론 피해/쿨다운, 수리비 상한 45%는 플레이테스트 후 조정한다.
- 메뉴와 월드맵의 기존 `<img>` 두 곳은 Next lint 성능 경고만 남으며 게임 오류는 아니다.
- 최종 `npm run check` 통과: TypeScript, Vitest 26/26, Next.js production build 성공.
- 최종 `npm run lint`는 오류 0건이며 위의 기존 `<img>` 성능 경고 2건만 남았다.
- `git diff --check` 통과.

## 2026-08-24 — 수정 전용 개발계획 실행

- 사용자 요청: `BATTLE_2D_GAMEPLAY_CORRECTION_PLAN.md`의 C0~C8을 구현하고, 각 작업 단위마다 계획서와 이 파일을 갱신한다.
- 현재 기준선: `d262530`의 main, 추적 파일 변경 없음. `cloud-*`, `mothership-raised.png`, `sam-road-layout*.png`, 기존/신규 `output/**`는 사용자 또는 로컬 검증 산출물로 보존하며 커밋 범위에서 제외한다.
- C0 시작: 기존 `npm run check`와 현재 side-view 브라우저 검증을 기준선으로 사용한다.
- C0 완료: `npm run check`는 TypeScript·Vitest 26/26·production build를 통과했고, lint 오류는 0건이다. 기존 `<img>` 최적화 경고 2건은 별도 성능 개선 범위로 남긴다.
- C1 진행: 키보드/포인터 공통 이동 입력, 모바일 홀드 버튼, 확인형 임무 포기(`ABORTED`), 35% 포기 화물 회수율, 개발 환경 전용 debug 쿼리와 저장 격리를 구현했다. `npm run check`는 이 시점에 TypeScript·Vitest 29/29·production build를 통과했다. 다음은 모바일/포기 브라우저 검증이다.
- C1 브라우저 반복: 900×500 포인터 검증에서 Next 개발 도구 버튼이 좌하단 이동 버튼을 가리는 현상을 확인했다. 제품 UI가 아니라 개발 오버레이 충돌이므로 검증 스크립트에서만 `nextjs-portal`을 숨겼다. 동시에 coarse pointer 900px 폭에서는 목표 HUD가 이동 버튼과 겹치던 실제 레이아웃을 수정했다. 900×500·640×360에서 양방향 hold, pointerup/pointercancel 정지, 목표까지 이동 후 흡수가 모두 통과했고 스크린샷을 확인했다.
- C1 완료: `verify-side-view-abort.mjs`로 확인 모달→`ABORTED` 디브리핑, 수리비 미표시, debug 직접 전투 후 실제 저장 불변을 확인했다. production 서버에서도 `debug=battle`, `battle-fast`, `battle-debug` 쿼리가 전투 진입·저장 변경을 만들지 않았다. 정상 전체 흐름 및 일반 캠페인 대파 수리 흐름도 통과했다. 최종 `npm run check`는 29/29, `npm run lint`는 오류 0건(기존 `<img>` 경고 2건), `git diff --check` 통과다.
- C2 시작: 기존 dynamic target ID(`city:visit-N:cluster-N`)가 잔량 키로 사용되어 다음 방문에서 재생성되는 문제를 CityState 종류별 풀과 미션 배치 스냅샷으로 교체한다. v4 저장의 확정 가능한 ID는 종류별 풀로 합산하고, 판별 불가 dynamic ID는 원본 백업과 도시 migration backup 모두에 보존한다.
- C2 진행: v5 `sideViewResources`와 `MissionLoadout.battleSetup`을 구현했다. 동일 미션의 배치/수량은 단위 테스트에서 고정되고 다음 방문은 새 seed로 위치가 바뀌며, 종류별 생성 총량은 남은 풀보다 크지 않다. v4 정적 ID·동적 ID migration도 테스트했다. 실제 정상 전투에서는 ORGANIC 풀 43,764가 18,029 흡수 뒤 25,735로 저장되는 것을 확인했다.
- C2 완료: `npm run check`는 TypeScript·Vitest 31/31·production build를 통과했고, lint 오류 0건과 `git diff --check` 통과를 확인했다. C2가 추가한 v5 미션 setup/자원 풀은 정상 전체 흐름 브라우저 테스트에서 저장·차감까지 검증됐다.
- C3 시작: 고정 18명 civilian VFX를 제거하고, ORGANIC target 중심에만 시민 덩어리·숫자·잔량 비율을 표현한다. 함께 scanner-array의 실제 자동 탐지 거리와 화면 밖 목표 방향/거리를 HUD snapshot으로 추가한다.
- C3 완료: 고정 18명 VFX를 삭제하고 ORGANIC target 전용 `OrganicClusterVisualAdapter`를 추가했다. River 브라우저 검증에서 `1.7만 → 1.4만` 숫자와 군집 표시가 실제 흡수량에 맞춰 감소했고, 근접 target 고갈 뒤 HUD guidance가 화면 밖 신호의 LEFT/거리 값을 반환·표시했다. scanner-array 범위 단위 테스트를 포함해 `npm run check` 32/32, lint 오류 0건, diff check 통과다.
- C4 시작: runtime snapshot에 EMP/Plasma/Absorb/Overdrive/Extract의 가용성·실패 이유·쿨다운을 계산해 버튼에 반영하고, River/Desert profile의 defenseWeights·enemyPressureMultiplier·groundPressureMultiplier·occupationNodeCount를 실제 생성 규칙으로 연결한다.
- C4 완료: 능력 availability snapshot/disabled reason을 구현했고, EMP 사용 후 cells 3→2·16초 cooldown·disabled 버튼을 browser에서 확인했다. 2D 바이옴 카탈로그로 side-view를 3D Coastal clone 데이터에서 분리했으며, River(시설 5/필수 노드 2)와 Desert(시설 6/필수 노드 3, 더 높은 압력)의 snapshot 차이를 검증했다. `npm run check` 35/35, lint 오류 0건, diff check 통과다.
- C5 시작: extraction 중 모든 코호트를 RETREAT로 덮어쓰던 AI를 RAID/OCCUPATION으로 분기한다. OCCUPATION 성공 후 필수 노드에 남은 생존 코호트는 recovery radius보다 먼저 GARRISON_CANDIDATE로 판정한다.
- C5 완료: OCCUPATION의 node hold/후보 우선 판정을 구현했다. 단위 테스트는 extraction 중 RETREAT 미전환과 recovery radius보다 GARRISON_CANDIDATE 우선 처리를, missionRules 테스트는 선택 후보만 GARRISON이고 미선택 후보는 Reserve임을 검증한다. `npm run check` 36/36, lint 오류 0건, diff check 통과다.
- C6 시작: runtime의 독립 fighter 3대와 fixed ground prototype을 실제 EnemyState/CombatFacilityState/GroundDefenderState ID 기준 visual pool로 대체한다. snapshot과 화면 객체 수·위치·파괴 상태가 같도록 자동화용 visual summary도 추가한다.
- C6 완료: `BattleEntityVisuals`가 actual fighter/ground IDs를 동기화하고, non-debug prototype은 숨긴다. visual-sync browser script는 fighter 4개 ID·X/Z와 ground 8개 ID를 state와 비교해 통과했으며, 텍스처 로드 후 실제 fighter sprite 화면도 확인했다. `npm run check` 36/36, lint 오류 0건, diff check 통과다.
- C7 시작: C1~C6의 mobile/abort/failure/full-flow/visual-sync browser scripts를 하나의 재실행 가능한 검증 명령으로 묶고, 계획서 및 상위 문서의 구현 상태를 최신 코드와 맞춘다.
- C7 완료: `test:e2e:side-view` runner와 GitHub Actions CI를 추가했다. 기본 runner는 로컬 Chrome fallback/CI Playwright Chromium을 모두 지원한다. 정상 RAID·대파·모바일 900/640·포기·visual sync·production debug 7개 결과가 전부 true/errors=[]였고, 최종 check 36/36·lint 오류 0건·diff check를 통과했다.
- C8 시작: River/Desert 마스터 기반 레이어의 alpha/중복 실루엣/패럴랙스 이음새를 실제 맵 화면과 파일 메타데이터로 점검한다. 필요한 경우 투명 레이어 아트 산출물을 만들고, 그렇지 않으면 남은 최종 아트 요구사항을 명시적으로 기록한다.
- C8 완료: built-in ImageGen으로 River/Desert Far/Middle/Near/Ground 독립 alpha PNG v2 원본 8개를 만들고, `generate:battle:biomes`가 2048×724 alpha WebP와 manifest v2를 만들도록 연결했다. flattened preview와 좌우 이동 battle screenshot을 검토했고 biome-art E2E가 River/Desert v2 manifest/path를 검증했다. 최종 `npm run check:full`은 36/36·lint 오류 0건(기존 경고 2건)·browser E2E 8/8·diff check를 통과했다.

## 2026-08-25 — SAM 이동 발사 소켓 연결

- SAM 미사일이 실제 SAM 스프라이트와 분리된 공중 좌표에서 생성되는 문제를 확인했다.
- SAM 게임 오브젝트 루트의 미사일 발사대 끝에 자식 `attackSpawn` TransformNode를 추가했다.
- 미사일 상태에 `sourceId`, `launchPosition`, `launchY`를 저장하고, 발사 당시 SAM 위치를 고정했다.
- 렌더링은 SAM 발사 소켓에서 시작해 우주선으로 이동하며, SAM이 이후 이동해도 이미 발사된 미사일은 발사 당시 위치를 유지한다.
- SAM 위치를 바꾼 뒤 발사 위치도 함께 바뀌는 규칙 테스트를 추가했다.
- TypeScript, Vitest 42/42, `git diff --check`, 로컬 city-night 브라우저 화면과 Playwright 검증 루프를 통과했다.

## 2026-08-25 — SAM 사거리·미사일 수 제한 제거

- SAM 발사 조건에서 우주선과의 45 유닛 거리 제한과 전체 미사일 16개 상한 검사를 제거했다.
- SAM은 파괴·비활성화 상태가 아니고 시설별 쿨다운만 끝나면 발사한다.
- 원거리 SAM 및 이미 16개 미사일이 존재하는 상황에서도 발사하는 규칙 테스트를 추가했다.
- TypeScript, Vitest 43/43, `git diff --check`, 게임용 Playwright 검증 루프를 통과했다.

## 2026-08-25 — SAM 피격 폭발 이펙트 연결

- `mothershipHits`의 실제 `source === 'sam'` 피격 이벤트를 기존 폭발 플립북에 연결했다.
- SAM이 실드에 맞을 때도 실드 피격과 함께 기존 폭발 이펙트를 표시한다.
- 요격되거나 8초 만료된 미사일처럼 피격 이벤트가 없는 경우에는 폭발을 생성하지 않는다.
- TypeScript, Vitest 43/43, `git diff --check`, 로컬 전투 화면 검증을 통과했다.

## 2026-08-25 — 포인트 디펜스 요격 빔 추가

- 포인트 디펜스가 미사일을 실제 요격할 때 `lastPointDefenseShot` 이벤트를 기록하도록 연결했다.
- 기존 방공 레이저 생성 구조를 재활용해 우주선에서 요격 대상 미사일로 노란색 빔과 코어를 표시하도록 추가했다.
- 요격 실패·미사일 만료·일반 미사일 제거에는 요격 빔을 생성하지 않는다.
- 사용자 요청에 따라 이 변경에서는 테스트·빌드·브라우저 검증을 실행하지 않았다.

## 2026-08-25 — Day 빠른 전투 배경 디버그 패널 노출

## 2026-08-25 — 오버드라이브 배경 왜곡 VFX

- 오버드라이브가 활성화된 동안 모선의 화면 투영 위치를 중심으로 원형 후처리 왜곡을 적용했다.
- 원형 띠 내부에서 배경 UV를 방사형으로 굴절시키고 약한 청색 색수차·리플을 더해, 모선 주변의 하늘과 도시가 휘어 보이도록 했다.
- 모선 중심과 후처리 UV의 Y축 방향 차이를 보정해 왜곡 중심이 모선에 정확히 맞도록 했다.
- 오버드라이브 종료 시 효과 강도가 자연스럽게 페이드아웃되며, 비활성 상태에서는 화면을 변경하지 않는다.
- `npm run typecheck`와 웹 게임 Playwright 검증을 통과했고, 활성/비활성 캡처에서 시각 효과와 콘솔 오류 0건을 확인했다.

- 배경 레이어 디버그 패널 표시 조건을 `debug=battle`뿐 아니라 개발용 `battle-fast=1`에도 활성화했다.
- `?battle-fast=1`의 `빠른 전투 테스트`로 진입한 CITY DAY 전투에서 7개 레이어 Y 조정 패널이 표시되는 것을 확인했다.

## 2026-08-25 — DAY 지면 레이어 좌우 반복 확장

- DAY `GroundRootPlane`이 카메라 이동 범위보다 짧아 좌우 이동 시 하단 지면이 사라지는 문제를 확인했다.
- 런타임 지면 plane 폭을 2배로 확장하고, 텍스처 U 반복도 같은 비율로 늘렸다.
- Editor 씬 생성기에도 GroundRoot 전용 2배 폭과 반복값을 반영했다.

## 2026-08-25 — Ground 레이어 전면 정렬

- Near와 Ground가 같은 투명 렌더 그룹에서 정렬 순서가 불명확해 Ground가 건물 뒤로 보일 수 있는 문제를 확인했다.
- Ground plane에 투명 정렬 우선순위(`alphaIndex`)를 부여해 Near보다 항상 앞에 그려지도록 수정했다.
- DAY 빠른 전투에서 좌우 이동 후 화면·콘솔 상태를 확인했다.

## 2026-08-25 — NEAR 건물 레이어 70% 축소

- Near 레이어의 건물 크기를 기존 대비 70%로 축소했다.
- 화면을 덮는 plane 폭은 유지하고 텍스처 반복 밀도를 조정해 좌우 빈 공간이 생기지 않도록 했다.
- 세로 축소는 하단 기준선을 유지하도록 plane local Y를 보정했다.

## 2026-08-25 — 하단 조작 안내 제거 및 버튼 하향

- `A / D or ← / → MOVE ...` 하단 조작 안내 문구와 전용 스타일을 제거했다.
- 데스크톱 액션 버튼 바와 모바일 이동 버튼을 안내 문구가 차지하던 공간만큼 아래로 이동했다.

## 2026-08-25 — 파괴된 지상 오브젝트 완전 숨김

- 파괴된 시설·지상 유닛의 루트를 비활성화하고 본체·체력바를 모두 visibility 0으로 처리했다.
- 기존에 남던 0.18 잔상과 파괴 시설 라벨 잔상을 제거했다.

## 2026-08-25 — 모선 지상 탐색 빔 추가

- 모선 하부의 `mothership-reactor-glow`와 `mothership-underside-emitter-*` 메시를 탐색 빔 시작점으로 사용한다.
- 한 번에 2~3개의 반투명 시안 탐색 빔과 지면 원형 링을 생성한다.
- 각 빔은 1초 페이드 인, 2~4초 랜덤 유지, 1초 페이드 아웃으로 동작하며 다음 탐색까지 짧은 랜덤 간격을 둔다.
- 모선 이동 시 시작점도 하부 발광 메시를 따라 이동한다.
- DAY 빠른 전투 화면에서 복수 탐색 빔과 지면 링을 확인했다.

## 2026-08-25 — 탐색 빔 크기·스캔 이동 튜닝

- 모선 발사부 폭을 `1.2`, 지면 도달 폭과 링을 기존의 80%인 `4.16`으로 조정했다.
- 별도 중앙 코어 선을 제거하고 반투명 콘형 본체만 남겼다.
- 동시 빔 수를 1~4개로 변경했다.
- 반경·속도 조합 50개를 미리 랜덤 생성하고 순환 인덱스로 적용했다.
- 각 빔이 서로 다른 반경·속도·위상으로 지면을 좁게 천천히 스캔하도록 연결했다.

## 2026-08-25 — 요격 지점 폭발 이펙트 추가

- 포인트 디펜스 요격 빔이 도달한 미사일 위치에 기존 5×5 폭발 플립북을 추가했다.
- 요격 성공 이벤트에만 생성되며, 요격 실패·만료·일반 제거에는 생성되지 않는다.
- 폭발 수명 동안 빔보다 오래 표시되도록 별도 수명과 정리 처리를 추가했다.
- 사용자 요청에 따라 이 변경에서는 테스트·빌드·브라우저 검증을 실행하지 않았다.

## 2026-08-25 — 우주선 시각 모델 2배 확대

- `MothershipVisualRoot`만 런타임에서 2배 확대해 우주선 본체·장식·소켓이 함께 커지도록 했다.
- `MothershipGameplayRoot`는 확대하지 않아 이동, 전투 판정, 흡수 대상 기준점은 기존 좌표를 유지한다.
- TypeScript, Vitest 43/43, 프로덕션 빌드와 흡수 중인 실제 전투 화면 캡처 검증을 통과했다.

## 2026-08-25 — 흡입 빔 GROUND 레이어 도달

- 흡입 빔이 도시 중간 좌표 `-4.2`에서 멈추던 문제를 확인했다.
- `GROUND_ABSORPTION_TARGET_Y`를 공통 지면 기준 좌표에 연결해 중심 빔·깔때기·방사형 막대가 GROUND까지 내려가도록 수정했다.
- TypeScript, Vitest 43/43, 프로덕션 빌드와 실제 흡입 전투 화면 캡처 검증을 통과했다.

## 2026-08-25 — 우주선 시각 모델 1.5배로 조정

- 기존 원래 크기의 2배 설정을 원래 크기의 1.5배로 낮췄다.
- 이동·충돌·흡수 기준점은 변경하지 않고 우주선 시각 모델만 조정했다.

## 2026-08-25 — 확대된 우주선의 보호막·피격 효과 동기화

- 우주선 시각 스케일을 공통 밸런스 값으로 이동해 렌더링, VFX, 피격 판정이 같은 `1.5` 배율을 사용하도록 했다.
- 보호막 껍질, 피격 위치, 충돌 반경과 수직 판정 높이를 확대된 우주선에 맞춰 조정했다.
- 보호막·선체 피격 폭발, 연기, 충격 링, 파편, 무기 발사 시작점도 같은 비율로 확대했다.

## 2026-08-25 — 우주선 보라색 발광 파츠 Bloom 추가

- `mothership-violet-material`과 `mothership-soft-violet-material`을 사용하는 우주선 파츠만 포함하는 Babylon `GlowLayer`를 추가했다.
- 보라색 링, 장갑등, 리액터 링·코어·글로우, 하부 이미터에 실제 블러 기반 빛번짐을 적용했다.
- 씬 정리 시 GlowLayer도 함께 dispose하도록 연결했다.

## 2026-08-25 — 우주선 아랫면만 보라색 Bloom 적용

- 상단 링과 장갑등은 GlowLayer 대상에서 제외했다.
- 리액터 파츠와 하부 이미터만 이름 기준으로 선별해 아랫면에만 빛번짐이 남도록 조정했다.

## 2026-08-25 — 아랫면 보라색 Bloom 펄스 애니메이션

- Glow intensity를 `0.5`에서 시작해 1.5초 동안 `1.0`까지 올리도록 했다.
- intensity `0.8` 전까지는 완만하게 상승하고, 이후 빠르게 최대값에 도달한다.
- 최대값을 0.5초 유지한 뒤 0.5초 동안 빠르게 `0.5`로 낮추며 반복한다.

## 2026-08-25 — 보라색 Bloom 최대 유지·감소 시간 조정

- intensity `1.0` 유지 시간을 1초로 변경했다.
- `1.0`에서 `0.5`로 감소하는 시간을 0.8초로 변경했다.
- 상승 1.5초를 포함한 전체 반복 주기는 3.3초가 됐다.

## 2026-08-25 — 유닛 무적 디버그와 그룹 위치 조정

- 기존 우주선 무적 버튼 옆에 기본 ON인 `유닛 무적 ON/OFF` 버튼을 추가했다.
- 유닛 무적이 켜져 있으면 Plasma, 방공 레이저, 지상 공격, 코호트 교전으로 유닛 체력·시설 파괴·코호트 손실이 발생하지 않는다.
- 유닛 위치 디버그를 `DEFENDER`, `SAM`, `RADAR`, `AIRBASE`, `POWER` 시각 그룹별로 묶고 X 좌우 조정은 제거했다.
- 각 그룹은 Y 슬라이더 하나로 화면의 같은 타입 유닛을 일괄 이동한다.

## 2026-08-25 — 지상 오브젝트 기준 Y 조정

- 공통 지상 오브젝트 루트 Y를 `-14.50`에서 `-18.50`으로 변경했다.
- 지상 유닛·시설·흡수 대상·관련 라벨이 같은 기준 좌표를 사용하도록 유지했다.
- 배경 `GROUND` 레이어 위치는 변경하지 않았다.

## 2026-08-25 — 전투기 편대 측면 카메라 VFX 이식

- `FIGHTER_COMBAT_VISUAL_TRANSFER_GUIDE.md`를 기준으로 현재 도메인의 편대 궤도·steering·heading/bank 구조는 유지하고, 렌더링 계층에 측면 카메라용 가림 제한을 추가했다.
- 전투기별 짧은 외곽/코어 `TrailMesh`, 속도 기반 visibility, disabled 상태의 엔진 정지, 노즐 위치, 수명 제한 꼬리연기를 추가했다.
- 전투기 health 감소 flash와 제거 시 마지막 위치 기준 0.62초 폭발 플립북·코어·충격 링을 추가했다.
- 우주선 뒤쪽 depth가 grace 시간보다 오래 유지되면 전투기 시각 위치를 제한하고 trail history와 숨겨진 smoke를 함께 정리한다.
- TypeScript, Vitest 45/45, 표준 web-game Playwright 루프, 78초 fighter visual-sync가 통과했다. 최신 78초 장면에서 enemy 5개와 visual fighter 5개의 ID/위치 동기화를 확인했다.
- 후속 화면 검수에서 TrailMesh 상태는 활성인데 발광이 배경에 묻히는 경우를 확인해, 노즐의 명시적 외곽/코어 제트 메시와 더 읽기 쉬운 smoke puff를 추가했다. 최신 78초 캡처에서 전투기별 `trailVisible=true`, `smokePuffCount=10`, bank 값과 콘솔 오류 0건을 확인했다.

## 2026-08-25 — 탐색 빔 스캔 범위·패턴 확장

- 탐색 빔 동시 수를 1~4개로 확장했다.
- 시작 폭을 확대하고 지면 도달 폭과 링을 기존 대비 80%로 축소했다.
- 중앙 코어 선을 제거했다.
- 반경·속도 패턴 50개를 미리 랜덤 생성하고 인덱스를 순환 적용해 빔마다 다른 속도와 이동 반경을 사용한다.

## 2026-08-25 — 우주선 이동 가속·관성·기울기

- 기존 좌우 최고 속도 `34`를 유지하면서 1초에 최고 속도까지 도달하도록 가속을 적용했다.
- 이동 키를 놓으면 1초에 걸쳐 감속하고, 반대 방향을 누르면 현재 속도를 기준으로 감속 후 반대 방향으로 전환되도록 관성을 적용했다.
- 이동 속도에 따라 기존 방향 회전(`Y`)과 별도 선체 기울기(`Z`)를 함께 적용하고, 두 회전 모두 1초 동안 부드럽게 변화하도록 했다.
- 전투 상태의 모선 속도에도 런타임 좌우 속도를 반영해 시각 이동과 전투 상태가 어긋나지 않도록 했다.

## 2026-08-25 — 쉴드 소진 후 선체 피격 흔들림

- `mothershipHits`에서 `HULL` 피격 이벤트가 소비될 때마다 `MothershipVisualRoot`에만 약 0.32초의 감쇠 흔들림을 시작하도록 연결했다.
- 좌우·상하·깊이 미세 이동과 짧은 pitch/yaw/roll을 조합했으며, `MothershipGameplayRoot`의 이동·충돌·카메라 기준은 변경하지 않았다.
- 연속 선체 피격은 매 이벤트마다 흔들림을 재시작하고 위상만 바꿔 같은 패턴이 겹치지 않도록 했다.
- TypeScript, Vitest 45/45, DAY 빠른 전투 화면 렌더링 및 콘솔 오류 0건을 확인했다.

## 2026-08-25 — 자폭드론 속도 감소 및 벌떼 군집 시각화

- 지상 자폭드론 공격 간격을 `4.2초`에서 `8.4초`로 늘려 공격 발생 속도를 절반으로 낮췄다.
- 드론 비행 속도를 `24`에서 `12`로 낮추고 최소·최대 비행 시간도 2배로 조정했다.
- 실제 피해 판정용 논리 드론 4개는 유지하고, 각 드론을 시각적으로 7~11개 멤버로 확장했다.
- 멤버마다 고정된 위상·반경·각속도를 부여해 군집 중심을 따라 서로 다른 속도로 선회하도록 했다.
- 브라우저 DAY 전투 화면에서 느려진 비행과 군집 표현, 콘솔 오류 0건을 확인했다.
- TypeScript와 Vitest 45/45를 통과했다.

## 2026-08-25 — 자폭드론 70% 감속 및 수평 Spiral 궤도

- 기존 자폭드론 비행 속도 `12`의 70%인 `8.4`로 낮췄다.
- 최소·최대 비행 시간은 `2~8초`로 늘려 실제 이동 속도가 모든 거리 구간에서 동일하게 70%가 되도록 했다.
- 공격 간격 `8.4초`와 실제 피해 판정 수는 유지했다.
- 군집 멤버의 수평 반경을 넓히고 수직 반경을 줄여 화면상 더 수평에 가까운 회전으로 변경했다.
- 비행 진행에 따른 위상 누적과 반경 확장으로 직선 이동 중에도 spiral 형태가 보이도록 조정했다.
- TypeScript, Vitest 45/45, DAY 전투 화면 및 콘솔 오류 0건을 확인했다.

## 2026-08-25 — 전체 쉴드 bubble 임시 비활성화

- 전체 우주선을 감싸는 쉴드 `bubble` 생성·업데이트·정리 코드는 유지했다.
- `SHOW_SHIELD_BUBBLE = false` 플래그로 표시만 임시 차단했다.
- 피격 지점의 코어·링·충격 스프라이트는 계속 표시된다.

## 2026-08-25 — SAM 미사일 수평 스프라이트 및 회전 보정 제거

- `sam-missile-white-jet-web.png`를 원본 64×64 투명 캔버스 안에서 미사일 머리가 정확히 오른쪽을 보도록 45° 회전했다.
- 미사일 스프라이트의 대각선 보정 상수 `SAM_MISSILE_ART_ANGLE`과 `-π/4` 회전을 제거하고, 실제 비행 방향 각도만 그대로 적용한다.

## 2026-08-25 — SAM 미사일 시각 경로 기준 회전 보정

- 미사일 회전각을 게임 판정 좌표의 현재 위치가 아니라, 발사 소켓에서 화면상 목표점까지 보간되는 실제 스프라이트 경로로 계산하도록 수정했다.
- 발사 소켓과 게임 Y 매핑의 차이로 인해 대각선 경로를 수평 스프라이트로 보이게 만들던 좌표 불일치를 제거했다.

## 2026-08-25 — 피격 지점 국소 쉴드 망 추가

- 쉴드 피격 지점의 법선 방향을 기준으로 작은 구면 패치형 라인 망을 생성했다.
- 동심 격자와 방사형 선으로 구성된 망이 피격 위치를 따라 움직이며 짧게 표시된다.
- 전체 쉴드 `bubble`은 계속 숨김 상태로 유지하고, 기존 피격 코어·링 효과와 함께 표시한다.
- 브라우저에서 쉴드 피격 디버그 입력과 콘솔 오류 0건을 확인했다.

## 2026-08-26 — 메인 메뉴 밤 빠른 전투 버튼 추가

- 기존 `빠른 전투 테스트` 버튼은 유지했다.
- `빠른 전투 테스트 (밤)` 버튼을 추가하고 `city-night` 맵으로 바로 진입하도록 연결했다.
- `127.0.0.1:3000`에서 밤 버튼 클릭 후 `CITY NIGHT` 전투 화면과 콘솔 오류 0건을 확인했다.

## 2026-08-25 — 선체 피격 흔들림 강도 절반 조정

- 선체 피격 흔들림의 이동 진폭을 `0.22 → 0.11`, 회전 진폭을 `0.045 → 0.0225`로 줄였다.
- 지속시간 `0.32초`와 피격 시 재시작 동작은 유지했다.

## 2026-08-25 — 요격 차단 상태의 SAM 조기 소멸 원인 추적

- 3100 전투에서 `요격빔 차단 ON`을 확인한 상태로 실드가 실제로 감소하는 것을 재현했다. 따라서 숨은 요격이 아니라 도메인 충돌 경로가 피격 이벤트를 만드는 상황이다.
- 도메인 충돌은 `baseAltitude=33` 기준 타원체에 도달했을 때 정상적으로 미사일을 제거하고 모선 피격 이벤트를 생성한다.
- 실제 패키징 씬의 `MothershipGameplayRoot`는 Y=16.5이지만, SAM 스프라이트 보간 목표만 과거 값 Y=8을 하드코딩하고 있다. Fighter 투사체는 이미 Y=16.5를 사용한다.
- 현재 서울 SAM 3개를 계산하면 충돌 프레임의 SAM 스프라이트는 Y=5.88~6.37에서 제거되어 모선 중심보다 10.13~10.62 월드 유닛 아래에 있다. 1280×720 카메라에서는 약 126~132px 차이다.
- 결론: 충돌 영역이나 요격 판정 문제가 아니라 SAM의 화면 좌표 변환이 오래된 모선 높이를 참조하는 렌더링 동기화 버그다. 수정 시 하드코딩 Y=8/16.5를 제거하고 `mothershipRoot.getAbsolutePosition()`을 단일 목표 좌표로 사용해야 한다.

## 2026-08-26 — 전투기 실제 3D 궤도·모선 관통 방지 재설계

- 신규 계획서 `docs/battlescene/FIGHTER_FORMATION_TRUE_3D_ORBIT_REDESIGN_PLAN.md`를 작성했다.
- 현재 구현은 `x/z` 평면 steering과 별도 altitude, 렌더링 `z * 0.12` 축소를 사용해 완전한 3D 궤도가 아님을 명시했다.
- 모선 실제 외곽 반경 약 `16.97`에 비해 전투기 기본 반경 `19`, 공격 중 약 `15.2`까지 접근할 수 있어 관통이 수치상 가능함을 기록했다.
- V2 구현 기준은 `Vec3` 전투기 상태, 일반 궤도 `34~46`, 공격 최소 반경 `30`, X/Z keep-out `28`, Y keep-out `9`다.
- 목표점 투영과 swept segment 검사를 함께 적용하고, 공격은 모선 중심 돌진이 아닌 접선형 pass로 변경한다.
- 실제 월드 Z와 모선 `getAbsolutePosition()`을 좌표 기준으로 사용하며, 기존 depth 축소·clamp는 제거한다.

## 2026-08-26 — 투사체 목표 좌표를 실제 모선 루트로 통합

- SAM과 전투기 투사체의 하드코딩된 시각 목표 Y=8/Y=16.5 및 기준 고도 33을 제거했다.
- 두 투사체 모두 매 프레임 `MothershipGameplayRoot`의 실제 절대 위치를 공통 시각 경로 종점으로 사용한다.
- 발사 원점 fallback과 현재 위치 fallback도 모선 루트에 대한 상대 좌표 변환으로 통일했다.
- 모선 루트는 경로 종점일 뿐이며 기존 도메인 타원체 충돌 판정은 유지되어 미사일은 실드/선체 표면에서 제거된다.
- TypeScript, Vitest 47/47, production build를 통과했다.
- 3100 앱 내부 브라우저에서 요격 차단 ON·실드 피격·콘솔 오류 0건을 확인했다. 앱 내부 브라우저의 캔버스 캡처 미지원으로 로컬 Playwright 웹게임 루프를 보조 사용했고, 20개 연속 프레임에서 SAM이 모선 표면까지 접근한 뒤 피격 이펙트와 같은 위치권에서 제거되는 것을 확인했다.

## 2026-08-26 — 실제 3D 전투기 궤도의 잔상 아티팩트 진단

- 첨부 화면과 78초 River 전투 캡처에서 긴 적색 선, 적색 사각 조각, 회색 반투명 덩어리를 재현했다.
- 적색 선·사각 조각은 전투기 노즐을 추적하는 Babylon `TrailMesh` 외곽/코어다. 숫자형 생성자를 사용해 기본 4각 단면과 14/7개 세그먼트가 만들어지며, 노즐의 pitch/heading/bank가 실제 3D 선회 중 크게 변하면 사각 단면과 비틀린 연결면이 카메라에 노출된다.
- 회색 덩어리는 0.08초마다 생성되는 8-segment 저폴리 구형 smoke puff다. 1초 동안 크기가 0.55에서 1.70까지 커지고 전투기당 10개가 남아, 카메라 가까운 실제 Z 궤도에서 큰 원·사각형 잔상처럼 보인다.
- smoke는 1초 후 dispose되고 전역 120개 상한이 있으며 Trail도 전투기 제거 시 dispose되므로 누수는 아니다. 2.5D depth 압축을 제거한 뒤에도 기존 시각 표현을 그대로 사용한 호환성 문제다.
- 권장 수정은 TrailMesh를 카메라 방향 billboard segment trail로 교체하고, smoke sphere를 텍스처 기반 billboard puff로 바꾸거나 비활성화하는 것이다. 단순히 TrailMesh sections만 늘리면 사각 단면은 완화되지만 급격한 3D 회전 비틀림은 남는다.

## 2026-08-26 — 플라즈마 낙하·광역 아크 VFX 구현

- 기존 EMP 공통 트레이서 대신 플라즈마 전용 연출을 연결했다.
- 기존 VFX atlas의 전기 구체(frame 9), 보라색 아크(frame 11), 청록 전기 링(frame 10)을 조합해 모선 아래로 구체가 낙하하고 지상과 모선 사이 중앙에서 체공하도록 했다.
- 중앙 구체에서 화면 가장자리까지 22개 방향, 각 7개 세그먼트의 절차적 번개 아크를 생성하고, 세그먼트별 지터·플리커·보라색 글로우/백색 코어를 적용했다.
- 아크가 화면 전체를 시각적으로 덮지만 도메인 피해 판정은 변경하지 않아 기존 Plasma 반경 4.5 국소 피해를 유지한다.
- 플라즈마 효과는 약 1.85초 후 정리되며, 중앙 보라색 코어를 추가해 아크가 겹쳐도 구체 형태가 보이도록 했다.
- 브라우저에서 플라즈마 활성·종료 캡처와 EMP 회귀 캡처를 확인했고 콘솔 오류는 없었다.

## 2026-08-26 — 플라즈마 수직 하강·지속 방출 조정

- 플라즈마 시각 위치의 X/Z를 자동 공격 목표가 아니라 발동 순간 모선의 현재 위치에 고정했다.
- 구체는 모선에서 정의된 중간 높이까지 전체 1.85초 동안 일정하게 수직 하강한다.
- 하강 중에도 전기 아크·펄스 링·충격 링을 계속 갱신하고, 구체와 코어는 반복적인 grow/shrink 바운스를 유지한다.
- 1.85초 종료 직전 짧게 페이드한 뒤 정의된 높이에 도달한 순간 전체 이펙트를 정리한다.
- 브라우저 캡처에서 모선 수직 아래 경로, 1.55초 시점 하강 중 아크 지속, 종료 후 제거를 확인했다.
- `git diff --check`는 통과했다. 전체 타입/테스트 실행은 작업 트리에 이미 존재하는 전투기 3D 궤도 재설계의 `EnemyState`/`Vec3` 타입 불일치로 실패했으며 플라즈마 코드와 무관하다.

## 2026-08-26 — 플라즈마 구체 크기·바운스 리듬 조정

- 중앙 플라즈마 구체·코어·halo 크기를 기존 대비 2배로 확대했다.
- 단일 빠른 진동 대신 느린 주기 팽창/수축과 약한 보조 박동을 합성해 더 리드미컬한 바운스로 변경했다.
- 브라우저 캡처에서 확대된 보라색 코어와 반복 바운스 상태를 확인했다.

## 2026-08-26 — EMP 초음파 화면 왜곡 VFX

- 기존 오버드라이브 후처리 셰이더를 재사용해 EMP 전용 화면 왜곡 파동을 추가했다.
- EMP 발동 시 모선 위치를 중심으로 청백색 충격파가 화면 전체로 확산되고, 파동 전면에서 방사형 UV 굴절·색수차·출렁임이 발생한다.
- 모선을 별도 렌더 패스로 분리하지 않고 전체 Babylon 장면에 함께 적용해 임팩트를 우선했다. HTML HUD는 왜곡되지 않는다.
- EMP 시각 왜곡은 약 1.05초 동안 지속되며 기존 EMP 목표 무력화/미사일 제거 도메인 효과는 변경하지 않았다.
- 브라우저에서 EMP 활성 화면과 종료 직전 화면을 확인했고 콘솔 오류 없이 동작했다.

## 2026-08-26 — 플라즈마 전용 연출 조사

- 현재 플라즈마는 EMP와 같은 공통 `triggerAbility` 경로를 사용하며, 모선에서 고정된 지상 목표로 짧은 트레이서·충격 링·폭발·연기만 재생한다. 별도 낙하 구체나 화면 광역 아크 단계는 없다.
- 기존 `vfx-atlas.webp`에는 4×4 프레임 중 플라즈마 연출에 재사용 가능한 보라색 전기 구체(frame 9), 보라색 아크(frame 11), 청록색 전기 충격 링(frame 10), 에너지 링(frame 3)이 이미 있다.
- 현재 화면 좌표상 모선 루트는 Y=16.5, 지상 공격 기준점은 Y=-16.5이므로, 구체 체공 위치는 두 좌표의 중간인 Y≈0으로 잡을 수 있다.
- 현재 도메인 플라즈마 피해는 목표 반경 4.5의 국소 피해다. 사용자가 말한 화면 전체 광역 피해로 바꾸려면 VFX 변경과 별도로 피해 판정 범위/자동 목표 규칙도 함께 조정해야 한다.
- 이번 단계에서는 구현하지 않고 조사 결과와 구현 방향만 기록했다.

## 2026-08-26 — RELIC 공군기지 유물 1차 교체

- 기존 보석형 `target-relic-airbase-prototype-y0-web.png`는 보존했다.
- 고대 석재·흙·침식·균열·절제된 내부 발광을 가진 3/4 시점 유물 스프라이트를 새로 제작했다.
- 256×256 RGBA 에셋 `target-relic-airbase-ancient-stone-v1.png`를 추가하고 `RELIC` 런타임 표시가 새 에셋을 사용하도록 연결했다.
- Vitest 47/47 통과. 전체 typecheck/build는 기존 작업 중인 `BattleCombatVfx.ts`의 EMP/Plasma 분기 오류로 차단되어 해당 파일은 수정하지 않았다.

## 2026-08-26 — 모선 대파 추락 연출 구현

- 사용자 요청: 모선 Hull이 0이 되면 즉시 디브리핑으로 넘어가지 않고, 곳곳의 불길과 검은 연기 꼬리를 남기며 기울어진 채 천천히 추락한 뒤 지면 충돌 전에 기존 실패 화면으로 전환한다.
- 기존 2.4초 디버그 CRASH를 4.2초 대파 연출로 확장하고, 실제 `MOTHERSHIP_DISABLED` 실패에도 자동 시작되도록 연결했다.
- 파괴 연출 중에는 실패 결과와 수리비 산정용 전투 상태를 이미 확정하되 `onCombatComplete` 호출만 추락 완료까지 지연한다. 임무 포기와 정상 탈출은 기존 즉시 전환을 유지한다.
- 전용 `BattleMothershipDestructionVfx`가 모선 5개 지점의 불길과 월드 공간에 남는 검은 연기 입자를 관리한다. 연기는 하강하는 모선 뒤에 꼬리처럼 남고 최대 72개로 제한된다.
- `render_game_to_text` snapshot에 CRASH 진행률과 파괴 VFX의 fire/smoke 수를 추가했으며, 실패 E2E가 추락 중 화면과 이후 디브리핑을 각각 검증하도록 갱신했다.
- 1차 브라우저 캡처에서 검은 연기는 확인됐지만 부모 회전과 billboard가 겹친 불길이 선체에 묻혀, 불길 스프라이트가 모선의 월드 좌표를 직접 추적하도록 보정했다.
- 실패 디브리핑 제목이 기존 번역에서 `VICTORY`로 표시되던 오류를 한국어 `모선 대파`, 영어 `MOTHERSHIP DISABLED`로 수정했다.
- 모선 실제 전면 반경을 반영해 불길 지점을 선체 표면으로 옮겼고, 밝은 코어와 주황 불꽃을 겹쳐 낮 배경에서도 5개 손상 지점이 읽히도록 보강했다.
- CRASH 시작 시 기존 탐색 빔·충돌 오버레이·일반 전투 VFX를 정리하고 하부 보라색 동력광을 낮춰 파괴 연출만 남도록 했다.
- 최종 실패 E2E는 전용 `C` 연출 키 대신 우주선 무적을 끄고 실제 선체 피해로 Hull을 0으로 만들어, 일반 `MOTHERSHIP_DISABLED` 경로가 자동으로 CRASH를 시작하는지 검증한다.
- 최종 브라우저 검증 통과: 추락 중 `progress=0.5238`, 불길 5개, 검은 연기 29개, 전투 화면 유지 후 4.2초 종료 시 `FAILED` 디브리핑과 수리비 Biomass 54 / Alloy 36이 표시됐고 브라우저 오류는 0건이었다.
- 표준 web-game 클라이언트로 직접 전투 진입, canvas 렌더, `render_game_to_text`, 결정적 `advanceTime` 상태를 확인했다.
- 변경 파일 ESLint와 `git diff --check`는 통과했다. 전체 검사에는 병행 작업 중인 전투기 3D 상태 전환의 기존 불일치가 남아 있다: `EnemyState`에서 제거된 `altitude/orbit*Amplitude`를 `sideViewBattleRules.test.ts`가 참조해 TypeScript 오류와 Vitest 1건 실패(46/47)를 낸다.

## 2026-08-26 — 전투 스킬 버튼 및 키 매핑 확장

- 하단 전투 액션 바에 `감염 강습부대` 버튼을 추가했다. 버튼 클릭 또는 `/` 키로 현재 미션에 편성된 미투입 `ASSAULT` 코호트를 즉시 투입하며, 투입할 부대가 없으면 비활성화된다.
- 키 매핑을 요청대로 변경했다: EMP `N`, 플라즈마 `M`, 흡수 `,`, 오버라이드 `.`; 철수 `X`는 마지막 버튼으로 유지했다.
- 한국어 IME에서도 물리 키 코드가 우선되도록 `KeyN`, `KeyM`, `Comma`, `Period`, `Slash`를 정규화하고 키 입력 단위 테스트를 갱신했다.
- TypeScript 검사는 통과했다. 전체 Vitest는 기존 병행 작업의 전투기 keep-out 경계 테스트 1건만 실패했으며, 이번 변경 관련 키보드 테스트는 통과했다.
- 전투기 편성 코호트의 수동 투입 단위 테스트를 추가했고 관련 테스트 2개·키보드/능력 가용성 테스트 4개가 통과했다. production build와 브라우저의 버튼/키 입력 검증도 통과했으며 오류는 0건이다.

## 2026-08-26 — 감염 강습부대 포자형 자유낙하 프로토타입

- 사용자 요청에 따라 실제 강습부대 보유량·편성·숫자 차감은 확인하지 않고, 버튼 클릭 또는 `/` 입력마다 독립적인 시각 웨이브를 생성하도록 변경했다.
- 한 웨이브는 112개의 작은 인간형 실루엣(분홍 몸체 + 산성 녹색 머리), 청록 낙하 궤적, 반짝이는 후광으로 구성되어 낮/밤 배경 모두에서 읽히도록 했다.
- 낙하체는 모선 아래에서 서로 다른 지연·폭·흔들림으로 자유낙하하고, 지면 도달 시 충격 링을 남긴 뒤 약 3초 후 자동 정리된다. 버튼을 연속 사용하면 최대 3개 웨이브가 겹친다.
- `render_game_to_text`에 `infectedAssault` 상태를 추가했다. 코호트가 0개인 디버그 전투에서도 버튼 enabled=true이며, 브라우저 검증에서 클릭·`/`·중첩 웨이브·자동 정리를 확인했다.
- 낮/밤 배경 Playwright 캡처와 상태 JSON 모두 콘솔 오류 0건이다. TypeScript와 production build가 통과했다.
- 감염체마다 팔 2개와 다리 2개를 추가하고, 낙하 중 서로 다른 위상으로 팔·다리를 크게 휘젓고 몸통을 비틀도록 보강했다. 밤 배경에서 바둥거리는 작은 실루엣이 포자 폭포 안에서 읽히는 것을 확인했다.
- 기존 지상 유닛 초기화 effect가 값이 바뀌지 않아도 새 객체를 반환하던 문제를 안정화해 브라우저의 `Maximum update depth exceeded` 오류가 재현되지 않도록 했다. 관련 캡처의 오류 목록은 비어 있다.

## 2026-08-26 — 감염 강습부대 낙하 렌더링 최적화

- 팔·다리 애니메이션을 제거하고 사람형 감염체를 몸통·머리·낙하 궤적 3개 인스턴스로 단순화했다.
- 웨이브당 사람형 64개와 저비용 포자 점 96개로 밀도를 유지하고, 최대 동시 웨이브를 2개로 제한했다.
- 사람형·포자·지상 충격 링을 런타임 생성 시 미리 풀링해 버튼 입력 순간의 `createInstance`/dispose 폭주를 제거했다.
- Babylon 인스턴스에 매 프레임 `visibility`를 쓰던 경로를 `setEnabled` 기반으로 바꿔 불필요한 경고와 갱신을 줄였다.
- 최적화 후 밤 배경 브라우저 캡처에서 포자 밀도와 지상 충격 링을 유지하면서 콘솔 오류 0건을 확인했다. TypeScript, 관련 테스트 4개, production build가 통과했다.

## 2026-08-26 — 도주 민간인 군중 스프라이트 리소스

- 기존 `civilian-4x4.webp`의 clean HD 인간형 스타일을 참고해, 지상에서 작게 보여도 방향성이 읽히는 도주 군중 1x4 애니메이션 시트를 생성했다.
- 4개 프레임 모두 8~12명의 피난민이 같은 방향으로 달리며, 투명 RGBA 배경의 `2048×683` PNG로 저장했다.
- 리소스 경로: `public/assets/runtime/sprites/infected-fleeing-crowd-1x4.png`.

## 2026-08-26 — 조밀한 지상 도주 군중 시안

- SAM과 비슷한 작은 화면 크기에서 개별 인물보다 군중 덩어리로 읽히도록 약 50명의 피난민이 촘촘히 달리는 단일 클러스터 시안을 생성했다.
- 512×256 RGBA PNG로 크로마키 정리했으며, 리소스 경로는 `public/assets/runtime/sprites/infected-fleeing-crowd-swarm-v1.png`이다.

## 2026-08-26 — 타이트 앵커형 군중 와글거림 시트

- 군중의 상하좌우 빈 공간을 제거하고 바닥 접지선을 고정한 1×4 와글거림 애니메이션 시트를 제작했다.
- 프레임마다 군중의 압축·확장과 앞/뒤 행의 미세한 위치 변화를 넣어, 아래 기준 배치에서도 덩어리가 흔들리는 느낌을 유지한다.
- 리소스 경로: `public/assets/runtime/sprites/infected-fleeing-crowd-swarm-wiggle-1x4.png` (`1984×213`, RGBA, 프레임당 496px).

## 2026-08-26 — 좌향 도주 군중 시트

- 기존 1×4 와글거림 시트를 프레임별로 좌우 반전해, 애니메이션 순서와 바닥 앵커를 유지한 반대 방향 리소스를 만들었다.
- 리소스 경로: `public/assets/runtime/sprites/infected-fleeing-crowd-swarm-wiggle-left-1x4.png` (`1984×213`, RGBA, 프레임당 496px).

## 2026-08-26 — 지상 도주 군중 배치·흡수 연결

- 지상 Unit과 같은 `GROUND_ENTITY_ROOT_Y`에 5개 도주 군중을 배치하고, 화면 밖 이동 영역까지 포함하도록 x 좌표를 `-168/-84/0/84/168`에 분산했다.
- 각 군중은 50명×100 흡수량으로 총 5,000을 가지며, 좌우로 이동하다가 흡수 대상이 되면 이동을 멈춘다.
- 흡수 중에는 군중 이미지가 흰색 플래시 오버레이로 반짝이고 `+100 / 인` 표시가 나타나며, 흡수가 끝나면 이미지가 사라진다.
- 기존 ORGANIC 기본 타깃 이미지는 군중 타깃에서 숨기고 전용 좌향/우향 1×4 시트를 사용한다.
- 브라우저에서 서쪽 군중 선택 → 빔 시작 → `moving=false`, `absorbing=true`, `flashIntensity=0.79`, `remainingAmount=3750` → 1.5초 후 `visible=false`, `remainingAmount=0`, cargo 5,000을 확인했다. 오류는 0건이다.

## 2026-08-26 — 원본 모선 파괴 시퀀스 독립 이식

- 사용자 지시서 `mothership_destroyed_implement.md`에 따라 `/Users/switch/Development/game/webgame/TheyCallItEarth`의 `MothershipDestructionVisual`, TacticalScene 연결부, flipbook/atlas/material/geometry 헬퍼를 모두 조사했다.
- 원본 경로를 import하거나 런타임에 읽지 않고, 필요한 atlas·flipbook·재질 팩토리·실린더 정렬 헬퍼를 현재 프로젝트의 `src/game/battle/runtime/` 아래 독립 소스로 이식했다.
- 원본과 SHA-256이 같은 `mothership-flame-16x4.webp`를 현재 프로젝트의 `public/assets/runtime/vfx/`에 실제 복사했다. 기존 explosion/smoke 에셋도 원본과 SHA-256이 동일함을 확인했다.
- 임시 4.2초/5개 불꽃 구현을 원본 구조의 5.8초 파괴 시퀀스로 교체했다. 4.35초 충돌 전까지 3개 16×4 불길 Plane을 24fps loop로 재생하고, 로딩 전에는 outer/core cylinder fallback을 사용한다.
- 원본 타임라인의 공중 폭발 11회, 충돌 시 지면 폭발 3회, 파편 16개, 품질별 연기 상한 LOW 16/BALANCED 23/HIGH 30을 이식했다.
- 현재 2D 측면 카메라에 맞춰 모선 충돌 루트 Y를 지면 기준 +7.4, VFX 깊이를 모선 전면으로 보정했으며, CRASH 동안 카메라 target이 실제 파괴 pose를 따라가도록 연결했다.
- Texture 자체의 `isReady()`가 로드 실패 후 오류 텍스처에도 true가 될 수 있음을 fallback E2E에서 발견해, 원본 AssetLoader처럼 성공 콜백을 별도 추적하도록 수정했다. 강제 flame 요청 실패 시 오류 Plane은 숨고 outer/core cylinder가 표시된다.
- 정상 브라우저 검증: 2.183초 FALLING에서 불길 Plane 3, 연기 18, 공중 폭발 6; 4.433초 IMPACT에서 총 폭발 14, 파편 16, 불길 0; 5.8초 이후 FAILED Debrief와 수리비 Biomass 54 / Alloy 36을 확인했다.
- fallback 브라우저 검증: 동일 FALLING 시점에 `flameFallbackActive=true`, cylinder 2개, 연기 18개가 유지됐고 전체 충돌·Debrief 흐름도 통과했다.
- 최종 검증은 typecheck, Vitest 48/48, production build, 전체 ESLint, 표준 web-game 클라이언트, 정상/fallback 실패 E2E, `git diff --check`를 통과했다. `src/`, `scripts/`, 설정 및 런타임 에셋에는 원본 프로젝트 절대경로 참조가 없다.

## 2026-08-26 — SAM 측면·상향 포대 에셋 교체

- SAM을 완전 측면 차량으로 재디자인하고, 4발 미사일 포대를 약 28도 상향시켰다.
- 하단 투명 여백을 제거해 512px/256px 이미지의 알파 영역이 이미지 바닥에 닿도록 정렬했다.
- 기존 런타임 경로 `public/assets/runtime/sprites/ground-sam-mobile-side-elevated.png`를 새 256×256 RGBA 에셋으로 교체했다.
- 교체 전 런타임 SAM은 `assets/_weapon-temp/final/ground-sam-mobile-side-elevated-previous-v1.png`로 백업했다.
- 브라우저 전투 화면에서 새 SAM 로드와 `render_game_to_text` ground visual 동기화, 콘솔 오류 0건을 확인했다.

## 2026-08-26 — 전투기 실제 3D 원거리 궤도 구현

- V2 계획서에 따라 전투기 상태를 `Vec3` 위치·속도로 전환하고 `pitch`, 실제 depth 반경, 궤도면 기울기, `ORBIT/ATTACK_PASS/RECOVER` 상태를 추가했다.
- 일반 선회 반경을 `34~46`, 실제 depth를 `34~42`, 공격 최소 중심 거리를 `30`으로 변경해 모선에서 충분히 떨어져 싸우도록 했다.
- X/Z `28`, Y `9`의 keep-out 타원체, 중심 거리 구면 하한, 목표점 투영, swept segment 교차 검사, 안쪽 속도 제거를 구현했다.
- 전투기 렌더링의 `z * 0.12`, hidden grace, depth clamp를 제거하고 모선 절대 위치 기준 실제 3D 상대 좌표를 사용하도록 변경했다.
- 전투기 sprite depth pre-pass, 3D 노즐·TrailMesh·smoke, 미사일·방공 레이저의 실제 노즐 목표를 연결했다.
- 10분 결정적 soak에서 최대 20대와 최소 안전거리, 세 비행 상태를 검증했다.
- 78초 visual-sync는 전투기 5대 ID/3D 좌표 일치, 최저 중심 거리 `30.205`, 최저 keep-out metric `1.363`, 브라우저 오류 0건으로 통과했다.
- TypeScript, Vitest 48/48, 대상 ESLint, `git diff --check`가 통과했다.

## 2026-08-26 — 모선 추락 카메라 고정

- 모선 파괴 중 카메라 target이 하강 pose를 따라가면서 지면 아래 빈 공간이 노출되는 문제를 수정했다.
- CRASH 시작 후에는 카메라 X 이동 추적을 중단하고 position Y/Z 및 target을 기존 전투 구도에 고정한다. 모선과 파괴 VFX만 화면 아래로 추락한다.
- `render_game_to_text`에 camera position/target을 추가하고, 실패 E2E가 추락 전·FALLING·IMPACT 세 시점의 카메라 6개 좌표가 모두 동일한지 검증하도록 확장했다.
- production 자연 대파 검증에서 추락 전·FALLING·IMPACT 모두 camera position `(0, 5, -92)`, target `(0, 5, 0)`으로 동일했다. 충돌 장면에서도 기존 도시·지면 구도가 유지되고 화면 아래 빈 공간이 노출되지 않았으며 브라우저 오류는 0건이었다.

## 2026-08-26 — Babylon Editor 모선 계층 재시작 보존 수정

- 기존 계층 생성은 런타임 `parentId`만 기록해 Babylon Editor가 프로젝트를 다시 열 때 부모를 복원하지 못하고 모든 모선 파츠를 루트에 평면 배치했다.
- Editor 5.4.2의 실제 저장·로드 코드를 확인해 소스 씬은 `metadata.parentId = parent.uniqueId`를 사용한다는 것을 확인했다.
- 실행 중인 Babylon Editor에서 agent automation으로 실제 `TransformNode` 6개를 만들고, 59개 모선 메시를 Hull 7 / Ring 4 / Armor 32 / Reactor 4 / Emitter 12 그룹으로 정리했다.
- `BattleSceneRoot/AirBattleRoot/MothershipGameplayRoot/MothershipVisualRoot` 체인과 Weapon/Drone/VFX 소켓 부모 관계도 Editor API로 복원했다.
- 씬 생성기가 향후 재실행돼도 Editor 전용 부모 메타데이터를 남기도록 `preserveEditorParentMetadata` 단계를 추가했다.
- Editor 창을 실제로 닫고 Dashboard의 프로젝트 메뉴에서 다시 연 뒤 `BattleSceneRoot/AirBattleRoot/MothershipGameplayRoot/MothershipVisualRoot/MothershipModelRoot`와 다섯 하위 그룹이 그대로 복원되는 것을 Graph에서 확인했다.
- `npm run generate:battle` 패키지의 public scene에서도 59개 메시가 동일 그룹에 속하며 `MothershipModelRoot`가 실제 `TransformNode`임을 확인했다.
- 기존 GroundRootPlane이 삭제된 `ground-road-day.webp`를 참조하던 404를 현행 `ground-sideview-day.webp`로 정리했다.
- 최종 `npm run check` 통과: TypeScript, Vitest 48/48, production build 성공. 표준 web-game 클라이언트 빠른 전투 2회 캡처에서 우측 이동과 `render_game_to_text` 동기화, 콘솔 오류 0건을 확인했다.

## 2026-08-26 — 전투기 깨짐으로 오인되는 일반 선체 파편 제거

- 사용자 지정 검증 경로 `http://localhost:3000/?battle-fast=1`의 `빠른 전투 테스트`에서 전투기 주변에 큰 주황 사각 조각이 겹치는 현상을 재현했다.
- 조각은 전투기 sprite/trail이 아니라 실드 소진 후 일반 projectile 선체 피격마다 `BattleCombatVfx`가 생성하던 10개의 solid box debris였다. 최대 6회분이 동시에 남아 전투기와 겹치면서 기체가 삼각형·사각형으로 깨진 것처럼 보였다.
- 일반 HULL 피격의 box debris 생성을 제거했다. 폭발·충격 링·연기·흔들림은 유지하고, 실제 모선 대파 시 파편은 별도 `BattleMothershipDestructionSequence`가 계속 담당한다.
- 동일 지정 URL에서 82.4초까지 진행해 shield 0, fighter 4대인 반복 피격 상태를 캡처했다. 전투기 형태는 모두 정상이고 큰 주황 조각은 없으며 브라우저 오류도 0건이었다.
- TypeScript와 Vitest 48/48이 통과했다.

## 2026-08-26 — Babylon Editor 모선 계층 적용 롤백

- 사용자 요청에 따라 실제 Editor 계층 적용만 역순으로 되돌렸다.
- 모선 59개 메시와 Weapon/Drone/VFX 소켓, Air/Gameplay/Visual 루트를 다시 씬 루트로 이동했다.
- `MothershipModelRoot`와 Hull/Ring/Armor/Reactor/Emitter 그룹 TransformNode 6개를 삭제했다.
- 씬 생성기의 Editor 전용 `metadata.parentId` 보존 단계를 제거해, 향후 재생성 후 Editor를 열어도 그룹 계층이 강제로 유지되지 않게 했다.
- 다른 전투/VFX/전투기/SAM 변경은 유지했다.
- Editor 창을 실제로 닫고 Dashboard에서 다시 연 뒤 모선 59개 파츠와 소켓/루트가 모두 씬 루트의 평면 목록으로 유지되는 것을 확인했다.
- 빠른 전투 브라우저 검증에서 모선 렌더링·우측 이동·카메라 추적이 정상이며 콘솔 오류는 0건이었다.
- 평탄화된 Editor 소스를 `npm run generate:battle`로 다시 패키징해 로컬호스트가 읽는 `public/scene/battlescene.babylon`에도 롤백을 반영했다. public scene 기준 그룹 TransformNode 0개, 부모가 지정된 모선 메시 0개이며, 재패키징 후 빠른 전투에서 모선 렌더링·우측 이동·상태 동기화와 콘솔 오류 0건을 다시 확인했다.

## 2026-08-26 — 장면 계층 손상 복원

- 폴더 작업 직전 정상 기준을 `b5de3e6`으로 고정해 문제 커밋 `c6b80b8`과 장면 데이터를 비교했다.
- `c6b80b8`의 Editor 저장에서 7개 배경 Plane의 기존 `parentId`가 모두 사라져, 배경 디버그 패널은 숫자만 바꾸고 실제 Plane은 움직이지 않는 상태였음을 확인했다.
- 런타임 로드 시 배경 Plane을 `SkyRoot/CloudRoot/City*Root/GroundRoot/ForegroundRoot`에 다시 연결하도록 복원했다. 브라우저에서 `NEAR -5.00 → -3.00` 이동 시 실제 가까운 건물 레이어가 함께 이동하는 것을 확인했다.
- 충돌 디버그 Sphere는 패널이 닫혀 있어도 매 프레임 표시되던 문제를 수정했다. 이제 `COLLISION DEBUG`를 열 때만 표시되고 닫으면 비활성화된다.
- 부모를 잃어 루트에 노출되던 Fighter/Drone/Ground 프로토타입은 장면 전체 이름 기준으로 숨겨 회색·보라 placeholder가 전투 화면에 나오지 않게 했다.
- 정상본의 `MothershipGameplayRoot.y = 16.5`를 Editor 소스와 런타임 계약에 복원했다. 문제 저장본의 `y = 8` 때문에 카메라 높이에 가까워져 납작한 수평 원반처럼 보이던 것이 원인이었다.
- Editor 소스는 요청대로 모선 그룹 없이 평탄하게 유지하되, 런타임에서 59개 모선 파츠와 Weapon/Drone/VFX 소켓을 원래 Gameplay/Visual Root에 연결해 이동·스케일·VFX 기준을 복원했다.
- 최종 public scene은 그룹 TransformNode 0개, 루트 모선 메시 59개이며 런타임 재구성 후 `worldY=16.5`로 렌더링된다.
- 최종 검증: TypeScript, Vitest 48/48, production build, `git diff --check`, 표준 web-game 클라이언트 우측 이동, 브라우저 배경 패널·충돌 패널, 콘솔 오류 0건 통과.
- 후속 확인에서 Editor 소스와 재패키징된 public scene에 `CloudRoot`/`CloudRootPlane`이 누락돼 구름 텍스처가 있어도 표시할 메시가 없음을 확인했다.
- 런타임 로더가 정상본과 동일한 `360 × 202.5` 크기의 `CloudRootPlane`을 복구해 `CloudRoot`에 연결하도록 수정했고, 장면 생성기의 `BACKGROUND_PLANE_HEIGHTS`에도 `CloudRoot: 202.5`를 추가했다.
- 구름 복원 후 브라우저와 표준 web-game 클라이언트에서 낮 구름 레이어, 모선 `worldY=16.5`, 우측 이동, 콘솔 오류 0건을 확인했다. 전체 TypeScript/Vitest 48/48/production build와 `git diff --check`도 다시 통과했다.
- 런타임 보정에만 의존하지 않도록 Editor 소스에 `CloudRoot.json`과 `CloudRootPlane.json`도 복원했다. 구름 Plane은 정상본의 `360 × 202.5` geometry를 재사용하고 `CloudRoot`의 자식으로 저장했으며, 재패키징된 public scene에서도 `CloudRootPlane → CloudRoot` 부모 관계와 `CloudRootMaterial`을 확인했다.
- 구름이 화면 위로 치우쳐 일부가 잘리는지 재점검한 결과, 크기(`360 × 202.5`)는 정상본과 동일했고 위치만 정상본 `CloudRoot.y=4` 대비 `13.25`로 올라가 있었다. CloudRoot와 런타임 기본값을 `y=4`로 복원하고 public scene을 재패키징했다. 표준 web-game 캡처에서 구름이 건물 위쪽에 자연스럽게 걸쳐 보이며 콘솔 오류 0건을 확인했다.

## 2026-08-26 — SAM 지상 Y 복원값 조정

- 공통 지상 기준 `-18.50`은 유지하고 SAM 전용 루트 기준만 `GROUND_SAM_ROOT_Y=-16.50`으로 분리했다.
- SAM 본체·체력바·라벨·발사 소켓과 SAM 공격 목표 Y가 함께 새 기준을 사용하도록 연결했다. 다른 지상 유닛과 흡수 대상 위치는 변경하지 않았다.
- 표준 web-game 검증에서 세 SAM의 `visuals.ground[].y=-16.5`, 모선 `worldY=16.5`, 우측 이동, 콘솔 오류 0건을 확인했고 TypeScript와 `git diff --check`를 통과했다.

## 2026-08-26 — 방어막 국소 피격 패치 원형화

- 기존 방어막 피격 부위의 `shield-impact.webp` 방사형 스프라이트와 LineSystem 동심선/방사선을 확인했다. 이 조합이 피격 부위를 삼각형·육각형처럼 보이게 만들었다.
- 전체 bubble shield는 계속 비활성화한 채, 피격 위치의 법선 방향으로 정렬된 얇은 3D Sphere 패치만 남겼다. 패치는 기존 피격 반경을 유지하며 국소적으로 표시되고, 기존 링은 짧은 원형 ripple로만 남는다.
- TypeScript, Vitest 48/48, production build, `git diff --check`를 통과했다. 개발 서버에서 전투 진입과 방어막 효과 로딩을 확인했다.

## 2026-08-26 — 전체 방어막 표시 원복

- 사용자 요청에 따라 국소 3D 방어막 패치 변경을 다시 되돌렸다.
- 초기 구현의 `shield-impact.webp` 방사형 스프라이트와 우주선 전체를 감싸는 `shieldBubble` 표시(`SHOW_SHIELD_BUBBLE=true`)를 복원했다.
- 피격 지점에만 붙던 3D Sphere 패치와 LineSystem 패치 경로는 제거했다.
- 실제 전투 피격 화면에서 우주선 전체 bubble과 기존 방사형 효과가 함께 표시되고 콘솔 오류가 없음을 확인했다.
- 최종 TypeScript, Vitest 48/48, production build, `git diff --check` 통과.

## 2026-08-26 — 대공 레이저 전투기 피격 효과

- 기존 대공 레이저는 전투기 목표까지 beam/core와 작은 impact Sphere만 표시하고 목표 지점 피격 flipbook은 비활성화되어 있었다.
- 대공 레이저 경로의 목표 지점에 explosion flipbook을 활성화해 레이저가 전투기에 닿는 순간 주황색 피격 섬광이 표시되도록 했다. 기존 전투기 체력 감소 flash는 그대로 유지된다.
- 브라우저에서 빠른 전투 대공 레이저 경로와 콘솔 오류 0건을 확인했으며, TypeScript/Vitest 48/48/production build를 통과했다. 장시간 표준 클라이언트 캡처는 개발 서버 재컴파일 제한으로 완료되지 않았지만 짧은 브라우저 검증은 통과했다.

## 2026-08-26 — 지상 유닛 피격·폭발 효과

- `BattleEntityVisuals`의 지상 유닛에는 체력 감소 감지와 파괴 이펙트가 없어, 차량/SAM/시설이 맞아도 스프라이트와 체력바만 변하는 상태였다.
- 모든 지상 유닛에 짧은 밝은 3D hit flash를 추가하고, `destroyed` 전환 시 지상 위치에서 차량/시설 크기에 맞춘 explosion flipbook·코어·링을 생성하도록 연결했다.
- 기존 전투기 폭발 업데이트를 공유하되 ground explosion scale을 별도로 적용해 SAM은 1.15배, 일반 지상 유닛은 0.9배로 표시한다.
- TypeScript, Vitest 48/48, production build, `git diff --check`를 통과했다. 브라우저 전투 화면에서 지상 유닛 렌더링과 콘솔 오류 0건을 확인했다.

## 2026-08-26 — 쉴드 소진 후 hull 파편 복원

- 쉴드가 0이 된 뒤 hull 피격 시 `createHullEffect()`가 파편을 빈 배열로 만들고 `createDebris()` 호출도 제거된 상태를 확인했다.
- 원래의 10개 파편 생성·속도·회전·수명 로직과 `damageId` 시드를 복원했다. 쉴드 피격 bubble/방사형 효과와 hull 파편 효과는 서로 다른 경로로 유지된다.
- 무적을 끄고 실제 전투에서 쉴드 소진 후 hull 피격을 재현했으며, 우주선 주변으로 붉은 파편 조각이 튀는 프레임을 확인했다. 전체 TypeScript/Vitest 48/48/production build와 `git diff --check`도 통과했다.

## 2026-08-26 — 발전소형 MACHINERY 에셋 교체

- 기존 소형 기계 장치를 대형 고정형 발전소 설비로 재제작했다.
- 대형 발전기 홀, 냉각탑, 변압기, 고압 송전 케이블, 산업용 배관과 점검 데크를 포함했다.
- 상·하단 투명 공백을 제거한 `460×258` RGBA 이미지로 정리하고, 기존 `target-machinery-fabrication-line-y0-web.png` 경로에 적용했다.
- 런타임에서는 원본 비율을 유지하면서 SAM 대비 약 2배 폭으로 표시하도록 `BattleAbsorbableRegions`의 MACHINERY 스케일을 조정했다.
- TypeScript, Vitest 48/48, 브라우저 전투 화면과 콘솔 오류 0건을 확인했다.

## 2026-08-26 — 전투기 프레임 누적 잔상 근본 수정 계획

- 지정 경로 `http://localhost:3000/?battle-fast=1`에서 DAY 빠른 전투의 70~86초를 1초 간격으로 캡처했다.
- snapshot에는 계속 전투기 4대만 존재하지만 84~86초 캔버스에는 이전 위치의 전투기 영상이 6~9개까지 누적되어, 엔티티 중복이나 trail 개수 문제가 아닌 프레임버퍼 누적으로 판정했다.
- `scene.autoClear=true`와 달리 상시 부착된 EMP/오버드라이브 PostProcess만 `autoClear=false`인 점을 최우선 원인으로 특정했다.
- 개별 VFX를 추가로 삭제하는 대신 후처리 렌더 타깃 clear 계약을 수정하고, 필요할 때만 전투기 depth 재질을 A/B 검증하는 단계형 계획을 `docs/battlescene/FIGHTER_FRAME_GHOSTING_ROOT_FIX_PLAN.md`에 작성했다.
- 이번 단계에서는 계획만 수립했으며 후처리 및 전투기 렌더링 코드는 아직 변경하지 않았다.

## 2026-08-26 — 전투기 프레임 누적 잔상 근본 수정 완료

- 상시 부착된 EMP/오버드라이브 PostProcess의 `autoClear=false`가 이전 color buffer를 남겨 이동 전투기 영상이 누적되는 원인이었다.
- PostProcess `autoClear=true`, scene `autoClearDepthAndStencil=true`로 프레임 clear 계약을 복원했다.
- P1만으로 이전 위치 복제가 사라져 계획의 P3 전투기 depth 재질 변경은 수행하지 않았다.
- runtime snapshot에 `sceneAutoClear`, `sceneAutoClearDepthAndStencil`, `postProcessAutoClear`를 추가했다.
- 지정 URL 전용 `verify-fighter-frame-ghosting.mjs`를 추가해 70~78초 9프레임의 enemy/visual ID와 clear 계약을 검사하고 EMP·오버드라이브 화면도 캡처한다.
- `npm run test:e2e:fighter-ghosting` 결과 ok=true, fighter 4대 유지, clear 세 값 true, 브라우저 오류 0건이었다.
- TypeScript, Vitest 48/48, production build, `git diff --check`가 통과했다.

## 2026-08-26 — 전투기 추가 배기 꼬리 임시 비활성화

- 전투기 아틀라스 자체에 이미 엔진 불꽃이 포함되어 있으므로, 별도로 붙이던 직사각형 jet flame/core, trail segment, smoke puff를 모두 비활성화했다.
- 관련 생성·정리 코드는 추후 텍스처 기반 꼬리 재설계를 위해 보존하고 `FIGHTER_AUXILIARY_EXHAUST_ENABLED=false`로 차단했다.
- visual-sync 검증도 trail/smoke가 0이어야 통과하도록 현재 의도에 맞게 변경했다.
- 지정 DAY 빠른 전투의 70~78초 9프레임에서 전투기 4대가 정상이며 아틀라스에 포함된 엔진 불꽃 외의 연한 직사각형 꼬리와 연기 잔상이 없음을 확인했다.
- frame-clear 계약 세 값 true, EMP/오버드라이브 캡처, 브라우저 오류 0건을 확인했다.

## 2026-08-26 — 전투기 탄환을 SAM 미사일 외형으로 통일

- 전투기 projectile의 기존 청색 sphere 렌더링을 제거하고 SAM과 동일한 흰색 미사일 sprite material을 사용하도록 변경했다.
- 전투기 미사일에도 SAM과 동일한 비행 방향 회전, 적색 jet glow/core, 연속 smoke trail을 적용했다.
- 전투기와 SAM의 도메인 속도·피해·발사 간격·충돌 판정은 변경하지 않고 시각 표현만 통합했다.
- TypeScript와 Vitest 48/48이 통과했다.
- 지정 DAY 빠른 전투 브라우저 검증은 병행 소스 변경으로 개발 서버가 전투 로딩 중 반복 재컴파일되어 최종 편대 캡처가 완료되지 못했다. 정적 렌더 경로와 전체 타입·규칙 검증은 통과했다.

## 2026-08-26 — 흡수 완료 생산설비 잔상 제거

- 흡수 잔량이 0이 된 대상의 스프라이트를 기존 `0.18` 투명도에서 완전히 숨기도록 수정했다.
- 흡수 완료 대상의 생산설비 라벨도 함께 숨겨 빈 투명 형체가 남지 않도록 했다.
- 생산설비 흡수 전·후 화면과 `DEPLETED / remainingAmount=0` 상태를 직접 확인했으며 콘솔 오류는 0건이다.
- TypeScript와 Vitest 48/48 통과.

## 2026-08-26 — 흡수 광선 V2 구현 완료

- 기존 가는 원통·funnel·28×2 rod 기반 약 60메시 흡수광을 `BattleAbsorptionVfx`로 분리한 V2로 교체했다.
- 셰이더 기반 외곽 체적광 3개, 결정적 내부 shaft 12개, 중심 core 2개, 모선 흡입구와 지면 halo/ring을 포함해 총 24메시로 구성했다.
- 외곽은 Alpha combine, 내부 광선은 낮은 강도의 Additive로 분리해 낮 배경에서도 생산설비와 도시 실루엣이 보이게 했다.
- `IGNITING(0.45초) → SUSTAINED → FADING(0.22초) → OFF` 상태를 구현했고, 기존 0.85초 반복 재전개와 즉시 dispose를 제거했다.
- 흡수 중 기존 탐색광을 정리하고 새 탐색광 생성을 중단해 대표 효과끼리 겹치지 않게 했다.
- runtime snapshot에 phase, 레이어 수, shaft 수, 폭, 메시 수를 추가했다.
- `verify-absorption-beam-v2.mjs`와 `test:e2e:absorption-v2`를 추가해 점화·유지·목표 고갈·중간 페이드·종료를 자동 검증한다.
- 1280×720, 900×500, 640×360에서 검증 결과 ok=true, `MACHINERY 5995 → 0`, 최종 phase OFF, 콘솔 오류와 4xx 응답 0건을 확인했다.
- TypeScript, Vitest 48/48, production build, 변경 파일 ESLint, `git diff --check`가 통과했다.

## 2026-08-26 — 밤 전투용 도주 군중 오브젝트

- 기존 좌향·우향 1×4 군중 시트의 프레임·투명 여백·1984×213 규격을 유지하면서 RGB를 낮추고 차가운 남청색 음영을 더한 야간 시트를 추가했다.
- 신규 리소스: `infected-fleeing-crowd-swarm-wiggle-1x4-night.png`, `infected-fleeing-crowd-swarm-wiggle-left-1x4-night.png`.
- `BattleFleeingCrowdVisuals`가 `nightMode`를 받아 야간 시트를 선택하고, `createBattleRuntime`에서 `map.id === 'city-night'`일 때만 야간 모드를 켠다. 주간 맵은 기존 시트를 계속 사용한다.
- 야간·주간 전투 화면을 각각 1280×720으로 로드하고, 야간 PNG 두 경로의 HTTP 200 응답과 `city-night` 텍스처 선택을 확인했다.
- TypeScript, Vitest 48/48, 변경 런타임 파일 ESLint, production build가 통과했다.

## 2026-08-26 — BG DEBUG·모선 속도·군중 높이 조정

- BG DEBUG 패널이 배틀 진입 시 기본으로 닫히고 `BG DEBUG` 버튼만 보이도록 변경했다.
- 모선 수평 이동 최대 속도와 가속·감속을 `34 → 17` 월드 유닛 기준으로 절반 조정했다.
- 도주 군중의 기준 Y를 현재 위치보다 2 월드 유닛 위로 올렸다. 브라우저 snapshot에서 군중 `worldY=-15.27`을 확인했다.
- 속도 변경에 맞춰 모바일·전체 흐름 검증의 이동 시간과 관성 허용값을 갱신했다.
- TypeScript, Vitest 48/48, production build가 통과했다. 전체 lint는 기존 `BattleScreen`의 `setState-in-effect` 오류 1건과 `<img>` 경고 2건이 남아 있다.

## 2026-08-26 — NORMAL/ENDLESS 플레이 타이머 모드

- 기존 RUN/STOP 버튼이 전체 runtime `paused`를 토글하던 동작을 제거하고, 시간 HUD 옆에 `NORMAL/ENDLESS` 토글을 추가했다.
- 기본 모드는 `NORMAL`이며 75초 생존 제한 시간이 정상적으로 감소한다.
- `ENDLESS`에서는 게임 경과시간·이동·전투는 계속 진행하고 `survivalUnlockSeconds`를 프레임만큼 연장해 75초 제한이 자동 만료되지 않도록 했다.
- runtime snapshot에 `timeMode`를 추가했다. 일반 전투 브라우저에서 NORMAL 1초 감소, ENDLESS 10초 동안 잔여시간 고정, NORMAL 복귀 후 감소 재개를 확인했다.
- ENDLESS를 전체 게임 정지가 아닌 생존 제한 시계 연장 방식으로 확정했다. ENDLESS에서 80초를 진행해도 `result=ACTIVE`, `extractionStatus=LOCKED`, 게임 경과시간은 계속 증가하는 것을 확인했다.
- TypeScript, Vitest 56/56, production build, 브라우저 버튼 상호작용 검증을 통과했다. 전체 lint는 기존 `BattleScreen`의 `setState-in-effect` 오류 1건과 `<img>` 경고 2건이 남아 있다.

## 2026-08-26 — 스킬트리 분기명·모선 코어 글씨 확대

- 스킬트리의 `방어`, `수확`, `유틸리티`, `에너지`, `군단`, `무장` 분기 허브 글씨를 26px로 확대했다.
- 중앙 `모선 코어` 글씨를 24px로 확대하고 한 줄 표시를 유지했다.
- 3000 로컬 스킬트리 화면에서 여섯 분기명과 모선 코어의 확대 상태, 콘솔 오류 0건을 확인했다.

## 2026-08-26 — ORGANIC 방공호 보호·파괴 후 흡수

- 기존 주거 건물 ORGANIC 스프라이트 대신 WebP 최적화 방공호 본체와 손상 본체를 사용하도록 런타임 참조를 교체했다.
- 방공호 본체와 내부 군중 오버레이를 별도 텍스처로 겹쳐 표시하고, 기존 도주 군중 타깃은 직접 흡수 규칙을 유지했다.
- ORGANIC 방공호 타깃은 `INTACT → BREACHING → DESTROYED` 상태를 가지며, 흡수 시작 후 3초 동안 잔량을 차감하지 않는다.
- 3초가 지나면 손상 방공호 이미지로 전환되고, 다음 프레임부터 인간 흡수가 시작된다. 흡수가 중단되면 파괴 진행도는 유지된다.
- WebP 에셋 3종을 768px/512px 폭으로 최적화해 `public/assets/runtime/sprites/`에 추가했다.
- 도메인 상태 전환 테스트와 River Metropolis 브라우저 검증에서 방공호 표시, 3초 보호 구간, 파괴 후 흡수, 콘솔 오류 0건을 확인했다.

## 2026-08-26 — 디브리핑 요약 문구 정리

- `서울 표시 완료`와 `표적 보관량 저장 완료`처럼 시스템 내부 상태를 노출하던 문구를 삭제했다.
- `방어 거점 N개 손실`을 공격자 관점의 `방어 거점 N개 파괴`로 변경했다.
- `코어 충전`을 `코어 회수/충전`으로 변경하고 영어 문구도 동일한 의미로 맞췄다.

## 2026-08-26 — 임무 준비 화면 재구성

- 임무 준비 화면을 단순 텍스트 나열에서 도시 상태·출격 자원·임무 방식·지상 병력·특수 능력 설정 패널로 재구성했다.
- `압박 방식을 선택하세요`를 `임무 방식을 선택하세요`로 정리하고, 임무 상태를 `상태 / 미접촉`으로 분리 표시했다.
- 습격/점령을 명확한 선택 버튼 카드로 만들고, 왼쪽에 큰 임무명과 오른쪽에 제목/설명을 배치했다.
- 상단 도시 정보는 4개 수치 패널, 자원 정보는 4개 컴팩트 패널로 정리했다. 임무 방식은 전체 폭, 병력·과충전은 2열로 배치해 세로 높이를 줄였다.
- 1280×720·900×500에서 한 화면 내 표시를 확인했고, 640×360에서도 카드 구조와 텍스트가 깨지지 않음을 확인했다. Playwright 콘솔 오류 0건, 변경 TSX 정적 검사 통과, `git diff --check` 통과.

## 2026-08-26 — 임무 준비 정보·임무 선택 배치 개선

- 전력/기술/방공/저항 정보를 왼쪽 2×2 카드 하나로 통합하고, 코어/이동/셀/출격 후 잔량을 오른쪽 2×2 카드 하나로 통합했다.
- 두 카드의 내부 칸별 테두리를 제거하고 카드 테두리만 유지해 구분선을 줄이면서 수치 글씨를 키웠다.
- 임무 방식 영역은 왼쪽에 큰 `상태 / 미접촉` 라벨과 제목을, 오른쪽에 습격/점령 선택 버튼을 가로로 배치했다.
- 1280×720·900×500·640×360 hot-reload 화면에서 새 배치와 반응형 구조를 확인했다. Playwright 콘솔 오류 0건, 변경 TSX 정적 검사와 `git diff --check` 통과. 빌드는 실행하지 않았다.

## 2026-08-26 — 임무 준비 수치 가로 정렬

- 도시 정보/출격 자원 두 카드의 각 2×2 항목을 세로 라벨-값 구조에서 가로 `항목 — 값` 구조로 변경했다.
- 1280×720에서는 항목 12px·값 18px, 900×500에서는 항목 10px·값 16px로 표시해 가독성을 높였다.
- 1280×720·900×500 화면에서 카드 전체가 화면 안에 유지되는 것을 확인했다. 변경 파일 정적 검사와 `git diff --check` 통과, 빌드는 실행하지 않았다.

## 2026-08-26 — 임무 준비 수치 간격 압축

- 도시/자원 카드의 항목과 값을 `space-between`으로 양끝에 배치하던 규칙을 제거했다.
- 항목과 값 사이 간격을 6px로 고정하고 카드·행 간 여백도 줄여, 남는 가로 공간을 없애면서 글씨가 가까이 읽히도록 조정했다.
- 1280×720·900×500 hot-reload 화면에서 컴팩트 배치와 화면 내 표시를 확인했다. 변경 파일 정적 검사와 `git diff --check` 통과, 빌드는 실행하지 않았다.

## 2026-08-26 — 병력·과충전 정보 가독성 확대

- 지상 병력 행의 체크 표시, 병력명, 전력/응집도/통제력 수치를 크게 확대했다.
- 과충전 셀 제목과 설명을 크게 확대해 한눈에 읽히도록 조정했다.
- 유효한 구성에서 반복적으로 표시되던 `장비 구성 유효` 문구를 제거하고, 잘못된 구성일 때만 오류 사유를 표시하도록 변경했다.
- 확정 버튼은 성공 상태에서도 오른쪽 정렬을 유지한다. 900×500 화면과 콘솔 오류 0건을 hot-reload로 확인했으며 빌드는 실행하지 않았다.

## 2026-08-26 — 임무 준비 보조 정보 글씨 확대

- `투하 수용량`, `지휘 대역폭`, `강습 전용` 라벨을 11px, 값을 16px로 확대했다.
- `과충전 셀` 제목을 19px, 설명을 11px로 유지해 화면의 주요 정보와 같은 가독성 수준으로 맞췄다.
- 유효 상태의 `장비 구성 유효` 문구는 계속 숨기고 오류 상태에서만 사유를 표시한다. 1280×720 hot-reload 화면, 콘솔 오류 0건, 변경 파일 정적 검사와 `git diff --check`를 확인했다.

## 2026-08-26 — 임무 준비 상태·단계 라벨 확대

- `상태 / 미접촉`을 12px/30px로 확대하고 `01 / 02 / 03` 단계 라벨을 15px로 확대했다.
- 1280×720 hot-reload 화면에서 확인했으며 화면 높이는 유지했다. 빌드는 실행하지 않았다.

## 2026-08-26 — 지상 차량·구조물 공통 그림자

- 차량과 구조물의 실제 실루엣을 추적하지 않는 단일 투명 SVG 그림자 에셋 `ground-unit-shadow.svg`를 추가했다.
- 그림자 재질과 텍스처는 Babylon Scene 단위로 공유하고, 각 그림자 Mesh는 본체의 가로 폭 × `1.08`로 X 스케일만 조정한다. 높이는 `0.58`로 고정한다.
- 빛이 완전 수직으로 떨어지지 않는 느낌을 위해 본체 바닥선보다 `0.06` 아래, X축 `+0.3`만큼 치우쳐 배치했다.
- `BattleEntityVisuals`의 DEFENDER/SAM/RADAR/AIRBASE/POWER와 `BattleAbsorbableRegions`의 VEHICLE/ORGANIC/MACHINERY/POWER/DATA/RELIC에 동일 규칙을 적용했다.
- 파괴·고갈·미발견·비표시 대상은 그림자도 함께 숨기며, 군중·코호트·투사체 같은 애니메이션 VFX에는 고정 그림자를 추가하지 않았다.
- 원본 에셋은 `assets/battlescene/shared/units/ground-unit-shadow.svg`, 런타임 복사본은 `public/assets/runtime/sprites/ground-unit-shadow.svg`이며 `process-ground-unit-sprites.mjs`가 동기화한다.
- 1280×720 DAY/NIGHT, 900×500, 640×360 전투 캡처에서 그림자 표시와 콘솔 오류 0건을 확인했다. 변경 파일 ESLint, production build, `git diff --check`가 통과했다.
- 전체 타입검사는 기존 미커밋 지상공격 AI 테스트의 `HOLD` 비교 오류 때문에 실패하며, 전체 Vitest도 기존 SAM 발사 테스트 3건이 실패한다. 이번 그림자 변경 파일의 정적 검사와 production build에는 영향이 없다.

## 2026-08-26 — 화면 배치 유닛 사용 경로 점검

- `assets/battlescene.scene`의 `FighterPrototype1~3`, `DronePrototype1~3`, `GroundTurretPrototype1~3`, `GroundBarrelPrototype1~3`은 에디터 회색상자 잔재로 확인했다. 일반 런타임은 `hideDebugPrototypes`로 숨기며, `battle-debug=1`에서만 화면에 남는다.
- 실제 전투기·SAM·지상 시설/경비대는 `CombatState` 기반 런타임 visual pool과 별도 스프라이트를 사용한다.
- `BattleInfectedAssaultVfx`와 감염 강습 버튼은 현재 전투 상태·피해·코호트에 연결되지 않은 순수 시각 효과다.
- 코호트 유형은 현재 `ASSAULT`만 생성·편성·배치되며, `SABOTEUR`·`HARVEST`는 저장 스키마/표시만 있고 선택 시 `COHORT TYPE LOCKED`로 거부된다.
- Vitest 95/95, 지상 유닛 브라우저 검증, 표준 web-game 캡처를 확인했다. 이 점검에서는 코드 수정 없이 보고만 남겼다.

## 2026-08-26 — 에디터 회색상자 잔재 제거

- 요청에 따라 감염강습 구현은 그대로 보존하고, 에디터 전용 `FighterPrototype`, `DronePrototype`, `GroundTurretPrototype`, `GroundBarrelPrototype` 메시 12개와 관련 기하 산출물을 제거했다.
- `scripts/create-battle-editor-scene.mjs`가 앞으로 해당 회색상자를 생성하지 않도록 수정했으며, `FighterPoolRoot`, `DronePoolRoot`, `GroundBattleRoot`, 레인 앵커 계약 노드는 유지했다.
- 일반/디버그 배틀 씬의 패키징 참조에서 프로토타입 이름이 사라졌고, 감염강습 버튼은 `active=true`, `totalDrops=64`로 계속 동작한다.
- TypeScript, Vitest 95/95, production build, 지상 유닛 3개 viewport 브라우저 회귀, 표준 web-game 캡처와 `git diff --check`를 통과했다.

## 2026-08-26 — 정지 지상 차량 재점검

- 실행 snapshot에서 `coastal:sam-west`, `coastal:sam-central`, `coastal:sam-east` 세 SAM 모두 `HOLD`, `shot.allowed=true`이며 각 ID에서 미사일이 반복 생성되는 것을 확인했다. `velocityX=0`은 발사 위치 도달 후 대기하는 정상 상태다.
- 화면 중앙의 정지 탱크형 차량은 SAM이 아니라 `coastal:guard-command` 계열 `DEFENDER`다. DEFENDER는 배치된 ASSAULT 코호트만 공격 대상으로 삼고, 코호트가 없는 빠른 전투에서는 대기한다.
- 이번 점검에서는 코드를 수정하지 않았다.

## 2026-08-26 — DEFENDER 개틀링 전차 이미지 교체

- `DEFENDER` 런타임 스프라이트를 기존 전차에서 투명 배경의 `assets/_weapon-temp/final/gatling-armored-vehicle-gameobject-v1-512.png` 기반 개틀링 전차로 교체했다.
- `process-ground-unit-sprites.mjs`가 해당 원본을 자동 trim해 `ground-defender-mobile-side.png`로 생성하도록 연결했다. 출력 크기는 `460×302`다.
- 개틀링 전차의 종횡비에 맞춰 런타임 크기를 조정하고, 모선 기준 좌우 반전 방향도 원본 이미지 방향에 맞게 보정했다.
- SAM 로직·감염강습은 변경하지 않았다. TypeScript, Vitest 102/102, production build, 표준 web-game 캡처, 지상 유닛 브라우저 회귀에서 개틀링 전차와 SAM 발사를 확인했다.

## 2026-08-26 — 시민 방공호 피난·수용 한도 구현

- ORGANIC 지상 타깃을 맵에 배치되는 방공호로 취급하고, 전투 시작 시 잔량·수용 인원을 0으로 초기화했다. 수용량은 방공호별 초기 규모에 따라 계산하며 기존 유기물 자원 풀을 방공호 입장만으로 차감하지 않는다.
- 런타임에 외부 시민 군중을 등록하고 가장 가까운 수용 가능한 방공호를 향해 이동시킨다. 방공호가 가득 차면 남은 시민은 `BLOCKED` 상태로 외부에 남고, 수용 중인 시민은 방공호 내부 오버레이로 표시된다.
- 방공호는 `INTACT → BREACHING → DESTROYED`로 전환된다. 파괴 전에는 시민이 보호되고, 위가 열린 파괴 상태에서는 구조물 상호작용을 끄며 노출된 잔여 시민만 흡수 대상으로 남긴다. 빈 방공호는 파괴 후 `DEPLETED`가 되어 더 이상 빔 대상이 되지 않는다.
- `render_game_to_text`에 방공호 수용량·현재 인원·잔여 공간·파괴 상태·상호작용 가능 여부와 시민의 이동/수용/차단 상태를 추가했다.
- `src/game/domain/shelterRules.test.ts`에 빈 시작, 최단 방공호 배정, 수용량 초과 차단, 파괴 후 노출 규칙을 추가했다. 전체 Vitest 18개 파일 102개 테스트, TypeScript, 관련 ESLint, `git diff --check`가 통과했다.
- `scripts/verify-civilian-shelters.mjs`와 `test:e2e:civilian-shelters`를 추가했다. 실제 로컬 브라우저에서 빈 방공호 → 시민 이동 → 수용 완료/초과 차단 → 방공호 접근·파괴 → `interactable=false`를 확인했고 콘솔/HTTP 오류는 0건이다. 캡처는 `output/civilian-shelters/`에 보존했다.

### 다음 작업

- 사용자 확인 후 방공호별 수용량 비율과 시민 이동 속도를 플레이테스트 기준으로 조정한다.
- 현재 전체 lint에는 이번 기능과 무관한 기존 `BattleScreen.tsx`의 `react-hooks/set-state-in-effect` 오류 1건과 `<img>` 경고 2건이 남아 있다.

## 2026-08-26 — 인게임 유닛명 임시 숨김

- 군용 차량·생산 설비·방공호 등 월드 오브젝트 위에 생성되는 이름 라벨은 삭제하지 않고 `SHOW_IN_GAME_UNIT_LABELS=false` 표시 옵션으로 임시 비활성화했다.
- 라벨 구성과 텍스트는 그대로 유지해 이후 다시 표시할 수 있으며, 시민 흡수 수치 같은 효과성 안내는 이름 라벨이 아니므로 기존 동작을 유지한다.
- 1280×720 로컬 전투 화면에서 이름 박스가 사라지고 유닛 본체·체력바·전투 효과는 유지되는 것을 확인했다. TypeScript, 전체 Vitest 102/102, 관련 ESLint, `git diff --check`가 통과했으며 빌드는 실행하지 않았다.

## 2026-08-26 — 흡입광선 하단 확장형 보정

- 레퍼런스 이미지와 현재 게임 캡처를 비교한 뒤, 기존 하단 반폭 6.5가 좁게 보이는 문제를 확인했다.
- `BattleAbsorptionVfx`의 하단 반폭을 15로 확대하고 점화 시 폭 스케일도 0.9 이상으로 제한해 항상 위쪽은 좁고 아래쪽은 넓은 깔때기 형태가 보이게 했다.
- 1280×720 브라우저 캡처에서 하단 확장형 광선을 확인했다. 내부 가상 오브젝트의 시각 전용 이동, 0.8초 이동 시간, 기존 광선 VFX는 유지된다.
- typecheck, production build, 관련 파일 ESLint, diff check, 흡입광선 가상 오브젝트 E2E를 통과했다. 병행 중인 보호시설 변경으로 전체 Vitest는 현재 94/95 상태다.

## 2026-08-26 — 방공호 내부 시민 정적 배치 전환

- 외부 시민의 방공호 이동은 현재 임시로 비활성화하고, 방공호 타깃 생성 시 내부 시민 수를 고정 배치했다. 외부 도주 군중은 기존처럼 `OUTSIDE` 상태로 계속 이동한다.
- 방공호 내부 시민 오버레이는 방공호 본체와 함께 표시되며, 흡입 빔은 기존 3초 `BREACHING` 보호 구간 후 `DESTROYED` 상태에서 내부 시민 잔량만 흡수한다.
- 방공호 지면 기준 Y를 `-19`로 조정해 본체와 내부 시민 오버레이가 같은 레이어에 맞도록 정렬했다.
- 정적 배치 전용 로컬 브라우저 검증에서 내부 시민 시작 표시, 외부 군중 유지, 방공호 파괴·내부 시민 흡수를 확인했다. 전체 Vitest 18개 파일 103개, TypeScript, 관련 ESLint, `git diff --check`를 통과했으며 빌드는 실행하지 않았다.

## 2026-08-26 — 밤 맵 DEFENDER Y 기준 보정

- 밤 맵 snapshot에서 정지 차량 3대가 `coastal:guard-*` `DEFENDER`이며, 실제 SAM 3대(`coastal:sam-*`)와 달리 미사일 발사 AI 대상이 아님을 확인했다.
- DEFENDER의 런타임 스프라이트는 기존 개틀링 전차 이미지이며, 기본 지상 루트 Y를 `GROUND_SAM_ROOT_Y=-16.5`로 맞춰 SAM과 동일한 높이에서 표시되도록 보정했다.
- 밤 맵 브라우저 snapshot에서 DEFENDER와 SAM 모두 `visuals.ground[].y=-16.5`, 세 SAM의 미사일 생성, 콘솔 오류 0건을 확인했다.

## 2026-08-26 — SAM 흰색 미사일 구간 발사 위치 보정

- SAM 발사 소켓의 공통 로컬 Y를 `4.6`에서 `2.2`로 낮춰, 장비 위 투명 영역이 아니라 SAM 스프라이트의 흰색 미사일 구간에서 발사되도록 조정했다.
- 도메인 발사 좌표와 Babylon 시각 소켓은 같은 상수를 계속 사용하며, 이에 따라 월드 발사 Y는 `-11.9`에서 `-14.3`으로 내려갔다.
- SAM 발사 회귀 테스트 33개, TypeScript, 변경 파일 ESLint, `git diff --check`가 통과했다. 표준 web-game 캡처에서도 좌표 동기화와 화면을 확인했다.
- 전체 `verify-ground-unit-positioning`은 좌우 발사·3개 viewport·이동/EMP까지 통과했지만, 마지막 geometry overlay 단계는 현재 `SHOW_IN_BATTLE_DEBUG_CONTROLS=false`로 숨겨진 기존 버튼을 찾지 못해 실패했다. 이번 좌표 변경과 무관한 검증 스크립트/UI 불일치다.

## 2026-08-26 — 메인 메뉴 밤 빠른 전투 테스트 임시 숨김

- 메인 메뉴의 `빠른 전투 테스트 (밤)` 버튼 렌더링·콜백·번역 키는 유지하고 `quick-night-battle-button` 클래스의 `display: none`으로만 임시 숨김 처리했다.
- 낮 빠른 전투 테스트 버튼은 기존 위치와 동작을 유지한다.
- 1280×720 및 640×360 Playwright 화면 검증에서 밤 버튼이 DOM에 존재하면서 숨겨진 상태이고, 낮 버튼이 표시되며 전투 화면으로 정상 진입하는 것을 확인했다. 콘솔·HTTP 오류는 0건이다.

## 2026-08-27 — 흡수 에너지 소모 조정 재개 완료

- 중단했던 작업을 재개해 흡입 중 에너지 소모를 `energyDrainPerSecond=100`으로 적용했다. 고정 60Hz 기준 0.1초마다 10씩 차감되며, 에너지가 부족한 마지막 구간은 가능한 시간만 처리한 뒤 `ENERGY_DEPLETED`로 정지한다.
- 흡수 미리보기의 `energyCost`에도 동일한 초당 비용을 반영하고, beam 시작 시 최소 0.1초 비용 미만 에너지는 거부한다. 기존 흡수로 얻는 tactical energy와 에너지 회복/다른 능력 규칙은 유지했다.
- 대상 흡수 속도는 이전 요청대로 `durationMultiplier=3`을 계속 사용해 전체 흡수 시간이 기존의 3배다.
- 에너지 규칙을 검증하는 회귀 테스트를 추가했다. 전체 Vitest 109/109, typecheck, production build, 관련 ESLint, diff check, 흡입광선 브라우저 E2E와 표준 web-game 캡처가 통과했다.
