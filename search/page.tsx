'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

type Category = {
  id: string
  name: string
}

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

  const initialCategory = searchParams.get('category') || ''
  const initialRegion = searchParams.get('region') || searchParams.get('q') || ''

  const [categories, setCategories] = useState<Category[]>([])
  const [categoryInput, setCategoryInput] = useState(initialCategory)
  const [regionInput, setRegionInput] = useState(initialRegion)

  const [results, setResults] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [sortKey, setSortKey] = useState<'match' | 'rating'>('match')

  // 카테고리 목록 불러오기 (검색바 드롭다운용)
  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setCategories(data as Category[])
      })
  }, [])

  // 검색 실행
  async function runSearch(category: string, region: string) {
    setLoading(true)

    let query = supabase
      .from('partners')
      .select('id, name, region, description, verified_badge, rating_avg, review_count')
      .neq('status', 'suspended')

    if (region.trim()) {
      query = query.ilike('region', `%${region.trim()}%`)
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

  useEffect(() => {
    runSearch(initialCategory, initialRegion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (categoryInput) params.set('category', categoryInput)
    if (regionInput) params.set('region', regionInput)
    router.push(`/search?${params.toString()}`)
    runSearch(categoryInput, regionInput)
  }

  const visibleResults = results
    .filter((r) => !verifiedOnly || r.verified_badge)
    .sort((a, b) => {
      if (sortKey === 'rating') return b.rating_avg - a.rating_avg
      return b.matchScore - a.matchScore
    })

  return (
    <div style={{ background: colors.paper, minHeight: '70vh' }}>
      <div style={styles.searchBarWrap}>
        <div style={styles.wrap}>
          <form onSubmit={handleSearchSubmit} style={styles.searchBar}>
            <div style={styles.sbField}>
              <label style={styles.sbLabel}>카테고리</label>
              <select
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                style={styles.sbSelect}
              >
                <option value="">전체</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.sbField}>
              <label style={styles.sbLabel}>지역</label>
              <input
                type="text"
                value={regionInput}
                onChange={(e) => setRegionInput(e.target.value)}
                placeholder="예) 서울 마포구"
                style={styles.sbInput}
              />
            </div>
            <button type="submit" style={styles.sbBtn}>
              검색
            </button>
          </form>
        </div>
      </div>

      <div style={styles.wrap}>
        <div style={styles.resultSummary}>
          <div>
            <h1 style={styles.h1}>
              {categoryInput || '전체 카테고리'} {regionInput && `· ${regionInput}`} 검색결과
            </h1>
            <div style={styles.rSub}>
              조건에 맞는 업체 <b style={{ color: colors.navy }}>{visibleResults.length}곳</b>을 찾았어요
            </div>
          </div>
        </div>

        <div style={styles.layout}>
          {/* 필터 사이드바 */}
          <div style={styles.filterPanel}>
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
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as 'match' | 'rating')}
                style={styles.sortSelect}
              >
                <option value="match">조건 일치도순</option>
                <option value="rating">평점순</option>
              </select>
              <span style={{ fontSize: 12.5, color: colors.muted }}>총 {visibleResults.length}곳</span>
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
                <div key={p.id} style={styles.resultCard}>
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
                      <span style={styles.rcName}>{p.name}</span>
                      {p.verified_badge && <span style={styles.rcBadge}>✓ 검증 업체</span>}
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
                  <div style={styles.rcRight}>
                    <div style={styles.rcMatch}>{p.matchScore}%</div>
                    <div style={styles.rcMatchLabel}>일치</div>
                    <button style={styles.rcCta}>무료 견적 요청</button>
                  </div>
                </div>
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
  searchBarWrap: { background: colors.deep, padding: '22px 0' },
  searchBar: {
    background: colors.white,
    borderRadius: 10,
    padding: '16px 18px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr auto',
    gap: 12,
    alignItems: 'end',
    boxShadow: '0 14px 30px rgba(5,20,40,0.25)',
  },
  sbField: { display: 'flex', flexDirection: 'column', gap: 4 },
  sbLabel: { fontSize: 10.5, color: colors.muted, fontWeight: 700 },
  sbSelect: { border: 'none', background: 'none', fontSize: 14, color: colors.ink, fontWeight: 600, padding: 0 },
  sbInput: { border: 'none', background: 'none', fontSize: 14, color: colors.ink, fontWeight: 600, padding: 0 },
  sbBtn: {
    background: colors.amber,
    color: colors.deep,
    border: 'none',
    borderRadius: 7,
    padding: '12px 22px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  resultSummary: { padding: '20px 0 4px' },
  h1: { fontSize: 19, color: colors.deep },
  rSub: { fontSize: 12.8, color: colors.muted, marginTop: 6 },
  layout: { display: 'grid', gridTemplateColumns: '230px 1fr', gap: 28, padding: '22px 0 90px', alignItems: 'start' },
  filterPanel: {
    background: colors.white,
    border: `1px solid ${colors.line}`,
    borderRadius: 10,
    padding: 20,
    position: 'sticky',
    top: 20,
  },
  filterGroup: { paddingBottom: 18, marginBottom: 18, borderBottom: `1px solid ${colors.paper2}` },
  filterTitle: { fontSize: 13.5, fontWeight: 700, marginBottom: 12 },
  checkRow: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.3, color: colors.ink, cursor: 'pointer' },
  listToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sortSelect: {
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    padding: '9px 12px',
    fontSize: 13.3,
    background: colors.white,
    color: colors.ink,
  },
  resultCard: {
    background: colors.white,
    border: `1px solid ${colors.line}`,
    borderRadius: 10,
    padding: '20px 22px',
    marginBottom: 14,
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    gap: 20,
    alignItems: 'center',
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
  rcName: { fontSize: 16, fontWeight: 700 },
  rcBadge: { fontSize: 10.5, fontWeight: 700, background: colors.goodBg, color: colors.good, padding: '3px 8px', borderRadius: 10 },
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
