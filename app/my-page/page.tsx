'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors } from './_shared'
import { useMyPageLayout } from './MyPageLayoutContext'
import { buildMonthlyAmounts, currentMonthTotal, MonthlyAmount } from '../../lib/deals/monthlyAmounts'
import { buildRiskItems, RiskItem } from '../../lib/deals/riskItems'
import DashboardCard from '../../components/DashboardCard'
import MonthlyAmountChart from '../../components/MonthlyAmountChart'
import Badge from '../../components/ui/Badge'

type DealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  partners: { id: string; name: string } | null
}

type ArRow = { partner_id: string; balance: number; partners: { name: string } | null }

// 마이페이지 메인(첫 화면) — 쿠팡 윙 판매자센터 스타일 카드 그리드 대시보드.
// 기존 "현재 거래처" 목록은 /my-page/partners로 옮기고, 이 화면은 요약
// 카드 4개(월별 매입 추이 / 미결제 외상 / 진행 중 거래 / 리스크 알림)로
// 구성해 한눈에 훑어보고 각 카드에서 상세 화면으로 넘어가게 한다.
export default function MyPageDashboard() {
  const { buyerProfile, session } = useMyPageLayout()
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
          .select('id, amount, status, confirmed_at, partners ( id, name )')
          .eq('buyer_id', buyerProfile.id)
          .order('confirmed_at', { ascending: false }),
        supabase.from('ar_balances').select('partner_id, balance, partners ( name )').eq('buyer_id', session.userId),
      ])

      const deals = (dealRows || []) as unknown as DealRow[]
      const arBalances = (arRows || []) as unknown as ArRow[]

      setMonthly(buildMonthlyAmounts(deals, 6))
      setInProgressCount(deals.filter((d) => d.status === 'in_progress').length)
      setTotalUnpaid(arBalances.reduce((sum, r) => sum + Number(r.balance || 0), 0))
      setRisks(
        buildRiskItems(
          deals
            .filter((d) => d.status === 'disputed' && d.partners)
            .map((d) => ({ id: d.id, counterpartName: d.partners!.name })),
          arBalances
            .filter((r) => r.partners)
            .map((r) => ({ id: r.partner_id, counterpartName: r.partners!.name, balance: Number(r.balance) }))
        )
      )
      setLoading(false)
    }

    load()
  }, [buyerProfile.id, session.userId])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  const thisMonthTotal = currentMonthTotal(monthly)

  return (
    <div>
      <div style={{ fontSize: 19, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, marginBottom: 4 }}>
        {buyerProfile.business_name} 사장님, 안녕하세요
      </div>
      <div style={{ fontSize: 13.5, color: colors.muted, marginBottom: 22 }}>거래 현황을 한눈에 확인하세요.</div>

      <div style={styles.grid}>
        <div style={styles.wide}>
          <DashboardCard title="월별 매입 금액 추이" href="/my-page/statements">
            <div style={styles.heroNumber}>{thisMonthTotal.toLocaleString('ko-KR')}원</div>
            <div style={styles.heroLabel}>이번 달 누적 매입</div>
            <div style={{ marginTop: 12 }}>
              <MonthlyAmountChart data={monthly} />
            </div>
          </DashboardCard>
        </div>

        <DashboardCard title="미결제 외상 현황" href="/my-page/partners">
          <div style={{ ...styles.bigNumber, color: totalUnpaid > 0 ? colors.warn : colors.navy }}>
            {totalUnpaid.toLocaleString('ko-KR')}원
          </div>
          <div style={styles.smallNote}>{totalUnpaid > 0 ? '거래처 관리에서 자세히 보기 ›' : '미결제 외상이 없어요'}</div>
        </DashboardCard>

        <DashboardCard title="진행 중 거래 건수" href="/my-page/statements">
          <div style={styles.bigNumber}>{inProgressCount}건</div>
          <div style={styles.smallNote}>거래명세서에서 자세히 보기 ›</div>
        </DashboardCard>

        <DashboardCard title="리스크 알림" href="/my-page/history">
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
