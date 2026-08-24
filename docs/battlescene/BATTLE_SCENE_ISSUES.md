# Battle Scene 이슈 기록

- 대상 계획서: [BATTLE_SCENE_DEVELOPMENT_PLAN.md](./BATTLE_SCENE_DEVELOPMENT_PLAN.md)
- 기술 구현안: [BATTLE_SCENE_IMPLEMENTATION_PLAN.md](./BATTLE_SCENE_IMPLEMENTATION_PLAN.md)
- 기록 시작일: 2026-08-23

## 상태 정의

- `OPEN`: 확인됐지만 해결 또는 우회가 아직 없음
- `WORKAROUND`: 임시 우회로 개발을 계속하지만 근본 해결은 아님
- `BLOCKED`: 특정 작업이 외부 조건 때문에 진행 불가
- `RESOLVED`: 수정과 검증이 완료됨

## 기록 원칙

- 배틀 씬, 맵 manifest, 전투 에셋, 카메라, 렌더링, 패킹과 생명주기 문제를 기록한다.
- 재현 절차, 영향 범위, 근거 로그와 다음 조치를 포함한다.
- 공통 앱 빌드나 월드맵 통합에 영향을 주는 문제는 `docs/MIGRATION_ISSUES.md`에도 연결한다.
- 임시 우회는 해결 완료로 표시하지 않는다.
- 일반적인 오류 때문에 전체 개발을 중단하지 않고 독립 작업을 계속한다.

## 이슈 템플릿

```md
## BAT-000 — 제목

- 상태: `OPEN`
- 심각도: `S1` / `S2` / `S3`
- 발견 단계: `B0` ~ `B7`
- 발견일: YYYY-MM-DD
- 관련 파일: `path`

### 증상

### 재현 절차

1.

### 근거

### 영향 범위

### 우회 또는 계속 진행 방법

### 다음 조치

### 해결 기록
```

## BAT-001 — 웹 런타임에서 Editor 물리 메타데이터가 CANNON 오류를 유발

- 상태: `RESOLVED`
- 심각도: `S2`
- 발견 단계: `B6`
- 발견일: 2026-08-23
- 관련 파일: `scripts/pack-editor.mjs`, `public/scene/battlescene.babylon`

### 증상

Editor 패커가 씬에 물리 메타데이터를 포함하면 웹 런타임에서 Havok/Cannon 플러그인이 없는 상태로 `CANNON is not defined`가 발생하고 씬 로딩이 중단됐다.

### 재현 절차

1. 배틀 Editor 씬을 패킹한다.
2. 별도 물리 플러그인을 등록하지 않은 웹 빌드에서 배틀에 진입한다.

### 우회 또는 계속 진행 방법

`npm run generate:battle` 후 패커가 배틀 씬의 `physicsEnabled`, `physicsEngine`, `physicsGravity` 필드를 제거한다. 1차 배틀은 물리 엔진을 사용하지 않고 단순 판정으로 진행한다.

### 해결 기록

배틀 전용 패킹 경로에 정확한 씬 파일 대상의 물리 메타데이터 정리 단계를 추가했고, 패킹 결과와 브라우저 진입을 확인했다.

## BAT-002 — Editor 모선이 원본 런타임 모선과 다른 단순 원반으로 저장됨

- 상태: `RESOLVED`
- 심각도: `S2`
- 발견 단계: `B5`
- 발견일: 2026-08-24
- 관련 파일: `scripts/create-battle-editor-scene.mjs`, `assets/battlescene.scene/`, `assets/battlescene/shared/mothership/mapping/mothership-saucer-atlas.png`

### 증상

원본 게임은 Babylon 런타임에서 상판·돔·장갑 패널·발광 링·하부 반응로를 조립하지만, Editor 씬에는 원반형 hull과 rim만 있어 실루엣과 표면 디테일이 크게 달랐다. Editor 저장본의 부모 참조도 빠져 모선 루트 이동을 모든 부품이 안정적으로 따르는지 보장할 수 없었다.

### 해결 기록

원본 `MothershipVisual.ts`의 치수, UV, 재질, 발광색과 루트 스케일을 재현하는 씬 생성기를 추가했다. `MothershipVisualRoot` 아래 59개 메시와 원본 atlas를 Editor 자산으로 생성하고, `npm run generate:battle` 패키징 후 서울 전투 진입·우측 이동을 브라우저에서 검증했다. 최종 검증에서 콘솔 오류와 4xx 응답은 없었다.

## 현재 이슈

현재 개발을 막는 배틀 씬 이슈는 없다. 최종 3D 모델·VFX·KTX2 통합 단계에서 성능 이슈를 별도 등록한다.
