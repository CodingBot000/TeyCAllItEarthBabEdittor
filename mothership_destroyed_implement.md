원본 프로젝트의 모선 추락 불길 이펙트를 분석하고, 필요한 소스 코드·헬퍼·재질 설정·에셋을 모두 현재 프로젝트로 복사·이식해서 같은 구조로 구현해줘.

복사 원본 프로젝트 경로: /Users/switch/Development/game/webgame/TheyCallItEarth

이 경로는 구현 내용을 확인하고 복사하기 위한 원본 위치일 뿐이다. 구현 완료 후 현재 프로젝트는 원본 프로젝트의 파일이나 경로를 전혀 참조하거나 의존하면 안 된다. 원본 프로젝트가 삭제·이동되어도 현재 프로젝트의 개발 서버, 빌드, 테스트, 배포 및 런타임이 모두 정상 동작해야 한다.

독립 구현 필수 조건:

- 원본 프로젝트 파일을 절대경로로 import하거나 런타임에 읽지 않는다.
- 원본 프로젝트를 향하는 symlink, alias, 동적 import, 파일 복사 스크립트 의존성을 만들지 않는다.
- 필요한 TypeScript 구현과 보조 함수는 현재 프로젝트 내부 파일로 모두 복사·이식한다.
- 필요한 이미지와 텍스처는 현재 프로젝트의 `public/assets/runtime/vfx/`에 실제 파일로 복사한다.
- 복사한 코드는 현재 프로젝트의 타입, 좌표계, 스케일, 생명주기 및 디렉터리 구조에 맞게 수정한다.
- 최종 결과물만으로 독립적인 재설치, 빌드, 테스트 및 실행이 가능해야 한다.

원본 분석 및 복사·이식 대상 핵심 파일:

1. src/rendering/babylon/tactical/MothershipDestructionVisual.ts
2. src/rendering/babylon/TacticalScene.ts
3. src/rendering/babylon/tactical/flipbookVfx.ts
4. src/rendering/babylon/tactical/atlasUtils.ts
5. src/rendering/babylon/tactical/TacticalMaterialFactory.ts
6. src/rendering/babylon/tactical/geometryUtils.ts

핵심 불길 구현은 원본 `MothershipDestructionVisual.ts`의 다음 부분이다. 해당 부분만 호출하거나 링크하지 말고, 필요한 구현을 현재 프로젝트 코드로 복사·이식한다.

- 상수 및 추락 타이밍: 59~75행
- 불길 Mesh/Flipbook 생성: 116~134행
- 매 프레임 추락 이펙트 갱신: 148~170행
- 추락 포즈 계산: 205~221행
- 불길 꼬리 처리: 223~252행
- 연기 꼬리 처리: 254~279행
- 리소스 정리: 195~203행, 396~405행

구현 동작:

1. 모선 파괴가 시작되면 start(state)를 한 번만 호출한다.
2. 전체 파괴 시퀀스는 5.8초다.
3. 4.35초까지 모선이 추락하면서 불길과 연기 꼬리를 표시한다.
4. 추락 중 모선 주변에서 11개의 폭발을 시간차로 생성한다.
5. 4.35초가 되면 불길과 연기 꼬리를 숨긴다.
6. 지면에서 폭발 3개와 파편 16개를 생성한다.
7. 시퀀스가 끝날 때까지 게임오버/결과 화면 전환을 지연한다.

불길 플립북 구현:

- flameTexture는 16열 × 4행, 총 64프레임이다.
- Billboard Plane 3개를 생성한다.
- 각 Plane은 같은 불길 텍스처를 공유한다.
- 프레임 재생 속도는 24fps다.
- loop=true로 반복 재생한다.
- 세 불길 Plane을 서로 다른 거리와 크기로 배치한다.
- 불길 방향 벡터는 normalize(-0.38, 1, 0.28)이다.
- 불길 시작점은 모선 포즈 기준 local offset (-2.3, 0.3, 1.7)이다.
- 세 Plane의 trail distance는 index * 2.45다.
- X 크기는 3.3 - index * 0.42다.
- Y 크기는 5.8 - index * 0.72다.
- 각 Plane에 약간 다른 flicker를 적용한다.
- visibility는 0.96 - index * 0.17이다.
- 매 프레임 setFlipbookFrame(sprite, 16, 4, elapsed + index * 0.37, 24, true)를 호출한다.

불길 fallback:

- 현재 프로젝트로 복사한 flameTexture가 로딩되지 않으면 텍스처 Plane을 숨긴다.
- 대신 주황색 outer cylinder와 노란색 core cylinder를 사용한다.
- outer 불길 길이는 약 9.5, core 불길 길이는 약 6.2다.
- alignCylinder(origin, end)를 사용해 추락 방향으로 실린더를 정렬한다.
- sin(elapsed * 29), sin(elapsed * 37) 등으로 길이와 투명도를 흔든다.
- 복사된 텍스처의 로딩이 실패해도 불길이 사라지지 않도록 해야 한다.

Babylon 재질 설정:

- 불길 Plane은 Mesh.BILLBOARDMODE_ALL을 사용한다.
- 텍스처는 알파 채널을 사용한다.
- diffuseColor는 흰색 또는 약한 주황색 tint를 사용한다.
- emissiveColor를 설정해 발광시킨다.
- alphaMode는 ALPHA_COMBINE을 사용한다.
- disableDepthWrite=true로 설정한다.
- backFaceCulling=false로 설정한다.

필수 에셋 복사:

- public/assets/runtime/vfx/mothership-flame-16x4.webp
- public/assets/runtime/vfx/mothership-explosion-5x5.webp
- public/assets/runtime/vfx/mothership-smoke-8x8.webp

위 파일들은 원본 프로젝트 경로에서 현재 프로젝트의 동일한 `public/assets/runtime/vfx/` 경로로 실제 복사해야 한다. 원본 파일을 절대경로로 로드하거나 원본 프로젝트의 정적 파일 서버를 참조해서는 안 된다.

에셋 로드 예시:

const explosionTexture = assetLoader.loadTexture( 'mothershipExplosionVfx', '/assets/runtime/vfx/mothership-explosion-5x5.webp', true, );

const flameTexture = assetLoader.loadTexture( 'mothershipFlameVfx', '/assets/runtime/vfx/mothership-flame-16x4.webp', true, );

const smokeTexture = assetLoader.loadTexture( 'mothershipSmokeVfx', '/assets/runtime/vfx/mothership-smoke-8x8.webp', true, );

MothershipDestructionVisual 생성 시 다음을 주입한다.

{ explosionTexture, flameTexture, smokeTexture, isExplosionReady: () => assetLoader.isReady('mothershipExplosionVfx'), isFlameReady: () => assetLoader.isReady('mothershipFlameVfx'), isSmokeReady: () => assetLoader.isReady('mothershipSmokeVfx'), }

씬 연결:

- 원본 구현에서 필요한 `MothershipDestructionVisual` 소스를 현재 프로젝트 내부로 복사·이식하고, 현재 프로젝트의 TacticalScene 또는 대응 런타임 생성자에서 해당 인스턴스를 만든다.
- 매 프레임 updateVisuals(dt)에서 destructionVisual.sync(dt)를 호출한다.
- sync가 반환한 destructionPose를 실제 모선 Mesh의 position/rotation에 적용한다.
- 파괴 시퀀스 동안 카메라 target도 destructionPose.position을 따라가게 한다.
- dispose 시 destructionVisual.dispose()를 호출한다.
- LOW/BALANCED/HIGH 품질 설정에 따라 연기 퍼프 개수를 제한한다.
  - LOW: 16개
  - BALANCED: 23개
  - HIGH: 30개

파괴 시작 연결:

- 모선 hull이 0 이하가 되면 결과 상태를 FAILED로 만든다.
- 즉시 Debrief 화면으로 전환하지 않는다.
- mothershipDestructionVisual.start(state)를 호출한다.
- 매 프레임 sync하면서 5.8초 시퀀스를 재생한다.
- isComplete()가 true가 된 뒤에만 게임오버/Debrief 화면으로 전환한다.
- start() 내부에는 중복 실행 방지용 if (active) return을 유지한다.

주의사항:

- MothershipDamageVisual.ts는 일반 피격 효과용이므로 추락 불길 구현과는 별도다.
- 추락 불길의 핵심은 원본 `MothershipDestructionVisual.ts`의 `updateFlameTrail()`이며, 필요한 로직을 현재 프로젝트의 파괴 VFX 구현으로 복사·이식한다.
- 현재 프로젝트의 고도/스케일이 원본과 다르면 BALANCE.mothership.baseAltitude, IMPACT_ALTITUDE, 불길 origin offset, trail distance, Plane scaling을 조정한다.
- 현재 프로젝트에 복사된 텍스처의 로딩 실패 시에도 procedural cylinder fallback이 동작해야 한다.
- 불길 Plane과 연기 Plane은 반드시 dispose해야 장시간 플레이에서 Mesh가 누적되지 않는다.

완료 검증:

- 현재 프로젝트 안에 필요한 소스와 에셋이 모두 존재하는지 확인한다.
- 현재 프로젝트 코드와 설정에 `/Users/switch/Development/game/webgame/TheyCallItEarth` 절대경로 참조가 남아 있지 않은지 검색한다. 이 문서에 기록된 복사 원본 경로는 예외다.
- 원본 프로젝트를 사용할 수 없는 상태라고 가정하고 현재 프로젝트의 typecheck, 테스트, production build 및 브라우저 전투 검증을 실행한다.
- 원본 프로젝트가 삭제되어도 모선 파괴 시퀀스, 불길 플립북, fallback, 연기, 폭발, 파편 및 Debrief 지연이 모두 동작해야 한다.

구현 완료 상태 (2026-08-26):

- 독립 파괴 시퀀스: `src/game/battle/runtime/BattleMothershipDestructionSequence.ts`
- 로컬 보조 소스: `BattleVfxMaterialFactory.ts`, `battleAtlasUtils.ts`, `battleFlipbookVfx.ts`, `battleGeometryUtils.ts`
- 런타임 연결: `src/game/battle/runtime/createBattleRuntime.ts`
- 회귀 검증: `scripts/verify-side-view-failure.mjs`
- 현재 프로젝트에 `mothership-flame-16x4.webp`를 실제 복사했고 explosion/smoke를 포함한 필수 에셋 3개의 원본 SHA-256 일치를 확인했다.
- 정상 불길 텍스처와 강제 로딩 실패 procedural cylinder fallback을 각각 브라우저에서 검증했다.
- 2.183초 FALLING 상태에서 불길 Plane 3개·연기 18개·공중 폭발 6회를, 4.433초 IMPACT 상태에서 총 폭발 14회·파편 16개·불길 종료를 확인했다.
- `isComplete()`가 참이 되는 5.8초 이후에만 FAILED Debrief로 전환하며 기존 수리비 정산을 유지한다.
- 현재 프로젝트의 typecheck, Vitest 48/48, production build, ESLint, 브라우저 전투 검증 및 `git diff --check`를 통과했다.
- `src/`, `scripts/`, 설정 및 런타임 에셋에는 복사 원본 프로젝트의 절대경로 참조가 없다.
