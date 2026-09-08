'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles, formatDate, PARTNER_STATUS_LABEL, BUYER_STATUS_LABEL, statusBadgeStyle } from '../_shared'

type BuyerRow = {
  id: string
  business_name: string
  contact_name: string | null
  industry: string | null
  region: string | null
  created_at: string
  user_id: string
  users: { status: string | null } | null
  deals: { count: number }[] | null
}

type PartnerRow = {
  id: string
  name: string
  description: string | null
  region: string | null
  created_at: string
  verified_badge: boolean
  status: string
}

export default function AdminMembersPage() {
  const [tab, setTab] = useState<'buyer' | 'partner'>('buyer')
  const [loading, setLoading] = useState(true)
  const [buyers, setBuyers] = useState<BuyerRow[]>([])
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: buyerRows }, { data: partnerRows }] = await Promise.all([
        supabase
          .from('buyer_profiles')
          .select(
            `id, business_name, contact_name, industry, region, created_at, user_id,
             users ( status ),
             deals ( count )`
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('partners')
          .select('id, name, description, region, created_at, verified_badge, status')
          .order('created_at', { ascending: false }),
      ])

      setBuyers((buyerRows || []) as unknown as BuyerRow[])
      setPartners((partnerRows || []) as unknown as PartnerRow[])
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
    setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
  }

  async function updateBuyerStatus(userId: string, status: 'active' | 'suspended') {
    const label = status === 'active' ? '활성화' : '정지'
    if (!window.confirm(`정말 이 소상공인 계정을 ${label} 처리하시겠습니까?`)) return

    setActionError('')
    setUpdatingId(userId)
    const { error } = await supabase.from('users').update({ status }).eq('id', userId)
    setUpdatingId(null)

    if (error) {
      setActionError('상태 변경 중 오류가 발생했습니다: ' + error.message)
      return
    }
    setBuyers((prev) => prev.map((b) => (b.user_id === userId ? { ...b, users: { status } } : b)))
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>회원 관리</div>
      <div style={styles.sectionSub}>소상공인과 공급업체 회원을 조회하고 관리하세요.</div>

      <div style={styles.tabRow}>
        <div style={{ ...styles.tab, ...(tab === 'buyer' ? styles.tabActive : {}) }} onClick={() => setTab('buyer')}>
          소상공인 ({buyers.length})
        </div>
        <div
          style={{ ...styles.tab, ...(tab === 'partner' ? styles.tabActive : {}) }}
          onClick={() => setTab('partner')}
        >
          공급업체 ({partners.length})
        </div>
      </div>

      {actionError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{actionError}</div>}

      {tab === 'buyer' ? (
        buyers.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>가입한 소상공인이 없어요</h3>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.historyTable}>
              <thead>
                <tr>
                  <th style={styles.th}>사업장명</th>
                  <th style={styles.th}>대표자</th>
                  <th style={styles.th}>업종/지역</th>
                  <th style={styles.th}>가입일</th>
                  <th style={styles.th}>누적거래건수</th>
                  <th style={styles.th}>상태</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((b) => {
                  const dealCount = b.deals?.[0]?.count ?? 0
                  const status = b.users?.status || null
                  return (
                    <tr key={b.id}>
                      <td style={styles.td}>{b.business_name}</td>
                      <td style={styles.td}>{b.contact_name || '-'}</td>
                      <td style={styles.td}>{[b.industry, b.region].filter(Boolean).join(' · ') || '-'}</td>
                      <td style={styles.td}>{formatDate(b.created_at)}</td>
                      <td style={styles.td}>{dealCount.toLocaleString('ko-KR')}건</td>
                      <td style={styles.td}>
                        {status ? (
                          <span style={{ ...styles.htag, ...statusBadgeStyle(status) }}>
                            {BUYER_STATUS_LABEL[status] || status}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            style={{ ...styles.btn, ...styles.btnPrimarySmall }}
                            disabled={updatingId === b.user_id || status === 'active'}
                            onClick={() => updateBuyerStatus(b.user_id, 'active')}
                          >
                            활성
                          </button>
                          <button
                            style={{ ...styles.btn, ...styles.btnDangerSmall }}
                            disabled={updatingId === b.user_id || status === 'suspended'}
                            onClick={() => updateBuyerStatus(b.user_id, 'suspended')}
                          >
                            정지
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : partners.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>가입한 공급업체가 없어요</h3>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>업체명</th>
                <th style={styles.th}>취급품목/지역</th>
                <th style={styles.th}>가입일</th>
                <th style={styles.th}>인증여부</th>
                <th style={styles.th}>상태</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td style={styles.td}>{p.name}</td>
                  <td style={styles.td}>{[p.description, p.region].filter(Boolean).join(' · ') || '-'}</td>
                  <td style={styles.td}>{formatDate(p.created_at)}</td>
                  <td style={styles.td}>{p.verified_badge ? '✓ 검증' : '-'}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.htag, ...statusBadgeStyle(p.status) }}>
                      {PARTNER_STATUS_LABEL[p.status] || p.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        style={{ ...styles.btn, ...styles.btnPrimarySmall }}
                        disabled={updatingId === p.id || p.status === 'approved'}
                        onClick={() => updatePartnerStatus(p.id, 'approved')}
                      >
                        승인
                      </button>
                      <button
                        style={{ ...styles.btn, ...styles.btnDangerSmall }}
                        disabled={updatingId === p.id || p.status === 'suspended'}
                        onClick={() => updatePartnerStatus(p.id, 'suspended')}
                      >
                        정지
                      </button>
                    </div>
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
