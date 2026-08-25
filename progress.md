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

## 2026-08-25 — 피격 지점 국소 쉴드 망 추가

- 쉴드 피격 지점의 법선 방향을 기준으로 작은 구면 패치형 라인 망을 생성했다.
- 동심 격자와 방사형 선으로 구성된 망이 피격 위치를 따라 움직이며 짧게 표시된다.
- 전체 쉴드 `bubble`은 계속 숨김 상태로 유지하고, 기존 피격 코어·링 효과와 함께 표시한다.
- 브라우저에서 쉴드 피격 디버그 입력과 콘솔 오류 0건을 확인했다.

## 2026-08-25 — 선체 피격 흔들림 강도 절반 조정

- 선체 피격 흔들림의 이동 진폭을 `0.22 → 0.11`, 회전 진폭을 `0.045 → 0.0225`로 줄였다.
- 지속시간 `0.32초`와 피격 시 재시작 동작은 유지했다.
