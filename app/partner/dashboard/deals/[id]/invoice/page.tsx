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
  partners: {
    id: string
    name: string
    biz_reg_no: string | null
    address: string | null
    phone: string | null
  } | null
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

type Variant = 'receiver' | 'supplier'

const MIN_ITEM_ROWS = 15

function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// deals에는 created_at이 따로 없어(confirmed_at만 존재) 이 앱에서는 거래
// 확정 시점이 곧 생성 시점이라 confirmed_at을 거래일자로 씀.
function isBoxUnit(unit: string) {
  return /box|박스/i.test(unit)
}

export default function DealInvoicePage() {
  const params = useParams<{ id: string }>()
  const dealId = params.id

  const [loading, setLoading] = useState(true)
  const [deal, setDeal] = useState<DealDetail | null>(null)
  const [lineItems, setLineItems] = useState<LineItemRow[]>([])
  const [arBalance, setArBalance] = useState(0)

  useEffect(() => {
    async function load() {
      if (!dealId) return

      // RLS(deals_select_buyer_or_partner)가 이미 해당 거래의 buyer/partner
      // 본인만 select 가능하도록 막아준다 - 별도 접근 제어 불필요.
      const { data: dealRow } = await supabase
        .from('deals')
        .select(
          `id, amount, confirmed_at,
           partners ( id, name, biz_reg_no, address, phone ),
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

  const creditTotal = lineItems.filter((li) => li.is_credit).reduce((s, li) => s + Number(li.amount), 0)
  const cashTotal = lineItems.filter((li) => !li.is_credit).reduce((s, li) => s + Number(li.amount), 0)
  const totalAmount = creditTotal + cashTotal
  const boxTotal = lineItems.filter((li) => isBoxUnit(li.unit)).reduce((s, li) => s + Number(li.quantity), 0)
  const eaTotal = lineItems.filter((li) => !isBoxUnit(li.unit)).reduce((s, li) => s + Number(li.quantity), 0)
  const qtyTotal = lineItems.reduce((s, li) => s + Number(li.quantity), 0)
  // 전미수금 = 현재 누적 외상잔액에서 "이번 거래가 반영한 외상분"을 역산해서 뺀 값
  const openingBalance = arBalance - creditTotal
  const grandTotal = openingBalance + totalAmount
  const docNo = deal.id.slice(0, 8).toUpperCase()
  const dealDate = formatDate(deal.confirmed_at)

  // 최소 15행 고정, 15개 넘으면 그만큼 늘림. 빈 칸은 null로 채워서
  // 렌더링 시 순번만 있고 나머지는 공백인 행이 되도록 함.
  const displayRowCount = Math.max(MIN_ITEM_ROWS, lineItems.length)
  const displayRows: (LineItemRow | null)[] = Array.from({ length: displayRowCount }, (_, i) => lineItems[i] ?? null)

  // deal을 클로저로 참조하지 않고 파라미터로 받음: 위 "if (!deal) return"의
  // null 좁히기는 이 바깥 함수 스코프에만 적용되고, 중첩 함수 안에서는
  // deal이 다시 DealDetail | null로 보여 TS가 "possibly null" 에러를 냄
  // (Vercel 빌드에서 실제로 발생했던 문제). 파라미터로 명시적으로 전달하면
  // 그 스코프 안에서는 확정적으로 DealDetail 타입이라 문제가 생기지 않음.
  function renderCopy(variant: Variant, deal: DealDetail) {
    const subtitle = variant === 'receiver' ? '(공급받는자용)' : '(공급자용)'

    return (
      <div style={styles.half}>
          <div style={styles.sheetHead}>
            <h1 style={styles.title}>거래명세서</h1>
            <div style={styles.subtitle}>{subtitle}</div>
          </div>

          <div style={styles.docNoRow}>
            <span>거래일자: {dealDate}</span>
            <span>NO. {docNo}</span>
          </div>

          <div
            className="responsive-two-col"
            style={{ ...styles.partiesGrid, ['--rtc-gap' as string]: '4px' } as React.CSSProperties}
          >
            <table style={styles.infoTable}>
              <tbody>
                <tr>
                  <th style={styles.infoTh} colSpan={4}>
                    공급자
                  </th>
                </tr>
                <tr>
                  <th style={styles.infoTh}>사업자번호</th>
                  <td style={styles.infoTd} colSpan={3}>
                    {deal.partners?.biz_reg_no || '-'}
                  </td>
                </tr>
                <tr>
                  <th style={styles.infoTh}>상호</th>
                  <td style={styles.infoTd}>{deal.partners?.name || '-'}</td>
                  <th style={styles.infoTh}>성명</th>
                  <td style={styles.infoTd}>{deal.partners?.name || '-'}</td>
                </tr>
                <tr>
                  <th style={styles.infoTh}>주소</th>
                  <td style={styles.infoTd} colSpan={3}>
                    {deal.partners?.address || '-'}
                  </td>
                </tr>
                <tr>
                  <th style={styles.infoTh}>연락처</th>
                  <td style={styles.infoTd} colSpan={3}>
                    {deal.partners?.phone || '-'}
                  </td>
                </tr>
              </tbody>
            </table>

            <table style={styles.infoTable}>
              <tbody>
                <tr>
                  <th style={styles.infoTh} colSpan={4}>
                    공급받는자
                  </th>
                </tr>
                <tr>
                  <th style={styles.infoTh}>사업자번호</th>
                  <td style={styles.infoTd} colSpan={3}>
                    {deal.buyer_profiles?.biz_reg_no || '-'}
                  </td>
                </tr>
                <tr>
                  <th style={styles.infoTh}>상호</th>
                  <td style={styles.infoTd}>{deal.buyer_profiles?.business_name || '-'}</td>
                  <th style={styles.infoTh}>성명</th>
                  <td style={styles.infoTd}>{deal.buyer_profiles?.contact_name || '-'}</td>
                </tr>
                <tr>
                  <th style={styles.infoTh}>주소</th>
                  <td style={styles.infoTd} colSpan={3}>
                    {deal.buyer_profiles?.address || '-'}
                  </td>
                </tr>
                <tr>
                  <th style={styles.infoTh}>담당자</th>
                  <td style={styles.infoTd}>{deal.buyer_profiles?.contact_name || '-'}</td>
                  <th style={styles.infoTh}>연락처</th>
                  <td style={styles.infoTd}>{deal.buyer_profiles?.phone || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.itemTable}>
              <thead>
                <tr>
                  <th style={styles.itemTh}>순번</th>
                  <th style={styles.itemTh}>품명 및 규격</th>
                  <th style={styles.itemTh}>BOX</th>
                  <th style={styles.itemTh}>EA</th>
                  <th style={styles.itemTh}>총수량</th>
                  <th style={styles.itemTh}>단가</th>
                  <th style={styles.itemTh}>금액</th>
                  <th style={styles.itemTh}>비고</th>
                  <th style={styles.itemTh}>참고사항</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((li, idx) => (
                  <tr key={li ? li.id : `empty-${idx}`}>
                    <td style={styles.itemTd}>{idx + 1}</td>
                    <td style={{ ...styles.itemTd, textAlign: 'left' }}>{li?.item_name || ''}</td>
                    <td style={styles.itemTd}>
                      {li && isBoxUnit(li.unit) ? Number(li.quantity).toLocaleString('ko-KR') : ''}
                    </td>
                    <td style={styles.itemTd}>
                      {li && !isBoxUnit(li.unit) ? Number(li.quantity).toLocaleString('ko-KR') : ''}
                    </td>
                    <td style={styles.itemTd}>{li ? Number(li.quantity).toLocaleString('ko-KR') : ''}</td>
                    <td style={styles.itemTd}>{li ? Number(li.unit_price).toLocaleString('ko-KR') : ''}</td>
                    <td style={styles.itemTd}>{li ? Number(li.amount).toLocaleString('ko-KR') : ''}</td>
                    <td style={styles.itemTd}>{li?.is_credit ? '외상' : ''}</td>
                    <td style={{ ...styles.itemTd, textAlign: 'left', color: colors.muted }}>
                      {idx === 0 ? '정산 내역은 소상공 마이페이지에서 확인 가능합니다.' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={styles.itemTdTotal} colSpan={2}>
                    합계
                  </td>
                  <td style={styles.itemTdTotal}>{boxTotal.toLocaleString('ko-KR')}</td>
                  <td style={styles.itemTdTotal}>{eaTotal.toLocaleString('ko-KR')}</td>
                  <td style={styles.itemTdTotal}>{qtyTotal.toLocaleString('ko-KR')}</td>
                  <td style={styles.itemTdTotal}></td>
                  <td style={styles.itemTdTotal}>{totalAmount.toLocaleString('ko-KR')}</td>
                  <td style={styles.itemTdTotal} colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <table style={styles.summaryTable}>
            <tbody>
              <tr>
                <th style={styles.summaryTh}>전미수금</th>
                <td style={styles.summaryTd}>{openingBalance.toLocaleString('ko-KR')}원</td>
                <th style={styles.summaryTh}>금일입금</th>
                <td style={styles.summaryTd}>{cashTotal.toLocaleString('ko-KR')}원</td>
              </tr>
              <tr>
                <th style={styles.summaryTh}>총미수금</th>
                <td style={styles.summaryTd}>{arBalance.toLocaleString('ko-KR')}원</td>
                <th style={styles.summaryTh}>인수자</th>
                <td style={styles.summaryTd}></td>
              </tr>
              <tr>
                <th style={styles.summaryTh}>금일매출액</th>
                <td style={styles.summaryTd}>{totalAmount.toLocaleString('ko-KR')}원</td>
                <th style={styles.summaryTh}>총합계</th>
                <td style={{ ...styles.summaryTd, fontWeight: 700 }}>{grandTotal.toLocaleString('ko-KR')}원</td>
              </tr>
            </tbody>
          </table>
      </div>
    )
  }

  return (
    <div style={{ background: colors.paper }}>
      <div className="invoice-no-print" style={styles.toolbar}>
        <a href="/partner/dashboard" style={styles.backLink}>
          ← 공급업체 마이페이지로
        </a>
        <button style={styles.printBtn} onClick={() => window.print()} type="button">
          인쇄하기
        </button>
      </div>

      {/* A4 1장에 위(공급자용)/아래(공급받는자용) 절반씩 - 절취선(점선)으로
          구분. page-break 없음(1페이지 안에 다 넣는 구조). 화면 미리보기와
          인쇄 결과가 항상 같아야 하므로, 아래 모든 스타일(폰트/padding/
          컨테이너 폭)은 화면·인쇄 공용 - 별도 @media print 오버라이드 없음
          (globals.css 참고). 컨테이너 폭도 인쇄 가능 영역 폭(194mm)에 맞춰
          화면에서 보이는 줄바꿈이 인쇄에서도 그대로 재현되도록 함. */}
      <div style={styles.pageSheet}>
        {renderCopy('supplier', deal)}
        <div style={styles.cutLine} />
        {renderCopy('receiver', deal)}
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
  toolbar: {
    maxWidth: 820,
    margin: '0 auto',
    padding: '20px 24px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  backLink: { fontSize: 13, color: colors.muted, textDecoration: 'none' },
  printBtn: {
    background: colors.navy,
    color: colors.white,
    border: 'none',
    borderRadius: 6,
    padding: '10px 20px',
    fontSize: 13.5,
    fontWeight: 700,
    cursor: 'pointer',
  },
  pageSheet: {
    width: '100%',
    maxWidth: '194mm',
    margin: '10px auto',
    background: colors.white,
    border: `1px solid ${colors.line}`,
    borderRadius: 3,
    padding: '3mm 4mm',
  },
  half: {},
  cutLine: { borderTop: '1px dashed #999', margin: '4mm 0', height: 0 },
  sheetHead: { textAlign: 'center', marginBottom: 4, marginTop: 0 },
  title: { fontSize: 14, fontFamily: "'Noto Serif KR', serif", fontWeight: 700, color: colors.deep, margin: 0, letterSpacing: 2 },
  subtitle: { fontSize: 9, color: colors.muted, margin: '2px 0 0' },
  docNoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: colors.muted,
    margin: '3px 0',
    paddingBottom: 2,
    borderBottom: `1px solid ${colors.line}`,
  },
  partiesGrid: { marginBottom: 3 },
  infoTable: { width: '100%', borderCollapse: 'collapse', border: `1px solid ${colors.navy}` },
  infoTh: {
    border: `1px solid ${colors.navy}`,
    background: colors.paper2,
    fontSize: 8,
    color: colors.navy,
    fontWeight: 700,
    padding: '1px 4px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    lineHeight: 1.15,
  },
  infoTd: { border: `1px solid ${colors.navy}`, fontSize: 8, padding: '1px 4px', textAlign: 'center', lineHeight: 1.15 },
  itemTable: { width: '100%', borderCollapse: 'collapse', marginBottom: 3, border: `1px solid ${colors.navy}` },
  itemTh: {
    border: `1px solid ${colors.navy}`,
    background: colors.paper2,
    fontSize: 8,
    color: colors.navy,
    fontWeight: 700,
    padding: '1px 3px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    lineHeight: 1.1,
  },
  itemTd: { border: `1px solid ${colors.navy}`, fontSize: 7, padding: '1px 3px', textAlign: 'center', lineHeight: 1.1 },
  itemTdTotal: {
    border: `1px solid ${colors.navy}`,
    fontSize: 7,
    padding: '1px 3px',
    textAlign: 'center',
    fontWeight: 700,
    background: colors.paper2,
    lineHeight: 1.1,
  },
  summaryTable: { width: '100%', borderCollapse: 'collapse', border: `1px solid ${colors.navy}` },
  summaryTh: {
    border: `1px solid ${colors.navy}`,
    background: colors.paper2,
    fontSize: 8,
    color: colors.navy,
    fontWeight: 700,
    padding: '2px 5px',
    textAlign: 'center',
    width: '18%',
    lineHeight: 1.15,
  },
  summaryTd: { border: `1px solid ${colors.navy}`, fontSize: 8, padding: '2px 5px', textAlign: 'right', lineHeight: 1.15 },
  btnPrimary: {
    background: colors.amber,
    color: colors.deep,
    border: 'none',
    borderRadius: 6,
    padding: '13px 24px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    marginTop: 20,
  },
}
