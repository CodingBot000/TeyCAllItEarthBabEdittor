# They Call It Earth

**현행본 작성일: 2026-08-27 · 최종 수정일: 2026-08-27**

**변경 이력**

| 날짜 | 구분 | 내용 |
| --- | --- | --- |
| 2026-08-27 | 수정 | 작성일·최종 수정일·변경 이력 추가 |
| 2026-08-27 | 개정 | 실행 안내와 현행 게임 문서 입구로 전면 개정 |

외계 모선으로 도시를 습격·점령하는 싱글 플레이 웹 게임. React 세계 지도와 Babylon.js Editor 기반 측면 2.5D 전투를 사용한다.

## 게임 문서

**[docs/README.md](docs/README.md)에서 시작한다.** 현재 코드 기준 사양과 미구현 기획을 구분해 관리한다.

| 문서 | 내용 |
| --- | --- |
| [전체 구성](docs/GAME_SYSTEMS.md) | 게임 목적·전체 루프·구현 상태·코어/아이템 용어 |
| [캠페인](docs/CAMPAIGN.md) | 도시 오픈 조건·낮/밤·편성·점령·결과·저장 |
| [전투](docs/BATTLE.md) | 실제 in-battle 조작·흡수·능력·적과 아군 AI·연출 |
| [성장과 경제](docs/PROGRESSION.md) | 자원 사용처·포로·코호트·26개 업그레이드 |
| [개발 운영](docs/TECHNICAL.md) | 구조·Editor 안전 절차·에셋·디버그·검증 명령 |
| [오류와 누락](docs/GAPS.md) | 근거·재현·우선순위·결정 사항·완료 조건 |
| [조사 기록](docs/AUDIT.md) | 검증 결과·기존 문서 통합표·원문 백업 복원 |

## 실행과 검사

CI 기준 Node 24와 lockfile을 사용한다.

```bash
npm ci
npm run dev                 # localhost:3000
npm run typecheck
npm test
npm run build
npm run lint
npm run check               # typecheck + test + build
npm run test:e2e:side-view   # dev/prod 서버를 기동하는 대표 브라우저 검사
npm run check:full          # check + lint + 대표 브라우저 검사
```

개발 전투 바로 가기는 `/?debug=battle&city=seoul`. 개발용 옵션·저장 격리·자동화 훅의 한계는 [개발 운영](docs/TECHNICAL.md)을 먼저 확인한다. 알려진 기존 lint 실패와 검증하지 않은 범위는 [조사 기록](docs/AUDIT.md)에 명시했다.

## Babylon.js Editor

`project.bjseditor`를 열어 씬을 편집한 뒤 `npm run generate:battle`로 웹 패키지를 갱신한다. 일반 `generate`는 battle 폴더를 제외하므로 용도가 다르다.

**`scripts/create-battle-editor-scene.mjs`는 원본 씬 재생성 도구다.** 단순 패키징·모선 계층 정리 목적으로 실행하지 않는다. 원본·패키지·런타임 부모 관계의 차이와 필수 백업/왕복 검증 절차는 [개발 운영](docs/TECHNICAL.md)에 있다.

게임 코드가 바뀌면 해당 시스템 문서와 관련 `SYS-xxx` 항목을 함께 갱신한다. 완료 작업을 별도 계획서·누적 일지로 중복 관리하지 않는다.
