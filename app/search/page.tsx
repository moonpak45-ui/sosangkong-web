'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { useFavorites } from '../../lib/useFavorites'
import FavoriteHeart from '../../components/FavoriteHeart'
import HomeHeroSearch from '../../components/HomeHeroSearch'
import SearchPersonalizationPanel from '../../components/SearchPersonalizationPanel'
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

// 박스광고 섹션에 노출할 개수 상한. BuyerHomeFeed(components/BuyerHomeFeed.tsx)와
// 동일한 값/동일한 로테이션 방식을 그대로 이식함.
const MAX_BOX_ADS = 4

function SearchPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const categoryParam = searchParams.get('category') || ''
  const regionParam = searchParams.get('region') || ''
  const keywordParam = searchParams.get('q') || ''

  const [results, setResults] = useState<PartnerRow[]>([])
  const [boxAds, setBoxAds] = useState<PartnerRow[]>([])
  const [lineAdPartnerIds, setLineAdPartnerIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [sortKey, setSortKey] = useState<'match' | 'rating'>('match')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { favoritePartnerIds, toggleFavorite, pendingId } = useFavorites()

  // 박스광고 — 카테고리/지역 검색 조건과 무관하게 항상 같은 자리(결과 목록
  // 상단)에 고정 노출되는 별도 섹션. BuyerHomeFeed와 동일한 로직을 그대로
  // 이식: 승인된(status='active') 박스광고가 MAX_BOX_ADS보다 많으면 매번
  // 무작위로 그만큼만 뽑아 보여줌(로테이션), end_date 지난 건 자동 제외,
  // 같은 업체가 여러 건 보유해도 partner 기준 중복 제거.
  useEffect(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    supabase
      .from('ads')
      .select('id, partner_id, partners ( id, name, region, description, verified_badge, rating_avg, review_count )')
      .eq('status', 'active')
      .eq('ad_type', 'box')
      .or(`end_date.is.null,end_date.gte.${todayIso}`)
      .then(({ data }) => {
        const partnersById = new Map<string, Omit<PartnerRow, 'matchScore'>>()
        for (const r of (data || []) as unknown as { partners: Omit<PartnerRow, 'matchScore'> | null }[]) {
          if (r.partners && !partnersById.has(r.partners.id)) {
            partnersById.set(r.partners.id, r.partners)
          }
        }
        const rows = Array.from(partnersById.values()).map((p) => {
          const base = 70 + Number(p.rating_avg || 0) * 5 + (p.verified_badge ? 4 : 0)
          return { ...p, matchScore: Math.min(99, Math.round(base)) }
        })
        const shuffled = [...rows].sort(() => Math.random() - 0.5)
        setBoxAds(shuffled.slice(0, MAX_BOX_ADS))
      })
  }, [])

  // 줄광고 — 별도 섹션이 아니라 일반 검색 결과 목록 안에 "섞여서" 최우선
  // 정렬 + "광고" 배지로만 구분(BuyerHomeFeed와 동일). 현재 검색/필터
  // 결과에 있는 업체에 한해서만 의미가 있으므로, partner_id 집합만 들고
  // 있다가 visibleResults 정렬에서 사용.
  useEffect(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    supabase
      .from('ads')
      .select('partner_id')
      .eq('status', 'active')
      .eq('ad_type', 'line')
      .or(`end_date.is.null,end_date.gte.${todayIso}`)
      .then(({ data }) => {
        setLineAdPartnerIds(new Set((data || []).map((r) => r.partner_id as string)))
      })
  }, [])

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
      // 줄광고는 정렬 기준(조건 일치도순/평점순)과 무관하게 항상 최우선
      // (BuyerHomeFeed와 동일한 우선순위 규칙).
      const aAd = lineAdPartnerIds.has(a.id)
      const bAd = lineAdPartnerIds.has(b.id)
      if (aAd !== bAd) return aAd ? -1 : 1

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

          {/* 결과 리스트 + 우측 개인화 패널(buyer 로그인 시에만, 컴포넌트가
              자체적으로 null을 렌더해서 조건부 노출 — flex라 패널이 없을 때
              빈 공간이 남지 않음) */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 480px', minWidth: 0 }}>
            {boxAds.length > 0 && (
              <div style={styles.boxAdSection}>
                <div style={styles.boxAdHeading}>
                  프리미엄 매칭 업체 <Badge>광고</Badge>
                </div>
                <div style={styles.boxGrid}>
                  {boxAds.map((p) => (
                    <SupplierResultCard
                      key={`box-${p.id}`}
                      p={p}
                      large
                      isAd
                      selected={selectedIds.has(p.id)}
                      favActive={favoritePartnerIds.has(p.id)}
                      favPending={pendingId === p.id}
                      onToggleSelect={() => toggleSelected(p.id)}
                      onToggleFavorite={() => toggleFavorite(p.id)}
                      onRequestQuote={() => requestQuote([p.id])}
                    />
                  ))}
                </div>
              </div>
            )}

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

            <div style={styles.grid}>
              {!loading &&
                visibleResults.map((p) => (
                  <SupplierResultCard
                    key={p.id}
                    p={p}
                    isAd={lineAdPartnerIds.has(p.id)}
                    selected={selectedIds.has(p.id)}
                    favActive={favoritePartnerIds.has(p.id)}
                    favPending={pendingId === p.id}
                    onToggleSelect={() => toggleSelected(p.id)}
                    onToggleFavorite={() => toggleFavorite(p.id)}
                    onRequestQuote={() => requestQuote([p.id])}
                  />
                ))}
            </div>
          </div>

          <SearchPersonalizationPanel />
          </div>
        </div>
      </div>
    </div>
  )
}

function SupplierResultCard({
  p,
  large,
  isAd,
  selected,
  favActive,
  favPending,
  onToggleSelect,
  onToggleFavorite,
  onRequestQuote,
}: {
  p: PartnerRow
  large?: boolean
  isAd?: boolean
  selected: boolean
  favActive: boolean
  favPending: boolean
  onToggleSelect: () => void
  onToggleFavorite: () => void
  onRequestQuote: () => void
}) {
  return (
    <Card
      style={{
        padding: large ? 22 : 16,
        // 박스광고: 2px 주황 테두리로 확실히 구분. 줄광고: 흰 배경 그대로
        // 유지하고 아래 "광고" 배지만으로 은은하게 구분(박스광고보다 튀지
        // 않게 - 지시사항 원문 그대로).
        ...(large ? { border: '2px solid var(--color-accent)', boxShadow: '0 8px 22px rgba(242,137,29,0.18)' } : {}),
      }}
    >
      {isAd && (
        <div style={styles.adBadgeRow}>
          {large ? (
            <Badge style={{ background: 'var(--color-accent)', color: 'var(--color-on-primary)', fontWeight: 700 }}>
              광고
            </Badge>
          ) : (
            <Badge>광고</Badge>
          )}
        </div>
      )}
      <div style={styles.cardTop}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
        />
        <div style={{ ...styles.rcIcon, ...(large ? styles.rcIconLarge : {}) }}>
          <svg width={large ? 24 : 20} height={large ? 24 : 20} viewBox="0 0 24 24" fill="none">
            <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.rcNameRow}>
            <a href={`/partner/${p.id}`} style={{ ...styles.rcName, ...(large ? styles.rcNameLarge : {}) }}>
              {p.name}
            </a>
            {p.verified_badge && (
              <Badge style={{ background: colors.goodBg, color: colors.good, flexShrink: 0 }}>✓ 검증</Badge>
            )}
          </div>
          <div style={styles.rcLoc}>{p.region || '지역 정보 없음'}</div>
        </div>
        <FavoriteHeart active={favActive} pending={favPending} onClick={onToggleFavorite} />
      </div>

      <div style={styles.rcStats}>
        <div style={styles.rcStat}>
          <b style={styles.rcStatValue}>{Number(p.rating_avg || 0).toFixed(1)}</b>
          <span style={styles.rcStatLabel}>평점</span>
        </div>
        <div style={styles.rcStat}>
          <b style={styles.rcStatValue}>{p.review_count}건</b>
          <span style={styles.rcStatLabel}>리뷰</span>
        </div>
        <div style={styles.rcStat}>
          <b style={{ ...styles.rcStatValue, color: colors.good }}>{p.matchScore}%</b>
          <span style={styles.rcStatLabel}>일치</span>
        </div>
      </div>

      {p.description && <div style={styles.rcDesc}>{p.description}</div>}

      <Button variant="primary" size="sm" style={{ width: '100%' }} onClick={onRequestQuote}>
        무료 견적 요청
      </Button>
    </Card>
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

  // 결과 카드 그리드 (밀도 조정: auto-fill minmax(228px, 1fr))
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))',
    gap: 14,
    paddingBottom: 90,
  },
  boxAdSection: { marginBottom: 22 },
  boxAdHeading: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 14 },
  boxGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
    marginBottom: 4,
  },
  adBadgeRow: { display: 'flex', marginBottom: 8 },
  cardTop: { display: 'flex', alignItems: 'center', gap: 9 },
  rcIcon: {
    width: 40,
    height: 40,
    borderRadius: 9,
    background: colors.paper2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rcIconLarge: { width: 52, height: 52 },
  rcNameRow: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  rcName: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.ink,
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rcNameLarge: { fontSize: 16 },
  rcLoc: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  rcStats: {
    display: 'flex',
    gap: 8,
    margin: '12px 0',
    padding: '10px 0',
    borderTop: `1px dashed ${colors.line}`,
    borderBottom: `1px dashed ${colors.line}`,
  },
  rcStat: { flex: 1, textAlign: 'center' },
  rcStatValue: { display: 'block', fontSize: 13, color: colors.navy, fontFamily: "'Noto Serif KR', serif" },
  rcStatLabel: { fontSize: 10, color: colors.muted },
  rcDesc: { fontSize: 11.5, color: colors.muted, marginBottom: 12, lineHeight: 1.5 },
}
