'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type DealItem = { name: string; qty?: string; unit?: string }

type DealPartner = {
  id: string
  name: string
  region: string | null
  rating_avg: number
}

type DealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  partners: DealPartner | null
  quotes: { id: string; quote_requests: { attributes: { items?: DealItem[] } | null } | null } | null
}

type PartnerSummary = {
  partner: DealPartner
  dealCount: number
  lastDealAt: string
}

type BuyerProfile = {
  id: string
  business_name: string
  region: string | null
  industry: string | null
  biz_reg_no: string | null
  address: string | null
  contact_name: string | null
}

type QuoteRequestRow = {
  id: string
  title: string | null
  status: 'open' | 'matched' | 'closed'
  created_at: string
  quote_request_targets: { id: string; status: 'waiting' | 'responded' | 'declined' }[]
}

type FavoriteRow = {
  id: string
  partners: {
    id: string
    name: string
    region: string | null
    rating_avg: number
    partner_categories: { categories: { name: string } | null }[]
  } | null
}

const REQUEST_STATUS_LABEL: Record<QuoteRequestRow['status'], string> = {
  open: '회신 대기',
  matched: '회신 도착',
  closed: '확정 완료',
}

const STATUS_LABEL: Record<DealRow['status'], string> = {
  in_progress: '진행중',
  completed: '거래완료',
  disputed: '분쟁중',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function itemsSummary(row: DealRow): string {
  const items = row.quotes?.quote_requests?.attributes?.items
  if (!items || items.length === 0) return '-'
  return items.length > 1 ? `${items[0].name} 외 ${items.length - 1}건` : items[0].name
}

function buildPartnerSummaries(rows: DealRow[]): PartnerSummary[] {
  const map = new Map<string, PartnerSummary>()
  for (const row of rows) {
    if (!row.partners) continue
    const existing = map.get(row.partners.id)
    if (existing) {
      existing.dealCount += 1
      if (row.confirmed_at > existing.lastDealAt) existing.lastDealAt = row.confirmed_at
    } else {
      map.set(row.partners.id, { partner: row.partners, dealCount: 1, lastDealAt: row.confirmed_at })
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.lastDealAt < b.lastDealAt ? 1 : -1))
}

export default function MyPage() {
  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile | null | undefined>(undefined)
  const [deals, setDeals] = useState<DealRow[]>([])
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequestRow[]>([])
  const [favorites, setFavorites] = useState<FavoriteRow[]>([])
  const [reviewedDealIds, setReviewedDealIds] = useState<Set<string>>(new Set())
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session: authSession } } = await supabase.auth.getSession()

      if (!authSession) {
        setSession(null)
        setLoading(false)
        return
      }
      setSession({ userId: authSession.user.id })

      const { data: profile } = await supabase
        .from('buyer_profiles')
        .select('id, business_name, region, industry, biz_reg_no, address, contact_name')
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!profile) {
        setBuyerProfile(null)
        setLoading(false)
        return
      }
      setBuyerProfile(profile)

      const [{ data: dealRows }, { data: requestRows }, { data: favoriteRows }, { data: reviewRows }] =
        await Promise.all([
          supabase
            .from('deals')
            .select(
              `id, amount, status, confirmed_at,
               partners ( id, name, region, rating_avg ),
               quotes ( id, quote_requests ( attributes ) )`
            )
            .eq('buyer_id', profile.id)
            .order('confirmed_at', { ascending: false }),
          supabase
            .from('quote_requests')
            .select('id, title, status, created_at, quote_request_targets ( id, status )')
            .eq('buyer_id', profile.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('favorites')
            .select(
              `id,
               partners ( id, name, region, rating_avg, partner_categories ( categories ( name ) ) )`
            )
            .eq('buyer_id', profile.id)
            .order('created_at', { ascending: false }),
          supabase.from('reviews').select('deal_id').eq('buyer_id', profile.id),
        ])

      setDeals((dealRows || []) as unknown as DealRow[])
      setQuoteRequests((requestRows || []) as unknown as QuoteRequestRow[])
      setFavorites((favoriteRows || []) as unknown as FavoriteRow[])
      setReviewedDealIds(new Set((reviewRows || []).map((r) => r.deal_id as string)))
      setLoading(false)
    }

    load()
  }, [])

  async function removeFavorite(favoriteId: string) {
    setRemovingId(favoriteId)
    const { error } = await supabase.from('favorites').delete().eq('id', favoriteId)
    setRemovingId(null)
    if (!error) {
      setFavorites((prev) => prev.filter((f) => f.id !== favoriteId))
    }
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 마이페이지를 이용할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  if (buyerProfile === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>마이페이지는 소상공인(구매자) 계정 전용입니다.</p>
        <a href="/" style={styles.btnPrimary}>
          홈으로
        </a>
      </div>
    )
  }

  const partnerSummaries = buildPartnerSummaries(deals)

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <div style={styles.pageLayout}>
          <div style={styles.sideMenu}>
            <div style={styles.bizCard}>
              <div style={styles.bizName}>{buyerProfile!.business_name}</div>
              <div style={styles.bizMeta}>
                {Boolean(
                  buyerProfile!.business_name &&
                    buyerProfile!.biz_reg_no &&
                    buyerProfile!.industry &&
                    buyerProfile!.region &&
                    buyerProfile!.contact_name &&
                    buyerProfile!.address
                )
                  ? '정보 입력완료'
                  : '사업장 정보 미입력'}
              </div>
            </div>
            <a href="#partners" style={{ ...styles.menuItem, ...styles.menuItemActive }}>
              거래처 관리
            </a>
            <a href="#history" style={styles.menuItem}>
              거래 이력
            </a>
            <a href="#quotes" style={styles.menuItem}>
              견적 요청 현황
            </a>
            <a href="#favorites" style={styles.menuItem}>
              찜한 업체
              {favorites.length > 0 && <span style={styles.menuBadge}>{favorites.length}</span>}
            </a>
            <a href="/my-page/profile" style={styles.menuItem}>
              사업장 정보 수정
            </a>
          </div>

          <div>
            <div id="partners" style={styles.sectionTitle}>
              현재 거래처
            </div>
            <div style={styles.sectionSub}>지금까지 거래한 공급업체입니다.</div>

            {partnerSummaries.length === 0 ? (
              <div style={styles.emptyState}>
                <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>아직 거래 중인 업체가 없어요</h3>
                <p style={{ fontSize: 13.5, color: colors.muted }}>
                  검색에서 공급업체를 찾아 견적을 요청하면 이곳에서 거래처를 관리할 수 있어요.
                </p>
                <a href="/search" style={{ ...styles.btnOutline, marginTop: 16 }}>
                  공급업체 찾으러 가기
                </a>
              </div>
            ) : (
              <div style={styles.activeGrid}>
                {partnerSummaries.map(({ partner, dealCount, lastDealAt }) => (
                  <div key={partner.id} style={styles.activeCard}>
                    <div style={styles.acTop}>
                      <div style={styles.acIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
                        </svg>
                      </div>
                      <div>
                        <div style={styles.acName}>{partner.name}</div>
                        <div style={styles.acMeta}>{partner.region || '지역 정보 없음'}</div>
                      </div>
                      <div style={styles.acSince}>최근 거래일
                        <br />
                        {formatDate(lastDealAt)}
                      </div>
                    </div>
                    <div style={styles.acStats}>
                      <div style={styles.acStat}>
                        <b>{dealCount}건</b>
                        <span>누적 거래</span>
                      </div>
                      <div style={styles.acStat}>
                        <b>{Number(partner.rating_avg || 0).toFixed(1)}</b>
                        <span>배송정시율(평점 대체)</span>
                      </div>
                    </div>
                    <div style={styles.acActions}>
                      <a
                        href={`/quote-request?partner_ids=${partner.id}`}
                        style={{ ...styles.acBtn, ...styles.acBtnPrimary }}
                      >
                        재거래 요청
                      </a>
                      <a href="#history" style={{ ...styles.acBtn, ...styles.acBtnOutline }}>
                        거래 이력 보기
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div id="quotes" style={{ ...styles.sectionTitle, marginTop: 44 }}>
              견적 요청 현황
            </div>
            <div style={styles.sectionSub}>보낸 견적 요청과 회신 현황입니다. 항목을 클릭하면 받은 견적을 비교할 수 있어요.</div>

            {quoteRequests.length === 0 ? (
              <div style={styles.emptyState}>
                <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>보낸 견적 요청이 없어요</h3>
                <p style={{ fontSize: 13.5, color: colors.muted }}>
                  공급업체를 검색해 견적을 요청하면 이곳에서 회신 현황을 확인할 수 있어요.
                </p>
                <a href="/search" style={{ ...styles.btnOutline, marginTop: 16 }}>
                  공급업체 찾으러 가기
                </a>
              </div>
            ) : (
              <div style={{ marginBottom: 44 }}>
                {quoteRequests.map((qr) => {
                  const total = qr.quote_request_targets.length
                  const responded = qr.quote_request_targets.filter((t) => t.status === 'responded').length
                  return (
                    <a key={qr.id} href={`/quote-compare/${qr.id}`} style={styles.reqCard}>
                      <div style={styles.reqTop}>
                        <div>
                          <div style={styles.reqTitle}>{qr.title || '견적 요청'}</div>
                          <div style={styles.reqMeta}>
                            {formatDate(qr.created_at)} · {total}곳에 발송
                          </div>
                        </div>
                        <span
                          style={{
                            ...styles.reqStatus,
                            ...(qr.status === 'closed' ? styles.reqStatusReady : styles.reqStatusWaiting),
                          }}
                        >
                          {qr.status === 'closed' ? REQUEST_STATUS_LABEL.closed : `회신 ${responded}/${total} 완료`}
                        </span>
                      </div>
                    </a>
                  )
                })}
              </div>
            )}

            <div id="favorites" style={{ ...styles.sectionTitle, marginTop: 44 }}>
              찜한 업체
            </div>
            <div style={styles.sectionSub}>관심 있는 공급업체를 모아두고 필요할 때 바로 견적을 요청하세요.</div>

            {favorites.length === 0 ? (
              <div style={styles.emptyState}>
                <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>찜한 업체가 없어요</h3>
                <p style={{ fontSize: 13.5, color: colors.muted }}>
                  검색결과나 업체 상세페이지에서 하트 아이콘을 누르면 이곳에 모아둘 수 있어요.
                </p>
                <a href="/search" style={{ ...styles.btnOutline, marginTop: 16 }}>
                  공급업체 찾으러 가기
                </a>
              </div>
            ) : (
              <div style={styles.activeGrid}>
                {favorites.map((f) => {
                  const partner = f.partners
                  if (!partner) return null
                  const categoryNames = (partner.partner_categories || [])
                    .map((pc) => pc.categories?.name)
                    .filter((n): n is string => Boolean(n))
                  return (
                    <div key={f.id} style={styles.activeCard}>
                      <div style={styles.acTop}>
                        <div style={styles.acIcon}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
                          </svg>
                        </div>
                        <div>
                          <a href={`/partner/${partner.id}`} style={styles.acName}>
                            {partner.name}
                          </a>
                          <div style={styles.acMeta}>
                            {[partner.region, categoryNames.join(', ')].filter(Boolean).join(' · ') || '정보 없음'}
                          </div>
                        </div>
                      </div>
                      <div style={styles.acStats}>
                        <div style={styles.acStat}>
                          <b>{Number(partner.rating_avg || 0).toFixed(1)}</b>
                          <span>평점</span>
                        </div>
                      </div>
                      <div style={styles.acActions}>
                        <a
                          href={`/quote-request?partner_ids=${partner.id}`}
                          style={{ ...styles.acBtn, ...styles.acBtnPrimary }}
                        >
                          견적 요청하기
                        </a>
                        <button
                          onClick={() => removeFavorite(f.id)}
                          disabled={removingId === f.id}
                          style={{ ...styles.acBtn, ...styles.acBtnOutline }}
                        >
                          {removingId === f.id ? '해제 중...' : '찜 해제'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div id="history" style={{ ...styles.sectionTitle, marginTop: 44 }}>
              거래 이력
            </div>
            <div style={styles.sectionSub}>최근 거래 내역과 재거래 여부를 확인하세요.</div>

            {deals.length === 0 ? (
              <div style={styles.emptyState}>
                <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>거래 이력이 없어요</h3>
                <p style={{ fontSize: 13.5, color: colors.muted }}>
                  견적 요청 후 거래가 성사되면 이곳에서 거래 이력을 확인할 수 있어요.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.historyTable}>
                  <thead>
                    <tr>
                      <th style={styles.th}>거래일</th>
                      <th style={styles.th}>공급업체</th>
                      <th style={styles.th}>품목</th>
                      <th style={styles.th}>금액</th>
                      <th style={styles.th}>상태</th>
                      <th style={styles.th}></th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((row) => {
                      const canReview = row.status === 'completed' || row.status === 'in_progress'
                      const reviewed = reviewedDealIds.has(row.id)
                      return (
                        <tr key={row.id}>
                          <td style={styles.td}>{formatDate(row.confirmed_at)}</td>
                          <td style={styles.td}>{row.partners?.name || '-'}</td>
                          <td style={styles.td}>{itemsSummary(row)}</td>
                          <td style={styles.td}>{Number(row.amount).toLocaleString('ko-KR')}원</td>
                          <td style={styles.td}>
                            <span style={{ ...styles.htag, ...htagStyle(row.status) }}>
                              {STATUS_LABEL[row.status]}
                            </span>
                          </td>
                          <td style={styles.td}>
                            {row.partners && (
                              <a href={`/quote-request?partner_ids=${row.partners.id}`} style={styles.repeatLink}>
                                재주문
                              </a>
                            )}
                          </td>
                          <td style={styles.td}>
                            {reviewed ? (
                              <span style={{ fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>리뷰 완료</span>
                            ) : canReview ? (
                              <a href={`/review/write?deal_id=${row.id}`} style={styles.repeatLink}>
                                리뷰 작성
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={styles.adSlot}>
              <div style={styles.adLabel}>광고 (준비 중)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function htagStyle(status: DealRow['status']): React.CSSProperties {
  if (status === 'completed') return { background: colors.goodBg, color: colors.good }
  if (status === 'disputed') return { background: colors.warnBg, color: colors.warn }
  return { background: '#E7EEF5', color: colors.navy }
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
  warn: '#B5460B',
  warnBg: '#FBEAE0',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 1140, margin: '0 auto', padding: '0 32px' },
  pageLayout: { display: 'grid', gridTemplateColumns: '230px 1fr', gap: 36, padding: '36px 0 90px' },
  sideMenu: { borderRight: `1px solid ${colors.line}`, paddingRight: 20 },
  bizCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 18, marginBottom: 20 },
  bizName: { fontSize: 15, fontWeight: 700 },
  bizMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  menuItem: { display: 'block', padding: '10px 8px', fontSize: 14, color: colors.muted, fontWeight: 600, borderRadius: 6, textDecoration: 'none' },
  menuItemActive: { background: colors.paper2, color: colors.deep },
  menuBadge: { background: colors.amber, color: colors.deep, fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, marginLeft: 6 },
  sectionTitle: { fontSize: 19, marginBottom: 6, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
  sectionSub: { fontSize: 13.5, color: colors.muted, marginBottom: 22 },
  activeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 44 },
  activeCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 20 },
  acTop: { display: 'flex', alignItems: 'center', gap: 12 },
  acIcon: { width: 40, height: 40, borderRadius: 9, background: colors.paper2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  acName: { fontSize: 14.5, fontWeight: 700, color: colors.ink, textDecoration: 'none' },
  acMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  acSince: { marginLeft: 'auto', fontSize: 11.5, color: colors.muted, textAlign: 'right' },
  acStats: { display: 'flex', gap: 14, margin: '14px 0', padding: '12px 0', borderTop: `1px dashed ${colors.line}`, borderBottom: `1px dashed ${colors.line}` },
  acStat: { flex: 1, textAlign: 'center' },
  acActions: { display: 'flex', gap: 8 },
  acBtn: { flex: 1, padding: 9, borderRadius: 6, fontSize: 12.8, fontWeight: 700, cursor: 'pointer', textAlign: 'center', textDecoration: 'none' },
  acBtnPrimary: { background: colors.navy, color: colors.white, border: 'none' },
  acBtnOutline: { background: colors.white, color: colors.navy, border: `1px solid ${colors.line}` },
  reqCard: { display: 'block', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: '18px 22px', marginBottom: 12, textDecoration: 'none' },
  reqTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  reqTitle: { fontSize: 14.5, fontWeight: 700, color: colors.ink },
  reqMeta: { fontSize: 12.5, color: colors.muted, marginTop: 4 },
  reqStatus: { fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 14, whiteSpace: 'nowrap' },
  reqStatusWaiting: { background: colors.paper2, color: colors.muted },
  reqStatusReady: { background: colors.goodBg, color: colors.good },
  historyTable: { width: '100%', borderCollapse: 'collapse', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, overflow: 'hidden' },
  th: { background: colors.paper2, fontSize: 12.5, color: colors.muted, fontWeight: 700, padding: '12px 16px', textAlign: 'left' },
  td: { padding: '14px 16px', fontSize: 13.5, borderTop: `1px solid ${colors.paper2}` },
  htag: { fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 12 },
  repeatLink: { fontSize: 12.5, fontWeight: 700, color: colors.navy, cursor: 'pointer', textDecoration: 'none' },
  emptyState: { textAlign: 'center', padding: '50px 20px', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, marginBottom: 44 },
  adSlot: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 24, textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 20 },
  adLabel: { fontSize: 10.5, color: colors.muted, textAlign: 'left', marginBottom: 8, letterSpacing: 0.3 },
  btnPrimary: { background: colors.amber, color: colors.deep, border: 'none', borderRadius: 6, padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', marginTop: 20 },
  btnOutline: { border: `1px solid ${colors.line}`, color: colors.navy, background: colors.white, borderRadius: 6, padding: '11px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex' },
}
