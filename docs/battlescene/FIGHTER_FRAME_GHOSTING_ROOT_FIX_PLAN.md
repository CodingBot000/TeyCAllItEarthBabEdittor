# 전투기 프레임 잔상 근본 수정 계획

## 1. 목표

`http://localhost:3000/?battle-fast=1`의 `빠른 전투 테스트`에서 이동한 전투기 영상이 이전 프레임 위치에 남지 않도록 한다.

이번 작업은 전투기 궤도·전투 판정·미사일 규칙을 변경하지 않는다. 렌더 타깃 초기화와 전투기 시각 레이어만 수정한다.

## 2. 재현 근거

- 검증 경로는 반드시 `http://localhost:3000/?battle-fast=1` → `빠른 전투 테스트`를 사용한다.
- 70~86초를 1초 간격으로 캡처했을 때 도메인 및 visual snapshot의 전투기는 계속 4대였다.
- 84~86초 캔버스에는 현재 위치의 4대 외에 이전 위치의 전투기 영상이 추가로 남았다.
- 따라서 원인은 EnemyState 중복, visual pool 누수, 궤도 계산이 아니라 이전 프레임 색상 버퍼가 지워지지 않는 렌더링 누적이다.
- `createBattleRuntime`은 `scene.autoClear = true`로 설정한다.
- 반면 항상 카메라에 부착되는 EMP/오버드라이브 `PostProcess`는 `autoClear = false`를 명시한다. 현재 코드에서 프레임 출력 초기화를 막는 유일한 명시적 설정이다.

## 3. 이전 수정과의 관계

- `TrailMesh` 교체와 smoke billboard 변경은 붉은 트레일 단면·저폴리 연기 문제를 해결하지만 프레임버퍼 누적을 해결하지 못한다.
- 일반 선체 피격의 box debris 제거는 전투기 주변의 주황 파편 오인을 해결하지만 이전 프레임의 전투기 본체 복제 잔상을 해결하지 못한다.
- 이번에는 개별 VFX를 더 삭제하는 대신 후처리 출력 버퍼의 생명주기를 바로잡는다.

## 4. 구현 단계

### P0. 기준선 고정

1. 지정 URL에서 70초까지 결정적으로 진행한다.
2. 70~86초를 250ms 또는 1초 간격으로 캡처한다.
3. 각 프레임에 다음 상태를 같이 저장한다.
   - `elapsedSeconds`
   - `visuals.fighters[].id/x/y/z`
   - 전투기 body mesh 수
   - trail segment 수와 smoke puff 수
   - 후처리 활성 여부와 `autoClear` 값
4. 상태상 4대인데 화면에 과거 위치 복제가 남는 기준 캡처를 보존한다.

### P1. 후처리 렌더 타깃 초기화 수정

1. `BattleCombatVfx`의 `overdriveDistortion.autoClear = false`를 제거하고 기본 clear 동작을 사용한다.
2. 명시성이 필요하면 `autoClear = true`로 설정한다.
3. 장면의 color/depth clear 계약을 다음과 같이 고정한다.
   - `scene.autoClear = true`
   - `scene.autoClearDepthAndStencil = true`
   - 카메라는 한 프레임당 한 번만 최종 합성한다.
4. EMP/오버드라이브 비활성 시에는 후처리 셰이더가 입력 프레임을 그대로 출력하되, 과거 출력 텍스처를 재사용하지 않도록 한다.
5. 가능하면 두 효과의 intensity가 모두 0일 때 post-process를 카메라에서 일시 분리하고, 효과 시작 시에만 재부착한다. 재부착 순서가 불안정하면 이 최적화는 후속 단계로 미룬다.

### P2. 비활성·활성 효과 회귀 확인

1. 효과 미사용 상태에서 16초 연속 캡처에 과거 전투기 위치가 남지 않는지 확인한다.
2. 같은 지정 URL에서 EMP를 한 번 발동해 파동 중에도 프레임 누적이 없는지 확인한다.
3. 오버드라이브를 한 번 발동해 왜곡 중·종료 직후 모두 화면이 정상적으로 매 프레임 갱신되는지 확인한다.
4. HUD는 후처리 대상이 아니므로 기존처럼 선명하게 유지되어야 한다.

### P3. 전투기 렌더러 안전장치

P1 후에도 잔상이 남는 경우에만 아래 순서로 진행한다.

1. 전투기 body sprite의 `needDepthPrePass`와 `forceDepthWrite`를 한 항목씩 끄고 A/B 캡처한다.
2. alpha atlas는 `CLAMP_ADDRESSMODE`와 non-mipmap 또는 bilinear sampling으로 프레임 경계 bleed를 차단한다.
3. body sprite, jet flame, trail, smoke에 서로 다른 명확한 mesh name prefix를 부여해 캡처 시 원인을 식별한다.
4. trail/smoke를 모두 끈 body-only 모드에서도 잔상이 발생하는지 확인한다.
5. body-only가 정상일 때 trail과 smoke를 하나씩 다시 활성화한다.

## 5. 자동 회귀 검증

기존 visual-sync 테스트와 별도로 지정 URL 전용 검증을 추가한다.

1. `http://localhost:3000/?battle-fast=1`을 연다.
2. `빠른 전투 테스트` 버튼을 클릭한다.
3. `window.advanceTime`으로 편대가 생성되는 시점까지 진행한다.
4. 250ms 간격으로 최소 20장을 캡처한다.
5. snapshot의 fighter ID 수와 실제 fighter body mesh 수가 일치하는지 검사한다.
6. 직전 fighter screen bounding box에서 기체가 이동한 뒤에도 불투명 fighter 픽셀이 남는지 이미지 차분으로 검사한다.
7. 브라우저 console error와 framework overlay가 없어야 한다.

## 6. 완료 기준

- 상태 전투기 4대일 때 화면에도 현재 위치의 전투기 4대만 보인다.
- 전투기가 화면을 횡단한 뒤 이전 위치에는 2프레임 이내 배경이 복원된다.
- 70~86초 전체 캡처에서 누적 복제 잔상이 없다.
- EMP 및 오버드라이브 활성·종료 후에도 누적 잔상이 없다.
- 현재의 실제 3D 궤도, keep-out, 미사일 발사 위치는 변경되지 않는다.
- TypeScript, Vitest, production build가 통과한다.
- 정상 화면 검증은 사용자가 지정한 DAY 빠른 전투 URL에서만 수행한다.

## 7. 작업 순서와 커밋 경계

1. `fix: clear battle post-process every frame`
2. 필요할 때만 `fix: stabilize fighter sprite depth rendering`
3. `test: add fighter framebuffer ghosting regression`

각 단계는 별도로 캡처·검증하고, P1이 문제를 해결하면 P3의 재질 변경은 수행하지 않는다.

## 8. 구현 결과

- P0 완료: 지정 DAY 빠른 전투의 70~86초 캡처에서 상태 전투기 4대와 달리 이전 위치 영상이 최대 6~9개로 누적되는 기준선을 확보했다.
- P1 완료: 상시 카메라 후처리의 `autoClear`를 true로 변경하고 장면의 `autoClearDepthAndStencil`을 true로 고정했다.
- P2 완료: 효과 미사용 연속 프레임, EMP 활성·종료, 오버드라이브 활성 구간 모두 이전 전투기 위치가 누적되지 않았다.
- P3 생략: P1만으로 해결되어 전투기 sprite의 depth pre-pass와 depth write는 변경하지 않았다.
- 회귀 검증 추가: `scripts/verify-fighter-frame-ghosting.mjs`와 `npm run test:e2e:fighter-ghosting`을 추가했다.
- 회귀 결과: 70~78초 9개 프레임에서 enemy/fighter visual ID가 매번 4개로 일치했고 frame-clear 계약 세 값이 모두 true였다. EMP/오버드라이브 캡처와 브라우저 오류 검사도 통과했다.
- 최종 검사: TypeScript, Vitest 48/48, production build, `git diff --check` 통과.
