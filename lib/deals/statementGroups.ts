// lib/deals/statementGroups.ts
//
// "거래명세서" 목록용 그룹핑. app/partner/dashboard/deals/page.tsx의
// groupDeals()와 동일한 규칙(같은 확정일 + 같은 상대방 거래를 한 장으로
// 묶어 인쇄 화면 하나로 연결)을 buyer/partner 양쪽에서 재사용할 수 있게
// 일반화한 버전.

export type DealStatus = 'in_progress' | 'completed' | 'disputed'

export type StatementSourceDeal<C> = {
  id: string
  amount: number
  status: DealStatus
  confirmed_at: string
  counterpartId: string
  counterpart: C
}

export type StatementGroup<C> = {
  key: string
  dateLabel: string
  confirmedDate: string // YYYY-MM-DD (KST) — 탭/날짜범위 필터링용
  counterpartId: string
  counterpart: C
  dealIds: string[]
  totalAmount: number
  status: DealStatus
}

const STATUS_PRIORITY: Record<DealStatus, number> = { disputed: 2, in_progress: 1, completed: 0 }

// confirmed_at은 timestamptz라 그냥 slice(0,10)하면 UTC 기준 날짜가 나와
// 자정 근처(KST 00~09시)에 확정된 거래가 하루 전 명세서로 묶이는 문제가
// 있다 — lib/saju/calcSaju.ts에서 쓴 것과 동일한 KST 보정을 적용한다.
function toKstDateString(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateLabel(dateStr: string): string {
  return dateStr.replaceAll('-', '.')
}

export function groupDealsIntoStatements<C>(deals: StatementSourceDeal<C>[]): StatementGroup<C>[] {
  const map = new Map<string, StatementGroup<C>>()

  for (const d of deals) {
    const confirmedDate = toKstDateString(d.confirmed_at)
    const key = `${confirmedDate}__${d.counterpartId}`
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        dateLabel: formatDateLabel(confirmedDate),
        confirmedDate,
        counterpartId: d.counterpartId,
        counterpart: d.counterpart,
        dealIds: [],
        totalAmount: 0,
        status: d.status,
      }
      map.set(key, group)
    }
    group.dealIds.push(d.id)
    group.totalAmount += Number(d.amount)
    if (STATUS_PRIORITY[d.status] > STATUS_PRIORITY[group.status]) group.status = d.status
  }

  return Array.from(map.values()).sort((a, b) => (a.confirmedDate < b.confirmedDate ? 1 : -1))
}

/** 한국 시간(KST) 기준 오늘 날짜 문자열(YYYY-MM-DD) — 당일/지난 탭 구분 기준. */
export function todayKstDateString(): string {
  return toKstDateString(new Date().toISOString())
}
