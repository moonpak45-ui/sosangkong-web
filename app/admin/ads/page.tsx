'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { buildSafeUploadPath } from '../../../lib/safeUploadPath'
import { colors, styles, formatDate, statusBadgeStyle } from '../_shared'
import Card from '../../../components/ui/Card'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import Select from '../../../components/ui/Select'

type AdType = 'box' | 'line' | 'free' | 'banner'
type AdStatus = 'pending' | 'active' | 'rejected'

type AdRow = {
  id: string
  ad_type: AdType
  status: AdStatus
  banner_image_url: string | null
  memo: string | null
  reject_reason: string | null
  end_date: string | null
  created_at: string
  advertiser_name: string | null
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

// 관리자가 직접 등록하는 광고("광고 직접 등록")는 공급업체 신청이 아니라
// 제3자 광고주를 대신 등록하는 것이라 free(공급업체 무료 노출) 유형은
// 대상이 아님 - box/line/banner 3종만 선택지로 제공.
const DIRECT_AD_TYPES: Extract<AdType, 'box' | 'line' | 'banner'>[] = ['box', 'line', 'banner']
const MAX_BANNER_BYTES = 5 * 1024 * 1024

type RegisterForm = {
  adType: Extract<AdType, 'box' | 'line' | 'banner'>
  advertiserName: string
  endDate: string
  linkUrl: string
}

const EMPTY_REGISTER_FORM: RegisterForm = { adType: 'box', advertiserName: '', endDate: '', linkUrl: '' }

// 광고 승인 화면. box/line/free/banner 4종 신청을 한곳에서 검토·승인/반려.
// 결제는 오프라인 계좌이체로 이뤄지고(이 프로젝트에 결제 연동 자체가 없음),
// 관리자가 입금 확인 등을 시스템 밖에서 마친 뒤 여기서 수동으로 승인함.
//
// "광고 직접 등록"은 공급업체 신청 없이 관리자가 제3자 광고주(예: 외부
// 업체의 협찬 배너)를 바로 status='active'로 등록하는 별도 플로우 —
// ads.partner_id를 nullable로 바꾸고 advertiser_name 컬럼을 추가한
// 20260930000000 마이그레이션이 선행되어야 함. box/line 광고는 /search가
// SupplierResultCard(partners 테이블 전체 컬럼에 의존)로 렌더링하기 때문에
// partner_id가 없는 box/line 광고는 이 화면·DB엔 정상 등록되지만 /search에
// 실제로 노출되진 않음(범위 밖 - 별도 렌더링 경로 필요). banner는
// AdRollingBanner.tsx가 이미지+링크만 쓰므로 정상 노출됨.
export default function AdminAdsPage() {
  const router = useRouter()
  const [ads, setAds] = useState<AdRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'active' | 'rejected' | 'all'>('pending')

  const [mode, setMode] = useState<'list' | 'form'>('list')
  const [regForm, setRegForm] = useState<RegisterForm>(EMPTY_REGISTER_FORM)
  const [regBannerFile, setRegBannerFile] = useState<File | null>(null)
  const [regBannerPreviewUrl, setRegBannerPreviewUrl] = useState<string | null>(null)
  const [regBannerUploadedUrl, setRegBannerUploadedUrl] = useState<string | null>(null)
  const [regUploading, setRegUploading] = useState(false)
  const [regUploadError, setRegUploadError] = useState('')
  const [regSubmitting, setRegSubmitting] = useState(false)
  const [regSubmitError, setRegSubmitError] = useState('')

  function load() {
    supabase
      .from('ads')
      .select('id, ad_type, status, banner_image_url, memo, reject_reason, end_date, created_at, advertiser_name, partners ( id, name )')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAds((data || []) as unknown as AdRow[])
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  function startCreate() {
    setRegForm(EMPTY_REGISTER_FORM)
    setRegBannerFile(null)
    setRegBannerPreviewUrl(null)
    setRegBannerUploadedUrl(null)
    setRegUploadError('')
    setRegSubmitError('')
    setMode('form')
  }

  function cancelCreate() {
    setMode('list')
  }

  function updateRegForm<K extends keyof RegisterForm>(field: K, value: RegisterForm[K]) {
    setRegForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleRegBannerFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setRegUploadError('')

    if (!file.type.startsWith('image/')) {
      setRegUploadError('이미지 파일만 업로드할 수 있어요.')
      return
    }
    if (file.size > MAX_BANNER_BYTES) {
      setRegUploadError('파일 크기는 5MB를 넘을 수 없어요.')
      return
    }

    setRegBannerFile(file)
    setRegBannerPreviewUrl(URL.createObjectURL(file))
    setRegBannerUploadedUrl(null)
    setRegUploading(true)

    // admin/ 경로로 업로드 - storage RLS(partner_ad_banners_insert_admin)가
    // 이 경로 접두사 + qd_is_admin()을 요구함(20260930000000 마이그레이션).
    // 원본 파일명(한글/공백/특수문자 포함 가능)은 Storage 키로 쓰지 않고
    // 확장자만 유지해 새로 생성한다("Invalid key" 에러 방지).
    const path = buildSafeUploadPath('admin', file)
    const { error: uploadErr } = await supabase.storage.from('partner-ad-banners').upload(path, file)

    if (uploadErr) {
      setRegUploadError('이미지 업로드 중 오류가 발생했어요: ' + uploadErr.message)
      setRegUploading(false)
      return
    }

    const { data } = supabase.storage.from('partner-ad-banners').getPublicUrl(path)
    setRegBannerUploadedUrl(data.publicUrl)
    setRegUploading(false)
  }

  async function submitRegister() {
    setRegSubmitError('')

    if (!regForm.advertiserName.trim()) {
      setRegSubmitError('광고주명을 입력해주세요.')
      return
    }
    if (regForm.adType === 'banner' && !regBannerUploadedUrl) {
      setRegSubmitError('배너 이미지를 업로드해주세요.')
      return
    }
    const trimmedLinkUrl = regForm.linkUrl.trim()
    if (trimmedLinkUrl && !/^(https?:\/\/|\/)/i.test(trimmedLinkUrl)) {
      setRegSubmitError('연결 링크는 http:// 또는 https://로 시작해야 해요.')
      return
    }

    setRegSubmitting(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const { error } = await supabase.from('ads').insert({
      partner_id: null,
      advertiser_name: regForm.advertiserName.trim(),
      ad_type: regForm.adType,
      status: 'active',
      banner_image_url: regForm.adType === 'banner' ? regBannerUploadedUrl : null,
      end_date: regForm.endDate || null,
      link_url: trimmedLinkUrl || null,
      reviewed_by: session?.user.id ?? null,
      reviewed_at: new Date().toISOString(),
    })

    setRegSubmitting(false)

    if (error) {
      setRegSubmitError('등록 중 오류가 발생했습니다: ' + error.message)
      return
    }

    setMode('list')
    setTab('active')
    load()
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={styles.sectionTitle}>광고 관리</div>
          <div style={styles.sectionSub}>공급업체의 박스광고·줄광고·무료·롤링배너 신청을 검토하고 승인/반려하세요.</div>
        </div>
        {mode === 'list' && (
          <Button variant="primary" onClick={startCreate}>
            광고 직접 등록
          </Button>
        )}
      </div>

      {mode === 'form' && (
        <Card style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 4 }}>광고 직접 등록</div>
          <div style={{ fontSize: 12.5, color: colors.muted, marginBottom: 16 }}>
            공급업체 신청 없이 제3자 광고주를 바로 게재중 상태로 등록합니다.
          </div>

          <div style={styles.field}>
            <label style={styles.label}>광고 유형</label>
            <Select
              value={regForm.adType}
              onChange={(e) => updateRegForm('adType', e.target.value as RegisterForm['adType'])}
            >
              {DIRECT_AD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {AD_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>광고주명 *</label>
            <Input
              value={regForm.advertiserName}
              onChange={(e) => updateRegForm('advertiserName', e.target.value)}
              placeholder="예) OO물류 (공급업체가 아닌 제3자 광고주 표시용)"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              배너 이미지{regForm.adType === 'banner' ? ' *' : ' (선택)'}
            </label>
            <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 8 }}>
              권장 크기 1200×400px, 최대 5MB (jpg/png)
              {regForm.adType !== 'banner' && ' — 박스/줄광고는 현재 /search 화면에서 이미지가 쓰이지 않습니다.'}
            </div>
            <input type="file" accept="image/*" onChange={handleRegBannerFileChange} />
            {regBannerFile && <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>{regBannerFile.name}</div>}
            {regUploadError && <div style={{ ...styles.errorBox, marginTop: 8 }}>{regUploadError}</div>}
            {regUploading && <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 8 }}>업로드 중...</div>}
            {regBannerPreviewUrl && (
              <img
                src={regBannerPreviewUrl}
                alt="배너 미리보기"
                style={{ marginTop: 12, width: '100%', maxWidth: 420, borderRadius: 8, border: `1px solid ${colors.line}` }}
              />
            )}
            {regBannerUploadedUrl && <div style={{ fontSize: 12, color: colors.good, marginTop: 6 }}>✓ 업로드 완료</div>}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>게재 종료일 (선택, 비워두면 무기한)</label>
            <Input
              type="date"
              value={regForm.endDate}
              onChange={(e) => updateRegForm('endDate', e.target.value)}
              style={{ maxWidth: 220 }}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>연결 링크 (선택)</label>
            <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 8 }}>
              배너 클릭 시 이동할 광고주 사이트 주소. 비워두면 클릭해도 이동하지 않아요.
            </div>
            <Input
              value={regForm.linkUrl}
              onChange={(e) => updateRegForm('linkUrl', e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          {regSubmitError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{regSubmitError}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={submitRegister} disabled={regSubmitting || regUploading}>
              {regSubmitting ? '등록 중...' : '바로 게재중으로 등록'}
            </Button>
            <Button variant="secondary" onClick={cancelCreate} disabled={regSubmitting}>
              취소
            </Button>
          </div>
        </Card>
      )}

      {mode === 'list' && (
        <>
          <div style={styles.tabRow}>
            {(['pending', 'active', 'rejected', 'all'] as const).map((t) => (
              <div key={t} style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }} onClick={() => setTab(t)}>
                {t === 'all' ? '전체' : AD_STATUS_LABEL[t]} ({counts[t]})
              </div>
            ))}
          </div>

          {visible.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
              <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>해당하는 광고 신청이 없어요</h3>
            </Card>
          ) : (
            visible.map((ad) => (
              <Card
                key={ad.id}
                style={{ padding: 20, marginBottom: 16, cursor: 'pointer' }}
                onClick={() => router.push(`/admin/ads/${ad.id}`)}
              >
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
                        <b style={{ fontSize: 14.5, color: colors.ink }}>
                          {ad.partners?.name || ad.advertiser_name || '(삭제된 업체)'}
                        </b>
                        {!ad.partners && ad.advertiser_name && (
                          <span style={{ ...styles.htag, background: colors.paper2, color: colors.muted }}>직접 등록</span>
                        )}
                        <span style={{ ...styles.htag, background: colors.paper2, color: colors.navy }}>{AD_TYPE_LABEL[ad.ad_type]}</span>
                        <Badge style={statusBadgeStyle(ad.status)}>{AD_STATUS_LABEL[ad.status]}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>
                        {formatDate(ad.created_at)} 신청
                        {ad.end_date && ` · 종료 희망일 ${ad.end_date.replaceAll('-', '.')}`}
                      </div>
                      {ad.memo && <div style={{ fontSize: 12.5, color: colors.ink, marginTop: 8 }}>요청사항: {ad.memo}</div>}
                      {ad.status === 'rejected' && ad.reject_reason && (
                        <div style={{ fontSize: 12.5, color: colors.warn, marginTop: 8 }}>사유: {ad.reject_reason}</div>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: colors.muted, flexShrink: 0, alignSelf: 'center' }}>자세히 보기 ›</div>
                </div>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  )
}
