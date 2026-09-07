'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

type SubRatings = { delivery?: number; quality?: number; response?: number }

type ReviewDetail = {
  id: string
  overall_rating: number
  sub_ratings: SubRatings | null
  tags: string[] | null
  content: string | null
  is_anonymous: boolean
  created_at: string
  deals: { partners: { name: string } | null } | null
}

function stars(rating: number) {
  const n = Math.max(0, Math.min(5, rating))
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(n)
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function ReviewViewInner() {
  const searchParams = useSearchParams()
  const dealId = searchParams.get('deal_id') || ''

  const [loading, setLoading] = useState(true)
  const [review, setReview] = useState<ReviewDetail | null>(null)

  useEffect(() => {
    async function load() {
      if (!dealId) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('reviews')
        .select(
          `id, overall_rating, sub_ratings, tags, content, is_anonymous, created_at,
           deals ( partners ( name ) )`
        )
        .eq('deal_id', dealId)
        .maybeSingle()

      setReview((data as unknown as ReviewDetail) || null)
      setLoading(false)
    }

    load()
  }, [dealId])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (!review) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>해당 거래의 리뷰를 찾을 수 없어요.</p>
        <a href="/my-page" style={styles.btnPrimary}>
          마이페이지로 이동
        </a>
      </div>
    )
  }

  const sub = review.sub_ratings || {}
  const partnerName = review.deals?.partners?.name || '업체 정보 없음'

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <a href="/my-page" style={styles.backLink}>
          ← 마이페이지로
        </a>

        <div style={styles.pageHead}>
          <div style={styles.eyebrow}>내가 작성한 리뷰</div>
          <h1 style={styles.h1}>{partnerName}</h1>
          <p style={styles.headP}>{formatDate(review.created_at)}에 작성한 리뷰입니다.</p>
        </div>

        <div style={styles.card}>
          <div style={styles.field}>
            <label style={styles.label}>전체 만족도</label>
            <span style={styles.starsBig}>{stars(review.overall_rating)}</span>
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>배송정시성</label>
              <span style={styles.stars}>{stars(sub.delivery || 0)}</span>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>품질</label>
              <span style={styles.stars}>{stars(sub.quality || 0)}</span>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>응대</label>
              <span style={styles.stars}>{stars(sub.response || 0)}</span>
            </div>
          </div>

          {review.tags && review.tags.length > 0 && (
            <div style={styles.field}>
              <label style={styles.label}>선택한 항목</label>
              <div style={styles.chipGroup}>
                {review.tags.map((tag) => (
                  <span key={tag} style={styles.chip}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>자세한 후기</label>
            <p style={styles.content}>{review.content || '작성한 후기 내용이 없어요.'}</p>
          </div>

          <div style={styles.anonNote}>
            {review.is_anonymous
              ? '업체명 비공개로 작성됨 (업체 상세페이지에는 "이용자"로 표시돼요)'
              : '사업장명 공개로 작성됨'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReviewViewPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60 }}>불러오는 중...</div>}>
      <ReviewViewInner />
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
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 640, margin: '0 auto', padding: '0 32px 90px' },
  backLink: { display: 'inline-block', marginTop: 26, fontSize: 13, color: colors.muted, textDecoration: 'none' },
  pageHead: { padding: '18px 0 6px' },
  eyebrow: { fontSize: 13, color: colors.navy, fontWeight: 700, marginBottom: 8 },
  h1: { fontSize: 21, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  headP: { marginTop: 8, color: colors.muted, fontSize: 14 },
  card: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 26, marginTop: 22 },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  field: { marginBottom: 20 },
  label: { display: 'block', fontSize: 12.8, color: colors.muted, fontWeight: 600, marginBottom: 8 },
  starsBig: { color: colors.amber, fontSize: 24 },
  stars: { color: colors.amber, fontSize: 18 },
  chipGroup: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: {
    border: `1px solid ${colors.line}`,
    borderRadius: 20,
    padding: '7px 14px',
    fontSize: 12.5,
    fontWeight: 600,
    color: colors.ink,
    background: colors.paper2,
  },
  content: { fontSize: 13.5, color: colors.ink, lineHeight: 1.7, background: colors.paper2, borderRadius: 6, padding: '12px 14px', margin: 0 },
  anonNote: { fontSize: 12, color: colors.muted, borderTop: `1px dashed ${colors.line}`, paddingTop: 14, marginTop: 4 },
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
    marginTop: 20,
  },
}
