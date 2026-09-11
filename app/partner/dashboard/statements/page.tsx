'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { colors, styles } from '../../_shared'
import { usePartnerLayout } from '../../PartnerLayoutContext'
import { groupDealsIntoStatements, todayKstDateString, StatementGroup } from '../../../../lib/deals/statementGroups'

type Counterpart = { id: string; business_name: string }

type DealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  buyer_profiles: Counterpart | null
}

const STATUS_LABEL = { in_progress: '진행중', completed: '거래완료', disputed: '분쟁중' } as const

function statusStyle(status: keyof typeof STATUS_LABEL): React.CSSProperties {
  if (status === 'completed') return { background: colors.goodBg, color: colors.good }
  if (status === 'disputed') return { background: colors.warnBg, color: colors.warn }
  return { background: '#E7EEF5', color: colors.navy }
}

type Tab = 'today' | 'past' | 'custom'

// 공급업체(partner) 쪽 거래명세서 목록. my-page/statements와 동일한 RLS
// (deals_select_buyer_or_partner)로 이미 보호되어 있어 .eq('partner_id', ...)
// 조회만 하면 됨 - 새 정책 불필요.
export default function PartnerStatementsPage() {
  const { partner } = usePartnerLayout()
  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('today')
  const [dateFrom, setDateFrom] = useState(todayKstDateString())
  const [dateTo, setDateTo] = useState(todayKstDateString())

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('deals')
        .select('id, amount, status, confirmed_at, buyer_profiles ( id, business_name )')
        .eq('partner_id', partner.id)
        .order('confirmed_at', { ascending: false })
      setDeals((data || []) as unknown as DealRow[])
      setLoading(false)
    }
    load()
  }, [partner.id])

  const groups = useMemo(() => {
    const rows = deals
      .filter((d) => d.buyer_profiles)
      .map((d) => ({
        id: d.id,
        amount: d.amount,
        status: d.status,
        confirmed_at: d.confirmed_at,
        counterpartId: d.buyer_profiles!.id,
        counterpart: d.buyer_profiles!,
      }))
    return groupDealsIntoStatements(rows)
  }, [deals])

  function selectTab(next: Tab) {
    setTab(next)
    const today = todayKstDateString()
    if (next === 'today') {
      setDateFrom(today)
      setDateTo(today)
    } else if (next === 'past') {
      setDateFrom('')
      setDateTo(today)
    }
  }

  const visibleGroups = groups.filter((g) => {
    if (dateFrom && g.confirmedDate < dateFrom) return false
    if (dateTo && g.confirmedDate > dateTo) return false
    if (tab === 'past' && g.confirmedDate === todayKstDateString() && !dateFrom) return false
    return true
  })

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>거래명세서</div>
      <div style={styles.sectionSub}>소상공인별로 발행된 거래명세서를 조회하고 인쇄할 수 있어요.</div>

      <div style={tabStyles.tabRow}>
        <button type="button" onClick={() => selectTab('today')} style={{ ...tabStyles.tab, ...(tab === 'today' ? tabStyles.tabActive : {}) }}>
          당일 발행
        </button>
        <button type="button" onClick={() => selectTab('past')} style={{ ...tabStyles.tab, ...(tab === 'past' ? tabStyles.tabActive : {}) }}>
          지난 명세서
        </button>
      </div>

      <div style={tabStyles.filterRow}>
        <label style={tabStyles.filterLabel}>
          시작일
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setTab('custom')
              setDateFrom(e.target.value)
            }}
            style={tabStyles.dateInput}
          />
        </label>
        <label style={tabStyles.filterLabel}>
          종료일
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setTab('custom')
              setDateTo(e.target.value)
            }}
            style={tabStyles.dateInput}
          />
        </label>
      </div>

      {visibleGroups.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>조회된 명세서가 없어요</h3>
          <p style={{ fontSize: 13.5, color: colors.muted }}>날짜 범위를 조정해보세요.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>발행일</th>
                <th style={styles.th}>소상공인</th>
                <th style={styles.th}>금액</th>
                <th style={styles.th}>상태</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((g) => (
                <StatementRow key={g.key} group={g} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatementRow({ group }: { group: StatementGroup<Counterpart> }) {
  const isMerged = group.dealIds.length > 1
  return (
    <tr>
      <td style={styles.td}>{group.dateLabel}</td>
      <td style={styles.td}>{group.counterpart.business_name}</td>
      <td style={styles.td}>{group.totalAmount.toLocaleString('ko-KR')}원</td>
      <td style={styles.td}>
        <span style={{ ...styles.htag, ...statusStyle(group.status) }}>{STATUS_LABEL[group.status]}</span>
      </td>
      <td style={styles.td}>
        <a
          href={`/partner/dashboard/deals/${group.dealIds[0]}/invoice?ids=${group.dealIds.join(',')}`}
          style={styles.repeatLink}
        >
          명세서 보기{isMerged ? ` (${group.dealIds.length}건 통합)` : ''}
        </a>
      </td>
    </tr>
  )
}

const tabStyles: { [k: string]: React.CSSProperties } = {
  tabRow: { display: 'flex', gap: 8, marginBottom: 16 },
  tab: {
    border: `1px solid ${colors.line}`,
    background: colors.white,
    color: colors.muted,
    fontWeight: 700,
    fontSize: 13,
    borderRadius: 20,
    padding: '8px 16px',
    cursor: 'pointer',
  },
  tabActive: { background: colors.deep, color: colors.white, borderColor: colors.deep },
  filterRow: { display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' },
  filterLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.muted, fontWeight: 600 },
  dateInput: { border: `1px solid ${colors.line}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: colors.ink },
}
