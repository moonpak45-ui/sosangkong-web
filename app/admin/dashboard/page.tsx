'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles, formatDate, won, DEAL_STATUS_LABEL, statusBadgeStyle } from '../_shared'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'

type PendingPartner = {
  id: string
  name: string
  region: string | null
  description: string | null
  created_at: string
  status: string
}

type RecentDeal = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  buyer_profiles: { business_name: string } | null
  partners: { name: string } | null
}

type SettlementMonthRow = {
  commission_amount: number
  deals: { confirmed_at: string } | null
}

const MONTH_START = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [memberCount, setMemberCount] = useState(0)
  const [dealsThisMonth, setDealsThisMonth] = useState(0)
  const [settlementRevenueThisMonth, setSettlementRevenueThisMonth] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingPartners, setPendingPartners] = useState<PendingPartner[]>([])
  const [recentDeals, setRecentDeals] = useState<RecentDeal[]>([])
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    async function load() {
      const monthStartIso = MONTH_START.toISOString()

      const [
        { count: buyerCount },
        { count: partnerCount },
        { count: dealCountThisMonth },
        { count: pendingPartnerCount },
        { data: settlementRows },
        { data: pendingRows },
        { data: dealRows },
      ] = await Promise.all([
        supabase.from('buyer_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('partners').select('id', { count: 'exact', head: true }),
        supabase.from('deals').select('id', { count: 'exact', head: true }).gte('confirmed_at', monthStartIso),
        supabase.from('partners').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('settlements').select('commission_amount, deals ( confirmed_at )'),
        supabase
          .from('partners')
          .select('id, name, region, description, created_at, status')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('deals')
          .select(
            `id, amount, status, confirmed_at,
             buyer_profiles ( business_name ),
             partners ( name )`
          )
          .order('confirmed_at', { ascending: false })
          .limit(10),
      ])

      setMemberCount((buyerCount || 0) + (partnerCount || 0))
      setDealsThisMonth(dealCountThisMonth || 0)
      setPendingCount(pendingPartnerCount || 0)

      const monthSettlements = ((settlementRows || []) as unknown as SettlementMonthRow[]).filter(
        (s) => s.deals && new Date(s.deals.confirmed_at) >= MONTH_START
      )
      setSettlementRevenueThisMonth(monthSettlements.reduce((sum, s) => sum + Number(s.commission_amount), 0))

      setPendingPartners((pendingRows || []) as unknown as PendingPartner[])
      setRecentDeals((dealRows || []) as unknown as RecentDeal[])
      setLoading(false)
    }

    load()
  }, [])

  async function updatePartnerStatus(id: string, status: 'approved' | 'suspended') {
    setActionError('')
    setUpdatingId(id)
    const { error } = await supabase.from('partners').update({ status }).eq('id', id)
    setUpdatingId(null)

    if (error) {
      setActionError('상태 변경 중 오류가 발생했습니다: ' + error.message)
      return
    }
    setPendingPartners((prev) => prev.filter((p) => p.id !== id))
    setPendingCount((prev) => Math.max(0, prev - 1))
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>대시보드</div>
      <div style={styles.sectionSub}>플랫폼 현황을 한눈에 확인하세요.</div>

      <div style={styles.statsGrid}>
        <Card style={{ padding: '18px 20px' }}>
          <div style={styles.statLabel}>전체 회원 수</div>
          <div style={styles.statValue}>{memberCount.toLocaleString('ko-KR')}명</div>
        </Card>
        <Card style={{ padding: '18px 20px' }}>
          <div style={styles.statLabel}>이번 달 거래 확정 건수</div>
          <div style={styles.statValue}>{dealsThisMonth.toLocaleString('ko-KR')}건</div>
        </Card>
        <Card style={{ padding: '18px 20px' }}>
          <div style={styles.statLabel}>이번 달 정산 매출 합계</div>
          <div style={styles.statValue}>{won(settlementRevenueThisMonth)}</div>
        </Card>
        <Card style={{ padding: '18px 20px' }}>
          <div style={styles.statLabel}>승인 대기 건수</div>
          <div style={styles.statValue}>{pendingCount.toLocaleString('ko-KR')}건</div>
        </Card>
      </div>

      <div style={{ ...styles.sectionTitle, fontSize: 17, marginTop: 8 }}>승인 대기 업체</div>
      <div style={styles.sectionSub}>신규 가입한 공급업체를 검토하고 승인/정지 처리하세요.</div>

      {actionError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{actionError}</div>}

      {pendingPartners.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '50px 20px', marginBottom: 44 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>승인 대기 중인 업체가 없어요</h3>
          <p style={{ fontSize: 13.5, color: colors.muted }}>새로 가입한 공급업체가 있으면 이곳에 표시됩니다.</p>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflowX: 'auto', marginBottom: 44 }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>업체명</th>
                <th style={styles.th}>지역/취급품목</th>
                <th style={styles.th}>가입일</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {pendingPartners.map((p) => (
                <tr key={p.id}>
                  <td style={styles.td}>{p.name}</td>
                  <td style={styles.td}>{[p.region, p.description].filter(Boolean).join(' · ') || '-'}</td>
                  <td style={styles.td}>{formatDate(p.created_at)}</td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={updatingId === p.id}
                        onClick={() => updatePartnerStatus(p.id, 'approved')}
                      >
                        승인
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        style={{ color: colors.warn, border: `1px solid ${colors.warn}` }}
                        disabled={updatingId === p.id}
                        onClick={() => updatePartnerStatus(p.id, 'suspended')}
                      >
                        보류
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div style={{ ...styles.sectionTitle, fontSize: 17 }}>최근 거래 확정 내역</div>
      <div style={styles.sectionSub}>가장 최근에 확정된 거래 10건입니다.</div>

      {recentDeals.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>확정된 거래가 없어요</h3>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>확정일</th>
                <th style={styles.th}>소상공인</th>
                <th style={styles.th}>공급업체</th>
                <th style={styles.th}>거래액</th>
                <th style={styles.th}>상태</th>
              </tr>
            </thead>
            <tbody>
              {recentDeals.map((row) => (
                <tr key={row.id}>
                  <td style={styles.td}>{formatDate(row.confirmed_at)}</td>
                  <td style={styles.td}>{row.buyer_profiles?.business_name || '-'}</td>
                  <td style={styles.td}>{row.partners?.name || '-'}</td>
                  <td style={styles.td}>{won(row.amount)}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.htag, ...statusBadgeStyle(row.status) }}>
                      {DEAL_STATUS_LABEL[row.status] || row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
