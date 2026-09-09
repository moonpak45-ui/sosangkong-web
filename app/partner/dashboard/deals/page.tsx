'use client'

import { Fragment, useEffect, useState } from 'react'
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
  buyer_id: string
  buyer_profiles: { business_name: string } | null
  quotes: { id: string; quote_requests: { attributes: RequestAttributes | null } | null } | null
}

type DealGroup = {
  key: string
  dateLabel: string
  buyerId: string
  buyerName: string
  deals: DealRow[]
  totalAmount: number
  status: DealRow['status']
}

// 같은 날짜(확정일 기준, 로컬 캘린더 날짜) + 같은 소상공인의 거래를 한 그룹으로
// 묶음 - 실제 유통 관행상 하루에 여러 번 주문해도 다음날 한 번에 배송/정산하는
// 경우가 많아, 명세서도 날짜+거래처 단위로 한 장만 인쇄하면 되기 때문.
// deals/deal_line_items 테이블 구조는 그대로 두고 화면 조회 단계에서만 묶음.
function groupDeals(deals: DealRow[]): DealGroup[] {
  const map = new Map<string, DealGroup>()
  for (const d of deals) {
    const dateLabel = formatDate(d.confirmed_at)
    const key = `${dateLabel}__${d.buyer_id}`
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        dateLabel,
        buyerId: d.buyer_id,
        buyerName: d.buyer_profiles?.business_name || '-',
        deals: [],
        totalAmount: 0,
        status: d.status,
      }
      map.set(key, group)
    }
    group.deals.push(d)
    group.totalAmount += Number(d.amount)
    // 상태 병합 우선순위: 분쟁중 > 진행중 > 거래완료 - 그룹 안에 하나라도
    // 분쟁/진행중이 있으면 전체를 아직 "마무리 안 된" 상태로 보여줘야 함.
    const priority: Record<DealRow['status'], number> = { disputed: 2, in_progress: 1, completed: 0 }
    if (priority[d.status] > priority[group.status]) group.status = d.status
  }
  // 각 그룹 내부도 최신순 정렬 유지
  for (const g of map.values()) {
    g.deals.sort((a, b) => (a.confirmed_at < b.confirmed_at ? 1 : -1))
  }
  return Array.from(map.values()).sort((a, b) => (a.dateLabel < b.dateLabel ? 1 : -1))
}

function groupItemsSummary(group: DealGroup): string {
  const allItems = group.deals.flatMap((d) => d.quotes?.quote_requests?.attributes?.items || [])
  if (allItems.length === 0) return group.deals.length > 1 ? `통합 ${group.deals.length}건` : '-'
  const base = allItems.length > 1 ? `${allItems[0].name} 외 ${allItems.length - 1}건` : allItems[0].name
  return group.deals.length > 1 ? `${base} (거래 ${group.deals.length}건 통합)` : base
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('deals')
        .select(
          `id, amount, status, confirmed_at, buyer_id,
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
                <th style={styles.th}></th>
                <th style={styles.th}>확정일</th>
                <th style={styles.th}>소상공인</th>
                <th style={styles.th}>품목</th>
                <th style={styles.th}>거래액</th>
                <th style={styles.th}>상태</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {groupDeals(deals).map((group) => {
                const ids = group.deals.map((d) => d.id)
                const isOpen = !!expanded[group.key]
                const isMerged = group.deals.length > 1
                return (
                  <Fragment key={group.key}>
                    <tr>
                      <td style={styles.td}>
                        {isMerged && (
                          <button
                            type="button"
                            onClick={() => setExpanded((e) => ({ ...e, [group.key]: !e[group.key] }))}
                            style={{ ...styles.repeatLink, background: 'none', border: 'none', padding: 0 }}
                          >
                            {isOpen ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                      <td style={styles.td}>{group.dateLabel}</td>
                      <td style={styles.td}>{group.buyerName}</td>
                      <td style={styles.td}>{groupItemsSummary(group)}</td>
                      <td style={styles.td}>{group.totalAmount.toLocaleString('ko-KR')}원</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.htag, ...dealStatusStyle(group.status) }}>
                          {DEAL_STATUS_LABEL[group.status]}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <a
                          href={`/partner/dashboard/deals/${ids[0]}/invoice?ids=${ids.join(',')}`}
                          style={styles.repeatLink}
                        >
                          명세서 인쇄{isMerged ? ` (${ids.length}건 통합)` : ''}
                        </a>
                      </td>
                    </tr>
                    {isOpen &&
                      group.deals.map((d) => (
                        <tr key={d.id} style={{ background: colors.paper }}>
                          <td style={styles.td}></td>
                          <td style={{ ...styles.td, color: colors.muted, fontSize: 12.5 }}>
                            └ {formatDate(d.confirmed_at)}
                          </td>
                          <td style={styles.td}></td>
                          <td style={{ ...styles.td, color: colors.muted, fontSize: 12.5 }}>
                            {itemsSummary(d.quotes?.quote_requests?.attributes ?? null)}
                          </td>
                          <td style={{ ...styles.td, color: colors.muted, fontSize: 12.5 }}>
                            {Number(d.amount).toLocaleString('ko-KR')}원
                          </td>
                          <td style={styles.td}>
                            <span style={{ ...styles.htag, ...dealStatusStyle(d.status) }}>
                              {DEAL_STATUS_LABEL[d.status]}
                            </span>
                          </td>
                          <td style={styles.td}></td>
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
