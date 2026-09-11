// lib/saju/calcSaju.ts

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 그레고리력 날짜 → 율리우스적일(JDN). Richards' algorithm(Fliegel & Van
// Flandern, 1968) 정수 연산 버전 — 윤년 규칙까지 정확히 반영하는 표준 공식.
function toJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * 60갑자 일진 계산. 일진은 절기·음력과 무관하게 60일 주기로 계속 순환하는
 * 값이라 그레고리력 날짜만 있으면 계산할 수 있다.
 *
 * 보정 기준: 2000-01-01(양력)은 무오일(戊午) — 해당 날짜의 JDN(2451545)과
 * 갑자를 0으로 둔 60진 인덱스(戊=4, 午=6 → 54)로 역산한 offset(49)을 사용.
 */
export function calcIljin(year: number, month: number, day: number): { pillar: string } {
  const jdn = toJdn(year, month, day);
  const index = (((jdn + 49) % 60) + 60) % 60;
  return { pillar: `${GAN[index % 10]}${ZHI[index % 12]}` };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 한국 시간(KST, UTC+9) 기준 오늘 날짜의 일진.
 * 서버(Vercel 등)는 UTC로 도는 경우가 많아 그냥 new Date()로 날짜를 자르면
 * 자정 이후 9시간 동안 어제 날짜로 계산되는 문제가 있어 KST로 보정한다.
 */
export function calcTodayIljin(): { pillar: string; date: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();

  const { pillar } = calcIljin(year, month, day);
  return { pillar, date: `${year}-${pad2(month)}-${pad2(day)}` };
}
