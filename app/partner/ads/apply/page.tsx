'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { buildSafeUploadPath } from '../../../../lib/safeUploadPath'
import { colors, styles, formatDate } from '../../_shared'
import { usePartnerLayout } from '../../PartnerLayoutContext'
import Card from '../../../../components/ui/Card'
import Button from '../../../../components/ui/Button'

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
}

const MAX_BANNER_BYTES = 5 * 1024 * 1024

const AD_TYPE_INFO: Record<AdType, { label: string; desc: string; price: string }> = {
  box: { label: '박스광고', desc: '검색결과 상단에 박스형으로 강조 노출됩니다.', price: '100,000원 / 월' },
  line: { label: '줄광고', desc: '검색결과 목록에서 한 줄로 강조 노출됩니다.', price: '50,000원 / 월' },
  free: { label: '무료 노출', desc: '별도 비용 없이 기본 노출됩니다. 관리자 확인 후 게시됩니다.', price: '무료' },
  banner: { label: '롤링 배너', desc: '메인 화면 상단에 이미지 배너로 자동 슬라이드 노출됩니다.', price: '150,000원 / 월' },
}

const AD_STATUS_LABEL: Record<AdStatus, string> = {
  pending: '승인 대기',
  active: '게재중',
  rejected: '반려됨',
}

function statusBadgeStyle(status: AdStatus): React.CSSProperties {
  if (status === 'active') return { background: colors.goodBg, color: colors.good }
  if (status === 'rejected') return { background: colors.warnBg, color: colors.warn }
  return { background: '#E7EEF5', color: colors.navy }
}

// 광고 신청 화면. 이 리포에 원래 있던 게 아니라 이번에 광고 시스템 전체를
// 새로 설계하며 만든 화면 — box/line/free/banner 4종 전부 여기서 신청하고,
// 신청 이력/상태(승인 대기·게재중·반려됨)도 여기서 확인함. 실제 노출
// 위치는 banner(BuyerHomeFeed 롤링 배너)만 구현되어 있고, box/line/free는
// 신청·승인 플로우까지만 있음(HANDOFF 참고).
export default function PartnerAdsApplyPage() {
  const { partner } = usePartnerLayout()

  const [ads, setAds] = useState<AdRow[]>([])
  const [loading, setLoading] = useState(true)

  const [adType, setAdType] = useState<AdType>('box')
  const [memo, setMemo] = useState('')
  const [endDate, setEndDate] = useState('')
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null)
  const [bannerUploadedUrl, setBannerUploadedUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    loadAds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadAds() {
    supabase
      .from('ads')
      .select('id, ad_type, status, banner_image_url, memo, reject_reason, end_date, created_at')
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAds((data || []) as AdRow[])
        setLoading(false)
      })
  }

  async function handleBannerFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError('')

    if (!file.type.startsWith('image/')) {
      setUploadError('이미지 파일만 업로드할 수 있어요.')
      return
    }
    if (file.size > MAX_BANNER_BYTES) {
      setUploadError('파일 크기는 5MB를 넘을 수 없어요.')
      return
    }

    setBannerFile(file)
    setBannerPreviewUrl(URL.createObjectURL(file))
    setBannerUploadedUrl(null)
    setUploading(true)

    // 원본 파일명(한글/공백/특수문자 포함 가능)은 Storage 키로 쓰지 않고
    // 확장자만 유지해 새로 생성한다("Invalid key" 에러 방지).
    const path = buildSafeUploadPath(partner.id, file)
    const { error: uploadErr } = await supabase.storage.from('partner-ad-banners').upload(path, file)

    if (uploadErr) {
      setUploadError('이미지 업로드 중 오류가 발생했어요: ' + uploadErr.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('partner-ad-banners').getPublicUrl(path)
    setBannerUploadedUrl(data.publicUrl)
    setUploading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    setSubmitted(false)

    if (adType === 'banner' && !bannerUploadedUrl) {
      setSubmitError('배너 이미지를 업로드해주세요.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('ads').insert({
      partner_id: partner.id,
      ad_type: adType,
      memo: memo.trim() || null,
      banner_image_url: adType === 'banner' ? bannerUploadedUrl : null,
      end_date: endDate || null,
    })
    setSubmitting(false)

    if (error) {
      setSubmitError('신청 중 오류가 발생했어요: ' + error.message)
      return
    }

    setSubmitted(true)
    setMemo('')
    setEndDate('')
    setBannerFile(null)
    setBannerPreviewUrl(null)
    setBannerUploadedUrl(null)
    loadAds()
  }

  return (
    <div>
      <div style={styles.sectionTitle}>광고 신청</div>
      <div style={styles.sectionSub}>
        원하는 광고 유형을 선택해 신청하면, 담당자 확인(입금 확인 등) 후 게재됩니다.
      </div>

      <div style={styles.card}>
        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>광고 유형</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {(Object.keys(AD_TYPE_INFO) as AdType[]).map((t) => (
                <label key={t} style={{ display: 'block', cursor: 'pointer' }}>
                  <Card
                    style={{
                      padding: 14,
                      border: adType === t ? '1.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                      background: adType === t ? 'var(--color-surface-muted)' : 'var(--color-surface)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="ad_type"
                        checked={adType === t}
                        onChange={() => setAdType(t)}
                      />
                      <b style={{ fontSize: 13.5, color: colors.ink }}>{AD_TYPE_INFO[t].label}</b>
                    </div>
                    <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>{AD_TYPE_INFO[t].desc}</div>
                    <div style={{ fontSize: 12.5, color: colors.navy, fontWeight: 700, marginTop: 6 }}>
                      {AD_TYPE_INFO[t].price}
                    </div>
                  </Card>
                </label>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: colors.muted, marginTop: 8 }}>
              ※ 위 가격은 안내용 예시입니다. 실제 청구 금액과 결제(계좌이체) 방법은 신청 후 담당자가 별도로
              안내드립니다.
            </div>
          </div>

          {adType === 'banner' && (
            <div style={styles.field}>
              <label style={styles.label}>배너 이미지</label>
              <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 8 }}>
                권장 크기 1200×400px, 최대 5MB (jpg/png)
              </div>
              <input type="file" accept="image/*" onChange={handleBannerFileChange} />
              {bannerFile && <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>{bannerFile.name}</div>}
              {uploadError && <div style={{ ...styles.errorBox, marginTop: 8 }}>{uploadError}</div>}
              {uploading && <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 8 }}>업로드 중...</div>}
              {bannerPreviewUrl && (
                <img
                  src={bannerPreviewUrl}
                  alt="배너 미리보기"
                  style={{ marginTop: 12, width: '100%', maxWidth: 420, borderRadius: 8, border: `1px solid ${colors.line}` }}
                />
              )}
              {bannerUploadedUrl && (
                <div style={{ fontSize: 12, color: colors.good, marginTop: 6 }}>✓ 업로드 완료</div>
              )}
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>게재 종료 희망일 (선택, 비워두면 무기한)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ ...styles.input, maxWidth: 220 }}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>요청사항 (선택)</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              style={styles.textarea}
              placeholder="희망 게재 기간, 문의사항 등을 자유롭게 남겨주세요."
            />
          </div>

          {submitError && <div style={styles.errorBox}>{submitError}</div>}
          {submitted && <div style={styles.successBox}>신청이 접수됐어요. 담당자 확인 후 게재됩니다.</div>}

          <Button
            type="submit"
            variant="primary"
            style={{ marginTop: 8 }}
            disabled={submitting || uploading}
          >
            {submitting ? '신청 중...' : '신청하기'}
          </Button>
        </form>
      </div>

      <div style={{ ...styles.sectionTitle, fontSize: 16, marginTop: 32 }}>신청 이력</div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
      ) : ads.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={{ fontSize: 13.5, color: colors.muted }}>아직 신청한 광고가 없어요.</p>
        </div>
      ) : (
        ads.map((ad) => (
          <div key={ad.id} style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 14, color: colors.ink }}>{AD_TYPE_INFO[ad.ad_type].label}</b>
                <span style={{ ...styles.btn, ...statusBadgeStyle(ad.status), padding: '3px 9px', fontSize: 11, cursor: 'default' }}>
                  {AD_STATUS_LABEL[ad.status]}
                </span>
              </div>
              <span style={{ fontSize: 12, color: colors.muted }}>{formatDate(ad.created_at)} 신청</span>
            </div>
            {ad.banner_image_url && (
              <img
                src={ad.banner_image_url}
                alt="배너 이미지"
                style={{ marginTop: 12, width: '100%', maxWidth: 420, borderRadius: 8, border: `1px solid ${colors.line}` }}
              />
            )}
            {ad.end_date && (
              <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 10 }}>종료 희망일: {ad.end_date.replaceAll('-', '.')}</div>
            )}
            {ad.memo && <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 6 }}>요청사항: {ad.memo}</div>}
            {ad.status === 'rejected' && ad.reject_reason && (
              <div style={{ ...styles.errorBox, marginTop: 10, marginBottom: 0 }}>반려 사유: {ad.reject_reason}</div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
