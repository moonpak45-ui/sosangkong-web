'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import {
  colors,
  styles,
  formatDate,
  won,
  DEAL_STATUS_LABEL,
  REQUEST_STATUS_LABEL,
  DISPUTE_STATUS_LABEL,
  statusBadgeStyle,
} from '../_shared'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'

type QuoteRequestRow = {
  id: string
  title: string | null
  status: 'open' | 'matched' | 'closed'
  created_at: string
  buyer_profiles: { business_name: string } | null
  quote_request_targets: { id: string; status: 'waiting' | 'responded' | 'declined' }[]
}

type AdminDealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  buyer_profiles: { business_name: string } | null
  partners: { name: string } | null
  settlements: { commission_amount: number; net_amount: number; status: string }[] | null
}

type DisputeRow = {
  id: string
  status: string
  description: string | null
  created_at: string
  deals: {
    id: string
    buyer_profiles: { business_name: string } | null
    partners: { name: string } | null
  } | null
}

export default function AdminDealsPage() {
  const [tab, setTab] = useState<'requests' | 'deals' | 'disputes'>('requests')
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<QuoteRequestRow[]>([])
  const [deals, setDeals] = useState<AdminDealRow[]>([])
  const [disputes, setDisputes] = useState<DisputeRow[]>([])
  const [updatingDisputeId, setUpdatingDisputeId] = useState<string | null>(null)
  const [disputeActionError, setDisputeActionError] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: requestRows }, { data: dealRows }, { data: disputeRows }] = await Promise.all([
        supabase
          .from('quote_requests')
          .select(
            `id, title, status, created_at,
             buyer_profiles ( business_name ),
             quote_request_targets ( id, status )`
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('deals')
          .select(
            `id, amount, status, confirmed_at,
             buyer_profiles ( business_name ),
             partners ( name ),
             settlements ( commission_amount, net_amount, status )`
          )
          .order('confirmed_at', { ascending: false }),
        supabase
          .from('disputes')
          .select(
            `id, status, description, created_at,
             deals ( id, buyer_profiles ( business_name ), partners ( name ) )`
          )
          .order('created_at', { ascending: false }),
      ])

      setRequests((requestRows || []) as unknown as QuoteRequestRow[])
      setDeals((dealRows || []) as unknown as AdminDealRow[])
      setDisputes((disputeRows || []) as unknown as DisputeRow[])
      setLoading(false)
    }

    load()
  }, [])

  async function updateDisputeStatus(id: string, newStatus: 'resolved' | 'rejected') {
    const label = newStatus === 'resolved' ? '해결' : '반려'
    if (!window.confirm(`정말 이 분쟁을 ${label} 처리하시겠습니까?`)) return

    setDisputeActionError('')
    setUpdatingDisputeId(id)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const { error } = await supabase
      .from('disputes')
      .update({
        status: newStatus,
        resolved_at: new Date().toISOString(),
        resolved_by: session?.user.id ?? null,
      })
      .eq('id', id)

    setUpdatingDisputeId(null)

    if (error) {
      setDisputeActionError('분쟁 처리 중 오류가 발생했습니다: ' + error.message)
      return
    }
    setDisputes((prev) => prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d)))
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>거래·견적 관리</div>
      <div style={styles.sectionSub}>견적요청, 확정된 거래, 분쟁·클레임 현황을 확인하세요.</div>

      <div style={styles.tabRow}>
        <div
          style={{ ...styles.tab, ...(tab === 'requests' ? styles.tabActive : {}) }}
          onClick={() => setTab('requests')}
        >
          견적요청 현황 ({requests.length})
        </div>
        <div style={{ ...styles.tab, ...(tab === 'deals' ? styles.tabActive : {}) }} onClick={() => setTab('deals')}>
          거래 확정 내역 ({deals.length})
        </div>
        <div
          style={{ ...styles.tab, ...(tab === 'disputes' ? styles.tabActive : {}) }}
          onClick={() => setTab('disputes')}
        >
          분쟁·클레임 ({disputes.length})
        </div>
      </div>

      {tab === 'requests' &&
        (requests.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
            <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>견적요청 내역이 없어요</h3>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflowX: 'auto' }}>
            <table style={styles.historyTable}>
              <thead>
                <tr>
                  <th style={styles.th}>요청일</th>
                  <th style={styles.th}>소상공인</th>
                  <th style={styles.th}>제목</th>
                  <th style={styles.th}>발송업체수</th>
                  <th style={styles.th}>회신현황</th>
                  <th style={styles.th}>상태</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const total = r.quote_request_targets.length
                  const responded = r.quote_request_targets.filter((t) => t.status === 'responded').length
                  return (
                    <tr key={r.id}>
                      <td style={styles.td}>{formatDate(r.created_at)}</td>
                      <td style={styles.td}>{r.buyer_profiles?.business_name || '-'}</td>
                      <td style={styles.td}>{r.title || '견적 요청'}</td>
                      <td style={styles.td}>{total}곳</td>
                      <td style={styles.td}>
                        {responded}/{total} 완료
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.htag, ...statusBadgeStyle(r.status) }}>
                          {REQUEST_STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        ))}

      {tab === 'deals' &&
        (deals.length === 0 ? (
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
                  <th style={styles.th}>수수료</th>
                  <th style={styles.th}>정산상태</th>
                  <th style={styles.th}>거래상태</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => {
                  const settlement = d.settlements?.[0]
                  return (
                    <tr key={d.id}>
                      <td style={styles.td}>{formatDate(d.confirmed_at)}</td>
                      <td style={styles.td}>{d.buyer_profiles?.business_name || '-'}</td>
                      <td style={styles.td}>{d.partners?.name || '-'}</td>
                      <td style={styles.td}>{won(d.amount)}</td>
                      <td style={styles.td}>{settlement ? won(settlement.commission_amount) : '-'}</td>
                      <td style={styles.td}>
                        {settlement ? (
                          <span style={{ ...styles.htag, ...statusBadgeStyle(settlement.status) }}>
                            {settlement.status === 'completed' ? '정산 완료' : '정산 예정'}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.htag, ...statusBadgeStyle(d.status) }}>
                          {DEAL_STATUS_LABEL[d.status] || d.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        ))}

      {tab === 'disputes' &&
        (disputes.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
            <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>등록된 분쟁·클레임이 없어요</h3>
            <p style={{ fontSize: 13.5, color: colors.muted }}>거래 중 분쟁이 접수되면 이곳에서 확인할 수 있어요.</p>
          </Card>
        ) : (
          <>
            {disputeActionError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{disputeActionError}</div>}
            <Card style={{ padding: 0, overflowX: 'auto' }}>
              <table style={styles.historyTable}>
                <thead>
                  <tr>
                    <th style={styles.th}>접수일</th>
                    <th style={styles.th}>소상공인</th>
                    <th style={styles.th}>공급업체</th>
                    <th style={styles.th}>사유</th>
                    <th style={styles.th}>상태</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id}>
                      <td style={styles.td}>{formatDate(d.created_at)}</td>
                      <td style={styles.td}>{d.deals?.buyer_profiles?.business_name || '-'}</td>
                      <td style={styles.td}>{d.deals?.partners?.name || '-'}</td>
                      <td style={styles.td}>{d.description || '-'}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.htag, ...statusBadgeStyle(d.status) }}>
                          {DISPUTE_STATUS_LABEL[d.status] || d.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {(d.status === 'received' || d.status === 'reviewing') && (
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={updatingDisputeId === d.id}
                              onClick={() => updateDisputeStatus(d.id, 'resolved')}
                            >
                              해결
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              style={{ color: colors.warn, border: `1px solid ${colors.warn}` }}
                              disabled={updatingDisputeId === d.id}
                              onClick={() => updateDisputeStatus(d.id, 'rejected')}
                            >
                              반려
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        ))}
    </div>
  )
}
