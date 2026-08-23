# Battle Scene 신규 에셋 제작 목록

- 작성일: 2026-08-23
- 대상: Babylon.js Editor 전투 씬
- 배포 형태: 웹 빌드
- 시각 참고: `docs/reference_images/thetcall_inbattle_2d_day.png`
- 에셋 정책: 기존 전투 에셋 및 초안 이미지의 부분 추출을 사용하지 않고 모두 신규 제작
- 현재 맵 ID: `city-day`

## 제작 단계

### 1차 — 2D 에셋만 제작

1차에서는 계층별 전투 배경과 향후 3D 모선에 사용할 표면 매핑 이미지만 제작한다. 3D 모델은 제작하지 않는다.

- 제작 대상: `2D-001`부터 `2D-009`
- 제외 대상: 아래의 모든 `3D-*` 항목
- 목적: 최종 3D 모델 제작 전에 카메라, 패럴랙스, 배경 합성, 색상과 모선 재질 방향을 먼저 검증
- 주의: 모선 UV가 아직 없으므로 1차 모선 이미지는 특정 UV 전개도에 맞춘 완성 texture가 아니라 반복 투영 가능한 표면 재질과 decal 원본이다.

### 2차 이후 — 3D 에셋 제작

1차 2D 에셋을 적용한 회색상자 씬에서 화면 비율과 모델 크기를 확정한 다음 3D 에셋을 제작한다. 모선 모델의 UV가 확정되면 1차 모선 매핑 이미지를 바탕으로 모델 전용 base color, normal, ORM, emissive texture를 다시 bake한다.

## 1차 2D 에셋 목록

### 배경 레이어

| ID | 파일 기본명 | 용도 | 투명도 | 런타임 형식 | 제작 상태 |
|---|---|---|---|---|---|
| `2D-001` | `sky-day-base` | 카메라에 고정되는 청명한 낮 하늘과 부드러운 구름 | 불투명 | WebP, 이후 KTX2 검토 | 1차 완료 |
| `2D-002` | `city-far-day` | 대기 원근이 강한 먼 도시 스카이라인 | 알파 | WebP alpha, 이후 KTX2 | 1차 완료 |
| `2D-003` | `city-middle-day` | 중거리 고층 건물 레이어 | 알파 | WebP alpha, 이후 KTX2 | 1차 완료 |
| `2D-004` | `city-near-day` | 가까운 저·중층 건물과 옥상 구조물 | 알파 | WebP alpha, 이후 KTX2 | 1차 완료 |
| `2D-005` | `ground-road-day` | 화면 하단 지면, 도로, 방벽 및 지상 유닛 lane | 알파 | WebP alpha, 이후 KTX2 | 1차 완료 |
| `2D-006` | `foreground-atmosphere-day` | 선택적으로 겹치는 연무, 먼지, 희미한 연기 | 알파 | WebP alpha, 이후 KTX2 | 1차 완료 |

### 모선 표면 매핑 이미지

| ID | 파일 기본명 | 용도 | 투명도 | 런타임 형식 | 제작 상태 |
|---|---|---|---|---|---|
| `2D-007` | `mothership-hull-basecolor` | 반복 투영 가능한 짙은 금속 패널과 표면 기본색 | 불투명 | WebP 입력, 최종 KTX2 | 1차 완료 |
| `2D-008` | `mothership-hull-height-source` | 패널 홈, 리벳, 기계 경계의 height/normal 생성 원본 | 불투명 grayscale | lossless WebP 입력, 최종 KTX2 normal | 1차 완료 |
| `2D-009` | `mothership-emissive-decals` | 붉은 발광 링, 선, 경고 표식용 decal atlas | 알파 | WebP alpha, 최종 KTX2 | 1차 완료 |

## 맵별 리소스 배치

배틀 화면은 하나의 Babylon Editor 씬과 하나의 런타임 화면을 공유한다. 맵 스타일이 추가될 때 씬을 복제하지 않고 `maps/<map-id>/` 패키지만 추가한다.

```text
assets/battlescene/
├─ shared/                                      # 모든 맵에서 공통 사용
│  └─ mothership/
│     └─ mapping/                               # 모선 표면 재질·decal
└─ maps/
   ├─ city-day/                                 # 현재 1차 맵
   │  ├─ map.manifest.json
   │  └─ backgrounds/
   │     ├─ sky-day-base.webp
   │     ├─ city-far-day.webp
   │     ├─ city-middle-day.webp
   │     ├─ city-near-day.webp
   │     ├─ ground-road-day.webp
   │     └─ foreground-atmosphere-day.webp
   ├─ city-night/                               # 후속 예시
   └─ desert-day/                               # 후속 예시

art-source/battlescene/
├─ shared/mothership/mapping/                    # 생성 원본, 웹 배포 제외
└─ maps/city-day/backgrounds/                   # 생성 원본, 웹 배포 제외
```

현재 생성된 파일은 이 구조로 배치되어 있다. `assets/battlescene`는 Babylon Editor가 이해하는 원본 에셋 루트이며, `art-source/battlescene`는 PNG 제작 원본을 보관하는 비배포 경로다.

맵을 하나 더 만들 때는 다음 세 가지만 추가한다.

1. `assets/battlescene/maps/<map-id>/backgrounds/`에 동일한 역할의 레이어 파일을 넣는다.
2. `assets/battlescene/maps/<map-id>/map.manifest.json`에 레이어 경로와 패럴랙스 값을 기록한다.
3. `src/game/battle/maps`의 맵 카탈로그에 `<map-id>`를 등록한다.

모선의 3D 모델과 표면 매핑은 기본적으로 `shared`에 둔다. 특정 맵에서 모선 색상이나 발광 패턴만 바꾸고 싶을 때만 manifest에 map-specific override 경로를 추가한다.

### 런타임 경로 규칙

manifest의 에셋 경로는 `/scene/assets/`를 포함하지 않는 프로젝트 상대 key로 저장한다. 전투 로더가 다음처럼 공통 prefix를 붙인다.

```text
manifest key:
battlescene/maps/city-day/backgrounds/city-far-day.webp

runtime URL:
/scene/assets/battlescene/maps/city-day/backgrounds/city-far-day.webp
```

이 규칙을 사용하면 배틀 화면 코드는 `city-day`인지 `desert-day`인지 알 필요 없이 manifest의 동일한 `far`, `middle`, `near`, `ground` 슬롯만 읽으면 된다.

### 맵 교체 흐름

```text
BattleLaunchRequest.mapId
        ↓
map catalog / manifest loader
        ↓
shared battle scene의 배경 Plane 재질 교체
        ↓
parallax · camera · ground lane 설정 적용
```

맵 선택 시점에 manifest를 읽고 중앙 배경과 필수 텍스처만 먼저 로드한다. 모든 맵을 Babylon 씬에 동시에 배치하지 않으며, 사용하지 않는 맵의 이미지는 브라우저가 요청하지 않게 한다.

## 1차 생성 결과 manifest

이미지는 내장 `imagegen`으로 신규 생성했다. PNG 생성 원본은 웹 배포 경로 밖의 `art-source`에 보관하고, 런타임본은 Sharp를 사용해 WebP로 변환했다.

| ID | 런타임 파일 | 크기 | Alpha | 파일 용량 |
|---|---|---:|---|---:|
| `2D-001` | `assets/battlescene/maps/city-day/backgrounds/sky-day-base.webp` | 1672×941 | 없음 | 34.3 KiB |
| `2D-002` | `assets/battlescene/maps/city-day/backgrounds/city-far-day.webp` | 1672×941 | 0~255 | 131.8 KiB |
| `2D-003` | `assets/battlescene/maps/city-day/backgrounds/city-middle-day.webp` | 1672×941 | 0~255 | 224.5 KiB |
| `2D-004` | `assets/battlescene/maps/city-day/backgrounds/city-near-day.webp` | 1774×887 | 0~255 | 236.6 KiB |
| `2D-005` | `assets/battlescene/maps/city-day/backgrounds/ground-road-day.webp` | 2048×724 | 0~255 | 189.6 KiB |
| `2D-006` | `assets/battlescene/maps/city-day/backgrounds/foreground-atmosphere-day.webp` | 1672×941 | 0~254 | 254.1 KiB |
| `2D-007` | `assets/battlescene/shared/mothership/mapping/mothership-hull-basecolor.webp` | 1024×1024 | 없음 | 121.3 KiB |
| `2D-008` | `assets/battlescene/shared/mothership/mapping/mothership-hull-height-source.webp` | 1024×1024 | 없음 | 310.9 KiB |
| `2D-009` | `assets/battlescene/shared/mothership/mapping/mothership-emissive-decals.webp` | 1024×1024 | 0~255 | 677.3 KiB |

- 런타임 WebP 전체: 약 2.13 MiB
- `2D-002`부터 `2D-006`, `2D-009`까지 실제 alpha channel 검사 완료
- `2D-008`은 grayscale lossless WebP로 변환
- 모선 base color 가장자리 평균 색차: 좌우 3.41, 상하 4.84
- 모선 height source 가장자리 평균 색차: 좌우 3.92, 상하 7.73
- KTX-Software가 현재 개발 환경에 설치되어 있지 않아 KTX2 생성은 Editor 통합 단계로 보류

## 배경 공통 제작 규격

- 카메라: 지상에서 도시를 바라보는 고정 측면 원근 시점
- 기준 화면: 16:9 landscape
- 스타일: 사실적인 근미래 도시, 낮, 자연스러운 대기 원근
- 조명: 화면 좌측 상단의 부드러운 주광을 공통 기준으로 사용
- 색상: 푸른 하늘, 중성 회색 도시, 과도한 주황/청록 영화 색보정 금지
- 금지 요소: HUD, 글자, 로고, 워터마크, 모선, 전투기, 드론, 탱크, 대공포, 미사일, 폭발
- 패럴랙스: 각 이미지는 다른 레이어의 물체를 포함하지 않아야 한다.
- 경계: 가로 반복 또는 인접 타일 연결을 고려해 좌우 가장자리에 잘린 핵심 랜드마크를 두지 않는다.
- 알파 레이어: 하늘 영역은 실제 투명 픽셀이어야 하며 checkerboard 무늬나 가짜 배경색을 넣지 않는다.
- overscan: 화면 비율 변화와 카메라 이동에 대비해 가장자리 여유 공간을 둔다.

## 레이어별 시각 규칙

### `2D-001 sky-day-base`

- 도시와 지면을 포함하지 않는다.
- 구름은 화면 전체를 가리지 않고 중간 밀도로 배치한다.
- 강한 태양 원반이나 렌즈 플레어를 넣지 않는다.
- 카메라 고정 배경으로 사용해도 움직임 반복이 쉽게 드러나지 않는 구성을 사용한다.

### `2D-002 city-far-day`

- 얇고 조밀한 원거리 고층 스카이라인만 포함한다.
- 낮은 대비, 낮은 채도와 푸른 대기 원근을 적용한다.
- 창문이나 간판의 세부 묘사를 최소화한다.
- 아래쪽 건물 실루엣부터 위쪽은 실제 투명 배경으로 만든다.

### `2D-003 city-middle-day`

- 중간 높이와 높은 건물을 혼합한다.
- Far보다 대비와 디테일이 높고 Near보다 낮아야 한다.
- 특정 실존 도시나 상표를 연상시키는 랜드마크를 사용하지 않는다.
- 안테나, 물탱크, 옥상 설비는 작은 실루엣으로만 사용한다.

### `2D-004 city-near-day`

- 저층 및 중층 건물, 옥상, 환기 설비, 방어 도시 분위기를 담는다.
- 지상 유닛과 겹칠 수 있는 큰 전경 물체는 넣지 않는다.
- 반복 사용 시 눈에 띄는 하나의 거대한 랜드마크를 피한다.

### `2D-005 ground-road-day`

- 화면 하단만 차지하는 수평 지면 스트립으로 제작한다.
- 도로, 콘크리트 방벽, 얕은 식재와 도시 기반 시설을 포함할 수 있다.
- 지상 유닛이 좌우로 이동할 수 있는 평탄한 lane을 비워 둔다.
- 원근 소실점이 강하게 나타나는 도로 방향은 피하고 측면 이동에 맞는 수평 구조를 사용한다.

### `2D-006 foreground-atmosphere-day`

- 희미한 흰색/회색 연무와 소량의 연기만 포함한다.
- 실제 알파 배경으로 제작한다.
- 화면을 불투명하게 덮거나 전투 유닛의 실루엣을 방해하지 않는다.
- 반복되는 구름 덩어리처럼 보이지 않도록 큰 빈 영역을 유지한다.

## 모선 매핑 공통 규격

- 스타일: 짙은 gunmetal 기반의 외계/근미래 금속 구조
- 표면: 동심원형 모선과 잘 어울리는 방사형 패널 감각을 가지되 특정 UV 형태에는 종속되지 않음
- 조명: base color에는 강한 방향성 조명과 그림자를 bake하지 않음
- 반복: 좌우 및 상하 반복 시 큰 이음새가 없어야 함
- 금지 요소: 글자, 숫자, 실제 언어, 로고, 워터마크, 완성된 모선 실루엣
- 발광색: 붉은색 및 주홍색 계열을 기본으로 사용
- 최종 PBR: 3D 모선 UV 확정 후 normal, ORM, emissive를 모델 전용으로 다시 bake

### `2D-007 mothership-hull-basecolor`

- top-down orthographic material swatch
- 짙은 금속 패널, 미세한 가장자리 마모와 색 변화
- 큰 방향성 구조와 광원 그림자를 제거
- 기하학적 홈은 base color에 지나치게 입체적으로 그리지 않음

### `2D-008 mothership-hull-height-source`

- 중성 회색 바탕의 grayscale height source
- 밝을수록 돌출, 어두울수록 홈이라는 규칙 사용
- 패널 경계, 작은 리벳, 기계 홈을 포함
- 실제 normal map의 보라색 RGB 표현이 아니라 normal 생성 전 높이 원본으로 제작

### `2D-009 mothership-emissive-decals`

- 실제 투명 배경
- 붉은 발광 링, 짧은 선, 점, 기하학적 경고 패턴
- 각 decal 사이에 충분한 padding 유지
- 글자나 숫자 없이 기하학적 표식만 사용
- 발광 bloom 자체를 넓게 bake하지 않고 밝은 core 중심으로 제작

## 2차 이후 3D 에셋 목록

| ID | 에셋 | 주요 구성 | 제작 단계 |
|---|---|---|---|
| `3D-001` | 모선 본체 | LOD0~2, UV, PBR material slot, 단순 충돌 proxy | 2차 이후 |
| `3D-002` | 모선 하부 무기 시스템 | 포탑, 에너지 빔 emitter, 발사 socket | 2차 이후 |
| `3D-003` | 모선 드론 출격 구조 | bay door, spawn socket, 선택적 animation | 2차 이후 |
| `3D-004` | 주력 전투기 | LOD, engine/VFX socket, 단순 hit volume | 2차 이후 |
| `3D-005` | 보조 전투기 variation | 공통 material과 instance 사용 고려 | 2차 이후 |
| `3D-006` | 전투 드론 | swarm instance용 저비용 모델 | 2차 이후 |
| `3D-007` | 공격 드론 variation | 무기 socket과 공통 skeleton/animation 고려 | 2차 이후 |
| `3D-008` | 자주대공포 | 차체/포탑 분리, X축 ground lane 이동 | 2차 이후 |
| `3D-009` | 방공 탱크 | 차체/포탑 분리, 단순 궤도 animation | 2차 이후 |
| `3D-010` | 미사일 | pool 및 instance용 저비용 모델 | 2차 이후 |
| `3D-011` | 대형 에너지 발사체 | emissive material, trail socket | 2차 이후 |
| `3D-012` | 충돌 proxy 세트 | box, sphere, convex 조합 | 2차 이후 |

## 웹 배포 최적화 규칙

- 제작 원본 PNG는 `art-source/battlescene/`에 보관하고 웹 빌드에 직접 포함하지 않는다.
- Babylon Editor가 사용하는 런타임 이미지에는 `assets/battlescene/maps/<map-id>/`와 `assets/battlescene/shared/`의 WebP를 우선 사용한다.
- 불투명 이미지와 알파 이미지를 모두 WebP로 변환하되 가장자리 품질을 검수한다.
- 일반 배경 타일과 모선 재질은 2048px 이하를 기본으로 한다.
- 4096px는 실측 화질 이득이 있을 때만 예외로 허용하고 8K 이미지는 금지한다.
- Babylon Editor의 KTX2 압축을 활성화해 패킹 시 GPU 압축본을 생성한다.
- KTX2 미지원 또는 제외 텍스처를 위한 WebP fallback을 유지한다.
- mipmap이 필요한 이미지와 atlas에는 색 번짐을 막는 padding을 포함한다.
- 동일 이미지의 PNG, WebP, KTX2가 런타임에서 중복 다운로드되지 않는지 확인한다.
- 최초 전투 진입 시 중앙 배경과 모선 관련 텍스처만 우선 로드하고 선택적인 외곽/variation은 후순위로 로드한다.

## 폴더 구조

```text
art-source/battlescene/
├─ shared/mothership/mapping/     # 모든 맵에서 공유하는 생성 원본
└─ maps/<map-id>/backgrounds/     # 맵별 생성 원본

assets/battlescene/shared/
└─ mothership/mapping/            # 모든 맵에서 공유하는 WebP

assets/battlescene/maps/<map-id>/
├─ map.manifest.json
└─ backgrounds/                   # 맵별 Editor WebP
```

`art-source`는 제작 보관용이며 웹 배포 manifest에 포함하지 않는다. `assets` 아래의 선택된 WebP만 Editor 씬에서 참조하고, `npm run generate`가 필요 파일과 KTX2를 `public/scene`에 출력하게 한다.

## 1차 완료 조건

- [x] `2D-001`부터 `2D-009`까지 신규 이미지가 존재한다.
- [x] 모든 알파 레이어가 실제 투명 채널을 가진다.
- [ ] 2D 배경을 순서대로 합성했을 때 하나의 낮 도시 전투 공간으로 보인다.
- [x] 배경에 HUD, 유닛, 발사체, 글자 또는 워터마크가 없다.
- [x] 모선 base color와 height source가 반복 투영을 고려한 형태다.
- [x] 모선 emissive decal atlas가 실제 투명 배경을 가진다.
- [x] 런타임 WebP와 제작 원본이 분리되어 있다.
- [x] 생성 이미지의 픽셀 크기, alpha, WebP 용량을 manifest에 기록한다.
- [x] 1차 작업에서 `3D-*` 파일을 만들지 않는다.
