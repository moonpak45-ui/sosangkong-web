'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'
import { useFavorites } from '../lib/useFavorites'
import FavoriteHeart from './FavoriteHeart'
import AdRollingBanner from './AdRollingBanner'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Button from './ui/Button'

type Category = { id: string; name: string }

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

// 박스광고 섹션에 노출할 개수 상한. 승인된 박스광고가 이보다 많아지면
// 매번 무작위로 이만큼만 뽑아 보여줌("순서 로테이션" — 특정 업체가 먼저
// 신청했다는 이유만으로 계속 상단을 독점하지 않도록 함). HANDOFF 참고.
const MAX_BOX_ADS = 4

// role이 buyer로 로그인된 소상공인이 "/"에 접속했을 때 보이는 홈 피드.
// /search 페이지와 같은 매칭 점수 계산(평점+검증뱃지 기반 단순 가중치 -
// 아직 match_weight_configs 같은 정교한 알고리즘은 없음, 실제 데이터는
// partners.rating_avg/verified_badge뿐)을 그대로 재사용한다. "배송정시율/
// 응답률"에 대응하는 실제 컬럼은 DB에 없어서(확인 완료 - my-page/page.tsx가
// rating_avg를 "배송정시율(평점 대체)"로 표기하는 것과 동일한 관례를 따름)
// 없는 값을 지어내는 대신 평점/리뷰 수만 표시한다.
export default function BuyerHomeFeed() {
  const router = useRouter()
  const { favoritePartnerIds, toggleFavorite, pendingId, buyerProfileId } = useFavorites()

  const [categories, setCategories] = useState<Category[]>([])
  const [categoryInput, setCategoryInput] = useState('')
  const [regionInput, setRegionInput] = useState('')
  const [results, setResults] = useState<PartnerRow[]>([])
  const [recentPartnerIds, setRecentPartnerIds] = useState<Set<string>>(new Set())
  const [boxAds, setBoxAds] = useState<PartnerRow[]>([])
  const [lineAdPartnerIds, setLineAdPartnerIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setCategories(data as Category[])
      })
  }, [])

  // 즐겨찾기·최근 거래 업체를 상단에 우선 노출하기 위한 최근 거래처 id 목록
  useEffect(() => {
    if (!buyerProfileId) return
    supabase
      .from('deals')
      .select('partner_id')
      .eq('buyer_id', buyerProfileId)
      .order('confirmed_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setRecentPartnerIds(new Set((data || []).map((r) => r.partner_id as string)))
      })
  }, [buyerProfileId])

  // 박스광고 — 카테고리/지역 필터와 무관하게 항상 같은 자리(롤링배너 아래)에
  // 고정 노출되는 별도 섹션. 승인된 박스광고가 MAX_BOX_ADS보다 많으면 매번
  // 무작위로 그만큼만 뽑아 보여줌(로테이션). end_date가 지난 건 자동 제외.
  // 같은 업체가 박스광고를 여러 건 신청/승인받았을 수 있어(신청 자체는
  // 막지 않음) partner id 기준으로 중복 제거 — 안 하면 같은 업체 카드가
  // 여러 장 뜨고 React key도 중복됨(실제로 겪은 버그, 아래 참고).
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

  // 줄광고 — 별도 섹션이 아니라 일반 매칭 리스트 안에서 최우선 정렬 + "광고"
  // 뱃지로 구분(현재 검색/필터 결과에 있는 업체에 한해서만 - 필터와 무관한
  // 박스광고와 달리 줄광고는 매칭 리스트에 "섞여서" 노출되는 것이라 필터를
  // 따름). partner_id만 있으면 되므로 별도 partners 조인 없음.
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

  async function runSearch(category: string, region: string) {
    setLoading(true)

    let query = supabase
      .from('partners')
      .select('id, name, region, description, verified_badge, rating_avg, review_count')
      .neq('status', 'suspended')

    if (region.trim()) {
      query = query.ilike('region', `%${region.trim()}%`)
    }

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

    const scored: PartnerRow[] = data.map((p) => {
      const base = 70 + Number(p.rating_avg || 0) * 5 + (p.verified_badge ? 4 : 0)
      return { ...p, matchScore: Math.min(99, Math.round(base)) }
    })

    setResults(scored)
    setLoading(false)
  }

  useEffect(() => {
    runSearch('', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault()
    runSearch(categoryInput, regionInput)
  }

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

  const visibleResults = [...results].sort((a, b) => {
    const aAd = lineAdPartnerIds.has(a.id)
    const bAd = lineAdPartnerIds.has(b.id)
    if (aAd !== bAd) return aAd ? -1 : 1

    const aFav = favoritePartnerIds.has(a.id)
    const bFav = favoritePartnerIds.has(b.id)
    if (aFav !== bFav) return aFav ? -1 : 1

    const aRecent = recentPartnerIds.has(a.id)
    const bRecent = recentPartnerIds.has(b.id)
    if (aRecent !== bRecent) return aRecent ? -1 : 1

    return b.matchScore - a.matchScore
  })

  return (
    <div style={{ background: colors.paper, minHeight: '70vh' }}>
      <div style={styles.searchBarWrap}>
        <div style={styles.wrap}>
          <div style={styles.headText}>
            <h1 style={styles.h1}>오늘 조건에 맞는 공급업체</h1>
            <p style={styles.sub}>즐겨찾기·최근 거래 업체를 우선으로, 조건이 맞는 공급업체를 모아왔어요.</p>
          </div>
          <form onSubmit={handleFilterSubmit} className="search-bar-grid" style={styles.searchBar}>
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
          <div style={styles.filterNote}>
            배송 요일 · 최소주문금액 등 세부 배송조건 필터는 준비 중입니다.{' '}
            <a href="/search" style={styles.filterNoteLink}>
              전체 업체 상세 검색 ›
            </a>
          </div>
        </div>
      </div>

      <div style={styles.wrap}>
        <div style={{ marginTop: 22 }}>
          <AdRollingBanner />
        </div>

        {boxAds.length > 0 && (
          <div style={styles.boxAdSection}>
            <div style={styles.boxAdHeading}>
              프리미엄 매칭 업체 <span style={styles.adLabelSmall}>광고</span>
            </div>
            <div style={styles.boxGrid}>
              {boxAds.map((p) => (
                <SupplierCard
                  key={`box-${p.id}`}
                  p={p}
                  large
                  isAd
                  isFav={favoritePartnerIds.has(p.id)}
                  isRecent={recentPartnerIds.has(p.id)}
                  favPending={pendingId === p.id}
                  selected={selectedIds.has(p.id)}
                  onToggleFavorite={() => toggleFavorite(p.id)}
                  onToggleSelect={() => toggleSelected(p.id)}
                  onRequestQuote={() => requestQuote([p.id])}
                />
              ))}
            </div>
          </div>
        )}

        <div style={styles.listToolbar}>
          <span style={{ fontSize: 12.5, color: colors.muted }}>총 {visibleResults.length}곳</span>
          <button
            style={{ ...styles.rcCta, opacity: selectedIds.size === 0 ? 0.5 : 1 }}
            disabled={selectedIds.size === 0}
            onClick={() => requestQuote(Array.from(selectedIds))}
          >
            선택한 {selectedIds.size}곳에 견적요청
          </button>
        </div>

        {loading && <p style={{ color: colors.muted, padding: '40px 0' }}>불러오는 중...</p>}

        {!loading && visibleResults.length === 0 && (
          <div style={styles.emptyState}>
            <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>조건에 맞는 업체가 없어요</h3>
            <p style={{ fontSize: 13.5, color: colors.muted }}>필터를 조정해보세요.</p>
          </div>
        )}

        <div style={styles.grid}>
          {!loading &&
            visibleResults.map((p) => (
              <SupplierCard
                key={p.id}
                p={p}
                isAd={lineAdPartnerIds.has(p.id)}
                isFav={favoritePartnerIds.has(p.id)}
                isRecent={recentPartnerIds.has(p.id)}
                favPending={pendingId === p.id}
                selected={selectedIds.has(p.id)}
                onToggleFavorite={() => toggleFavorite(p.id)}
                onToggleSelect={() => toggleSelected(p.id)}
                onRequestQuote={() => requestQuote([p.id])}
              />
            ))}
        </div>
      </div>
    </div>
  )
}

function SupplierCard({
  p,
  large,
  isAd,
  isFav,
  isRecent,
  favPending,
  selected,
  onToggleFavorite,
  onToggleSelect,
  onRequestQuote,
}: {
  p: PartnerRow
  large?: boolean
  isAd?: boolean
  isFav: boolean
  isRecent: boolean
  favPending: boolean
  selected: boolean
  onToggleFavorite: () => void
  onToggleSelect: () => void
  onRequestQuote: () => void
}) {
  const showTagRow = isAd || isFav || isRecent

  return (
    <Card
      style={{
        padding: large ? 26 : 20,
        ...(large
          ? { border: '1.5px solid var(--color-accent)', boxShadow: '0 8px 22px rgba(242,137,29,0.18)' }
          : {}),
      }}
    >
      {showTagRow && (
        <div style={styles.tagRow}>
          {isAd && <Badge style={{ background: '#FDEFD9', color: '#8A5A0E' }}>광고</Badge>}
          {isFav && <Badge style={{ background: '#FEF6E9', color: '#D98D1F' }}>★ 즐겨찾기</Badge>}
          {isRecent && <Badge style={{ background: colors.goodBg, color: colors.good }}>최근 거래</Badge>}
        </div>
      )}
      <div style={styles.cardTop}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={{ width: 17, height: 17, cursor: 'pointer', flexShrink: 0 }}
        />
        <div style={{ ...styles.icon, ...(large ? styles.iconLarge : {}) }}>
          <svg width={large ? 26 : 22} height={large ? 26 : 22} viewBox="0 0 24 24" fill="none">
            <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.nameRow}>
            <a href={`/partner/${p.id}`} style={{ ...styles.name, ...(large ? styles.nameLarge : {}) }}>
              {p.name}
            </a>
            {p.verified_badge && (
              <Badge style={{ background: colors.goodBg, color: colors.good, flexShrink: 0 }}>✓ 검증</Badge>
            )}
          </div>
          <div style={styles.loc}>{p.region || '지역 정보 없음'}</div>
        </div>
        <FavoriteHeart active={isFav} pending={favPending} onClick={onToggleFavorite} />
      </div>

      <div style={styles.stats}>
        <div style={styles.stat}>
          <b style={styles.statValue}>{Number(p.rating_avg || 0).toFixed(1)}</b>
          <span style={styles.statLabel}>배송정시율(평점 대체)</span>
        </div>
        <div style={styles.stat}>
          <b style={styles.statValue}>{p.review_count}건</b>
          <span style={styles.statLabel}>리뷰</span>
        </div>
        <div style={styles.stat}>
          <b style={{ ...styles.statValue, color: colors.good }}>{p.matchScore}%</b>
          <span style={styles.statLabel}>일치</span>
        </div>
      </div>

      {p.description && <div style={styles.desc}>{p.description}</div>}

      <Button variant="primary" size="sm" style={{ width: '100%' }} onClick={onRequestQuote}>
        무료 견적 요청
      </Button>
    </Card>
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
  searchBarWrap: { background: colors.deep, padding: '30px 0 24px' },
  headText: { marginBottom: 18 },
  h1: { fontSize: 22, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.white, margin: 0 },
  sub: { fontSize: 13, color: '#C7D9E4', marginTop: 8 },
  searchBar: {
    background: colors.white,
    borderRadius: 10,
    padding: '16px 18px',
    alignItems: 'end',
    boxShadow: '0 14px 30px rgba(5,20,40,0.25)',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr auto',
    gap: 14,
  },
  sbField: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  sbLabel: { fontSize: 10.5, color: colors.muted, fontWeight: 700 },
  sbSelect: { border: 'none', background: 'none', fontSize: 14, color: colors.ink, fontWeight: 600, padding: 0, minWidth: 0, width: '100%' },
  sbInput: { border: 'none', background: 'none', fontSize: 14, color: colors.ink, fontWeight: 600, padding: 0, minWidth: 0, width: '100%' },
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
  filterNote: { fontSize: 11.5, color: '#9FC3D8', marginTop: 12 },
  filterNoteLink: { color: colors.white, fontWeight: 700, textDecoration: 'underline' },
  listToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0 16px', flexWrap: 'wrap', rowGap: 10 },
  rcCta: {
    background: colors.deep,
    color: colors.white,
    border: 'none',
    borderRadius: 6,
    padding: '11px 18px',
    fontSize: 12.8,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  emptyState: { textAlign: 'center', padding: '70px 0' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
    gap: 18,
    paddingBottom: 90,
  },
  boxAdSection: { marginTop: 22 },
  boxAdHeading: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 14 },
  adLabelSmall: { fontSize: 10, fontWeight: 700, background: colors.amber, color: colors.deep, padding: '2px 8px', borderRadius: 10 },
  boxGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 18,
    marginBottom: 4,
  },
  tagRow: { display: 'flex', gap: 6, marginBottom: 10 },
  cardTop: { display: 'flex', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 9, background: colors.paper2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconLarge: { width: 56, height: 56 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 },
  name: { fontSize: 15, fontWeight: 700, color: colors.ink, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nameLarge: { fontSize: 17 },
  loc: { fontSize: 12, color: colors.muted, marginTop: 2 },
  stats: { display: 'flex', gap: 10, margin: '14px 0', padding: '12px 0', borderTop: `1px dashed ${colors.line}`, borderBottom: `1px dashed ${colors.line}` },
  stat: { flex: 1, textAlign: 'center' },
  statValue: { display: 'block', fontSize: 14, color: colors.navy, fontFamily: "'Noto Serif KR', serif" },
  statLabel: { fontSize: 10.5, color: colors.muted },
  desc: { fontSize: 12, color: colors.muted, marginBottom: 14, lineHeight: 1.5 },
}
