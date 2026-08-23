# Battle Scene 구현안

- 작성일: 2026-08-23
- 대상 프로젝트: `TeyCAllItEarthBabEdittor`
- 구현 도구: Babylon.js Editor 5.4.x / Babylon.js 9.12.x / Next.js
- 문서 상태: 초기 구현 기준안
- 시각 참고: `docs/reference_images/thetcall_inbattle_2d_day.png`

일정, 병렬 개발 경계와 단계별 완료 기준은 [Battle Scene 개발계획서](./BATTLE_SCENE_DEVELOPMENT_PLAN.md)를 따른다.

## 1. 목적

이 문서는 `thetcall_inbattle_2d_day.png` 초안을 바탕으로 전투 화면을 Babylon.js Editor에서 구현하기 위한 구조와 작업 순서를 정의한다.

초안 이미지의 HUD는 구현 범위에서 제외하고 게임이 렌더링되는 전투 공간만 다룬다. 초안 이미지는 화면 구성과 분위기를 설명하기 위한 참고 자료이며, 이미지 안의 모선·전투기·드론·전차·도시·하늘·이펙트를 런타임 에셋으로 사용하지 않는다.

### 에셋 제작 원칙

- 전투 화면에 사용되는 모든 2D 및 3D 에셋은 새로 제작한다.
- 기존 프로젝트와 이전 전투 구현의 모델, 텍스처, 스프라이트, VFX atlas를 재사용하지 않는다.
- 초안 이미지를 잘라 배경이나 유닛 텍스처로 사용하지 않는다.
- 새 에셋은 웹 런타임용 최적화본과 편집 가능한 원본을 구분해 관리한다.
- 외부 제작 도구나 외부 원본을 사용한다면 출처와 라이선스를 별도 manifest에 기록한다.

## 2. 구현 가능성 결론

요구하는 화면은 Babylon.js Editor와 Babylon.js로 구현 가능하다. 권장 방식은 고정된 측면 카메라 안에서 3D 전투 오브젝트와 여러 장의 2D 도시 레이어를 함께 렌더링하는 **2.5D 전투 장면**이다.

Babylon.js Editor는 다음 작업에 사용한다.

- 전투 씬 구성과 노드 계층 편집
- 신규 GLB/GLTF 모델 배치
- 재질, 조명, 그림자, Sprite Manager 설정
- 스크립트 부착과 에디터 노출 파라미터 조정
- 애니메이션 그룹과 씬 에셋 연결
- 텍스처 축소·압축 및 배포용 씬 패킹

다음 항목은 Editor의 시각 편집만으로 처리하지 않고 TypeScript 스크립트로 구현한다.

- 사용자 입력과 모선 이동
- 카메라 추적 및 이동 범위 제한
- 패럴랙스 계산
- 전투기·드론·지상 유닛 AI
- 충돌, 피격, 발사체 풀링
- 회피기동과 추락 같은 특수 연출 상태
- 장면 로딩, 전투 종료 및 리소스 해제

## 3. 확정된 표현 방식

| 항목 | 구현 기준 |
|---|---|
| 기본 화면 | 측면 시점 2.5D |
| 카메라 | 회전과 줌이 잠긴 원근 카메라 |
| 일반 모선 이동 | X축 좌우 이동만 허용 |
| 카메라 이동 | X축만 이동하며 월드 경계에서 제한 |
| 공중 전투기·드론 | 3D, 평상시 XY 전투 평면 사용 |
| 지상 대공포·탱크 | 3D 또는 2D Sprite, X축 이동만 허용 |
| 도시 | 거리별로 분리한 2D 레이어 |
| 하늘 | Skybox를 우선 사용 |
| 특수 모선 연출 | 전용 cinematic 상태에서 Y/Z 이동과 3축 회전 허용 |
| HUD | 본 문서 및 Babylon 전투 씬 범위에서 제외 |
| 물리 엔진 | 초기 구현에서는 사용하지 않음 |

## 4. 좌표계

Babylon.js의 기본 좌표계를 다음 의미로 사용한다.

- X: 화면 좌우 및 맵 진행 방향
- Y: 높이
- Z: 카메라로부터의 깊이
- 지면 기준: `Y = 0`
- 일반 모선 이동: `Y`와 `Z`를 고정하고 `X`만 변경
- 지상 유닛 이동: 각 유닛의 레일 `Y/Z`를 고정하고 `X`만 변경
- 공중 소형 유닛: 평상시에는 지정된 XY 전투 평면 안에서 이동
- Z축 이동: 깊이 표현, 회피, 진입, 이탈, 추락 등 제한된 연출에만 사용

카메라는 음의 Z 위치에서 양의 Z 방향을 바라보도록 구성한다. 게임 플레이 오브젝트보다 카메라에 가까운 전경은 더 작은 Z에, 도시 원경은 더 큰 Z에 배치한다.

게임 판정 좌표와 시각 연출 좌표를 분리한다. 특수 연출 중 모델이 Z축으로 움직여도 필요한 경우 판정용 루트와 충돌 도형은 기존 전투 평면에 유지할 수 있어야 한다.

## 5. 권장 씬 계층

노드 이름은 Editor 스크립트 연결과 디버깅에서 계약으로 사용되므로 구현이 시작된 뒤 임의로 변경하지 않는다.

```text
BattleSceneRoot
├─ EnvironmentRoot
│  ├─ SkyRoot
│  │  └─ Skybox
│  ├─ CityFarRoot
│  ├─ CityMiddleRoot
│  ├─ CityNearRoot
│  ├─ GroundRoot
│  └─ ForegroundRoot
├─ CameraRig
│  └─ BattleCamera
├─ AirBattleRoot
│  ├─ MothershipGameplayRoot
│  │  └─ MothershipVisualRoot
│  │     ├─ MothershipModel
│  │     ├─ WeaponSockets
│  │     ├─ DroneSpawnSockets
│  │     └─ MothershipVfxSockets
│  ├─ FighterPoolRoot
│  ├─ DronePoolRoot
│  └─ AirProjectilePoolRoot
├─ GroundBattleRoot
│  ├─ GroundLaneDefinitions
│  ├─ AntiAirPoolRoot
│  ├─ TankPoolRoot
│  └─ GroundProjectilePoolRoot
├─ WorldVfxRoot
└─ BattleDebugRoot
```

### 모선 루트 분리

`MothershipGameplayRoot`는 실제 위치, 선택, 피격 판정과 카메라 추적 기준을 담당한다. `MothershipVisualRoot`는 흔들림, 기울기, 회피 자세, 추락 자세처럼 판정과 직접 관계없는 시각 변형을 담당한다.

이 구조를 사용하면 모선의 정상 이동은 계속 X축으로만 유지하면서도 시각 모델에는 자유로운 3D 연출을 적용할 수 있다.

## 6. 카메라 설계

### 6.1 투영 방식

기본 카메라는 좁은 시야각의 원근 카메라를 사용한다.

- 초기 FOV 권장 범위: 30~40도
- 초기 기준값: 35도
- 사용자 카메라 회전: 비활성
- 사용자 카메라 줌: 비활성
- 일반 전투 중 카메라 Y/Z 이동: 비활성
- 일반 전투 중 카메라 X 이동: 활성

원근 카메라를 선택하는 이유는 모선의 3D 형태와 밑면을 보여주고, 카메라 쪽으로 기울어 추락하는 Z축 연출에서 자연스러운 크기 변화를 얻기 위해서다.

특수 연출을 모두 제거하게 될 경우에만 정사영 카메라를 대안으로 검토한다.

### 6.2 좌우 맵 범위

요구사항의 `현재 화면 크기에서 좌우 약 ±100%`는 다음과 같이 정의한다.

- 현재 카메라가 한 번에 보여주는 가로 월드 폭: `viewportWidth`
- 전체 전투 맵 폭: 약 `viewportWidth × 3`
- 시작 카메라 중심: `X = 0`
- 카메라 중심 이동 범위: 약 `-viewportWidth`부터 `+viewportWidth`

정확한 가로 월드 폭은 화면 비율과 카메라 FOV를 사용해 런타임에 계산한다. 브라우저 크기가 변경되면 카메라 frustum과 이동 경계를 다시 계산한다.

레벨 오브젝트 배치 데이터는 픽셀이나 현재 해상도 대신 정규화된 맵 좌표 또는 월드 좌표로 저장한다.

### 6.3 모선 추적

모선이 움직일 때 맵 전체 노드를 반대 방향으로 이동시키지 않는다. 월드는 고정하고 카메라의 X 위치가 모선을 추적한다.

카메라는 다음 순서로 동작한다.

1. 모선은 화면 중앙 부근의 dead zone 안에서 먼저 움직인다.
2. 모선이 dead zone을 벗어나면 카메라가 부드럽게 따라간다.
3. 카메라가 맵 경계에 도달하면 카메라는 정지하고 모선만 화면 끝 방향으로 움직인다.
4. 모선의 월드 X 위치도 별도의 전투 경계에서 제한한다.

카메라 추적에는 프레임 독립적인 감쇠 또는 spring 보간을 사용하고, 단순 프레임 비율 선형 보간으로 인한 해상도·프레임별 차이를 피한다.

## 7. 2D 배경과 패럴랙스

### 7.1 배경 레이어

도시는 최소 다음 레이어로 나눈다.

1. Skybox: 하늘과 가장 먼 구름
2. City Far: 흐릿한 원거리 스카이라인
3. City Middle: 중거리 고층 건물
4. City Near: 전투 지면 뒤쪽의 가까운 건물
5. Ground: 도로, 옥상, 지면 구조
6. Foreground: 선택적인 전경 잔해, 연기, 가까운 구조물

레이어 수는 최종 아트에 따라 늘릴 수 있지만, 동일한 역할의 이미지를 지나치게 잘게 나누어 draw call과 투명도 정렬 비용을 증가시키지 않는다.

### 7.2 패럴랙스 방식

원근 카메라와 서로 다른 Z 깊이를 이용한 물리적 패럴랙스를 기본으로 사용한다. 별도의 패럴랙스 이동 계수를 추가할 경우 물리적 깊이 효과와 중복되지 않도록 한 방식만 최종 이동량의 기준이 되게 한다.

아트 방향상 실제 깊이만으로 원하는 이동 비율을 얻기 어려운 경우 다음과 같은 제어값을 사용할 수 있다.

| 레이어 | 예시 이동 비율 |
|---|---:|
| Skybox | 0.00 |
| City Far | 0.10~0.20 |
| City Middle | 0.25~0.40 |
| City Near | 0.50~0.70 |
| Ground/게임 오브젝트 | 1.00 |

이 값은 초기 예시이며 실제 이미지 크기, Z 배치와 카메라 FOV를 기준으로 조정한다.

### 7.3 배경 텍스처 제작

- 전체 3화면을 한 장의 초대형 PNG로 제작하지 않는다.
- 각 레이어를 가로 타일 또는 구간 단위로 나눈다.
- 일반적인 런타임 타일 크기는 1024 또는 2048px를 우선한다.
- 투명도가 필요 없는 하늘과 불투명 원경은 WebP 또는 압축 텍스처를 우선한다.
- 알파가 필요한 스카이라인은 원본 PNG와 런타임 압축본을 분리한다.
- 타일 경계에서 선이나 색 차이가 보이지 않도록 bleed 영역을 포함한다.
- 화면 비율이 바뀌어도 배경 아래나 옆이 비지 않도록 overscan 영역을 제작한다.

### 7.4 투명도와 렌더링 순서

2D Plane과 반투명 VFX가 겹칠 때 발생할 수 있는 정렬 문제를 방지하기 위해 다음 규칙을 적용한다.

- 각 배경 계층에 명확한 Z 범위를 할당한다.
- 거의 동일한 Z값에 여러 투명 Plane을 겹치지 않는다.
- 렌더링 계층별 `renderingGroupId`를 고정한다.
- 완전 투명/불투명 경계만 필요한 이미지는 alpha blend보다 alpha test를 우선한다.
- 연기, 빛기둥, 폭발처럼 실제 반투명이 필요한 VFX는 별도 렌더링 그룹으로 분리한다.
- 2D 배경 재질은 기본적으로 조명을 받지 않는 unlit/emissive 방식으로 구성한다.
- 3D 오브젝트와 도시 레이어 사이의 가림 관계를 프로토타입 단계에서 먼저 검증한다.

## 8. 3D 모선

모선은 전투 화면의 hero asset으로 취급하되 웹 브라우저와 모바일 성능을 고려해 제작한다.

### 필수 구성

- GLB 런타임 모델
- LOD 또는 단순화 모델
- PBR 재질
- 무기 발사 소켓
- 드론 출격 소켓
- 피격 및 폭발 VFX 소켓
- 선택/충돌용 단순 proxy mesh
- 필요한 경우 기계 장치용 Animation Group

### 일반 이동

- 사용자 입력은 목표 X 또는 X축 속도만 변경한다.
- 모선의 기본 Y/Z는 전투 설정에서 고정한다.
- 정상 이동 중 모델의 작은 roll이나 지연 흔들림은 `MothershipVisualRoot`에만 적용한다.
- 입력과 시각 애니메이션을 동일 Transform에 누적하지 않는다.

### 잠정 에셋 예산

최종 목표 플랫폼이 확정되기 전까지 다음을 초기 기준으로 사용한다.

- LOD0 삼각형: 약 100k~150k 이하 권장
- 재질 슬롯: 6개 이하 권장
- 기본 텍스처: 재질 세트당 2K 우선
- 4K 텍스처: 명확한 화면상 이득이 있고 데스크톱 품질 분기가 있을 때만 허용
- 충돌: 렌더링 mesh가 아닌 단순 box/sphere/convex proxy 사용

## 9. 전투기와 드론

- 전투기와 드론은 3D GLB 모델로 신규 제작한다.
- 동일 모델이 여러 번 등장하면 Babylon instance 또는 thin instance를 사용한다.
- 개별 유닛마다 고비용 material clone을 생성하지 않는다.
- 엔진 불꽃, 궤적, 피격 불꽃은 메시보다 particle/VFX pool을 우선한다.
- 일반 비행은 XY 평면에서 처리하고, Z축은 교차 비행이나 회피 연출에 제한적으로 사용한다.
- 원거리 소형 유닛은 LOD 또는 단순 silhouette 모델로 전환할 수 있어야 한다.
- 드론 swarm은 모든 개체에 독립된 복잡한 AI를 실행하지 않고 그룹 경로와 로컬 offset을 결합한다.

잠정 모델 예산은 전투기 약 10k~20k 삼각형, 드론 약 5k~10k 삼각형 이하를 우선한다. 실제 동시 등장 수에 따라 더 낮춰야 한다.

## 10. 지상 대공포와 탱크

지상 유닛은 신규 3D 모델 또는 신규 2D Sprite 중 하나를 유닛 종류별로 선택할 수 있다.

### 공통 이동 규칙

- 유닛 생성 시 ground lane을 배정한다.
- lane은 고정된 Y와 Z를 가진다.
- 런타임 이동은 X만 변경한다.
- 지형 경사, NavMesh, 자유 회전 이동은 초기 범위에 포함하지 않는다.
- 포탑 조준은 시각적으로 별도 회전할 수 있지만 차체 이동은 X축으로 제한한다.

### 2D 선택 시

- Babylon Sprite Manager와 atlas를 사용한다.
- 이동, 피격, 발사 상태가 필요하면 신규 sprite animation을 제작한다.
- 화면 좌우 방향에 따라 sprite flip 또는 별도 방향 프레임을 사용한다.
- 3D 발사체와 혼합할 경우 총구 위치를 월드 좌표로 변환하는 socket 규칙을 둔다.

### 3D 선택 시

- 차체와 포탑 Transform을 분리한다.
- 바퀴나 궤도는 셰이더 또는 단순 애니메이션을 우선하고 실제 물리를 사용하지 않는다.
- 지면 그림자는 가까운 유닛에만 제한한다.

## 11. 모선 특수 연출

일반 전투와 특수 연출을 상태로 분리한다.

```text
Gameplay
├─ EvasionCinematic
├─ EntranceCinematic
├─ ExitCinematic
└─ CrashCinematic
```

### 회피기동

- 게임 입력을 잠시 차단하거나 AI 제어로 전환한다.
- `MothershipGameplayRoot`는 필요한 X/Y 경로를 이동한다.
- `MothershipVisualRoot`는 roll, pitch, yaw를 조합한다.
- 원회전은 시간 기반 원호 또는 spline으로 계산한다.
- 연출 종료 시 위치와 회전값을 정상 전투 상태로 명시적으로 정규화한다.

### 추락

- Y 하강, 카메라 방향 Z 이동, pitch/roll을 함께 사용한다.
- 원근 카메라에 가까워지면서 자연스럽게 화면 크기가 증가하게 한다.
- near clipping plane을 통과하기 전에 장면 전환 또는 파괴 연출을 완료한다.
- 추락 중 판정이 필요한지 여부를 상태 진입 시 결정한다.
- 카메라 흔들림은 CameraRig의 시각 offset으로 적용하고 카메라 추적 기준 X와 분리한다.

### 구현 우선순위

특수 연출은 기술적으로 구현 가능하므로 처음부터 제거하지 않는다. 먼저 단순 primitive 모선으로 회피 원호와 카메라 방향 추락을 검증한 뒤, 최종 모델에 적용한다. 성능이나 가독성 문제가 확인될 때에만 범위를 축소한다.

## 12. 조명과 화면 통합

2D 배경과 3D 모델의 이질감을 줄이기 위해 새 에셋 제작 단계부터 같은 광원 조건을 공유한다.

- 주광 방향과 색을 아트 가이드에 고정한다.
- 3D에는 Directional Light와 약한 환경광을 기본으로 사용한다.
- 2D 도시는 동일한 방향의 조명과 그림자를 베이크한다.
- 전체 장면에 공통 fog, contrast, color grading을 적용한다.
- 모선과 가까운 주요 유닛만 실시간 그림자 후보로 둔다.
- 배경 2D Plane은 실시간 그림자를 생성하거나 받지 않는다.
- 폭발과 에너지 빔은 제한된 emissive 및 bloom을 사용한다.
- 과도한 bloom으로 2D 배경의 디테일과 유닛 실루엣이 사라지지 않게 한다.

## 13. 충돌과 물리

초기 전투 구현에서는 Havok 물리를 초기화하지 않는다.

- 모선과 대형 유닛: 단순 box, sphere 또는 복수 hit volume
- 전투기와 드론: sphere 또는 capsule에 준하는 단순 판정
- 발사체: 선분 sweep 또는 단순 거리 판정
- 지상 유닛: lane X 범위 및 단순 hit volume
- 건물 배경: 기본적으로 충돌 없음

화면이 측면 전투 평면으로 제한되어 있으므로 커스텀 판정이 더 단순하고 결정적이다. 실제 3D 강체 상호작용이 게임 규칙으로 확정될 때만 Havok 도입을 다시 검토한다.

## 14. 발사체와 VFX

- 총알과 미사일을 매번 생성·폐기하지 않고 object pool을 사용한다.
- 수많은 작은 발사체는 thin instance 또는 GPU particle을 검토한다.
- 유도 미사일의 판정 좌표와 시각 궤적을 분리할 수 있게 한다.
- 폭발, 연기, 엔진 trail, 에너지 빔용 신규 atlas를 제작한다.
- VFX atlas는 가능하면 여러 효과를 통합해 texture switch를 줄인다.
- 화면 밖 오브젝트와 particle system은 갱신 또는 렌더링을 중지한다.
- 빛기둥 같은 대형 반투명 효과는 도시 레이어와의 렌더링 순서를 별도로 검증한다.

## 15. 스크립트 구성안

Editor에 부착할 스크립트는 역할별로 분리한다.

| 스크립트 | 책임 |
|---|---|
| `BattleSceneController` | 씬 시작·정지, 전투 상태와 하위 시스템 연결 |
| `HorizontalCameraController` | dead zone 추적, X 경계, resize 대응 |
| `MothershipController` | 입력, 일반 X 이동, 전투 경계 제한 |
| `MothershipCinematicController` | 회피·진입·이탈·추락 연출 |
| `ParallaxController` | 배경 깊이 또는 이동 비율 관리 |
| `GroundLaneController` | 지상 유닛 lane과 X축 이동 제한 |
| `AirUnitPoolController` | 전투기·드론 생성, 재사용, 비활성화 |
| `ProjectilePoolController` | 발사체 생성, 이동, 회수 |
| `BattleVfxController` | 폭발, trail, 카메라 흔들림 요청 |
| `BattleDebugController` | 경계, hit volume, FPS, draw call 표시 |

속도, 카메라 감쇠, 경계, 패럴랙스 비율, cinematic 지속시간처럼 반복 조정할 값은 Editor inspector에 노출한다. 씬 노드는 이름 문자열을 매 프레임 검색하지 않고 시작 시 연결하거나 캐시한다.

## 16. React 앱과 전투 씬 연결

현재 React 화면과 Babylon 전투 화면의 책임을 다음과 같이 분리한다.

- 메인 메뉴, 월드 맵, 도시 선택: React DOM/SVG
- 실제 전투 공간: Babylon canvas 및 Editor scene
- HUD: 추후 React DOM 또는 Babylon GUI 중 별도 결정
- 전투 진입: 필요한 시점에 Babylon 모듈과 전투 씬 지연 로드
- 전투 종료: 씬, observer, particle, texture 참조를 해제하고 React 화면으로 복귀

예상 소스 경계는 다음과 같다.

```text
assets/
└─ battlescene.scene/              # Babylon Editor 원본 씬

src/game/battle/
├─ BattleScreen.tsx                # Canvas 생명주기와 React 연결
├─ battleSceneLoader.ts            # 패킹된 씬 로드·해제
├─ battleContracts.ts              # 캠페인과 전투 사이 계약
└─ runtime/                         # Editor 부착 스크립트가 아닌 앱 측 어댑터

src/scripts/battlescene/
├─ battleSceneController.ts
├─ horizontalCameraController.ts
├─ mothershipController.ts
├─ mothershipCinematicController.ts
├─ parallaxController.ts
└─ ...
```

실제 폴더명은 Editor가 생성하는 스크립트 맵과 충돌하지 않는지 첫 프로토타입에서 확인한 뒤 확정한다.

Editor 씬을 변경한 뒤에는 `npm run generate`로 배포용 `.babylon` 씬과 스크립트 맵을 생성하고, 그 다음 Next.js 빌드를 실행한다.

### 16.1 동일 전투 화면과 맵 패키지 교체

배틀 화면은 하나의 공통 씬과 하나의 렌더링 코드를 사용한다. 맵 스타일이 늘어날 때 Babylon 씬을 복제하지 않고 맵 manifest와 이미지 패키지만 추가한다.

```text
assets/battlescene/
├─ shared/
│  └─ mothership/mapping/             # 모든 맵에서 공유하는 모선 이미지
└─ maps/
   ├─ city-day/
   │  ├─ map.manifest.json
   │  └─ backgrounds/
   ├─ city-night/
   └─ desert-day/
```

맵 manifest는 `sky`, `far`, `middle`, `near`, `ground`, `foregroundAtmosphere` 슬롯과 패럴랙스, 카메라, ground lane 설정을 제공한다. 전투 로더는 `BattleLaunchRequest.mapId`로 manifest를 선택한 뒤 공통 배경 Plane의 Material/Texture만 교체한다.

manifest에는 `/scene/assets/`를 포함하지 않는 key를 저장하고, 로더가 공통 prefix를 붙인다.

```text
key: battlescene/maps/city-day/backgrounds/city-far-day.webp
URL: /scene/assets/battlescene/maps/city-day/backgrounds/city-far-day.webp
```

이 구조에서 모선 GLB, 전투기, 드론, 지상 유닛 같은 3D 공통 에셋은 `shared/`에 둔다. 특정 맵에서 모선 이미지나 발광 색만 달라져야 할 때에만 manifest에 override를 추가한다.

현재 `scripts/pack-editor.mjs`는 1차 메뉴·월드맵 빌드에 전투 에셋이 섞이지 않도록 `assets/battlescene/`을 임시 제외한다. 전투 화면을 연결하는 단계에서는 별도 `generate:battle` 패킹 경로를 만들거나 이 제외 목록을 제거해야 한다. 맵별 파일은 빌드 산출물에 존재할 수 있지만, 브라우저는 선택된 map manifest가 참조하는 파일만 요청하도록 lazy loading한다.

## 17. 신규 에셋 인벤토리

### 3D

- 모선 LOD0/LOD1/LOD2
- 전투기 종류별 모델과 LOD
- 드론 종류별 모델과 LOD
- 대공포 종류별 모델 또는 2D 대체본
- 탱크 종류별 모델 또는 2D 대체본
- 미사일처럼 화면에서 크기가 충분한 발사체 모델
- 단순 충돌 proxy

### 2D

- 하늘 또는 Skybox용 신규 이미지 세트
- 원경 도시 타일
- 중경 도시 타일
- 근경 도시 타일
- 지면·도로 타일
- 전경 구조물·잔해
- 2D 지상 유닛을 선택할 경우 해당 sprite atlas
- 폭발, 연기, 엔진 trail, muzzle flash VFX atlas

### 재질과 텍스처

- 모선 PBR texture set
- 전투기·드론 PBR texture set
- 지상 유닛 PBR texture set
- emissive mask
- damage/decal atlas
- 공통 environment texture

### 선택 항목

- 전투 사운드와 음악
- 파괴 단계별 모선 모델 또는 texture variant
- 날씨 및 시간대별 배경 variation

## 18. 에셋 파일 규칙

- 런타임 3D 형식은 GLB를 우선한다.
- 편집 원본은 런타임 `public` 폴더에 넣지 않는다.
- 파일명은 영문 소문자와 하이픈 또는 프로젝트 표준 snake case 중 하나로 통일한다.
- 모델 scale과 축 방향을 export 전에 통일한다.
- texture set의 색공간을 명시한다.
- 동일 재질에서 사용할 texture 해상도와 UV density를 맞춘다.
- 숨겨진 불필요 mesh, camera, light를 GLB에 포함하지 않는다.
- 애니메이션 이름은 `idle`, `deploy`, `fire`, `damage`, `destroy`처럼 런타임 계약과 일치시킨다.
- 각 에셋은 게임에서의 화면 크기와 동시 등장 수를 기준으로 최적화한다.

## 19. 웹 배포 이미지 최적화

이 프로젝트는 설치형 게임이 아니라 웹 빌드로 배포하므로 이미지 최적화는 선택 사항이 아닌 에셋 승인 조건으로 취급한다. 원본 이미지의 파일 용량만 줄이는 것이 아니라 네트워크 전송량, 브라우저 디코딩 시간, GPU 업로드 시간과 GPU 메모리를 함께 측정한다.

WebP나 AVIF로 전송 용량을 줄이더라도 GPU에 업로드된 뒤에는 대개 비압축 RGBA 메모리를 사용할 수 있다. 따라서 Babylon 씬에서 사용하는 대형 텍스처는 웹 이미지 포맷만 적용하고 끝내지 않고 KTX2 GPU 압축까지 검토한다.

### 19.1 원본과 런타임 파일 분리

- PSD, Krita, Blender, EXR, 무손실 마스터 PNG 같은 제작 원본은 `assets` 또는 `public` 런타임 경로에 넣지 않는다.
- Babylon.js Editor에서 사용하는 입력 텍스처는 압축 전 원본 품질을 보존한다.
- `npm run generate` 결과에 런타임에 실제 필요한 크기와 포맷만 포함되게 한다.
- 같은 이미지의 원본, 중간 산출물, 런타임 압축본이 동시에 배포되지 않도록 출력 manifest를 검사한다.
- GLB에 포함된 embedded texture는 Editor가 추출한 뒤 압축 파이프라인에서 추적할 수 있어야 한다.

### 19.2 용도별 기본 포맷

| 이미지 용도 | 기본 포맷 | 규칙 |
|---|---|---|
| 불투명 2D 도시·배경 | WebP | Babylon 텍스처 호환성과 디코딩 비용을 우선한 기본값 |
| 매우 큰 정적 불투명 이미지 | AVIF 후보 | WebP보다 실제 이득이 있고 목표 브라우저에서 디코딩 지연이 허용될 때만 사용 |
| 투명 스카이라인·전경 | WebP alpha 또는 PNG 입력 + KTX2 출력 | 가장자리 품질과 압축 artifact를 실기기에서 비교 |
| Sprite/VFX atlas | PNG 입력 + KTX2 런타임 출력 우선 | 알파와 프레임 경계 bleed 필수 |
| 3D PBR 텍스처 | PNG/TGA 등 제작 입력 + KTX2 런타임 출력 | GPU 메모리와 texture bandwidth 절감을 우선 |
| 환경 조명 | Babylon `.env` | 원본 HDR을 그대로 배포하지 않음 |
| 마스크·ORM | 채널 패킹 텍스처 + KTX2 | 별도 grayscale 파일 수를 줄임 |

Babylon canvas에서 직접 사용하는 이미지의 기본 웹 포맷은 우선 WebP로 한다. AVIF는 파일 크기만 보고 일괄 적용하지 않는다. 큰 AVIF의 디코딩 지연이 전투 진입 시간을 늘리거나 Babylon Editor 및 목표 브라우저 조합에서 문제가 없는지 측정한 뒤 선택한다.

PNG는 제작 입력, 픽셀 단위의 정확한 마스크, 압축 artifact가 허용되지 않는 소형 UI/atlas 등에 제한한다. 대형 도시 배경을 무손실 PNG 그대로 배포하지 않는다.

### 19.3 KTX2 GPU 압축

Babylon.js Editor의 KTX-Software 방식으로 KTX2 압축을 활성화한다. KTX2는 단순 네트워크 파일 압축과 달리 GPU 메모리 사용량과 texture bandwidth를 줄이기 위한 런타임 최적화다.

- 개발 환경에 Babylon.js Editor가 지원하는 Khronos KTX-Software 4.x를 설치한다.
- Editor의 `Edit -> Project -> Editor -> Textures -> Enabled`를 활성화한다.
- 최종 패킹 품질은 `Normal`에서 비교를 시작하고 주요 hero texture만 `High` 필요성을 검토한다.
- `Enabled in preview`는 에디터 반복 작업 속도와 결과 확인 필요에 따라 활성화한다.
- 현재 `project.bjseditor`의 `compressedTexturesEnabled`와 `compressedTexturesEnabledInPreview`는 모두 `false`이므로 B0/B1 작업에서 설정을 변경하고 결과를 검증한다.
- 앱에서 전투 씬을 로드하기 전에 `babylonjs-editor-tools`의 `setUseKtx2CompressedTextures(true)`를 호출한다.
- KTX2를 사용할 수 없거나 제외된 텍스처를 위한 원본 포맷 fallback을 유지한다.
- 알파 경계, normal map, ORM 채널은 압축 artifact에 민감하므로 색상 텍스처와 별도의 품질 검수를 수행한다.

Editor CLI는 프로젝트 설정에서 압축이 활성화되어 있으면 `npm run generate` 시 KTX2 산출물을 생성한다. 압축 산출물의 존재만 확인하지 말고 실제 런타임 네트워크 요청이 KTX2를 선택하는지 브라우저 개발자 도구로 검증한다.

### 19.4 크기와 해상도 기준

- 일반적인 2D 배경 타일과 PBR 텍스처는 2048px 이하를 기본으로 한다.
- 모바일 공통 경로에서 4096px 텍스처는 예외 승인 대상으로 둔다.
- 8K 단일 배경 텍스처는 사용하지 않는다.
- 멀리 있는 City Far 텍스처는 화면상 픽셀 밀도에 맞춰 1024px 또는 그 이하도 허용한다.
- 화면에 작게 보이는 전투기·드론에 모선과 같은 해상도의 텍스처를 할당하지 않는다.
- Sprite/VFX atlas는 최대 크기보다 실제 동시 사용 프레임과 texture switch 감소 효과를 기준으로 나눈다.
- mipmap이 필요한 텍스처는 축소 단계의 번짐과 atlas frame 침범을 방지할 padding을 포함한다.
- 반복 타일은 압축 후에도 경계 색이 연속되는지 확인한다.

이미지 해상도는 원본 제작 해상도가 아니라 최종 화면에서 차지하는 최대 픽셀 크기를 기준으로 결정한다. 예를 들어 화면에서 최대 600px 폭으로 보이는 유닛에 항상 4K texture를 사용하는 방식은 허용하지 않는다.

### 19.5 품질 등급

Canvas 해상도만 낮추는 방식으로 끝내지 않고 텍스처 자체에도 품질 등급을 둔다.

```text
Low/Mobile
├─ City: 저해상도 타일
├─ 3D: 낮은 LOD와 1K 중심 텍스처
└─ VFX: 작은 atlas와 낮은 particle 수

Medium
├─ City: 1K~2K 타일
├─ 3D: 중간 LOD와 1K~2K 텍스처
└─ VFX: 표준 atlas

High/Desktop
├─ City: 필요 구간만 고해상도
├─ 3D: LOD0와 2K 중심 텍스처
└─ VFX: 고품질 atlas와 효과 수 증가
```

기기 이름으로 품질을 결정하지 않고 WebGL/WebGPU 기능, GPU 정보, 메모리 신호, 실제 프레임 성능과 사용자 설정을 조합한다. 전투 도중 texture 전체를 빈번히 교체하지 않고 씬 진입 전에 품질 등급을 결정한다.

### 19.6 로딩과 네트워크

- 전투 씬과 전투 에셋은 월드맵 첫 화면에서 즉시 로드하지 않는다.
- 도시 선택 또는 전투 준비 단계에서 중앙 구간과 모선 같은 핵심 에셋을 prefetch할 수 있다.
- 최초 화면에 필요한 중앙 배경, 모선, 기본 VFX를 우선 로드한다.
- 좌우 외곽 배경과 아직 등장하지 않는 적 variation은 후순위로 로드한다.
- 큰 이미지를 JavaScript나 CSS에 base64로 인라인하지 않는다.
- GLB, `.babylon`, JSON과 binary mesh에는 서버 Brotli/Gzip을 적용한다.
- WebP, AVIF, KTX2처럼 이미 압축된 파일을 서버에서 다시 압축해 CPU를 낭비하지 않는다.
- CDN을 사용하고 파일명이 content hash 또는 명시적인 asset version을 포함할 때 장기 immutable cache를 적용한다.
- 동일 URL의 내용을 덮어써 캐시 불일치를 만들지 않는다.
- 전투 진입 로딩 화면은 byte 진행률보다 실제 필수 에셋 준비 상태를 기준으로 완료한다.

### 19.7 잠정 전송 예산

최종 모델과 목표 기기가 정해지기 전까지 다음 값을 초기 경고 기준으로 사용한다.

- 모바일 최초 전투 표시 필수 다운로드: 12MB 이하 권장
- 데스크톱 최초 전투 표시 필수 다운로드: 25MB 이하 권장
- 모바일 한 전투의 전체 신규 다운로드: 25MB 이하 권장
- 데스크톱 High 한 전투의 전체 신규 다운로드: 50MB 이하 권장
- 압축된 단일 2D 배경 타일: 가능하면 1MB 이하
- 예고 없이 2MB를 넘는 단일 texture 파일: 검토 대상

이 값은 강제 최종 수치가 아니라 에셋이 비정상적으로 커지는 것을 조기에 발견하기 위한 기준이다. 실제 화질과 로딩 시간 측정 결과에 따라 문서에 근거를 남기고 조정한다.

### 19.8 웹 이미지 검증 체크리스트

- [ ] 배포 결과에 PSD, EXR, 무손실 마스터 등 제작 원본이 포함되지 않았는가?
- [ ] 대형 2D PNG가 WebP/AVIF/KTX2 없이 그대로 제공되지 않는가?
- [ ] KTX2 지원 환경에서 실제 `.ktx2` 요청이 발생하는가?
- [ ] KTX2 미지원 또는 제외 경로에서 fallback 이미지가 정상 로드되는가?
- [ ] mobile/medium/high 품질별 texture 크기가 실제로 달라지는가?
- [ ] 알파 스카이라인과 VFX 가장자리에 검은 테두리나 색 번짐이 없는가?
- [ ] normal map과 ORM 압축 후 조명 또는 금속성이 깨지지 않는가?
- [ ] 전투 최초 표시까지 전송된 byte와 소요 시간이 예산 안에 있는가?
- [ ] 느린 모바일 네트워크에서 중앙 필수 에셋이 외곽 variation보다 먼저 로드되는가?
- [ ] 전투 종료 후 texture가 해제되고 재진입 시 중복 다운로드·중복 메모리가 발생하지 않는가?

## 20. 성능 기준

초기 잠정 목표는 다음과 같다.

- 일반 데스크톱: 60 FPS 목표
- 지원 대상 모바일: 30 FPS 이상 유지
- device pixel ratio 상한 또는 Babylon hardware scaling 적용
- 동일 유닛은 instance/thin instance 사용
- 발사체, 폭발, 드론은 풀링
- 화면 밖 유닛의 렌더링과 AI 갱신 제한
- 배경에 단일 8K급 텍스처 사용 금지
- 실시간 그림자 생성자 수 제한
- 텍스처 압축 적용 전후 GPU 메모리와 시각 품질 비교

프로토타입부터 Babylon Inspector 또는 debug overlay로 다음 항목을 기록한다.

- FPS와 frame time
- active meshes
- draw calls
- 총 삼각형 수
- texture 메모리 추정치
- particle 수
- 동시 발사체와 유닛 수

최종 성능 예산은 실제 목표 모바일 기기와 최대 동시 유닛 수가 정해진 뒤 확정한다.

## 21. 화면 비율과 리사이즈

- 16:9를 기본 작화 기준으로 사용한다.
- 18:9, 19.5:9, 20:9에서 더 넓게 보이는 영역을 고려한다.
- 세로 표시 범위를 우선 고정하고 가로 표시 범위를 aspect ratio로 계산한다.
- 브라우저 resize 시 camera projection, viewport world width, X 경계를 다시 계산한다.
- 지나치게 넓은 화면에서 전투 밖 빈 공간이 보이지 않도록 배경에 overscan을 둔다.
- 모바일 세로 화면 정책은 기존 `MobileLandscapeGuard`가 담당하며 전투 씬은 가로 화면을 기준으로 한다.

HUD는 제외하지만 향후 HUD가 화면 가장자리를 가릴 수 있으므로 모선의 기본 위치와 주요 전투 연출은 중앙 안전 영역 안에서 읽히도록 구성한다.

## 22. 구현 단계

### B0 — 기술 회색상자

- 신규 `battlescene` Editor scene 생성
- primitive 모선, 전투기, 지상 유닛 배치
- 고정 원근 카메라 구성
- 일반 모선 X축 이동 구현
- 맵 폭 3화면 및 카메라 X 경계 검증

완료 기준: 최종 에셋 없이도 좌우 이동과 카메라 경계가 요구사항대로 동작한다.

### B1 — 2D 도시 레이어

- 임시 신규 테스트 이미지로 Far/Middle/Near/Ground 레이어 구성
- 카메라 이동에 따른 패럴랙스 검증
- 투명도와 렌더링 그룹 규칙 확정
- 화면 비율별 타일 이음새 검증

완료 기준: 카메라 전 구간에서 배경이 비거나 깜빡이지 않고 3D 오브젝트와 순서가 안정적이다.

### B2 — 모선 리그

- 신규 모선 GLB 반입
- GameplayRoot와 VisualRoot 분리
- 무기·드론·VFX 소켓 연결
- LOD와 단순 충돌 proxy 구성
- 기본 이동 시각 반응 구현

완료 기준: 모선 모델 교체 후에도 이동과 카메라 추적 코드 수정이 필요하지 않다.

### B3 — 전투 유닛

- 신규 전투기와 드론 반입
- instance/pool 구성
- 신규 지상 대공포·탱크 반입 또는 Sprite Manager 구성
- ground lane과 X축 제한 구현
- 발사체 풀과 단순 피격 판정 구현

완료 기준: 목표 최대 수량의 임시 전투를 성능 저하 없이 반복 실행할 수 있다.

### B4 — 특수 애니메이션

- 회피 원회전 prototype
- 카메라 방향 추락 prototype
- 연출 상태 진입·종료 처리
- 입력, 충돌, 카메라 추적과의 충돌 방지
- near plane과 화면 이탈 조건 처리

완료 기준: 연출 종료 후 정상 전투 상태로 복귀하거나 의도한 전투 종료 흐름으로 전환된다.

### B5 — 신규 아트와 VFX 통합

- 최종 신규 도시 레이어 적용
- 신규 하늘과 환경광 적용
- 신규 VFX atlas와 particle 적용
- 2D/3D 조명, fog, 색보정 통합
- 최종 모델 LOD와 texture 압축 적용

완료 기준: 초안의 구도를 따르되 기존 에셋에 의존하지 않는 독립적인 전투 비주얼이 완성된다.

### B6 — 앱 연결과 최적화

- 월드맵/미션에서 전투 씬 진입 연결
- 지연 로드와 로딩 상태 구현
- 전투 종료 후 scene dispose 검증
- 데스크톱과 목표 모바일 성능 측정
- `npm run generate`, typecheck, test, production build 검증

완료 기준: 전투에 반복 진입·이탈해도 메모리와 이벤트 observer가 누적되지 않는다.

## 23. 검증 체크리스트

### 카메라와 이동

- [ ] 모선의 사용자 조작 이동이 X축으로만 제한되는가?
- [ ] 카메라가 X축 외의 위치나 회전을 변경하지 않는가?
- [ ] 시작점 기준 좌우 약 한 화면 거리까지 탐색 가능한가?
- [ ] 카메라와 모선이 각자의 월드 경계를 넘지 않는가?
- [ ] 서로 다른 FPS에서도 추적 감각이 동일한가?

### 배경

- [ ] 모든 도시 에셋이 신규 제작물인가?
- [ ] 초안 이미지 일부가 런타임 텍스처로 포함되지 않았는가?
- [ ] 전 이동 구간에서 배경 타일 이음새가 보이지 않는가?
- [ ] 16:9와 긴 모바일 화면에서 빈 영역이 노출되지 않는가?
- [ ] 투명 레이어가 카메라 이동 중 순서가 바뀌거나 깜빡이지 않는가?

### 3D 유닛

- [ ] 모선, 전투기, 드론이 신규 GLB인가?
- [ ] 반복 유닛이 instance 또는 pool을 사용하는가?
- [ ] 지상 유닛의 차체 이동이 X축으로 제한되는가?
- [ ] 렌더링 mesh와 충돌 proxy가 분리되어 있는가?

### 특수 연출

- [ ] 회피기동 중 일반 입력과 AI 이동이 충돌하지 않는가?
- [ ] 추락 중 카메라 near plane을 뚫고 보이는 문제가 없는가?
- [ ] 연출 종료 후 Transform에 잔여 회전이나 Z offset이 남지 않는가?
- [ ] 연출 중 피격 판정 정책이 명시적으로 적용되는가?

### 성능과 생명주기

- [ ] 목표 동시 유닛과 발사체 수에서 성능 기준을 만족하는가?
- [ ] 전투 재진입 시 mesh, texture, observer, particle이 누적되지 않는가?
- [ ] 압축 텍스처가 지원되지 않는 환경에 fallback이 있는가?
- [ ] 화면 밖 유닛과 VFX가 불필요하게 갱신되지 않는가?
- [ ] 품질 등급별 최초 전투 다운로드가 웹 전송 예산 안에 있는가?
- [ ] KTX2가 활성화된 빌드에서 GPU 메모리 감소가 확인되는가?

## 24. 구현 전에 확정할 제품 값

다음 항목은 기술 차단 요소는 아니지만 최종 에셋 제작과 성능 예산에 영향을 준다.

- 한 전투에서 동시에 보일 수 있는 전투기, 드론, 지상 유닛의 최대 수
- 모선이 화면에서 차지해야 하는 최소·최대 비율
- 목표 모바일 최소 사양과 목표 FPS
- 낮/밤/새벽 배경을 별도 에셋으로 제작할지 색보정 variation으로 만들지 여부
- 지상 유닛 중 어떤 종류를 2D로 만들고 어떤 종류를 3D로 만들지 여부
- 특수 회피기동 중에도 사용자가 공격할 수 있는지 여부
- 추락 연출이 전투 화면 안에서 끝나는지 별도 결과 화면으로 이어지는지 여부
- 도시 배경의 파괴 상태를 정적 variation으로 만들지 런타임 decal/VFX로 표현할지 여부

## 25. 현재 프로젝트에서의 다음 작업

현재 Editor 프로젝트에는 기본 `example.scene`만 존재하고 실제 전투 씬은 없다. 첫 구현 작업은 최종 에셋 제작이 아니라 B0 기술 회색상자로 시작한다.

권장 첫 작업 범위는 다음과 같다.

1. Babylon.js Editor 5.4.x에서 프로젝트를 열고 프로젝트 메타데이터를 갱신한다.
2. `battlescene` 신규 씬을 생성한다.
3. primitive 모선과 3개의 임시 배경 Plane을 배치한다.
4. 원근 카메라의 FOV와 깊이 구성을 확정한다.
5. 모선 X 이동, 카메라 dead zone, 좌우 ±100% 경계를 구현한다.
6. 회피 원회전과 카메라 방향 추락을 primitive로 짧게 검증한다.
7. 결과가 확정된 뒤 신규 에셋의 화면 크기, 카메라 각도, texture 규격을 아트 제작 기준으로 전달한다.

이 순서를 따르면 최종 신규 에셋을 제작한 뒤 카메라나 월드 비율이 바뀌어 에셋을 다시 만드는 위험을 줄일 수 있다.

## 참고 문서

- [Babylon.js Editor Documentation](https://editor.babylonjs.com/documentation)
- [Composing a Scene](https://editor.babylonjs.com/documentation/basics/composing-scene)
- [Adding Scripts](https://editor.babylonjs.com/documentation/basics/adding-scripts)
- [Common Script Decorators](https://editor.babylonjs.com/documentation/scripting/common-decorators)
- [Using Sprite Manager](https://editor.babylonjs.com/documentation/sprites/using-sprite-manager)
- [Babylon.js Editor CLI](https://editor.babylonjs.com/documentation/deploying/babylonjs-editor-cli)
- [Compressing Textures](https://editor.babylonjs.com/documentation/advanced/compressing-textures)
