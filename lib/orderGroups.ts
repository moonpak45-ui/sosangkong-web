import { supabase } from './supabaseClient'

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export type OrderGroup = {
  id: string
  group_name: string
  delivery_days: number[]
  cutoff_time: string // 'HH:MM:SS'
  allow_after_cutoff: boolean
}

export type DeliveryEstimate = { date: Date; wasAfterCutoff: boolean }

// 마감 전: 오늘부터(오늘 포함) 가장 빠른 배송요일 / 마감 후: 오늘은
// 건너뛰고 그 다음 배송요일. allow_after_cutoff=true인 그룹은 이 계산을
// 건너뛰고 null을 반환(호출부에서 "기존처럼 즉시 처리"로 취급).
export function computeExpectedDelivery(
  group: Pick<OrderGroup, 'delivery_days' | 'cutoff_time' | 'allow_after_cutoff'>,
  now: Date = new Date()
): DeliveryEstimate | null {
  if (group.allow_after_cutoff) return null
  if (!group.delivery_days || group.delivery_days.length === 0) return null

  const [h, m, s] = group.cutoff_time.split(':').map((v) => Number(v))
  const cutoffToday = new Date(now)
  cutoffToday.setHours(h, m, s || 0, 0)
  const wasAfterCutoff = now.getTime() > cutoffToday.getTime()

  const searchStart = new Date(now)
  searchStart.setHours(0, 0, 0, 0)
  if (wasAfterCutoff) searchStart.setDate(searchStart.getDate() + 1)

  // 14일 안에 배송요일이 하나도 없으면(설정 오류 등) null - 화면에서
  // "제한 없음"으로 취급.
  for (let i = 0; i < 14; i++) {
    const candidate = new Date(searchStart)
    candidate.setDate(candidate.getDate() + i)
    if (group.delivery_days.includes(candidate.getDay())) {
      return { date: candidate, wasAfterCutoff }
    }
  }
  return null
}

export function toDateOnlyString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDeliveryLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABELS[d.getDay()]})`
}

// 이 거래처(buyer)가 이 파트너 기준으로 배정된 주문그룹을 조회 - 배정이
// 없으면 null(= 마감시간 제한 없음, 기존 동작 그대로).
export async function fetchOrderGroupForBuyer(partnerId: string, buyerId: string): Promise<OrderGroup | null> {
  if (!partnerId || !buyerId) return null
  const { data } = await supabase
    .from('partner_buyer_order_groups')
    .select('partner_order_groups ( id, group_name, delivery_days, cutoff_time, allow_after_cutoff )')
    .eq('partner_id', partnerId)
    .eq('buyer_id', buyerId)
    .maybeSingle()
  const row = data as unknown as { partner_order_groups: OrderGroup | null } | null
  return row?.partner_order_groups || null
}
