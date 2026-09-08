'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { colors, styles, formatDate } from '../../_shared'
import { usePartnerLayout } from '../../PartnerLayoutContext'

type SettlementRow = {
  id: string
  gross_amount: number
  commission_amount: number
  net_amount: number
  status: string
  settled_at: string | null
  deals: {
    id: string
    confirmed_at: string
    buyer_profiles: { business_name: string } | null
  } | null
}

const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  pending: '정산 예정',
  completed: '정산 완료',
}

function settlementStatusStyle(status: string): React.CSSProperties {
  if (status === 'completed') return { background: colors.goodBg, color: colors.good }
  if (status === 'disputed') return { background: colors.warnBg, color: colors.warn }
  return { background: '#E7EEF5', color: colors.navy }
}

const MONTH_START = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

export default function PartnerSettlementPage() {
  const { partner } = usePartnerLayout()
  const [settlements, setSettlements] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // 원본 대시보드 코드와 동일하게 partner_id로 명시적 필터를 걸지 않음 -
      // settlements RLS 정책이 이미 본인(공급업체) 소유 행만 반환하도록 함.
      const { data } = await supabase
        .from('settlements')
        .select(
          `id, gross_amount, commission_amount, net_amount, status, settled_at,
           deals ( id, confirmed_at, buyer_profiles ( business_name ) )`
        )

      const list = (data || []) as unknown as SettlementRow[]
      list.sort((a, b) => {
        const aDate = a.deals?.confirmed_at || ''
        const bDate = b.deals?.confirmed_at || ''
        return aDate < bDate ? 1 : -1
      })
      setSettlements(list)
      setLoading(false)
    }

    load()
  }, [partner.id])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  const isThisMonth = (iso: string) => new Date(iso) >= MONTH_START
  const thisMonthSettlements = settlements.filter((s) => s.deals && isThisMonth(s.deals.confirmed_at))

  const nextSettlementAmount = settlements
    .filter((s) => s.status === 'pending')
    .reduce((sum, s) => sum + Number(s.net_amount), 0)
  const thisMonthDealAmount = thisMonthSettlements.reduce((sum, s) => sum + Number(s.gross_amount), 0)
  const thisMonthCommission = thisMonthSettlements.reduce((sum, s) => sum + Number(s.commission_amount), 0)
  const totalSettledAmount = settlements
    .filter((s) => s.status === 'completed')
    .reduce((sum, s) => sum + Number(s.net_amount), 0)

  return (
    <div>
      <div style={styles.sectionTitle}>정산</div>
      <div style={styles.sectionSub}>거래 확정 시 자동으로 생성된 정산 내역입니다.</div>

      <div className="partner-stats-grid" style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>다음 정산 예정액</div>
          <div style={styles.statValue}>{nextSettlementAmount.toLocaleString('ko-KR')}원</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>이번 달 확정 거래액</div>
          <div style={styles.statValue}>{thisMonthDealAmount.toLocaleString('ko-KR')}원</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>이번 달 수수료 합계</div>
          <div style={styles.statValue}>{thisMonthCommission.toLocaleString('ko-KR')}원</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>누적 정산 완료액</div>
          <div style={styles.statValue}>{totalSettledAmount.toLocaleString('ko-KR')}원</div>
        </div>
      </div>

      {settlements.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>정산 내역이 없어요</h3>
          <p style={{ fontSize: 13.5, color: colors.muted }}>거래가 확정되면 이곳에 정산 내역이 자동으로 생성됩니다.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>거래확정일</th>
                <th style={styles.th}>소상공인</th>
                <th style={styles.th}>거래액</th>
                <th style={styles.th}>적용 수수료율</th>
                <th style={styles.th}>수수료</th>
                <th style={styles.th}>정산액</th>
                <th style={styles.th}>정산상태</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((row) => {
                const rate =
                  Number(row.gross_amount) > 0
                    ? ((Number(row.commission_amount) / Number(row.gross_amount)) * 100).toFixed(1) + '%'
                    : '-'
                return (
                  <tr key={row.id}>
                    <td style={styles.td}>{row.deals ? formatDate(row.deals.confirmed_at) : '-'}</td>
                    <td style={styles.td}>{row.deals?.buyer_profiles?.business_name || '-'}</td>
                    <td style={styles.td}>{Number(row.gross_amount).toLocaleString('ko-KR')}원</td>
                    <td style={styles.td}>{rate}</td>
                    <td style={styles.td}>{Number(row.commission_amount).toLocaleString('ko-KR')}원</td>
                    <td style={styles.td}>{Number(row.net_amount).toLocaleString('ko-KR')}원</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.htag, ...settlementStatusStyle(row.status) }}>
                        {SETTLEMENT_STATUS_LABEL[row.status] || row.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
