'use client'

import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles, formatDate } from '../_shared'
import { useMyPageLayout } from '../MyPageLayoutContext'

type DealItem = { name: string; qty?: string; unit?: string }

type DealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  partners: { id: string; name: string } | null
  quotes: { id: string; quote_requests: { attributes: { items?: DealItem[] } | null } | null } | null
}

type LineItemRow = {
  id: string
  item_name: string
  quantity: number
  unit: string
  unit_price: number
  amount: number
  is_credit: boolean
}

const STATUS_LABEL: Record<DealRow['status'], string> = {
  in_progress: '진행중',
  completed: '거래완료',
  disputed: '분쟁중',
}

function htagStyle(status: DealRow['status']): React.CSSProperties {
  if (status === 'completed') return { background: colors.goodBg, color: colors.good }
  if (status === 'disputed') return { background: colors.warnBg, color: colors.warn }
  return { background: '#E7EEF5', color: colors.navy }
}

function itemsSummary(row: DealRow): string {
  const items = row.quotes?.quote_requests?.attributes?.items
  if (!items || items.length === 0) return '-'
  return items.length > 1 ? `${items[0].name} 외 ${items.length - 1}건` : items[0].name
}

export default function MyPageHistoryPage() {
  const { buyerProfile } = useMyPageLayout()
  const [deals, setDeals] = useState<DealRow[]>([])
  const [reviewedDealIds, setReviewedDealIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null)
  const [lineItemsByDeal, setLineItemsByDeal] = useState<Record<string, LineItemRow[]>>({})
  const [lineItemsLoading, setLineItemsLoading] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: dealRows }, { data: reviewRows }] = await Promise.all([
        supabase
          .from('deals')
          .select(
            `id, amount, status, confirmed_at,
             partners ( id, name ),
             quotes ( id, quote_requests ( attributes ) )`
          )
          .eq('buyer_id', buyerProfile.id)
          .order('confirmed_at', { ascending: false }),
        supabase.from('reviews').select('deal_id').eq('buyer_id', buyerProfile.id),
      ])

      setDeals((dealRows || []) as unknown as DealRow[])
      setReviewedDealIds(new Set((reviewRows || []).map((r) => r.deal_id as string)))
      setLoading(false)
    }

    load()
  }, [buyerProfile.id])

  async function toggleDealExpand(dealId: string) {
    if (expandedDealId === dealId) {
      setExpandedDealId(null)
      return
    }
    setExpandedDealId(dealId)

    if (!lineItemsByDeal[dealId]) {
      setLineItemsLoading(dealId)
      const { data } = await supabase
        .from('deal_line_items')
        .select('id, item_name, quantity, unit, unit_price, amount, is_credit')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true })
      setLineItemsByDeal((prev) => ({ ...prev, [dealId]: (data || []) as LineItemRow[] }))
      setLineItemsLoading(null)
    }
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>거래 이력</div>
      <div style={styles.sectionSub}>최근 거래 내역과 재거래 여부를 확인하세요.</div>

      {deals.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>거래 이력이 없어요</h3>
          <p style={{ fontSize: 13.5, color: colors.muted }}>
            견적 요청 후 거래가 성사되면 이곳에서 거래 이력을 확인할 수 있어요.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>거래일</th>
                <th style={styles.th}>공급업체</th>
                <th style={styles.th}>품목</th>
                <th style={styles.th}>금액</th>
                <th style={styles.th}>상태</th>
                <th style={styles.th}></th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {deals.map((row) => {
                const canReview = row.status === 'completed' || row.status === 'in_progress'
                const reviewed = reviewedDealIds.has(row.id)
                const expanded = expandedDealId === row.id
                const lineItems = lineItemsByDeal[row.id]
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td style={styles.td}>{formatDate(row.confirmed_at)}</td>
                      <td style={styles.td}>{row.partners?.name || '-'}</td>
                      <td style={styles.td}>
                        <span style={styles.itemsToggle} onClick={() => toggleDealExpand(row.id)}>
                          {itemsSummary(row)} {expanded ? '▴' : '▾'}
                        </span>
                      </td>
                      <td style={styles.td}>{Number(row.amount).toLocaleString('ko-KR')}원</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.htag, ...htagStyle(row.status) }}>{STATUS_LABEL[row.status]}</span>
                      </td>
                      <td style={styles.td}>
                        {row.partners && (
                          <a href={`/quote-request?partner_ids=${row.partners.id}`} style={styles.repeatLink}>
                            재주문
                          </a>
                        )}
                      </td>
                      <td style={styles.td}>
                        {reviewed ? (
                          <a href={`/review/view?deal_id=${row.id}`} style={styles.repeatLink}>
                            리뷰 완료
                          </a>
                        ) : canReview ? (
                          <a href={`/review/write?deal_id=${row.id}`} style={styles.repeatLink}>
                            리뷰 작성
                          </a>
                        ) : null}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td style={styles.tdDetail} colSpan={7}>
                          {lineItemsLoading === row.id ? (
                            <div style={{ padding: 12, color: colors.muted, fontSize: 12.5 }}>불러오는 중...</div>
                          ) : !lineItems || lineItems.length === 0 ? (
                            <div style={{ padding: 12, color: colors.muted, fontSize: 12.5 }}>
                              등록된 거래전표가 없어요.
                            </div>
                          ) : (
                            <table style={styles.detailTable}>
                              <thead>
                                <tr>
                                  <th style={styles.detailTh}>품목명</th>
                                  <th style={styles.detailTh}>수량</th>
                                  <th style={styles.detailTh}>단가</th>
                                  <th style={styles.detailTh}>금액</th>
                                  <th style={styles.detailTh}>구분</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lineItems.map((li) => (
                                  <tr key={li.id}>
                                    <td style={styles.detailTd}>{li.item_name}</td>
                                    <td style={styles.detailTd}>
                                      {Number(li.quantity).toLocaleString('ko-KR')}
                                      {li.unit}
                                    </td>
                                    <td style={styles.detailTd}>{Number(li.unit_price).toLocaleString('ko-KR')}원</td>
                                    <td style={styles.detailTd}>{Number(li.amount).toLocaleString('ko-KR')}원</td>
                                    <td style={styles.detailTd}>
                                      <span
                                        style={{
                                          ...styles.htag,
                                          ...(li.is_credit
                                            ? { background: colors.warnBg, color: colors.warn }
                                            : { background: colors.goodBg, color: colors.good }),
                                        }}
                                      >
                                        {li.is_credit ? '외상' : '즉시결제'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.adSlot}>
        <div style={styles.adLabel}>광고 (준비 중)</div>
      </div>
    </div>
  )
}
