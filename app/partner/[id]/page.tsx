'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { useFavorites } from '../../../lib/useFavorites'
import FavoriteHeart from '../../../components/FavoriteHeart'
import Card from '../../../components/ui/Card'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'

type PartnerDetail = {
  id: string
  name: string
  region: string | null
  description: string | null
  verified_badge: boolean
  rating_avg: number
  review_count: number
}

type CategoryRow = { categories: { name: string } | null }

type ReviewRow = {
  id: string
  overall_rating: number
  tags: string[] | null
  content: string | null
  is_anonymous: boolean
  created_at: string
  deals: { buyer_profiles: { business_name: string } | null } | null
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function stars(rating: number) {
  return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(rating)
}

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const partnerId = params.id

  const [partner, setPartner] = useState<PartnerDetail | null | undefined>(undefined)
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const { favoritePartnerIds, toggleFavorite, pendingId } = useFavorites()

  useEffect(() => {
    async function load() {
      const [{ data: partnerRow }, { data: catRows }, { data: reviewRows }] = await Promise.all([
        supabase
          .from('partners')
          .select('id, name, region, description, verified_badge, rating_avg, review_count')
          .eq('id', partnerId)
          .maybeSingle(),
        supabase
          .from('partner_categories')
          .select('categories ( name )')
          .eq('partner_id', partnerId),
        supabase
          .from('reviews')
          .select(
            `id, overall_rating, tags, content, is_anonymous, created_at,
             deals!inner ( partner_id, buyer_profiles ( business_name ) )`
          )
          .eq('deals.partner_id', partnerId)
          .order('created_at', { ascending: false }),
      ])

      setPartner((partnerRow as PartnerDetail) || null)
      setCategoryNames(
        ((catRows || []) as unknown as CategoryRow[])
          .map((r) => r.categories?.name)
          .filter((n): n is string => Boolean(n))
      )
      setReviews((reviewRows || []) as unknown as ReviewRow[])
    }

    if (partnerId) load()
  }, [partnerId])

  if (partner === undefined) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (partner === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>업체 정보를 찾을 수 없어요.</p>
        <a href="/search" style={styles.btnPrimary}>
          검색으로 돌아가기
        </a>
      </div>
    )
  }

  return (
    <div style={{ background: colors.paper, minHeight: '70vh' }}>
      <div style={styles.wrap}>
        <Card style={{ padding: 28 }}>
          <div style={styles.headTop}>
            <div style={styles.icon}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.nameRow}>
                <h1 style={styles.h1}>{partner.name}</h1>
                {partner.verified_badge && (
                  <Badge style={{ background: colors.goodBg, color: colors.good }}>✓ 검증 업체</Badge>
                )}
              </div>
              <div style={styles.loc}>{partner.region || '지역 정보 없음'}</div>
              <div style={styles.stats}>
                <span style={styles.stat}>
                  평점 <b>{Number(partner.rating_avg || 0).toFixed(1)}</b>
                </span>
                <span style={styles.stat}>
                  리뷰 <b>{partner.review_count}건</b>
                </span>
              </div>
              {categoryNames.length > 0 && (
                <div style={styles.catRow}>
                  {categoryNames.map((c) => (
                    <span key={c} style={styles.catChip}>
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <FavoriteHeart
              active={favoritePartnerIds.has(partner.id)}
              pending={pendingId === partner.id}
              onClick={() => toggleFavorite(partner.id)}
              size={22}
            />
          </div>

          {partner.description && <p style={styles.desc}>{partner.description}</p>}

          <Button
            variant="primary"
            style={{ marginTop: 24 }}
            onClick={() => router.push(`/quote-request?partner_ids=${partner.id}`)}
          >
            무료 견적 요청
          </Button>
        </Card>

        <div style={styles.reviewSection}>
          <h2 style={styles.reviewH2}>이용자 후기 ({reviews.length})</h2>

          {reviews.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ fontSize: 13.5, color: colors.muted }}>아직 등록된 후기가 없어요.</p>
            </Card>
          ) : (
            reviews.map((r) => (
              <Card key={r.id} style={{ padding: '18px 20px', marginBottom: 12 }}>
                <div style={styles.reviewTop}>
                  <div>
                    <span style={styles.reviewStars}>{stars(r.overall_rating)}</span>
                    <span style={styles.reviewer}>
                      {r.is_anonymous ? '이용자' : r.deals?.buyer_profiles?.business_name || '이용자'}
                    </span>
                  </div>
                  <span style={styles.reviewDate}>{formatDate(r.created_at)}</span>
                </div>
                {r.tags && r.tags.length > 0 && (
                  <div style={styles.catRow}>
                    {r.tags.map((tag) => (
                      <span key={tag} style={styles.reviewTagChip}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {r.content && <p style={styles.reviewContent}>{r.content}</p>}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
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
  wrap: { maxWidth: 760, margin: '0 auto', padding: '36px 32px 90px' },
  headTop: { display: 'flex', alignItems: 'flex-start', gap: 18 },
  icon: { width: 64, height: 64, borderRadius: 14, background: colors.paper2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 10 },
  h1: { fontSize: 21, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  loc: { fontSize: 13, color: colors.muted, marginTop: 6 },
  stats: { display: 'flex', gap: 16, marginTop: 10 },
  stat: { fontSize: 12.5, color: colors.muted },
  catRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  catChip: { fontSize: 11.5, fontWeight: 600, color: colors.navy, background: colors.paper2, padding: '4px 10px', borderRadius: 20 },
  desc: { fontSize: 13.5, color: colors.ink, lineHeight: 1.6, marginTop: 22, paddingTop: 20, borderTop: `1px dashed ${colors.line}` },
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: colors.amber, color: colors.deep, border: 'none', borderRadius: 6,
    padding: '13px 24px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
    textDecoration: 'none', marginTop: 24,
  },
  reviewSection: { marginTop: 32 },
  reviewH2: { fontSize: 17, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, marginBottom: 14 },
  reviewTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  reviewStars: { color: colors.amber, fontSize: 14, marginRight: 8 },
  reviewer: { fontSize: 13, fontWeight: 700, color: colors.ink },
  reviewDate: { fontSize: 11.5, color: colors.muted, flexShrink: 0 },
  reviewTagChip: { fontSize: 11, fontWeight: 600, color: colors.navy, background: colors.paper2, padding: '4px 9px', borderRadius: 20 },
  reviewContent: { fontSize: 13, color: colors.ink, lineHeight: 1.6, marginTop: 10 },
}
