'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles, formatDate, statusBadgeStyle } from '../_shared'

type AdType = 'box' | 'line' | 'free' | 'banner'
type AdStatus = 'pending' | 'active' | 'rejected'

type AdRow = {
  id: string
  ad_type: AdType
  status: AdStatus
  banner_image_url: string | null
  memo: string | null
  reject_reason: string | null
  created_at: string
  partners: { id: string; name: string } | null
}

const AD_TYPE_LABEL: Record<AdType, string> = {
  box: '박스광고',
  line: '줄광고',
  free: '무료 노출',
  banner: '롤링 배너',
}

const AD_STATUS_LABEL: Record<AdStatus, string> = {
  pending: '승인 대기',
  active: '게재중',
  rejected: '반려됨',
}

// 광고 승인 화면. box/line/free/banner 4종 신청을 한곳에서 검토·승인/반려.
// 결제는 오프라인 계좌이체로 이뤄지고(이 프로젝트에 결제 연동 자체가 없음),
// 관리자가 입금 확인 등을 시스템 밖에서 마친 뒤 여기서 수동으로 승인함.
export default function AdminAdsPage() {
  const [ads, setAds] = useState<AdRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'active' | 'rejected' | 'all'>('pending')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  function load() {
    supabase
      .from('ads')
      .select('id, ad_type, status, banner_image_url, memo, reject_reason, created_at, partners ( id, name )')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAds((data || []) as unknown as AdRow[])
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  async function approve(id: string) {
    setActionError('')
    setUpdatingId(id)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const { error } = await supabase
      .from('ads')
      .update({ status: 'active', reject_reason: null, reviewed_by: session?.user.id ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', id)

    setUpdatingId(null)
    if (error) {
      setActionError('처리 중 오류가 발생했습니다: ' + error.message)
      return
    }
    setAds((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'active', reject_reason: null } : a)))
  }

  async function reject(id: string, isStop: boolean) {
    const reason = window.prompt(isStop ? '게재를 중단할 사유를 입력해주세요 (선택)' : '반려 사유를 입력해주세요 (선택)') || null

    setActionError('')
    setUpdatingId(id)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const { error } = await supabase
      .from('ads')
      .update({ status: 'rejected', reject_reason: reason, reviewed_by: session?.user.id ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', id)

    setUpdatingId(null)
    if (error) {
      setActionError('처리 중 오류가 발생했습니다: ' + error.message)
      return
    }
    setAds((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'rejected', reject_reason: reason } : a)))
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  const counts = {
    pending: ads.filter((a) => a.status === 'pending').length,
    active: ads.filter((a) => a.status === 'active').length,
    rejected: ads.filter((a) => a.status === 'rejected').length,
    all: ads.length,
  }
  const visible = tab === 'all' ? ads : ads.filter((a) => a.status === tab)

  return (
    <div>
      <div style={styles.sectionTitle}>광고 관리</div>
      <div style={styles.sectionSub}>공급업체의 박스광고·줄광고·무료·롤링배너 신청을 검토하고 승인/반려하세요.</div>

      <div style={styles.tabRow}>
        {(['pending', 'active', 'rejected', 'all'] as const).map((t) => (
          <div key={t} style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }} onClick={() => setTab(t)}>
            {t === 'all' ? '전체' : AD_STATUS_LABEL[t]} ({counts[t]})
          </div>
        ))}
      </div>

      {actionError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{actionError}</div>}

      {visible.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>해당하는 광고 신청이 없어요</h3>
        </div>
      ) : (
        visible.map((ad) => (
          <div key={ad.id} style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 16, flex: 1, minWidth: 260 }}>
                {ad.banner_image_url && (
                  <img
                    src={ad.banner_image_url}
                    alt="배너 미리보기"
                    style={{ width: 140, height: 47, objectFit: 'cover', borderRadius: 6, border: `1px solid ${colors.line}`, flexShrink: 0 }}
                  />
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ fontSize: 14.5, color: colors.ink }}>{ad.partners?.name || '(삭제된 업체)'}</b>
                    <span style={{ ...styles.htag, background: colors.paper2, color: colors.navy }}>{AD_TYPE_LABEL[ad.ad_type]}</span>
                    <span style={{ ...styles.htag, ...statusBadgeStyle(ad.status) }}>{AD_STATUS_LABEL[ad.status]}</span>
                  </div>
                  <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>{formatDate(ad.created_at)} 신청</div>
                  {ad.memo && <div style={{ fontSize: 12.5, color: colors.ink, marginTop: 8 }}>요청사항: {ad.memo}</div>}
                  {ad.status === 'rejected' && ad.reject_reason && (
                    <div style={{ fontSize: 12.5, color: colors.warn, marginTop: 8 }}>사유: {ad.reject_reason}</div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {ad.status === 'pending' && (
                  <>
                    <button
                      style={{ ...styles.btn, ...styles.btnPrimarySmall }}
                      disabled={updatingId === ad.id}
                      onClick={() => approve(ad.id)}
                    >
                      승인
                    </button>
                    <button
                      style={{ ...styles.btn, ...styles.btnDangerSmall }}
                      disabled={updatingId === ad.id}
                      onClick={() => reject(ad.id, false)}
                    >
                      반려
                    </button>
                  </>
                )}
                {ad.status === 'active' && (
                  <button
                    style={{ ...styles.btn, ...styles.btnDangerSmall }}
                    disabled={updatingId === ad.id}
                    onClick={() => reject(ad.id, true)}
                  >
                    게재 중단
                  </button>
                )}
                {ad.status === 'rejected' && (
                  <button
                    style={{ ...styles.btn, ...styles.btnPrimarySmall }}
                    disabled={updatingId === ad.id}
                    onClick={() => approve(ad.id)}
                  >
                    승인
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
