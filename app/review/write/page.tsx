'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

const TAG_OPTIONS = ['정시배송', '신선한상태', '친절한응대', '합리적가격', '빠른회신', '재거래의향']
const CONTENT_MAX = 300

function Star({ filled, onClick }: { filled: boolean; onClick: () => void }) {
  return (
    <span onClick={onClick} style={{ cursor: 'pointer', fontSize: 26, color: filled ? '#F2A93B' : '#D9E3EA' }}>
      ★
    </span>
  )
}

function StarRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= value} onClick={() => onChange(n)} />
      ))}
    </div>
  )
}

function ReviewWriteInner() {
  const searchParams = useSearchParams()
  const dealId = searchParams.get('deal_id') || ''

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [buyerProfileId, setBuyerProfileId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [alreadyReviewed, setAlreadyReviewed] = useState(false)

  const [overallRating, setOverallRating] = useState(0)
  const [deliveryRating, setDeliveryRating] = useState(0)
  const [qualityRating, setQualityRating] = useState(0)
  const [responseRating, setResponseRating] = useState(0)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [content, setContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    async function load() {
      if (!dealId) {
        setLoadError('리뷰를 작성할 거래가 지정되지 않았습니다.')
        setLoading(false)
        return
      }

      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()

      if (!authSession) {
        setSession(null)
        setLoading(false)
        return
      }
      setSession({ userId: authSession.user.id })

      const { data: profile } = await supabase
        .from('buyer_profiles')
        .select('id')
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!profile) {
        setLoadError('구매자(소상공인) 계정으로 로그인해주세요.')
        setLoading(false)
        return
      }
      setBuyerProfileId(profile.id)

      const { data: deal } = await supabase
        .from('deals')
        .select('id, buyer_id, partners ( name )')
        .eq('id', dealId)
        .maybeSingle()

      if (!deal || deal.buyer_id !== profile.id) {
        setLoadError('해당 거래의 리뷰를 작성할 권한이 없습니다.')
        setLoading(false)
        return
      }
      setPartnerName((deal.partners as unknown as { name: string } | null)?.name || '')

      const { data: existingReview } = await supabase
        .from('reviews')
        .select('id')
        .eq('deal_id', dealId)
        .maybeSingle()

      if (existingReview) {
        setAlreadyReviewed(true)
      }

      setLoading(false)
    }

    load()
  }, [dealId])

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }
      return next
    })
  }

  async function submitReview() {
    setSubmitError('')

    if (overallRating < 1) {
      setSubmitError('전체 만족도를 선택해주세요.')
      return
    }
    if (!buyerProfileId) return

    setSubmitting(true)

    const { error } = await supabase.from('reviews').insert({
      deal_id: dealId,
      buyer_id: buyerProfileId,
      overall_rating: overallRating,
      sub_ratings: {
        delivery: deliveryRating,
        quality: qualityRating,
        response: responseRating,
      },
      tags: [...selectedTags],
      content: content.trim(),
      is_anonymous: isAnonymous,
    })

    setSubmitting(false)

    if (error) {
      setSubmitError('리뷰 저장 중 오류가 발생했습니다: ' + error.message)
      return
    }

    setSubmitted(true)
    window.scrollTo(0, 0)
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 리뷰를 작성할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>{loadError}</p>
        <a href="/my-page" style={styles.btnPrimary}>
          마이페이지로 이동
        </a>
      </div>
    )
  }

  if (alreadyReviewed && !submitted) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>이미 리뷰를 작성한 거래입니다.</p>
        <a href="/my-page" style={styles.btnPrimary}>
          마이페이지로 이동
        </a>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={styles.confirmView}>
        <div style={styles.confirmIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#0B7A6D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={styles.confirmH2}>리뷰가 등록됐어요</h2>
        <p style={styles.confirmP}>소중한 후기 감사합니다. 다른 소상공인에게 큰 도움이 됩니다.</p>
        <a href="/my-page" style={{ ...styles.btnPrimary, width: '100%' }}>
          마이페이지로 이동
        </a>
      </div>
    )
  }

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <div style={styles.pageHead}>
          <div style={styles.eyebrow}>리뷰 작성</div>
          <h1 style={styles.h1}>{partnerName}와의 거래는 어떠셨나요?</h1>
          <p style={styles.headP}>솔직한 후기는 다른 소상공인의 좋은 선택에 도움이 됩니다.</p>
        </div>

        <div style={styles.card}>
          <div style={styles.field}>
            <label style={styles.label}>전체 만족도 *</label>
            <StarRow value={overallRating} onChange={setOverallRating} />
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>배송정시성</label>
              <StarRow value={deliveryRating} onChange={setDeliveryRating} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>품질</label>
              <StarRow value={qualityRating} onChange={setQualityRating} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>응대</label>
              <StarRow value={responseRating} onChange={setResponseRating} />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>해당하는 항목을 선택해주세요 (선택)</label>
            <div style={styles.chipGroup}>
              {TAG_OPTIONS.map((tag) => {
                const selected = selectedTags.has(tag)
                return (
                  <div
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{ ...styles.chip, ...(selected ? styles.chipSelected : {}) }}
                  >
                    {tag}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              자세한 후기 (선택) <span style={{ color: colors.muted, fontWeight: 400 }}>{content.length}/{CONTENT_MAX}자</span>
            </label>
            <textarea
              style={styles.textarea}
              placeholder="배송, 품질, 응대 등 자세한 경험을 남겨주세요."
              value={content}
              maxLength={CONTENT_MAX}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <label style={styles.checkboxRow}>
            <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
            업체명 비공개 (리뷰에 사업장명 대신 &quot;이용자&quot;로 표시됩니다)
          </label>

          {submitError && <div style={{ ...styles.errorBox, marginTop: 8 }}>{submitError}</div>}

          <button
            style={{ ...styles.btnPrimary, width: '100%', marginTop: 18 }}
            onClick={submitReview}
            disabled={submitting}
            type="button"
          >
            {submitting ? '등록 중...' : '리뷰 등록하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReviewWritePage() {
  return (
    <Suspense fallback={<div style={{ padding: 60 }}>불러오는 중...</div>}>
      <ReviewWriteInner />
    </Suspense>
  )
}

const colors = {
  deep: '#0A1E3D',
  navy: '#065A82',
  ink: '#16233B',
  paper: '#F7FAFC',
  paper2: '#EFF5F8',
  line: '#D9E3EA',
  muted: '#5B6B79',
  white: '#FFFFFF',
  amber: '#F2A93B',
  good: '#0B7A6D',
  goodBg: '#E3F4F0',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 640, margin: '0 auto', padding: '0 32px 90px' },
  pageHead: { padding: '30px 0 6px' },
  eyebrow: { fontSize: 13, color: colors.navy, fontWeight: 700, marginBottom: 8 },
  h1: { fontSize: 21, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  headP: { marginTop: 8, color: colors.muted, fontSize: 14 },
  card: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 26, marginTop: 22 },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  field: { marginBottom: 20 },
  label: { display: 'block', fontSize: 12.8, color: colors.muted, fontWeight: 600, marginBottom: 8 },
  textarea: {
    width: '100%',
    border: `1px solid ${colors.line}`,
    borderRadius: 6,
    padding: '11px 12px',
    fontSize: 14,
    color: colors.ink,
    background: colors.paper2,
    minHeight: 100,
    resize: 'vertical',
    fontFamily: "'Noto Sans KR', sans-serif",
  },
  chipGroup: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: {
    border: `1px solid ${colors.line}`,
    borderRadius: 20,
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink,
    cursor: 'pointer',
    background: colors.white,
  },
  chipSelected: { background: colors.deep, color: colors.white, borderColor: colors.deep },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12.5,
    color: colors.muted,
    cursor: 'pointer',
  },
  errorBox: { background: '#FDECEC', color: '#B3261E', borderRadius: 7, padding: '10px 12px', fontSize: 12.5 },
  btnPrimary: {
    background: colors.amber,
    color: colors.deep,
    border: 'none',
    borderRadius: 6,
    padding: '13px 24px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmView: { maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' },
  confirmIcon: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    background: colors.goodBg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  confirmH2: { fontSize: 21, fontFamily: "'Noto Serif KR', serif", color: colors.deep, margin: 0 },
  confirmP: { color: colors.muted, fontSize: 14, marginTop: 10 },
}
