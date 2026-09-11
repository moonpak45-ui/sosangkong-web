// lib/saju/buildBazi.ts
//
// 사주 4주(년/월/일/시) 계산. 일주만 다루는 calcSaju.ts(오늘의 일진용)와
// 달리, 년주/월주는 절기(특히 입춘) 경계에 걸려서 단순 날짜 계산으로는
// 틀리기 쉽고, 음력→양력 변환도 매년 다른 실제 음력 데이터가 있어야 한다.
// 직접 구현하는 대신 절기/음력 계산이 검증된 lunar-javascript(6tail,
// MIT, 의존성 없음)에 위임한다.
import { Lunar, Solar } from 'lunar-javascript'
import { GAN_OHAENG, Ohaeng } from './relationType'

// 지지 오행 (지지 자체가 가진 오행 — 사업/매출/거래운 문구뱅크와 무관하게
// 프로필의 오행 분포 표시용으로만 쓰인다)
const ZHI_OHAENG: Record<string, Ohaeng> = {
  '子': '수', '丑': '토', '寅': '목', '卯': '목', '辰': '토', '巳': '화',
  '午': '화', '未': '토', '申': '금', '酉': '금', '戌': '토', '亥': '수',
}

export type BaziInput = {
  year: number
  month: number
  day: number
  hour: number | null
  minute: number | null
  isLunar: boolean
  isLeapMonth: boolean
}

export type BaziResult = {
  yearPillar: string
  monthPillar: string
  dayPillar: string
  hourPillar: string | null
  dayGan: string
  ohaengDistribution: Record<Ohaeng, number>
}

export function calcBazi(input: BaziInput): BaziResult {
  const hasTime = input.hour !== null
  const hour = input.hour ?? 0
  const minute = input.minute ?? 0

  // lunar-javascript는 윤달을 월(month)에 음수를 넣는 방식으로 표현한다.
  const lunar = input.isLunar
    ? Lunar.fromYmdHms(input.year, input.isLeapMonth ? -input.month : input.month, input.day, hour, minute, 0)
    : Solar.fromYmdHms(input.year, input.month, input.day, hour, minute, 0).getLunar()

  // 년주는 입춘(立春) 기준(전통 사주/만세력 관례) — 기본 getYearInGanZhi()는
  // 음력 설 기준이라 다름. 월주는 절기 기준 그대로(getMonthInGanZhi).
  const yearPillar: string = lunar.getYearInGanZhiByLiChun()
  const monthPillar: string = lunar.getMonthInGanZhi()
  const dayPillar: string = lunar.getDayInGanZhi()
  const hourPillar: string | null = hasTime ? lunar.getTimeInGanZhi() : null
  const dayGan: string = lunar.getDayGan()

  const pillars = [yearPillar, monthPillar, dayPillar, ...(hourPillar ? [hourPillar] : [])]

  const ohaengDistribution: Record<Ohaeng, number> = { '목': 0, '화': 0, '토': 0, '금': 0, '수': 0 }
  for (const pillar of pillars) {
    ohaengDistribution[GAN_OHAENG[pillar[0]]] += 1
    ohaengDistribution[ZHI_OHAENG[pillar[1]]] += 1
  }

  return { yearPillar, monthPillar, dayPillar, hourPillar, dayGan, ohaengDistribution }
}
