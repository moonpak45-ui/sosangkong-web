'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type LineItemRow = {
  id: string
  item_name: string
  quantity: number
  unit: string
  unit_price: number
  amount: number
  is_credit: boolean
  created_at: string
  deals: { buyer_profiles: { business_name: string } | null } | null
}

type ArBalanceRow = {
  id: string
  buyer_id: string
  balance: number
  updated_at: string
}

type StockRow = {
  id: string
  item_name: string
  quantity_on_hand: number
  unit: string
  updated_at: string
}

type MonthSummary = { month: string; count: number; total: number }

const MONTH_START = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function monthKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function PartnerLedgerPage() {
  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [loading, setLoading] = useState(true)

  const [lineItems, setLineItems] = useState<LineItemRow[]>([])
  const [arBalances, setArBalances] = useState<ArBalanceRow[]>([])
  const [buyerNames, setBuyerNames] = useState<Record<string, string>>({})
  const [stockLevels, setStockLevels] = useState<StockRow[]>([])

  useEffect(() => {
    async function load() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()

      if (!authSession) {
        setSession(null)
        setLoading(false)
        return
      }
      setSession({ userId: authSession.user.id })

      const { data: partner } = await supabase
        .from('partners')
        .select('id, name')
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!partner) {
        setPartnerId(null)
        setLoading(false)
        return
      }
      setPartnerId(partner.id)
      setPartnerName(partner.name)

      const [{ data: lineItemRows }, { data: arRows }, { data: stockRows }] = await Promise.all([
        supabase
          .from('deal_line_items')
          .select(
            `id, item_name, quantity, unit, unit_price, amount, is_credit, created_at,
             deals!inner ( partner_id, buyer_profiles ( business_name ) )`
          )
          .eq('deals.partner_id', partner.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('ar_balances')
          .select('id, buyer_id, balance, updated_at')
          .eq('partner_id', partner.id)
          .order('balance', { ascending: false }),
        supabase
          .from('stock_levels')
          .select('id, item_name, quantity_on_hand, unit, updated_at')
          .eq('partner_id', partner.id)
          .order('item_name', { ascending: true }),
      ])

      setLineItems((lineItemRows || []) as unknown as LineItemRow[])
      setArBalances((arRows || []) as ArBalanceRow[])
      setStockLevels((stockRows || []) as StockRow[])

      // ar_balances.buyer_id는 auth.users(id)라 buyer_profiles와 직접 FK로
      // 이어지지 않아 PostgREST 임베드가 안 됨 - user_id로 별도 조회해서 매칭.
      const buyerIds = (arRows || []).map((r) => r.buyer_id)
      if (buyerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('buyer_profiles')
          .select('user_id, business_name')
          .in('user_id', buyerIds)
        const map: Record<string, string> = {}
        ;(profiles || []).forEach((p) => {
          map[p.user_id as string] = p.business_name as string
        })
        setBuyerNames(map)
      }

      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 매출·재고 현황을 확인할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  if (!partnerId) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>매출·재고 현황은 공급업체 계정 전용입니다.</p>
        <a href="/" style={styles.btnPrimary}>
          홈으로
        </a>
      </div>
    )
  }

  const thisMonthItems = lineItems.filter((li) => new Date(li.created_at) >= MONTH_START)
  const thisMonthTotal = thisMonthItems.reduce((sum, li) => sum + Number(li.amount), 0)
  const totalArBalance = arBalances.reduce((sum, b) => sum + Number(b.balance), 0)

  const monthMap = new Map<string, MonthSummary>()
  lineItems.forEach((li) => {
    const key = monthKey(li.created_at)
    const entry = monthMap.get(key) || { month: key, count: 0, total: 0 }
    entry.count += 1
    entry.total += Number(li.amount)
    monthMap.set(key, entry)
  })
  const monthSummaries = Array.from(monthMap.values()).sort((a, b) => (a.month < b.month ? 1 : -1))

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <a href="/partner/dashboard" style={styles.backLink}>
          ← 공급업체 마이페이지로
        </a>

        <div style={styles.pageHead}>
          <div style={styles.eyebrow}>공급업체 마이페이지</div>
          <h1 style={styles.h1}>매출·재고 현황</h1>
          <p style={styles.headP}>
            {partnerName}의 월별·일자별 매출, 외상잔액, 재고 현황입니다. (매입 기록은 이 단계에서는 지원하지
            않아요 — 거래전표는 판매 건만 기록됩니다.)
          </p>
        </div>

        <div className="partner-stats-grid" style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>이번 달 매출 합계</div>
            <div style={styles.statValue}>{thisMonthTotal.toLocaleString('ko-KR')}원</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>이번 달 전표 건수</div>
            <div style={styles.statValue}>{thisMonthItems.length.toLocaleString('ko-KR')}건</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>외상잔액 합계</div>
            <div style={styles.statValue}>{totalArBalance.toLocaleString('ko-KR')}원</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>재고 등록 품목 수</div>
            <div style={styles.statValue}>{stockLevels.length.toLocaleString('ko-KR')}개</div>
          </div>
        </div>

        <div style={{ ...styles.sectionTitle, marginTop: 36 }}>월별 매출 요약</div>
        {monthSummaries.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={{ fontSize: 15, color: colors.deep }}>등록된 거래전표가 없어요</h3>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: 36 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>월</th>
                  <th style={styles.th}>전표 건수</th>
                  <th style={styles.th}>매출 합계</th>
                </tr>
              </thead>
              <tbody>
                {monthSummaries.map((m) => (
                  <tr key={m.month}>
                    <td style={styles.td}>{m.month}</td>
                    <td style={styles.td}>{m.count.toLocaleString('ko-KR')}건</td>
                    <td style={styles.td}>{m.total.toLocaleString('ko-KR')}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={styles.sectionTitle}>일자별 거래전표 내역</div>
        {lineItems.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={{ fontSize: 15, color: colors.deep }}>등록된 거래전표가 없어요</h3>
            <p style={{ fontSize: 13, color: colors.muted }}>공급업체 대시보드의 &quot;거래전표 등록&quot;에서 추가할 수 있어요.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: 36 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>일자</th>
                  <th style={styles.th}>소상공인</th>
                  <th style={styles.th}>품목</th>
                  <th style={styles.th}>수량</th>
                  <th style={styles.th}>금액</th>
                  <th style={styles.th}>구분</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.id}>
                    <td style={styles.td}>{formatDate(li.created_at)}</td>
                    <td style={styles.td}>{li.deals?.buyer_profiles?.business_name || '-'}</td>
                    <td style={styles.td}>{li.item_name}</td>
                    <td style={styles.td}>
                      {Number(li.quantity).toLocaleString('ko-KR')}
                      {li.unit}
                    </td>
                    <td style={styles.td}>{Number(li.amount).toLocaleString('ko-KR')}원</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.htag,
                          ...(li.is_credit
                            ? { background: colors.warnBg, color: colors.warn }
                            : { background: colors.goodBg, color: colors.good }),
                        }}
                      >
                        {li.is_credit ? '외상' : '즉시결제'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={styles.sectionTitle}>외상잔액 현황</div>
        {arBalances.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={{ fontSize: 15, color: colors.deep }}>외상잔액이 없어요</h3>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: 36 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>소상공인</th>
                  <th style={styles.th}>외상잔액</th>
                  <th style={styles.th}>최근 변동일</th>
                </tr>
              </thead>
              <tbody>
                {arBalances.map((b) => (
                  <tr key={b.id}>
                    <td style={styles.td}>{buyerNames[b.buyer_id] || '-'}</td>
                    <td style={styles.td}>{Number(b.balance).toLocaleString('ko-KR')}원</td>
                    <td style={styles.td}>{formatDate(b.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={styles.sectionTitle}>재고 현황</div>
        {stockLevels.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={{ fontSize: 15, color: colors.deep }}>등록된 재고 품목이 없어요</h3>
            <p style={{ fontSize: 13, color: colors.muted }}>
              &quot;프로필 · 배송조건 관리&quot;에서 초기 재고를 등록할 수 있어요.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: 90 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>품목명</th>
                  <th style={styles.th}>현재 재고</th>
                  <th style={styles.th}>최근 변동일</th>
                </tr>
              </thead>
              <tbody>
                {stockLevels.map((s) => (
                  <tr key={s.id}>
                    <td style={styles.td}>{s.item_name}</td>
                    <td style={styles.td}>
                      {Number(s.quantity_on_hand).toLocaleString('ko-KR')}
                      {s.unit}
                    </td>
                    <td style={styles.td}>{formatDate(s.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  warn: '#B5460B',
  warnBg: '#FBEAE0',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 1180, margin: '0 auto', padding: '0 32px' },
  backLink: { display: 'inline-block', marginTop: 26, fontSize: 13, color: colors.muted, textDecoration: 'none' },
  pageHead: { padding: '18px 0 6px' },
  eyebrow: { fontSize: 13, color: colors.navy, fontWeight: 700, marginBottom: 8 },
  h1: { fontSize: 23, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  headP: { marginTop: 8, color: colors.muted, fontSize: 14 },
  sectionTitle: { fontSize: 17, marginBottom: 12, marginTop: 8, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
  emptyState: { textAlign: 'center', padding: '40px 20px', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, marginBottom: 36 },
  statsGrid: { display: 'grid', gap: 14, marginBottom: 8 },
  statCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: '18px 20px' },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: 600, marginBottom: 8 },
  statValue: { fontSize: 19, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
  table: { width: '100%', borderCollapse: 'collapse', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, overflow: 'hidden' },
  th: { background: colors.paper2, fontSize: 12.5, color: colors.muted, fontWeight: 700, padding: '12px 16px', textAlign: 'left' },
  td: { padding: '14px 16px', fontSize: 13.5, borderTop: `1px solid ${colors.paper2}` },
  htag: { fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 12 },
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
    marginTop: 20,
  },
}
