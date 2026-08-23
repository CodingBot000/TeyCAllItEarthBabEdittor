import type { CityDefinition, CountryDefinition } from '../domain/types';
import type { Language } from './I18nProvider';

const KOREAN_CITY_NAMES: Record<string, string> = {
  seoul: '서울', tokyo: '도쿄', 'new-york': '뉴욕', london: '런던', shanghai: '상하이', paris: '파리', dubai: '두바이', cairo: '카이로',
};

const KOREAN_CONTENT_LABELS: Record<string, string> = {
  'coastal-megacity': '해안 거대 도시', 'ocean-arcology': '항만 관측 타워', 'coastal-transit': '북부 교통로', 'coastal-civic': '시민 핵심 구역', 'coastal-industrial': '산업 지대', 'coastal-strategic': '전략 전력망',
  'transit-convoy': '교통 수송대', 'downtown-crowd': '도심 인구', 'residential-crowd': '주거 지역 인구', 'west-fabricators': '제조 라인', 'grid-battery-cache': '전력망 배터리 저장고', 'power-turbines': '발전 터빈', 'radar-datacore': '레이더 데이터 코어', 'airbase-prototype': '공군 기지 시제품', 'arcology-archive': '항만 타워 기록고',
  'coastal-command': '도시 지휘부', 'coastal-comms': '통신 노드', 'coastal-power': '전력 제어부', 'coastal-guard-command': '지휘 경비대', 'coastal-guard-comms': '통신 경비대', 'coastal-guard-power': '전력 경비대',
  'river-metropolis': '강변 대도시', 'hydro-data-spire': '수력 제어 타워', 'river-approach': '북부 접근로', 'river-west': '서쪽 강변', 'river-east': '동쪽 강변', 'river-defense': '방어 회랑',
  'north-logistics': '연구 물류', 'west-bank-pop': '서쪽 강변 인구', 'east-bank-pop': '동쪽 강변 인구', 'port-machinery': '항만 기계 설비', 'river-grid-station': '강변 전력망 기지', 'airbase-fleet': '공군 기지 함대', 'north-radar-data': '북부 레이더 기록고', 'research-relic': '연구소 양자 배열', 'hydrospire-core': '수력 제어 코어',
  'river-command': '수력 지휘부', 'river-comms': '북부 통신', 'river-east-lock': '동쪽 강변 수문', 'river-guard-command': '수력 경비대', 'river-guard-comms': '북부 통신 경비대', 'river-guard-lock': '동쪽 수문 경비대',
  'desert-tech-hub': '사막 기술 거점', 'solar-crown-citadel': '사막 태양 연구 타워', 'desert-approach': '북부 둑길', 'desert-core': '기술 핵심 구역', 'desert-industry': '동부 산업 지대', 'desert-energy': '서부 전력망',
  'causeway-convoy': '자율 수송대', 'tech-core-pop': '기술 핵심 인구', 'industry-workers': '산업 노동 인구', 'factory-assembly': '로봇 조립 설비', 'thermal-storage-banks': '열 저장 뱅크', 'power-reactors': '핵융합 반응로', 'lab-a-data': '연구소 A 데이터 금고', 'lab-b-relic': '실험 코어', 'citadel-reactor': '태양 연구 코어',
  'desert-command': '기술 지휘부', 'desert-comms': '연구 통신', 'desert-power': '전력 제어부', 'desert-guard-command': '기술 경비대', 'desert-guard-comms': '연구 경비대', 'desert-guard-power': '전력 경비대',
  harvest: '흡수 목표 달성', landmark: '랜드마크 코어 흡수', extract: '탈출 구역 도달',
};

const KOREAN_UPGRADES: Record<string, { label: string; group: string; description: string }> = {
  'beam-capacity': { label: '흡수 광선 용량', group: '수확', description: '단계당 흡수 속도 +20%' },
  'beam-radius': { label: '흡수 광선 반경', group: '수확', description: '단계당 흡수 반경 +1.0' },
  'beam-efficiency': { label: '흡수 광선 효율', group: '수확', description: '단계당 광선 열 증가량 -10%' },
  'cargo-bay': { label: '화물칸', group: '수확', description: '단계당 화물 용량 +10,000' },
  'plasma-damage': { label: '플라즈마 피해', group: '무장', description: '단계당 타격 피해 +15%' },
  'shield-capacity': { label: '실드 용량', group: '방어', description: '단계당 최대 실드 +120' },
  'energy-core': { label: '에너지 코어', group: '방어', description: '단계당 에너지 +120, 재생 +4' },
  'scanner-array': { label: '스캐너 배열', group: '유틸리티', description: '단계당 스캔 범위 +6' },
  'signature-dampener': { label: '신호 감쇠기', group: '유틸리티', description: '단계당 광선 경보 -10%' },
  'selective-filter': { label: '선별 필터', group: '수확', description: '단계당 임무 수확량 +12%' },
  'neural-foundry': { label: '신경 주조소', group: '군단', description: '단계당 전환 수용량 +1' },
  'command-bandwidth': { label: '지휘 대역폭', group: '군단', description: '단계당 동시 지휘 대역폭 +1' },
  'drop-capacity': { label: '투하 수용량', group: '군단', description: '단계당 코호트 투하 수용량 +1' },
  'cohort-conditioning': { label: '코호트 조율', group: '군단', description: '단계당 기본 전력·이동 +8%, 강습 피해 +10%' },
  'recovery-protocol': { label: '회수 프로토콜', group: '군단', description: '단계당 코호트 손실 -12%, 실패 화물 회수 +10%' },
  'core-reservoir': { label: '코어 저장소', group: '에너지', description: '단계당 최대 코어 충전 +20' },
  'capacitor-rack': { label: '축전기 랙', group: '에너지', description: '단계당 과충전 셀 수용량 +1' },
  'emp-duration': { label: 'EMP 지속 시간', group: '무장', description: '단계당 EMP 지속 시간 +20%' },
  'emergency-bio-conversion': { label: '비상 생체 전환', group: '에너지', description: '단계당 비상 코어 충전 +4' },
  'threat-forecast': { label: '위협 예측', group: '유틸리티', description: '단계당 예상 경보 압력 -15%' },
};

const KOREAN_ENUMS: Record<string, string> = {
  UNTOUCHED: '미접촉', RAIDED: '습격됨', BREACHED: '돌파됨', OCCUPIED: '점령됨', ASSIMILATED: '동화됨',
  SUCCESS: '성공', PARTIAL: '부분 성공', FAILED: '실패', ACTIVE: '진행 중',
  AVAILABLE: '사용 가능', LOCKED: '잠김', HIDDEN: '숨김', DEPLETED: '고갈됨', DESTROYED: '파괴됨',
  ORGANIC: '유기체', POWER: '전력', VEHICLE: '차량', MACHINERY: '기계', DATA: '데이터', RELIC: '유물',
  RESERVE: '예비', DEPLOYED: '배치됨', GARRISON: '주둔', LOST: '손실', ASSAULT: '강습', SABOTEUR: '공작', HARVEST: '수확',
  IDLE: '대기', MOVE: '이동', SECURE: '확보', RETREAT: '후퇴',
  STABLE: '안정', WARM: '가열', CRITICAL: '위험', OVERHEATED: '과열',
  LOW: '낮음', BALANCED: '균형', HIGH: '높음', AUTO: '자동', DAY: '낮', NIGHT: '밤',
  LEGION: '군단 집중', SUSTAIN: '유지', ENERGY: '에너지', CARGO: '화물', TARGET: '표적',
};

const KOREAN_RUNTIME_TEXT: Record<string, string> = {
  'INITIALIZING TACTICAL SCENE': '전술 장면 초기화 중',
  'TACTICAL SCENE LOAD FAILED': '전술 장면을 불러오지 못했습니다',
  'BEAM ARMED — SELECT AN ABSORBABLE TARGET': '흡수 광선 준비 완료 — 흡수할 표적을 선택하세요',
  'BEAM UNAVAILABLE': '흡수 광선을 사용할 수 없습니다',
  'SCAN UNAVAILABLE': '스캔을 사용할 수 없습니다',
  'PLASMA ARMED — SELECT A GROUND TARGET': '플라즈마 준비 완료 — 지상 표적을 선택하세요',
  'PLASMA UNAVAILABLE': '플라즈마를 사용할 수 없습니다',
  'EMP ARMED — SELECT A DEFENSE CLUSTER': 'EMP 준비 완료 — 방어 구역을 선택하세요',
  'EMP UNAVAILABLE': 'EMP를 사용할 수 없습니다',
  'SHIELD OVERDRIVE ENGAGED': '실드 오버드라이브 가동',
  'OVERDRIVE UNAVAILABLE': '오버드라이브를 사용할 수 없습니다',
  'SHIELD CHARGE UNAVAILABLE': '실드를 충전할 수 없습니다',
  'AIM CANCELLED': '조준 취소됨',
  'NO PENDING DEBRIEF': '처리 대기 중인 보고가 없습니다',
  'UNKNOWN DOCTRINE': '알 수 없는 전환 교리입니다',
  'COHORT CAPACITY EXCEEDED': '코호트 수용량을 초과했습니다',
  'BIOMASS INPUT MUST USE 100 CAPTIVES': '바이오매스 투입은 포획 인원 100명 단위여야 합니다',
  'INVALID CAPTIVE RESERVE': '포획 인원 예비분이 올바르지 않습니다',
  'CAPTIVE RESERVE FULL': '포획 인원 예비 수용 공간이 가득 찼습니다',
  'GARRISON ONLY APPLIES TO OCCUPATION': '주둔군은 점령 임무에만 배정할 수 있습니다',
  'CAPTIVE ALLOCATION MUST BALANCE': '포획 인원 배분 총합이 일치해야 합니다',
  'OCCUPATION NOT READY': '점령 준비가 완료되지 않았습니다',
  'GARRISON REQUIRED': '주둔군이 필요합니다',
  'INVALID GARRISON CANDIDATE': '선택할 수 없는 주둔군 후보입니다',
  'GARRISON COHORT UNAVAILABLE': '주둔 코호트를 사용할 수 없습니다',
  'CITY UNAVAILABLE': '도시를 이용할 수 없습니다',
  'DEBRIEF REQUIRES ALLOCATION': '보고 배분을 먼저 완료해야 합니다',
  'TRAVEL ALREADY IN PROGRESS': '이미 이동 중입니다',
  'MISSION ALREADY PLANNED': '이미 임무가 계획되어 있습니다',
  'MISSION ID REQUIRED': '임무 ID가 필요합니다',
  'CITY MUST BE BREACHED FIRST': '먼저 도시를 돌파해야 합니다',
  'OVERCHARGE CELL LIMIT': '과충전 셀 한도를 초과했습니다',
  'COHORT NOT IN RESERVE': '코호트가 예비 상태가 아닙니다',
  'COHORT TYPE LOCKED': '이 코호트 유형은 사용할 수 없습니다',
  'COHORT HAS NO STRENGTH': '코호트 전력이 없습니다',
  'TRAVEL COST OUTDATED': '이동 비용 정보가 변경되었습니다',
  'CELL COST OUTDATED': '셀 비용 정보가 변경되었습니다',
  'INSUFFICIENT CORE CHARGE': '코어 충전량이 부족합니다',
  'ABDUCTION STOPPED': '흡수 중단',
  'ABDUCTION STOPPED — COURSE CHANGED': '흡수 중단 — 항로 변경됨',
  'ABDUCTION STOPPED — IMPACT DETECTED': '흡수 중단 — 충격 감지됨',
  'ABDUCTION STOPPED — ENERGY DEPLETED': '흡수 중단 — 에너지 고갈',
  'TARGET DEPLETED — SELECT ANOTHER OBJECT': '표적 고갈 — 다른 표적을 선택하세요',
  'ABDUCTION STOPPED — TARGET LOCKED': '흡수 중단 — 표적 잠김',
  'ABDUCTION STOPPED — OUT OF RANGE': '흡수 중단 — 사거리 밖',
  'ABDUCTION STOPPED — CARGO FULL, EXTRACT NOW': '흡수 중단 — 화물칸이 가득 찼습니다. 지금 철수하세요',
  'ABDUCTION SECURED — EXTRACTION IN PROGRESS': '흡수 확보 — 철수 진행 중',
  'ABDUCTION STOPPED — BEAM OVERHEATED, RECOVERING': '흡수 중단 — 광선 과열, 회복 중',
  'TARGET REJECTED — ATTACKING CONTACTS CANNOT BE ABSORBED': '표적 거부 — 공격 중인 접촉체는 흡수할 수 없습니다',
  'HULL FAILURE — LOSING ALTITUDE': '선체 파손 — 고도 상실 중',
  'TARGET UNAVAILABLE': '표적을 사용할 수 없습니다',
  'SECTOR UNAVAILABLE': '구역을 사용할 수 없습니다',
  'COHORT UNAVAILABLE': '코호트를 사용할 수 없습니다',
  'COHORT ORDER UNAVAILABLE': '코호트 명령을 사용할 수 없습니다',
};

export function displayCityName(city: CityDefinition, language: Language): string {
  return language === 'ko' ? KOREAN_CITY_NAMES[city.id] ?? city.localName : city.name;
}

export function displayCountryName(country: CountryDefinition, language: Language): string {
  return country.name[language];
}

export function displayContentLabel(id: string, fallback: string, language: Language): string {
  return language === 'ko' ? KOREAN_CONTENT_LABELS[id] ?? fallback : fallback;
}

export function displayUpgrade(id: string, fallback: { label: string; group: string; description: string }, language: Language) {
  return language === 'ko' ? KOREAN_UPGRADES[id] ?? fallback : fallback;
}

export function displayEnum(value: string, language: Language): string {
  return language === 'ko' ? KOREAN_ENUMS[value] ?? value : value;
}

export function displayRuntimeText(value: string, language: Language): string {
  if (language !== 'ko') return value;
  const scan = value.match(/^SCAN COMPLETE — (\d+) NEW SIGNALS$/);
  if (scan) return `스캔 완료 — 새 신호 ${scan[1]}개`;
  const target = value.match(/^TARGET LOCKED — (.+)$/);
  if (target) return `표적 고정 — ${target[1]}`;
  const abducting = value.match(/^ABDUCTING — (.+)$/);
  if (abducting) return `흡수 중 — ${abducting[1]}`;
  const course = value.match(/^COURSE SET — (.+)\. SCAN ON ARRIVAL\.$/);
  if (course) return `항로 설정 — ${course[1]}. 도착 후 스캔하세요.`;
  const selected = value.match(/^COHORT SELECTED — (.+)$/);
  if (selected) return `코호트 선택 — ${selected[1]}`;
  const shield = value.match(/^SHIELD CHARGED \+(\d+)$/);
  if (shield) return `실드 충전 +${shield[1]}`;
  const maxCohorts = value.match(/^MAX (\d+) COHORTS$/);
  if (maxCohorts) return `최대 코호트 ${maxCohorts[1]}개까지 선택할 수 있습니다`;
  const cooldown = value.match(/^COOLDOWN (\d+(?:\.\d+)?)s$/);
  if (cooldown) return `재사용 대기시간 ${cooldown[1]}초`;
  return KOREAN_RUNTIME_TEXT[value] ?? value;
}

export function displayCityNameFromEnglish(value: string, language: Language): string {
  if (language !== 'ko') return value;
  const entry = Object.entries(KOREAN_CITY_NAMES).find(([id]) => id === value.toLowerCase().replaceAll(' ', '-'));
  return entry?.[1] ?? value;
}
