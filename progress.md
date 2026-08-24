Original prompt: 우주선 모형이 지금 엉망진창인데 /Users/switch/Development/game/webgame/TheyCallItEarth/ 여기서 사용한 모선 을 그대로 가져와서 적용해봐

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
