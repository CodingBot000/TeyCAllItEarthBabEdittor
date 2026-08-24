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
