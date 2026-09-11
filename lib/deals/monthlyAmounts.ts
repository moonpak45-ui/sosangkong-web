// lib/deals/monthlyAmounts.ts
//
// 마이페이지/대시보드 카드의 "월별 매출·매입 추이" 집계. deals.confirmed_at은
// timestamptz라 그냥 slice(0,7)하면 UTC 기준 월이 나와 자정 근처(KST
// 00~09시)에 확정된 거래가 하루 전 달로 잘못 집계될 수 있어 KST로 보정한다
// (lib/saju/calcSaju.ts, lib/deals/statementGroups.ts와 동일한 패턴).

export type MonthlyAmount = { label: string; amount: number; monthKey: string }

function toKstDate(iso: string): Date {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
}

function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * 최근 monthsCount개월(이번 달 포함)의 월별 합계를 만든다. 거래가 없는
 * 달도 0으로 채워서 진짜 추이가 보이게 한다.
 */
export function buildMonthlyAmounts(
  rows: { amount: number; confirmed_at: string }[],
  monthsCount = 6
): MonthlyAmount[] {
  const nowKst = toKstDate(new Date().toISOString())
  const indexByKey = new Map<string, number>()

  const buckets: MonthlyAmount[] = []
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth() - i, 1))
    const monthKey = monthKeyOf(d)
    indexByKey.set(monthKey, buckets.length)
    buckets.push({ label: `${d.getUTCMonth() + 1}월`, amount: 0, monthKey })
  }

  for (const r of rows) {
    const monthKey = monthKeyOf(toKstDate(r.confirmed_at))
    const idx = indexByKey.get(monthKey)
    if (idx !== undefined) buckets[idx].amount += Number(r.amount)
  }

  return buckets
}

export function currentMonthTotal(monthly: MonthlyAmount[]): number {
  return monthly.length > 0 ? monthly[monthly.length - 1].amount : 0
}
