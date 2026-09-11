// lib/saju/relationType.ts

export type Ohaeng = '목' | '화' | '토' | '금' | '수';
export type RelationType = '생' | '극' | '합' | '충' | '비화';

export const GAN_OHAENG: Record<string, Ohaeng> = {
  '甲': '목', '乙': '목',
  '丙': '화', '丁': '화',
  '戊': '토', '己': '토',
  '庚': '금', '辛': '금',
  '壬': '수', '癸': '수',
};

// 천간합 (갑기합토, 을경합금, 병신합수, 정임합목, 무계합화)
const CHEONGAN_HAP: Record<string, string> = {
  '甲': '己', '己': '甲',
  '乙': '庚', '庚': '乙',
  '丙': '辛', '辛': '丙',
  '丁': '壬', '壬': '丁',
  '戊': '癸', '癸': '戊',
};

// 상생 순환: 목생화, 화생토, 토생금, 금생수, 수생목
const SANGSAENG: Record<Ohaeng, Ohaeng> = {
  '목': '화', '화': '토', '토': '금', '금': '수', '수': '목',
};

// 상극 순환: 목극토, 토극수, 수극화, 화극금, 금극목
const SANGGEUK: Record<Ohaeng, Ohaeng> = {
  '목': '토', '토': '수', '수': '화', '화': '금', '금': '목',
};

// 지지충 (자오충, 축미충, 인신충, 묘유충, 진술충, 사해충)
const JIJI_CHUNG: Record<string, string> = {
  '子': '午', '午': '子',
  '丑': '未', '未': '丑',
  '寅': '申', '申': '寅',
  '卯': '酉', '酉': '卯',
  '辰': '戌', '戌': '辰',
  '巳': '亥', '亥': '巳',
};

/**
 * 사용자의 일간(dayGan)과 오늘 일진(todayPillar, 예: '甲子')의 관계를 판정한다.
 * 우선순위: 충 > 합 > 생/극 > 비화
 */
export function getRelationType(dayGan: string, todayPillar: string): RelationType {
  const todayGan = todayPillar[0];

  // 1. 지지충 체크 — 사용자 일주의 지지가 없으므로, 오늘 지지가 충 관계인 경우
  //    (day_pillar 전체를 넘겨받아 비교하는 방식으로 확장 가능. 여기서는 천간 기준 우선 판정)
  // NOTE: 정밀 판정을 위해서는 사용자 dayPillar 전체(간+지)를 인자로 받는 것을 권장.
  //       1차 버전은 천간(일간) 기준으로만 판정한다.

  if (CHEONGAN_HAP[dayGan] === todayGan) return '합';

  const myOhaeng = GAN_OHAENG[dayGan];
  const todayOhaeng = GAN_OHAENG[todayGan];

  if (myOhaeng === todayOhaeng) return '비화';
  if (SANGSAENG[todayOhaeng] === myOhaeng) return '생'; // 오늘 오행이 나를 생함
  if (SANGSAENG[myOhaeng] === todayOhaeng) return '생'; // 내가 오늘 오행을 생함 (베풂도 길하게 처리)
  if (SANGGEUK[todayOhaeng] === myOhaeng || SANGGEUK[myOhaeng] === todayOhaeng) return '극';

  return '비화';
}

/**
 * 지지까지 고려한 정밀 버전 (dayPillar 전체를 알고 있을 때 사용)
 */
export function getRelationTypePrecise(dayPillar: string, todayPillar: string): RelationType {
  const dayZhi = dayPillar[1];
  const todayZhi = todayPillar[1];

  if (JIJI_CHUNG[dayZhi] === todayZhi) return '충';

  return getRelationType(dayPillar[0], todayPillar);
}
