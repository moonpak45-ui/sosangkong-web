'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors } from '../_shared'
import { usePartnerLayout } from '../PartnerLayoutContext'
import { buildMonthlyAmounts, currentMonthTotal, MonthlyAmount } from '../../../lib/deals/monthlyAmounts'
import { buildRiskItems, RiskItem } from '../../../lib/deals/riskItems'
import DashboardCard from '../../../components/DashboardCard'
import MonthlyAmountChart from '../../../components/MonthlyAmountChart'
import Badge from '../../../components/ui/Badge'

type DealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  buyer_profiles: { id: string; business_name: string } | null
}

type ArRow = { buyer_id: string; balance: number }

// 공급업체 대시보드 메인(첫 화면) — 쿠팡 윙 판매자센터 스타일 카드 그리드.
// 기존 "받은 견적요청" 목록은 /partner/dashboard/requests로 옮기고, 이
// 화면은 요약 카드 4개(월별 매출 추이 / 미결제 외상 / 진행 중 거래 /
// 리스크 알림)로 구성한다.
export default function PartnerDashboardHome() {
  const { partner } = usePartnerLayout()
  const [monthly, setMonthly] = useState<MonthlyAmount[]>([])
  const [inProgressCount, setInProgressCount] = useState(0)
  const [totalUnpaid, setTotalUnpaid] = useState(0)
  const [risks, setRisks] = useState<RiskItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: dealRows }, { data: arRows }] = await Promise.all([
        supabase
          .from('deals')
          .select('id, amount, status, confirmed_at, buyer_profiles ( id, business_name )')
          .eq('partner_id', partner.id)
          .order('confirmed_at', { ascending: false }),
        // ar_balances.buyer_id는 auth.users(id)라 buyer_profiles와 직접 FK로
        // 이어지지 않아 PostgREST 임베드가 안 됨(app/partner/ledger/page.tsx와
        // 동일한 주의사항) — buyer_profiles를 user_id로 별도 조회해서 매칭.
        supabase.from('ar_balances').select('buyer_id, balance').eq('partner_id', partner.id),
      ])

      const deals = (dealRows || []) as unknown as DealRow[]
      const arRows_ = (arRows || []) as ArRow[]
      const unpaidRows = arRows_.filter((r) => Number(r.balance) > 0)

      let buyerNameByUserId: Record<string, string> = {}
      if (unpaidRows.length > 0) {
        const { data: profiles } = await supabase
          .from('buyer_profiles')
          .select('user_id, business_name')
          .in('user_id', unpaidRows.map((r) => r.buyer_id))
        buyerNameByUserId = Object.fromEntries((profiles || []).map((p) => [p.user_id as string, p.business_name as string]))
      }

      setMonthly(buildMonthlyAmounts(deals, 6))
      setInProgressCount(deals.filter((d) => d.status === 'in_progress').length)
      setTotalUnpaid(arRows_.reduce((sum, r) => sum + Number(r.balance || 0), 0))
      setRisks(
        buildRiskItems(
          deals
            .filter((d) => d.status === 'disputed' && d.buyer_profiles)
            .map((d) => ({ id: d.id, counterpartName: d.buyer_profiles!.business_name })),
          unpaidRows.map((r) => ({
            id: r.buyer_id,
            counterpartName: buyerNameByUserId[r.buyer_id] || '거래처',
            balance: Number(r.balance),
          }))
        )
      )
      setLoading(false)
    }

    load()
  }, [partner.id])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  const thisMonthTotal = currentMonthTotal(monthly)

  return (
    <div>
      <div style={{ fontSize: 19, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, marginBottom: 4 }}>
        안녕하세요, {partner.name}님
      </div>
      <div style={{ fontSize: 13.5, color: colors.muted, marginBottom: 22 }}>거래 현황을 한눈에 확인하세요.</div>

      <div style={styles.grid}>
        <div style={styles.wide}>
          <DashboardCard title="월별 매출 금액 추이" href="/partner/dashboard/statements">
            <div style={styles.heroNumber}>{thisMonthTotal.toLocaleString('ko-KR')}원</div>
            <div style={styles.heroLabel}>이번 달 누적 매출</div>
            <div style={{ marginTop: 12 }}>
              <MonthlyAmountChart data={monthly} />
            </div>
          </DashboardCard>
        </div>

        <DashboardCard title="미결제 외상 현황" href="/partner/ledger">
          <div style={{ ...styles.bigNumber, color: totalUnpaid > 0 ? colors.warn : colors.navy }}>
            {totalUnpaid.toLocaleString('ko-KR')}원
          </div>
          <div style={styles.smallNote}>{totalUnpaid > 0 ? '매출·재고 현황에서 자세히 보기 ›' : '미결제 외상이 없어요'}</div>
        </DashboardCard>

        <DashboardCard title="진행 중 거래 건수" href="/partner/dashboard/deals">
          <div style={styles.bigNumber}>{inProgressCount}건</div>
          <div style={styles.smallNote}>진행 중인 거래에서 자세히 보기 ›</div>
        </DashboardCard>

        <DashboardCard title="리스크 알림" href="/partner/dashboard/deals">
          {risks.length === 0 ? (
            <div style={styles.smallNote}>지금은 특별한 리스크가 없어요.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {risks.slice(0, 4).map((r) => (
                <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Badge style={{ background: colors.warnBg, color: colors.warn }}>{r.label}</Badge>
                  <span style={{ fontSize: 11.5, color: colors.muted }}>{r.detail}</span>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}

const styles: { [k: string]: React.CSSProperties } = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
    paddingBottom: 40,
  },
  wide: { gridColumn: '1 / -1' },
  heroNumber: { fontSize: 30, fontFamily: "'Noto Serif KR', serif", fontWeight: 700, color: colors.deep },
  heroLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  bigNumber: { fontSize: 26, fontFamily: "'Noto Serif KR', serif", fontWeight: 700, color: colors.deep },
  smallNote: { fontSize: 12, color: colors.muted, marginTop: 8 },
}
