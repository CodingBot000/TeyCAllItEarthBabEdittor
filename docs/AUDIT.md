# 문서 조사 및 정리 기록

**작성일: 2026-08-27 · 최종 수정일: 2026-08-27**

**변경 이력**

| 날짜 | 구분 | 내용 |
| --- | --- | --- |
| 2026-08-27 | 수정 | 작성일·최종 수정일·변경 이력 추가 |
| 2026-08-27 | 작성 | 조사 계획·검증 결과·원문 통합표·백업 복원 방법 기록 |

조사 기준: 2026-08-27, 커밋 `084d4c3`. 이 작업은 문서 정비이며 게임 동작을 변경하지 않는다.

## 조사 계획

1. 기존 문서의 원문을 보존하고 파일별 통합 목적지를 기록한다.
2. `GameApp`에서 실제 진입 가능한 화면과 캠페인 명령을 추적한다.
3. 도시 진입 조건, 이동 비용, 자원 수입·소비, 업그레이드, 코호트, 점령, 저장을 대조한다.
4. `BattleGateway` → 전투 규칙 → Babylon 런타임 → HUD의 연결을 추적한다.
5. 기존 기획을 구현 완료·부분 구현·미연결·레거시·결정 필요로 분류한다.
6. 코드 근거와 재현 조건을 포함한 현행 문서와 개선 목록을 작성한다.
7. 통합을 마친 원문을 활성 문서에서 제거하고 링크·수치·검증 결과를 확인한다.

## 판정 원칙

- 실제 호출 경로와 상태 변경을 현재 사양의 기준으로 삼는다. 문서 날짜나 완료 표시만으로 구현을 단정하지 않는다.
- 정적 확인, 실행 검증, 과거 기록, 제품 결정이 필요한 제안을 구분한다.
- 저장 호환성 코드·타입·번역·에셋의 존재는 플레이 가능한 기능의 증거가 아니다.
- 미연결 기능은 생성 → 표시 → 사용 → 저장의 전체 경로를 확인한다.
- 스테이지 번호가 없다면 도시·난이도·점령 상태를 임의로 스테이지 해금 조건으로 바꾸지 않는다.
- 기존 계획의 미완료 항목과 에디터 운영상 주의사항도 통합 후 원문을 삭제한다.

## 원문 백업

- 파일: `backups/documentation-2026-08-27-084d4c3.tar.gz`
- 포함: 기존 `docs/**/*.md` 20개와 루트 `README.md`, `progress.md`, `mothership_destroyed_implement.md` 3개.
- 내부 `MANIFEST.json`: 기준 커밋, 생성 시각, 각 파일 경로·바이트 수·SHA-256.
- 아카이브 SHA-256: `22f1a093d31cb5448315760ef7f177ed409df578ef8d9f01e9a3c0bc36b5599f`.
- 생성 직후 아카이브 안의 23개 파일 내용을 원문 해시와 대조했다.
- 참고 이미지와 아트 에셋은 삭제하지 않는다.

## 조사 범위와 결과

기존 docs 문서 20개와 루트 작업 기록 2개를 검토해 현행 문서 8개에 통합했다. 루트 README는 실행 안내와 새 문서 입구로 갱신했다. 에셋 제작 README와 참고 이미지는 삭제 대상에서 제외했다.

`src`의 TS/TSX 93개(`src/game` 90개, 테스트 19개 포함)를 목록화하고 화면 진입점·캠페인·전투·저장·업그레이드·번역·시각 연결을 추적했다. 모든 파일의 모든 줄과 전체 에셋을 개별 검증했다는 뜻은 아니다. 월드 8권역·50국가·259도시, 출격 가능 도시 8곳, 업그레이드 26종을 코드와 대조했다.

| 조사 질문 | 확인한 결과 | 상세 |
| --- | --- | --- |
| 전체 흐름과 목적 | 8개 실제 화면, 정산·배분 루프, 최종 승리 화면 없음 | [전체 구성](GAME_SYSTEMS.md) |
| 스테이지별 오픈 조건 | 8도시 처음부터 가능, 나머지 비활성. 주기는 승패와 무관한 낮·밤 교대 | [캠페인](CAMPAIGN.md) |
| 코어 아이템 사용처 | 코어 충전·전투 에너지·DATA/RELIC·연구 명칭을 구분. 별도 인벤토리 없음 | [성장·경제](PROGRESSION.md) |
| 실제 전투 시스템 | 판정과 VFX, 자동 병력과 강하 버튼, 일반/디버그 경로 분리 | [전투](BATTLE.md) |
| 고장·미연결·미완 기획 | 근거와 완료 조건을 포함한 19개 항목 | [개선 목록](GAPS.md) |
| 보존해야 할 운영 지식 | Editor 계층 안전 절차·아트·무기 기획·검증 명령 | [개발 운영](TECHNICAL.md) |

## 실제 실행 검증

2026-08-27 로컬 체크아웃에서 실행했다. 임시 재현 코드는 시스템 임시 디렉터리에서 실행했고 제품 코드·의존성·테스트 파일은 변경하지 않았다.

| 검사 | 결과 | 의미 / 제한 |
| --- | --- | --- |
| 백업 무결성 | 통과: 원문 23개와 SHA-256 대조 | 삭제 전 재대조 포함 |
| `npm test` | 통과: 19개 파일 / 110개 테스트 | 신규 발견 이슈를 모두 커버한다는 뜻은 아님 |
| `npm run typecheck` | 통과 | 도메인 수치와 Zod 범위 불일치는 타입 검사로 검출되지 않음 |
| `npm run build` | 통과: 정적 페이지 생성 완료, 종료 코드 0 | production 브라우저 실행까지 검증한 것은 아님 |
| `npm run lint` | 실패: 6 errors / 2 warnings | 소스 effect 오류 1, 기존 `.vercel/output` 번들 오류 5, img 경고 2. [SYS-019](GAPS.md#sys-019) |
| `npm run check:battle:compression` | 명령 성공, WebP fallback | toktx/basisu 미설치. KTX2 렌더링 검증 아님 |
| 직접 도메인 재현 | 저장·배분·자원·셀·DATA 문제 확인 | 아래 표 참조 |
| 브라우저 기본 흐름 | 새 캠페인·편성·이동·전투·대파·배분·재출격 확인 | 개발 서버, 1280×720, 한국어, fast/debug 미사용 |
| 대표 E2E 전체 | 미실행 | 기존 기록의 통과 결과와 구분 |
| Editor pack·생성기 | 미실행 | 문서 감사에서 에셋을 재생성하지 않음 |

### 독립 도메인 재현

실제 export를 가져와 메모리의 캠페인 상태로 호출했다. 저장 재현은 임시 Map 기반 `localStorage`를 써서 사용자의 브라우저 저장에 접근하지 않았다. 전투 결과를 직접 구성한 경우는 장시간 정상 플레이가 아니라 경계조건 테스트다.

| 항목 | 설정·실행 | 관찰 |
| --- | --- | --- |
| 강화 저장 | seed 90210, 충분한 지갑, 실제 neural-foundry/conditioning 구매, 포로 5,000 변환, save/load | strength 108, 스키마 거부, load null, corrupt 백업 존재 |
| 배분 차단 | 예비고 50,000, 회수 포로 101, 세 교리 기본안 검증 | 모두 `BIOMASS INPUT MUST USE 100 CAPTIVES` |
| 유기물 고갈 | 서울 ORGANIC pool 0, 세션 생성 후 실제 군중 등록 함수 호출 | 방공호 11,663 + 군중 25,000 = 36,663 |
| 셀 미소모 | 셀 3개 편성 상태에서 overdrive, 이후 대파 정산 | 셀 3→3, 에너지 1,000→600, 셀 비용 24 중 4 회수 |
| DATA 잠금 | seed 5, 연결 레이더 EMP 후 파괴 | AVAILABLE→LOCKED, 잔량 4,276 |
| 화면비 접근성 | 카메라·이동 한계·군중 반경 공식 계산 | 16:9에서 최외곽 군중을 가까운 흡수 대상으로 선택할 수 없음 |

회귀 테스트를 추가할 때는 [GAPS](GAPS.md)의 입력·기대 동작·완료 조건을 사용한다. 임시 실행 파일의 머신별 경로에 의존하지 않는다.

### 브라우저 관찰

별도 localhost 포트 3012에 신규 테스트 캠페인을 만들었다. 첫 화면이 정상 렌더링됐고 초기 브라우저 로그 검사에서 오류가 없었다. 개발 서버에는 Tailwind 유틸리티 미검출 경고가 있었다.

1. 서울 편성: 시작 코어 48/100, 비용 0, 셀 0, 점령 잠김. 셀을 소모한다는 오래된 설명 확인.
2. 첫 전투: `CITY NIGHT`, 선체 1,200·에너지 1,000·화물 35,000·생존 75초. 일반 플레이에는 무적/전체 디버그 패널이 없었다.
3. 조작 없이 경과한 한 표본에서 40.1초에 실패, 바이오매스 54/합금 36 수리비·포로 0 배분 확인. 이 한 표본으로 전체 난이도를 결론 내리지 않았다.
4. 배분 확정 후 지도 주기 02, 서울 ‘영공 진입’으로 편성 없이 `CITY DAY` 진입. 대파 복구 선체 600·실드 800 확인.
5. 셀 구매 없이 오버드라이브 클릭 성공, 에너지 감소·18초 쿨다운·발동 메시지 확인. 이후 포기했으나 선체가 남은 상태에서도 대파 제목이 표시되는 문제 확인.

전투와 결과 화면 스크린샷을 육안 검토했다. 첫 능력 클릭 시도는 자연 대파로 화면이 바뀌어 실행하지 못했으므로 성공으로 세지 않았고 두 번째 전투에서 다시 확인했다. 개발 서버는 검사 후 종료했다.

미검증 범위: 정상 시간의 점령 성공 완주, 8도시 장기 캠페인, 모바일 실기기·여러 브라우저, FPS/VRAM 측정, 모든 음원의 청음, 전체 E2E, production 브라우저 실행, Editor 저장·재열기 왕복, 새 의존성 보안 감사. 빌드·단위 테스트 통과로 이 범위를 대신하지 않는다.

## 기존 문서 통합표

아래 경로는 **백업 안의 원문 식별자**다. 완료된 체크리스트·명령 로그·반복 회고는 백업에 보존하고, 활성 문서에는 현재 결과와 필요한 운영 지식을 옮겼다.

| 원문 경로 | 통합 목적지와 처리 |
| --- | --- |
| `docs/PHASE_1_MIGRATION_PLAN.md` | TECHNICAL: 현재 구조·도구. 완료된 1차 이식을 미구현 목록에서 제외 |
| `docs/MIGRATION_ISSUES.md` | TECHNICAL: CLI·패키징, GAPS SYS-019: 검증·의존성 후속. 과거 보안 수치 재사용 금지 |
| `docs/BATTLE_RUNTIME_BOUNDARY.md` | TECHNICAL: 엔진 독립 경계. unavailable gateway는 현행에서 제외 |
| `docs/MOTHERSHIP_UPGRADE_RESEARCH.md` | PROGRESSION: 현행 26종, GAPS: 미연결 효과·후속 선택 |
| `docs/MOTHERSHIP_UPGRADE_IMPLEMENTATION_MISMATCHES.md` | GAPS SYS-009/013: 남은 불일치. 연결된 플라즈마·EMP·방어 효과는 완료 사양으로 교정 |
| `docs/MOTHERSHIP_UPGRADE_SKILL_TREE_DEVELOPMENT_PLAN.md` | PROGRESSION: 분기·선행·비용, GAPS: 밸런스·슬롯 검토 |
| `docs/battlescene/BATTLE_SCENE_DEVELOPMENT_PLAN.md` | TECHNICAL: 씬/에셋 파이프라인, GAPS SYS-016: 최종 아트·압축 |
| `docs/battlescene/BATTLE_SCENE_IMPLEMENTATION_PLAN.md` | BATTLE·TECHNICAL: 실제 장면 구성, GAPS: 미실측 성능 목표 |
| `docs/battlescene/BATTLE_SCENE_ISSUES.md` | TECHNICAL: CANNON·모선 파트 복구 이력. 과거 ‘문제 없음’ 판정은 폐기 |
| `docs/battlescene/ASSET_PRODUCTION_LIST.md` | TECHNICAL: 제작 계약, GAPS SYS-016: 미완 제작 범위 |
| `docs/battlescene/BATTLE_2D_GAMEPLAY_DEVELOPMENT_PLAN.md` | CAMPAIGN·BATTLE·PROGRESSION: 구현된 루프, GAPS: 제외 범위 |
| `docs/battlescene/BATTLE_2D_GAMEPLAY_CORRECTION_PLAN.md` | BATTLE: 현재 규칙, GAPS SYS-003: 자원 지속성 회귀 |
| `docs/battlescene/ABSORPTION_BEAM_V2_IMPLEMENTATION_PLAN.md` | BATTLE: 실제 빔·인간 실루엣, TECHNICAL: 테스트. 현재 상수로 교체 |
| `docs/battlescene/FIGHTER_FORMATION_ORBIT_REDESIGN_PLAN.md` | BATTLE: 후속 실제 3D 구현으로 대체된 시각 오프셋 계획 정리 |
| `docs/battlescene/FIGHTER_FORMATION_TRUE_3D_ORBIT_REDESIGN_PLAN.md` | BATTLE: 실제 궤도·안전 공간·공격, TECHNICAL: 회귀 검사 |
| `docs/battlescene/FIGHTER_FRAME_GHOSTING_ROOT_FIX_PLAN.md` | TECHNICAL: autoClear·후처리 초기화·잔상 회귀 검증 |
| `docs/battlescene/GROUND_DEFENSE_WEAPON_LIST.md` | GAPS SYS-014: 무기 8종·현실 군사 장비 방향·지원 장비 기획 |
| `docs/battlescene/GROUND_UNIT_ATTACK_POSITIONING_AI_PLAN.md` | BATTLE: SAM 이동/사격, GAPS SYS-014: 무기·분산·포탑 미완 |
| `docs/battlescene/GROUND_UNIT_SHADOW_IMPLEMENTATION_PLAN.md` | BATTLE·TECHNICAL: 공유 지상 그림자·에셋 기준선 |
| `docs/battlescene/MOTHERSHIP_HIERARCHY_INCIDENT_AND_RETRY_GUIDE.md` | TECHNICAL: 원본/패키지/런타임 구분·생성기 주의·59파트/배경 검증 |
| `progress.md` | 전체 현행 문서: 최근 셀·음향·군중·빔·전투기 변경을 코드와 대조 |
| `mothership_destroyed_implement.md` | BATTLE: 대파 시퀀스, TECHNICAL: 저장소 독립성·에셋 실패 처리 |
| `README.md` | 실행 안내·문서 입구 교체. 원문은 백업 보존 |

## 백업 복원 방법

저장소 루트에서 **비어 있는 별도 임시 디렉터리**에 푼 뒤 필요한 원문만 비교한다. 현재 docs 위에 바로 덮어쓰지 않는다.

```bash
shasum -a 256 backups/documentation-2026-08-27-084d4c3.tar.gz
audit_restore_dir=$(mktemp -d)
tar -xzf backups/documentation-2026-08-27-084d4c3.tar.gz -C "$audit_restore_dir"
```

출력 해시를 위 값과 대조하고, 복원 디렉터리의 `MANIFEST.json`으로 파일별 SHA-256도 확인한다. 원문 전체를 다시 활성화하지 말고 필요한 이력만 읽는다. 이 백업은 문서만 포함하며 게임 저장·아트·코드 전체 백업은 아니다.

## 최종 점검

- 조사 계획 1~7 완료. 활성 docs는 8개 Markdown, 루트 README는 새 문서 입구로 정리했다.
- 새 문서와 루트 README의 로컬 링크·앵커 216개 확인: 누락 없음. 에셋 제작 문서를 포함한 저장소의 현재 Markdown 12개에서도 끊어진 로컬 경로 없음.
- 코드에서 추출한 업그레이드 ID 26개·레벨별 비용 78개와 문서 표 일치. 8개 도시의 등급·낮 맵·시설 수·필수 점령 노드도 일치.
- 아카이브 원문 23개 해시 검증, 삭제 전 기존 문서 22개가 백업과 동일함을 다시 확인. 모든 원문의 통합 목적지가 위 표에 있음.
- `git diff --check` 통과. 추적 파일의 변경 범위는 Markdown뿐이며 게임 코드·설정·lockfile·에셋·참고 이미지는 변경하지 않음.
- 테스트 중 Next.js가 만든 `next-env.d.ts`의 dev 경로 변경은 최종 build 후 원래 내용과 같음을 확인. 커밋·배포·게임 버그 수정은 수행하지 않음.
