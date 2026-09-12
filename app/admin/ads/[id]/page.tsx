'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import { buildSafeUploadPath } from '../../../../lib/safeUploadPath'
import { colors, styles, formatDate, statusBadgeStyle } from '../../_shared'
import Card from '../../../../components/ui/Card'
import Badge from '../../../../components/ui/Badge'
import Button from '../../../../components/ui/Button'
import Input from '../../../../components/ui/Input'

type AdType = 'box' | 'line' | 'free' | 'banner'
type AdStatus = 'pending' | 'active' | 'rejected'

type AdDetail = {
  id: string
  ad_type: AdType
  status: AdStatus
  banner_image_url: string | null
  memo: string | null
  reject_reason: string | null
  end_date: string | null
  created_at: string
  advertiser_name: string | null
  partner_id: string | null
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

const MAX_BANNER_BYTES = 5 * 1024 * 1024

export default function AdminAdDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const adId = params.id

  const [ad, setAd] = useState<AdDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [advertiserName, setAdvertiserName] = useState('')
  const [endDate, setEndDate] = useState('')
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(null)
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveDone, setSaveDone] = useState(false)

  const [statusUpdating, setStatusUpdating] = useState(false)
  const [statusError, setStatusError] = useState('')

  useEffect(() => {
    supabase
      .from('ads')
      .select(
        'id, ad_type, status, banner_image_url, memo, reject_reason, end_date, created_at, advertiser_name, partner_id, partners ( id, name )'
      )
      .eq('id', adId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setNotFound(true)
          setLoading(false)
          return
        }
        const row = data as unknown as AdDetail
        setAd(row)
        setAdvertiserName(row.advertiser_name || '')
        setEndDate(row.end_date || '')
        setBannerImageUrl(row.banner_image_url)
        setLoading(false)
      })
  }, [adId])

  // 파트너 신청 광고는 partner_id가 있어 파트너명이 partners 테이블 소관 —
  // 여기서 수정 불가(읽기 전용). partner_id가 없는 건 관리자 직접 등록 광고.
  const isDirect = !!ad && !ad.partner_id

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !ad) return

    setUploadError('')

    if (!file.type.startsWith('image/')) {
      setUploadError('이미지 파일만 업로드할 수 있어요.')
      return
    }
    if (file.size > MAX_BANNER_BYTES) {
      setUploadError('파일 크기는 5MB를 넘을 수 없어요.')
      return
    }

    setBannerPreviewUrl(URL.createObjectURL(file))
    setUploading(true)

    // 직접 등록 광고(partner_id 없음)는 admin/ 경로, 파트너 신청 광고는
    // <partner_id>/ 경로로 업로드 - storage RLS(partner_ad_banners_insert_admin
    // / partner_ad_banners_insert_own)가 각각 이 경로 규칙을 요구함.
    // 원본 파일명은 Storage 키로 쓰지 않고 확장자만 유지해 새로 생성한다
    // ("Invalid key" 에러 방지).
    const folder = ad.partner_id || 'admin'
    const path = buildSafeUploadPath(folder, file)
    const { error: uploadErr } = await supabase.storage.from('partner-ad-banners').upload(path, file)

    if (uploadErr) {
      setUploadError('이미지 업로드 중 오류가 발생했어요: ' + uploadErr.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('partner-ad-banners').getPublicUrl(path)
    setBannerImageUrl(data.publicUrl)
    setUploading(false)
  }

  async function save() {
    if (!ad) return
    setSaveError('')
    setSaveDone(false)

    if (isDirect && !advertiserName.trim()) {
      setSaveError('광고주명을 입력해주세요.')
      return
    }

    setSaving(true)

    const update: { banner_image_url: string | null; end_date: string | null; advertiser_name?: string } = {
      banner_image_url: bannerImageUrl,
      end_date: endDate || null,
    }
    if (isDirect) {
      update.advertiser_name = advertiserName.trim()
    }

    const { error } = await supabase.from('ads').update(update).eq('id', ad.id)

    setSaving(false)
    if (error) {
      setSaveError('저장 중 오류가 발생했습니다: ' + error.message)
      return
    }
    setAd((prev) => (prev ? { ...prev, ...update } : prev))
    setSaveDone(true)
  }

  async function setStatus(nextStatus: AdStatus, reason: string | null) {
    if (!ad) return
    setStatusError('')
    setStatusUpdating(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const { error } = await supabase
      .from('ads')
      .update({
        status: nextStatus,
        reject_reason: reason,
        reviewed_by: session?.user.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', ad.id)

    setStatusUpdating(false)
    if (error) {
      setStatusError('처리 중 오류가 발생했습니다: ' + error.message)
      return
    }
    setAd((prev) => (prev ? { ...prev, status: nextStatus, reject_reason: reason } : prev))
  }

  function approve() {
    setStatus('active', null)
  }

  function stopOrReject(isStop: boolean) {
    const reason = window.prompt(isStop ? '게재를 중단할 사유를 입력해주세요 (선택)' : '반려 사유를 입력해주세요 (선택)') || null
    setStatus('rejected', reason)
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (notFound || !ad) {
    return (
      <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>광고를 찾을 수 없어요</h3>
        <Button variant="secondary" onClick={() => router.push('/admin/ads')} style={{ marginTop: 16 }}>
          목록으로
        </Button>
      </Card>
    )
  }

  return (
    <div>
      <Button variant="secondary" size="sm" onClick={() => router.push('/admin/ads')} style={{ marginBottom: 16 }}>
        ← 목록으로
      </Button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ ...styles.sectionTitle, marginBottom: 0 }}>{ad.partners?.name || ad.advertiser_name || '(삭제된 업체)'}</div>
        {isDirect && <span style={{ ...styles.htag, background: colors.paper2, color: colors.muted }}>직접 등록</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <span style={{ ...styles.htag, background: colors.paper2, color: colors.navy }}>{AD_TYPE_LABEL[ad.ad_type]}</span>
        <Badge style={statusBadgeStyle(ad.status)}>{AD_STATUS_LABEL[ad.status]}</Badge>
      </div>

      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 16 }}>등록 정보</div>

        <div style={styles.field}>
          <label style={styles.label}>광고 유형</label>
          <div style={{ fontSize: 14, color: colors.ink }}>{AD_TYPE_LABEL[ad.ad_type]}</div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>{isDirect ? '광고주명' : '파트너명'}</label>
          {isDirect ? (
            <Input
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              placeholder="예) OO물류 (공급업체가 아닌 제3자 광고주 표시용)"
            />
          ) : (
            <div style={{ fontSize: 14, color: colors.ink }}>
              {ad.partners?.name || '(삭제된 업체)'}
              <span style={{ fontSize: 11.5, color: colors.muted, marginLeft: 8 }}>(파트너 정보는 파트너 관리에서 수정)</span>
            </div>
          )}
        </div>

        <div style={styles.field}>
          <label style={styles.label}>배너 이미지</label>
          <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 8 }}>권장 크기 1200×400px, 최대 5MB (jpg/png)</div>
          <input type="file" accept="image/*" onChange={handleFileChange} />
          {uploadError && <div style={{ ...styles.errorBox, marginTop: 8 }}>{uploadError}</div>}
          {uploading && <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 8 }}>업로드 중...</div>}
          {(bannerPreviewUrl || bannerImageUrl) && (
            <img
              src={bannerPreviewUrl || bannerImageUrl || ''}
              alt="배너 미리보기"
              style={{ marginTop: 12, width: '100%', maxWidth: 420, borderRadius: 8, border: `1px solid ${colors.line}` }}
            />
          )}
        </div>

        <div style={styles.field}>
          <label style={styles.label}>게재 종료일 (비워두면 무기한)</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ maxWidth: 220 }} />
        </div>

        {saveError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{saveError}</div>}
        {saveDone && <div style={{ fontSize: 12.5, color: colors.good, marginBottom: 16 }}>✓ 저장되었습니다</div>}

        <Button variant="primary" onClick={save} disabled={saving || uploading}>
          {saving ? '저장 중...' : '저장'}
        </Button>
      </Card>

      <Card style={{ padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 4 }}>게재 상태</div>
        <div style={{ fontSize: 12.5, color: colors.muted, marginBottom: 16 }}>
          {formatDate(ad.created_at)} 신청
          {ad.memo && ` · 요청사항: ${ad.memo}`}
        </div>
        {ad.status === 'rejected' && ad.reject_reason && (
          <div style={{ fontSize: 12.5, color: colors.warn, marginBottom: 16 }}>사유: {ad.reject_reason}</div>
        )}

        {statusError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{statusError}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          {ad.status === 'pending' && (
            <>
              <Button variant="primary" size="sm" disabled={statusUpdating} onClick={approve}>
                승인
              </Button>
              <Button
                variant="secondary"
                size="sm"
                style={{ color: colors.warn, border: `1px solid ${colors.warn}` }}
                disabled={statusUpdating}
                onClick={() => stopOrReject(false)}
              >
                반려
              </Button>
            </>
          )}
          {ad.status === 'active' && (
            <Button
              variant="secondary"
              size="sm"
              style={{ color: colors.warn, border: `1px solid ${colors.warn}` }}
              disabled={statusUpdating}
              onClick={() => stopOrReject(true)}
            >
              게재 중단
            </Button>
          )}
          {ad.status === 'rejected' && (
            <Button variant="primary" size="sm" disabled={statusUpdating} onClick={approve}>
              게재중으로 전환
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
