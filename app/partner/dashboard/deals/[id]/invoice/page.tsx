'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../../../lib/supabaseClient'

type LineItemRow = {
  id: string
  item_name: string
  quantity: number
  unit: string
  unit_price: number
  amount: number
  is_credit: boolean
}

type DealDetail = {
  id: string
  amount: number
  confirmed_at: string
  partners: { id: string; name: string; biz_reg_no: string | null; region: string | null; phone: string | null } | null
  buyer_profiles: {
    id: string
    business_name: string
    biz_reg_no: string | null
    address: string | null
    contact_name: string | null
    phone: string | null
    user_id: string
  } | null
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

export default function DealInvoicePage() {
  const params = useParams<{ id: string }>()
  const dealId = params.id

  const [loading, setLoading] = useState(true)
  const [deal, setDeal] = useState<DealDetail | null>(null)
  const [lineItems, setLineItems] = useState<LineItemRow[]>([])
  const [arBalance, setArBalance] = useState<number>(0)

  useEffect(() => {
    async function load() {
      if (!dealId) return

      // RLS(deals_select_buyer_or_partner)가 이미 해당 거래의 buyer/partner
      // 본인만 select 가능하도록 막아준다 - 별도 접근 제어 불필요. 권한이
      // 없거나 존재하지 않는 id면 maybeSingle이 null을 반환함.
      const { data: dealRow } = await supabase
        .from('deals')
        .select(
          `id, amount, confirmed_at,
           partners ( id, name, biz_reg_no, region, phone ),
           buyer_profiles ( id, business_name, biz_reg_no, address, contact_name, phone, user_id )`
        )
        .eq('id', dealId)
        .maybeSingle()

      if (!dealRow) {
        setLoading(false)
        return
      }
      const detail = dealRow as unknown as DealDetail
      setDeal(detail)

      const { data: items } = await supabase
        .from('deal_line_items')
        .select('id, item_name, quantity, unit, unit_price, amount, is_credit')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true })
      setLineItems((items || []) as LineItemRow[])

      if (detail.partners && detail.buyer_profiles) {
        const { data: ar } = await supabase
          .from('ar_balances')
          .select('balance')
          .eq('partner_id', detail.partners.id)
          .eq('buyer_id', detail.buyer_profiles.user_id)
          .maybeSingle()
        setArBalance(ar ? Number(ar.balance) : 0)
      }

      setLoading(false)
    }

    load()
  }, [dealId])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (!deal) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          거래명세서를 조회할 권한이 없거나 존재하지 않는 거래예요.
        </p>
        <a href="/partner/dashboard" style={styles.btnPrimary}>
          공급업체 마이페이지로
        </a>
      </div>
    )
  }

  const totalAmount = lineItems.reduce((sum, li) => sum + Number(li.amount), 0)
  const issuedDate = formatDate(new Date().toISOString())

  return (
    <div style={{ background: colors.paper, minHeight: '100vh' }}>
      <div className="invoice-no-print" style={styles.toolbar}>
        <a href="/partner/dashboard" style={styles.backLink}>
          ← 공급업체 마이페이지로
        </a>
        <button style={styles.printBtn} onClick={() => window.print()} type="button">
          인쇄하기
        </button>
      </div>

      <div style={styles.sheet}>
        <div style={styles.sheetHead}>
          <h1 style={styles.title}>거래명세표</h1>
          <div style={styles.issuedDate}>발행일자: {issuedDate} · 거래일자: {formatDate(deal.confirmed_at)}</div>
        </div>

        <div
          className="responsive-two-col"
          style={{ ...styles.partiesGrid, ['--rtc-gap' as string]: '20px' } as React.CSSProperties}
        >
          <div style={styles.partyBox}>
            <div style={styles.partyLabel}>공급자</div>
            <div style={styles.partyRow}>
              <span style={styles.partyKey}>업체명</span>
              <span>{deal.partners?.name || '-'}</span>
            </div>
            <div style={styles.partyRow}>
              <span style={styles.partyKey}>사업자등록번호</span>
              <span>{deal.partners?.biz_reg_no || '-'}</span>
            </div>
            <div style={styles.partyRow}>
              <span style={styles.partyKey}>연락처</span>
              <span>{deal.partners?.phone || '-'}</span>
            </div>
          </div>
          <div style={styles.partyBox}>
            <div style={styles.partyLabel}>공급받는자</div>
            <div style={styles.partyRow}>
              <span style={styles.partyKey}>사업장명</span>
              <span>{deal.buyer_profiles?.business_name || '-'}</span>
            </div>
            <div style={styles.partyRow}>
              <span style={styles.partyKey}>주소</span>
              <span>{deal.buyer_profiles?.address || '-'}</span>
            </div>
            <div style={styles.partyRow}>
              <span style={styles.partyKey}>담당자</span>
              <span>{deal.buyer_profiles?.contact_name || '-'}</span>
            </div>
            <div style={styles.partyRow}>
              <span style={styles.partyKey}>연락처</span>
              <span>{deal.buyer_profiles?.phone || '-'}</span>
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>품목명</th>
                <th style={styles.th}>수량</th>
                <th style={styles.th}>단위</th>
                <th style={styles.th}>단가</th>
                <th style={styles.th}>금액</th>
                <th style={styles.th}>비고</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td style={{ ...styles.td, textAlign: 'center', color: colors.muted }} colSpan={6}>
                    등록된 품목이 없어요.
                  </td>
                </tr>
              ) : (
                lineItems.map((li) => (
                  <tr key={li.id}>
                    <td style={styles.td}>{li.item_name}</td>
                    <td style={styles.td}>
                      {Number(li.quantity).toLocaleString('ko-KR')}
                      {li.unit}
                    </td>
                    <td style={styles.td}>{li.unit}</td>
                    <td style={styles.td}>{Number(li.unit_price).toLocaleString('ko-KR')}원</td>
                    <td style={styles.td}>{Number(li.amount).toLocaleString('ko-KR')}원</td>
                    <td style={styles.td}>{li.is_credit ? '외상' : ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={styles.totalsBox}>
          <div style={styles.totalsRow}>
            <span>합계금액</span>
            <b>{totalAmount.toLocaleString('ko-KR')}원</b>
          </div>
          <div style={styles.totalsRow}>
            <span>외상잔액</span>
            <b>{arBalance.toLocaleString('ko-KR')}원</b>
          </div>
        </div>

        <div
          className="responsive-two-col"
          style={{ ...styles.signGrid, ['--rtc-gap' as string]: '40px' } as React.CSSProperties}
        >
          <div style={styles.signBox}>
            <div style={styles.signLabel}>공급자 확인</div>
            <div style={styles.signLine}>(서명)</div>
          </div>
          <div style={styles.signBox}>
            <div style={styles.signLabel}>인수자 확인</div>
            <div style={styles.signLine}>(서명)</div>
          </div>
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
  warn: '#B5460B',
  warnBg: '#FBEAE0',
}

const styles: { [k: string]: React.CSSProperties } = {
  toolbar: { maxWidth: 800, margin: '0 auto', padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  backLink: { fontSize: 13, color: colors.muted, textDecoration: 'none' },
  printBtn: { background: colors.navy, color: colors.white, border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' },
  sheet: { maxWidth: 800, margin: '20px auto 60px', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 4, padding: '48px 56px', boxShadow: '0 8px 30px rgba(10,30,61,0.08)' },
  sheetHead: { textAlign: 'center', marginBottom: 32 },
  title: { fontSize: 26, fontFamily: "'Noto Serif KR', serif", fontWeight: 700, color: colors.deep, margin: 0, letterSpacing: 6 },
  issuedDate: { fontSize: 12.5, color: colors.muted, marginTop: 10 },
  partiesGrid: { marginBottom: 28 },
  partyBox: { border: `1px solid ${colors.line}`, borderRadius: 6, padding: 16 },
  partyLabel: { fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 10 },
  partyRow: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.8, padding: '6px 0', borderTop: `1px solid ${colors.paper2}` },
  partyKey: { color: colors.muted, flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 20 },
  th: { border: `1px solid ${colors.line}`, background: colors.paper2, fontSize: 12, color: colors.muted, fontWeight: 700, padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' },
  td: { border: `1px solid ${colors.line}`, fontSize: 12.8, padding: '9px 10px' },
  totalsBox: { border: `1px solid ${colors.line}`, borderRadius: 6, padding: '14px 18px', marginBottom: 40 },
  totalsRow: { display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0' },
  signGrid: {},
  signBox: { textAlign: 'center' },
  signLabel: { fontSize: 12.5, color: colors.muted, marginBottom: 40 },
  signLine: { borderTop: `1px solid ${colors.ink}`, paddingTop: 6, fontSize: 11, color: colors.muted },
  btnPrimary: { background: colors.amber, color: colors.deep, border: 'none', borderRadius: 6, padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', marginTop: 20 },
}
