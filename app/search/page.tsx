'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { useFavorites } from '../../lib/useFavorites'
import FavoriteHeart from '../../components/FavoriteHeart'
import HomeHeroSearch from '../../components/HomeHeroSearch'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'

type PartnerRow = {
  id: string
  name: string
  region: string | null
  description: string | null
  verified_badge: boolean
  rating_avg: number
  review_count: number
  matchScore: number
}

function SearchPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const categoryParam = searchParams.get('category') || ''
  const regionParam = searchParams.get('region') || ''
  const keywordParam = searchParams.get('q') || ''

  const [results, setResults] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [sortKey, setSortKey] = useState<'match' | 'rating'>('match')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { favoritePartnerIds, toggleFavorite, pendingId } = useFavorites()

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function requestQuote(ids: string[]) {
    if (ids.length === 0) return
    router.push(`/quote-request?partner_ids=${ids.join(',')}`)
  }

  // 검색 실행
  async function runSearch(category: string, region: string, keywordText: string) {
    setLoading(true)

    let query = supabase
      .from('partners')
      .select('id, name, region, description, verified_badge, rating_avg, review_count')
      .neq('status', 'suspended')

    if (region.trim()) {
      query = query.ilike('region', `%${region.trim()}%`)
    }

    if (keywordText.trim()) {
      query = query.ilike('name', `%${keywordText.trim()}%`)
    }

    // 카테고리가 선택된 경우, partner_categories 매핑을 통해 필터링
    if (category.trim()) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', `%${category.trim()}%`)
        .limit(1)
        .maybeSingle()

      if (cat) {
        const { data: mappedIds } = await supabase
          .from('partner_categories')
          .select('partner_id')
          .eq('category_id', cat.id)

        const ids = (mappedIds || []).map((m) => m.partner_id)
        if (ids.length === 0) {
          setResults([])
          setLoading(false)
          return
        }
        query = query.in('id', ids)
      }
    }

    const { data, error } = await query

    if (error || !data) {
      setResults([])
      setLoading(false)
      return
    }

    // 임시 매칭 점수 계산 (평점 + 검증 여부 기반 단순화 버전)
    // TODO: match_weight_configs 기반 정교한 가중치 계산으로 교체 예정
    const scored: PartnerRow[] = data.map((p) => {
      const base = 70 + Number(p.rating_avg || 0) * 5 + (p.verified_badge ? 4 : 0)
      return { ...p, matchScore: Math.min(99, Math.round(base)) }
    })

    setResults(scored)
    setLoading(false)
  }

  // HomeHeroSearch가 자체적으로 /search?category=...&region=...로 이동시키므로,
  // 여기서는 URL의 category/region/q가 바뀔 때마다(초기 진입 포함) 그 값 그대로
  // 재검색만 하면 됨 - router.push를 직접 호출할 필요 없음.
  useEffect(() => {
    runSearch(categoryParam, regionParam, keywordParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryParam, regionParam, keywordParam])

  const visibleResults = results
    .filter((r) => !verifiedOnly || r.verified_badge)
    .sort((a, b) => {
      if (sortKey === 'rating') return b.rating_avg - a.rating_avg
      return b.matchScore - a.matchScore
    })

  return (
    <div style={{ background: colors.paper, minHeight: '70vh' }}>
      <HomeHeroSearch initialCategory={categoryParam} initialRegion={regionParam} showCtas={false} />

      <div style={styles.wrap}>
        <div style={styles.resultSummary}>
          <div>
            <h1 style={styles.h1}>
              {[keywordParam, categoryParam, regionParam].filter(Boolean).join(' · ') || '전체 카테고리'} 검색결과
            </h1>
            <div style={styles.rSub}>
              조건에 맞는 업체 <b style={{ color: colors.navy }}>{visibleResults.length}곳</b>을 찾았어요
            </div>
          </div>
        </div>

        <div
          className="responsive-two-col"
          style={{ ...styles.layout, ['--rtc-cols' as string]: '230px 1fr', ['--rtc-gap' as string]: '28px' } as React.CSSProperties}
        >
          {/* 필터 사이드바 */}
          <div className="search-filter-panel" style={styles.filterPanel}>
            <div style={styles.filterGroup}>
              <div style={styles.filterTitle}>신뢰도</div>
              <label style={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                />
                ✓ 검증 업체만 보기
              </label>
            </div>
            <div style={{ fontSize: 11.5, color: colors.muted, marginTop: 8 }}>
              배송 요일 · 최소주문금액 등 세부 필터는 준비 중입니다.
            </div>
          </div>

          {/* 결과 리스트 */}
          <div>
            <div style={styles.listToolbar}>
              <Select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as 'match' | 'rating')}
                style={{ width: 'auto', fontSize: 13.3 }}
              >
                <option value="match">조건 일치도순</option>
                <option value="rating">평점순</option>
              </Select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 12.5, color: colors.muted }}>총 {visibleResults.length}곳</span>
                <button
                  style={{ ...styles.rcCta, marginTop: 0, opacity: selectedIds.size === 0 ? 0.5 : 1 }}
                  disabled={selectedIds.size === 0}
                  onClick={() => requestQuote(Array.from(selectedIds))}
                >
                  선택한 {selectedIds.size}곳에 견적요청
                </button>
              </div>
            </div>

            {loading && <p style={{ color: colors.muted, padding: '40px 0' }}>검색 중...</p>}

            {!loading && visibleResults.length === 0 && (
              <div style={styles.emptyState}>
                <h3 style={{ fontSize: 16, marginBottom: 8 }}>조건에 맞는 업체가 없어요</h3>
                <p style={{ fontSize: 13.5 }}>
                  아직 이 조건으로 등록된 공급업체가 없거나, 필터를 조정해보세요.
                </p>
              </div>
            )}

            {!loading &&
              visibleResults.map((p) => (
                <Card
                  key={p.id}
                  className="search-result-card"
                  style={{ padding: '20px 22px', marginBottom: 14 }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleSelected(p.id)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <div style={styles.rcIcon}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z"
                        stroke="#065A82"
                        strokeWidth="1.6"
                      />
                    </svg>
                  </div>
                  <div>
                    <div style={styles.rcNameRow}>
                      <a href={`/partner/${p.id}`} style={styles.rcName}>
                        {p.name}
                      </a>
                      {p.verified_badge && (
                        <Badge style={{ background: colors.goodBg, color: colors.good }}>✓ 검증 업체</Badge>
                      )}
                    </div>
                    <div style={styles.rcLoc}>{p.region || '지역 정보 없음'}</div>
                    <div style={styles.rcStats}>
                      <span style={styles.rcStat}>
                        평점 <b>{Number(p.rating_avg).toFixed(1)}</b>
                      </span>
                      <span style={styles.rcStat}>
                        리뷰 <b>{p.review_count}건</b>
                      </span>
                    </div>
                    {p.description && (
                      <div style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>{p.description}</div>
                    )}
                  </div>
                  <FavoriteHeart
                    active={favoritePartnerIds.has(p.id)}
                    pending={pendingId === p.id}
                    onClick={() => toggleFavorite(p.id)}
                  />
                  <div style={styles.rcRight}>
                    <div style={styles.rcMatch}>{p.matchScore}%</div>
                    <div style={styles.rcMatchLabel}>일치</div>
                    <Button variant="primary" size="sm" style={{ marginTop: 12 }} onClick={() => requestQuote([p.id])}>
                      무료 견적 요청
                    </Button>
                  </div>
                </Card>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60 }}>불러오는 중...</div>}>
      <SearchPageInner />
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
  wrap: { maxWidth: 1180, margin: '0 auto', padding: '0 32px' },
  resultSummary: { padding: '20px 0 4px' },
  h1: { fontSize: 19, color: colors.deep },
  rSub: { fontSize: 12.8, color: colors.muted, marginTop: 6 },
  layout: { padding: '22px 0 90px', alignItems: 'start' },
  filterPanel: {
    background: colors.white,
    border: `1px solid ${colors.line}`,
    borderRadius: 10,
    padding: 20,
  },
  filterGroup: { paddingBottom: 18, marginBottom: 18, borderBottom: `1px solid ${colors.paper2}` },
  filterTitle: { fontSize: 13.5, fontWeight: 700, marginBottom: 12 },
  checkRow: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.3, color: colors.ink, cursor: 'pointer' },
  listToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', rowGap: 10 },
  sortSelect: {
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    padding: '9px 12px',
    fontSize: 13.3,
    background: colors.white,
    color: colors.ink,
  },
  rcIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    background: colors.paper2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rcNameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  rcName: { fontSize: 16, fontWeight: 700, color: colors.ink, textDecoration: 'none' },
  rcLoc: { fontSize: 12.5, color: colors.muted, marginTop: 3 },
  rcStats: { display: 'flex', gap: 16, marginTop: 10 },
  rcStat: { fontSize: 12.3, color: colors.muted },
  rcRight: { textAlign: 'right' },
  rcMatch: { fontSize: 20, color: colors.good, fontWeight: 700 },
  rcMatchLabel: { fontSize: 11, color: colors.muted },
  rcCta: {
    marginTop: 12,
    background: colors.deep,
    color: colors.white,
    border: 'none',
    borderRadius: 6,
    padding: '10px 18px',
    fontSize: 12.8,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  emptyState: { textAlign: 'center', padding: '70px 0', color: colors.muted },
}
