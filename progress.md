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

- River/Desert의 1차 마스터 분할 레이어는 기능과 분위기 검증용이다. 최종 아트 단계에서 레이어별 투명 원본을 개별 제작하면 깊이 중복과 안개 경계를 더 정교하게 조정할 수 있다.
- 75초 기본 생존 시간, 자폭드론 피해/쿨다운, 수리비 상한 45%는 플레이테스트 후 조정한다.
- 메뉴와 월드맵의 기존 `<img>` 두 곳은 Next lint 성능 경고만 남으며 게임 오류는 아니다.
- 최종 `npm run check` 통과: TypeScript, Vitest 26/26, Next.js production build 성공.
- 최종 `npm run lint`는 오류 0건이며 위의 기존 `<img>` 성능 경고 2건만 남았다.
- `git diff --check` 통과.
