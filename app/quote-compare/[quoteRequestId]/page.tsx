'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import Card from '../../../components/ui/Card'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'

type Attributes = {
  items?: { name: string; qty?: string; unit?: string }[]
  desired_delivery_date?: string
  delivery_address?: string
  payment_method?: string
  request_note?: string
}

function formatEta(raw: string | null): string {
  if (!raw || !raw.trim()) return '-'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

type QuoteRequestRow = {
  id: string
  title: string | null
  attributes: Attributes | null
  status: 'open' | 'matched' | 'closed'
  category_id: string
  buyer_id: string
  created_at: string
}

type TargetRow = { id: string; status: 'waiting' | 'responded' | 'declined' }

type QuoteRow = {
  id: string
  price: number
  match_score: number | null
  eta_or_schedule: string | null
  payment_terms: string | null
  note: string | null
  responded_at: string
  partners: { id: string; name: string; region: string | null; rating_avg: number } | null
}

function QuoteCompareInner() {
  const params = useParams<{ quoteRequestId: string }>()
  const requestId = params.quoteRequestId

  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [buyerProfileId, setBuyerProfileId] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const [requestRow, setRequestRow] = useState<QuoteRequestRow | null>(null)
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [quotes, setQuotes] = useState<QuoteRow[]>([])

  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [confirmedPartnerName, setConfirmedPartnerName] = useState('')

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
        .select('id')
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!profile) {
        setLoading(false)
        return
      }
      setBuyerProfileId(profile.id)

      const { data: reqRow } = await supabase
        .from('quote_requests')
        .select('id, title, attributes, status, category_id, buyer_id, created_at')
        .eq('id', requestId)
        .maybeSingle()

      if (!reqRow || reqRow.buyer_id !== profile.id) {
        setAccessDenied(true)
        setLoading(false)
        return
      }
      setRequestRow(reqRow)

      const [{ data: targetRows }, { data: quoteRows }] = await Promise.all([
        supabase.from('quote_request_targets').select('id, status').eq('quote_request_id', requestId),
        supabase
          .from('quotes')
          .select(
            'id, price, match_score, eta_or_schedule, payment_terms, note, responded_at, partners ( id, name, region, rating_avg )'
          )
          .eq('quote_request_id', requestId)
          .order('price', { ascending: true }),
      ])

      setTargets((targetRows || []) as TargetRow[])
      setQuotes((quoteRows || []) as unknown as QuoteRow[])
      setLoading(false)
    }

    if (requestId) load()
  }, [requestId])

  async function confirmQuote(quote: QuoteRow) {
    if (!buyerProfileId || !requestRow || !quote.partners) return

    setConfirmError('')
    setConfirmingId(quote.id)

    const { error: dealError } = await supabase.from('deals').insert({
      quote_id: quote.id,
      buyer_id: buyerProfileId,
      partner_id: quote.partners.id,
      category_id: requestRow.category_id,
      amount: quote.price,
      status: 'in_progress',
      confirmed_at: new Date().toISOString(),
    })

    if (dealError) {
      setConfirmingId(null)
      setConfirmError('거래 확정 중 오류가 발생했습니다: ' + dealError.message)
      return
    }

    const { error: closeError } = await supabase
      .from('quote_requests')
      .update({ status: 'closed' })
      .eq('id', requestRow.id)

    setConfirmingId(null)

    if (closeError) {
      setConfirmError('요청 상태 업데이트 중 오류가 발생했습니다: ' + closeError.message)
      return
    }

    setConfirmedPartnerName(quote.partners.name)
    setConfirmed(true)
    window.scrollTo(0, 0)
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 견적 비교함을 이용할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  if (!buyerProfileId || accessDenied || !requestRow) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>해당 견적 요청을 확인할 수 없어요.</p>
        <a href="/my-page" style={styles.btnPrimary}>
          마이페이지로 이동
        </a>
      </div>
    )
  }

  if (confirmed) {
    return (
      <div style={styles.confirmView}>
        <div style={styles.confirmIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#0B7A6D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={styles.confirmH2}>거래가 확정됐어요</h2>
        <p style={styles.confirmP}>
          {confirmedPartnerName}와의 거래가 확정되었습니다. 거래 진행 상황은 마이페이지에서 확인하실 수 있어요.
        </p>
        <a href="/my-page" style={{ ...styles.btnPrimary, width: '100%' }}>
          마이페이지로 이동
        </a>
      </div>
    )
  }

  const respondedCount = targets.filter((t) => t.status === 'responded').length
  const totalCount = targets.length
  const isClosed = requestRow.status === 'closed'
  const bestScore = quotes.reduce<number | null>((max, q) => {
    if (q.match_score == null) return max
    return max == null ? q.match_score : Math.max(max, q.match_score)
  }, null)

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <div style={styles.pageHead}>
          <div style={styles.eyebrow}>견적 비교함</div>
          <h1 style={styles.h1}>{requestRow.title || '견적 요청'} 비교</h1>
          <p style={styles.headP}>회신이 모두 도착하면 조건 기준으로 비교해 보세요.</p>
        </div>

        <div style={styles.reqCard}>
          <div style={styles.reqTop}>
            <div>
              <div style={styles.reqTitle}>{requestRow.title || '견적 요청'}</div>
              <div style={styles.reqMeta}>
                {new Date(requestRow.created_at).toLocaleDateString('ko-KR')} · {totalCount}곳에 발송
              </div>
            </div>
            <span style={{ ...styles.reqStatus, ...(respondedCount === totalCount && totalCount > 0 ? styles.reqStatusReady : styles.reqStatusWaiting) }}>
              회신 {respondedCount}/{totalCount} 완료
            </span>
          </div>
          {totalCount > 0 && (
            <div style={styles.reqProgress}>
              {targets.map((t) => (
                <div key={t.id} style={{ ...styles.reqDot, ...(t.status === 'responded' ? styles.reqDotFilled : {}) }} />
              ))}
            </div>
          )}
        </div>

        {isClosed && (
          <div style={styles.closedNote}>이미 확정이 완료된 견적 요청입니다. 마이페이지에서 거래 내역을 확인하세요.</div>
        )}

        <div style={styles.compareHead}>
          <h2 style={styles.h2}>받은 견적 {quotes.length}건 비교</h2>
          <p style={styles.compareP}>가격뿐 아니라 배송 조건과 결제 조건까지 함께 확인하세요.</p>
        </div>

        {confirmError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{confirmError}</div>}

        {quotes.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>아직 도착한 견적이 없어요</h3>
            <p style={{ fontSize: 13.5, color: colors.muted }}>업체가 견적을 제출하면 이곳에서 비교하실 수 있어요.</p>
          </div>
        ) : (
          <div style={styles.quoteGrid}>
            {quotes.map((q) => {
              const isBest = bestScore != null && q.match_score === bestScore
              return (
                <Card
                  key={q.id}
                  style={{
                    padding: 22,
                    display: 'flex',
                    flexDirection: 'column',
                    border: isBest ? '1.5px solid var(--color-accent)' : '1.5px solid var(--color-border)',
                    boxShadow: isBest ? '0 10px 26px rgba(242,169,59,0.18)' : undefined,
                  }}
                >
                  {isBest && (
                    <Badge style={{ background: colors.amber, color: colors.deep, marginBottom: 10, alignSelf: 'flex-start' }}>
                      추천 견적
                    </Badge>
                  )}
                  <div style={styles.qSupplier}>
                    <div style={styles.qIcon}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
                      </svg>
                    </div>
                    <div>
                      <div style={styles.qName}>{q.partners?.name || '업체 정보 없음'}</div>
                      {q.match_score != null && <div style={styles.qMatch}>{q.match_score}% 일치</div>}
                    </div>
                  </div>
                  <div style={styles.qPrice}>
                    {Number(q.price).toLocaleString('ko-KR')}원 <span>/ 총액</span>
                  </div>
                  <ul style={styles.qDetail}>
                    <li style={styles.qDetailLi}>
                      <span>배송/착수 예정</span>
                      <span>{formatEta(q.eta_or_schedule)}</span>
                    </li>
                    <li style={styles.qDetailLi}>
                      <span>결제 조건</span>
                      <span>{q.payment_terms || '-'}</span>
                    </li>
                    <li style={styles.qDetailLi}>
                      <span>업체 평점</span>
                      <span>{Number(q.partners?.rating_avg || 0).toFixed(1)}</span>
                    </li>
                  </ul>
                  {q.note && <div style={styles.qNote}>{q.note}</div>}
                  <Button
                    variant="primary"
                    style={{ width: '100%', ...(isBest ? { background: colors.amberDeep } : {}) }}
                    onClick={() => confirmQuote(q)}
                    disabled={isClosed || confirmingId === q.id}
                  >
                    {confirmingId === q.id ? '확정 중...' : '이 견적으로 확정'}
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function QuoteComparePage() {
  return (
    <Suspense fallback={<div style={{ padding: 60 }}>불러오는 중...</div>}>
      <QuoteCompareInner />
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
  amberDeep: '#D98D1F',
  good: '#0B7A6D',
  goodBg: '#E3F4F0',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 1080, margin: '0 auto', padding: '0 32px 90px' },
  pageHead: { padding: '32px 0 22px' },
  eyebrow: { fontSize: 13, color: colors.navy, fontWeight: 700, marginBottom: 8 },
  h1: { fontSize: 23, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  headP: { marginTop: 8, color: colors.muted, fontSize: 14 },
  reqCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: '22px 24px', marginBottom: 14 },
  reqTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  reqTitle: { fontSize: 15.5, fontWeight: 700 },
  reqMeta: { fontSize: 12.5, color: colors.muted, marginTop: 4 },
  reqStatus: { fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 14, whiteSpace: 'nowrap' },
  reqStatusWaiting: { background: colors.paper2, color: colors.muted },
  reqStatusReady: { background: colors.goodBg, color: colors.good },
  reqProgress: { display: 'flex', gap: 6, marginTop: 14 },
  reqDot: { flex: 1, height: 5, borderRadius: 3, background: colors.paper2 },
  reqDotFilled: { background: colors.navy },
  closedNote: { background: colors.paper2, color: colors.muted, borderRadius: 8, padding: '12px 16px', fontSize: 13, marginBottom: 20 },
  compareHead: { margin: '30px 0 20px' },
  h2: { fontSize: 19, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  compareP: { color: colors.muted, fontSize: 13.5, marginTop: 6 },
  quoteGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, alignItems: 'stretch' },
  qSupplier: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  qIcon: { width: 36, height: 36, borderRadius: 8, background: colors.paper2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  qName: { fontSize: 14.5, fontWeight: 700 },
  qMatch: { fontSize: 11.5, color: colors.good, fontWeight: 700, marginTop: 2 },
  qPrice: { fontFamily: "'Noto Serif KR', serif", fontSize: 24, color: colors.deep, margin: '6px 0 14px' },
  qDetail: { listStyle: 'none', padding: 0, margin: '0 0 16px', flex: 1 },
  qDetailLi: { display: 'flex', justifyContent: 'space-between', fontSize: 12.8, color: colors.muted, padding: '7px 0', borderBottom: `1px solid ${colors.paper2}` },
  qNote: { background: colors.paper2, borderRadius: 6, padding: '10px 12px', fontSize: 12, color: colors.muted, marginBottom: 16 },
  emptyState: { textAlign: 'center', padding: '50px 20px', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10 },
  errorBox: { background: '#FDECEC', color: '#B3261E', borderRadius: 7, padding: '10px 12px', fontSize: 12.5 },
  confirmView: { maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' },
  confirmIcon: { width: 60, height: 60, borderRadius: '50%', background: colors.goodBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' },
  confirmH2: { fontSize: 21, fontFamily: "'Noto Serif KR', serif", color: colors.deep, margin: 0 },
  confirmP: { color: colors.muted, fontSize: 14, marginTop: 10 },
  btnPrimary: { background: colors.amber, color: colors.deep, border: 'none', borderRadius: 6, padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', marginTop: 20, alignItems: 'center', justifyContent: 'center' },
}
