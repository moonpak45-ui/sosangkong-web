'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { colors, styles, formatDate } from '../../_shared'
import { usePartnerLayout } from '../../PartnerLayoutContext'

type QuoteItem = { name: string; qty?: string; unit?: string }
type RequestAttributes = { items?: QuoteItem[] }

type DealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  buyer_profiles: { business_name: string } | null
  quotes: { id: string; quote_requests: { attributes: RequestAttributes | null } | null } | null
}

const DEAL_STATUS_LABEL: Record<DealRow['status'], string> = {
  in_progress: '진행중',
  completed: '거래완료',
  disputed: '분쟁중',
}

function dealStatusStyle(status: DealRow['status']): React.CSSProperties {
  if (status === 'completed') return { background: colors.goodBg, color: colors.good }
  if (status === 'disputed') return { background: colors.warnBg, color: colors.warn }
  return { background: '#E7EEF5', color: colors.navy }
}

function itemsSummary(attrs: RequestAttributes | null): string {
  const items = attrs?.items
  if (!items || items.length === 0) return '-'
  return items.length > 1 ? `${items[0].name} 외 ${items.length - 1}건` : items[0].name
}

export default function PartnerDealsPage() {
  const { partner } = usePartnerLayout()
  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('deals')
        .select(
          `id, amount, status, confirmed_at,
           buyer_profiles ( business_name ),
           quotes ( id, quote_requests ( attributes ) )`
        )
        .eq('partner_id', partner.id)
        .order('confirmed_at', { ascending: false })
      setDeals((data || []) as unknown as DealRow[])
      setLoading(false)
    }

    load()
  }, [partner.id])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>진행 중인 거래</div>
      <div style={styles.sectionSub}>확정된 거래 내역입니다. 상태가 바뀌면 이곳에서 확인할 수 있어요.</div>

      {deals.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>진행 중인 거래가 없어요</h3>
          <p style={{ fontSize: 13.5, color: colors.muted }}>
            견적을 제출하고 소상공인이 확정하면 이곳에서 거래를 확인할 수 있어요.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>확정일</th>
                <th style={styles.th}>소상공인</th>
                <th style={styles.th}>품목</th>
                <th style={styles.th}>거래액</th>
                <th style={styles.th}>상태</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {deals.map((row) => (
                <tr key={row.id}>
                  <td style={styles.td}>{formatDate(row.confirmed_at)}</td>
                  <td style={styles.td}>{row.buyer_profiles?.business_name || '-'}</td>
                  <td style={styles.td}>{itemsSummary(row.quotes?.quote_requests?.attributes ?? null)}</td>
                  <td style={styles.td}>{Number(row.amount).toLocaleString('ko-KR')}원</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.htag, ...dealStatusStyle(row.status) }}>
                      {DEAL_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <a href={`/partner/dashboard/deals/${row.id}/invoice`} style={styles.repeatLink}>
                      명세서 인쇄
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
