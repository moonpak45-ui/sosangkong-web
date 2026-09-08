'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type QuoteItem = { name: string; qty?: string; unit?: string }

type RequestAttributes = {
  items?: QuoteItem[]
  desired_delivery_date?: string
  delivery_address?: string
  payment_method?: string
  request_note?: string
}

type ReceivedRequest = {
  id: string // quote_request_targets.id
  sent_at: string
  quote_requests: {
    id: string
    title: string | null
    attributes: RequestAttributes | null
    created_at: string
    categories: { name: string } | null
    buyer_profiles: { business_name: string; region: string | null; industry: string | null } | null
  } | null
}

type Partner = {
  id: string
  name: string
  region: string | null
  description: string | null
  verified_badge: boolean
  status: string
}

type DealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  buyer_profiles: { business_name: string } | null
  quotes: { id: string; quote_requests: { attributes: RequestAttributes | null } | null } | null
}

type LineItemRow = {
  id: string
  item_name: string
  quantity: number
  unit: string
  unit_price: number
  amount: number
  is_credit: boolean
  created_at: string
}

type SettlementRow = {
  id: string
  gross_amount: number
  commission_amount: number
  net_amount: number
  status: string
  settled_at: string | null
  deals: {
    id: string
    confirmed_at: string
    buyer_profiles: { business_name: string } | null
  } | null
}

const PAYMENT_METHODS = ['계좌이체', '현금', '월말 정산']

const DEAL_STATUS_LABEL: Record<DealRow['status'], string> = {
  in_progress: '진행중',
  completed: '거래완료',
  disputed: '분쟁중',
}

const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  pending: '정산 예정',
  completed: '정산 완료',
}

function itemsText(attrs: RequestAttributes | null): string {
  const items = attrs?.items
  if (!items || items.length === 0) return '품목 정보 없음'
  return items.map((it) => [it.name, it.qty, it.unit].filter(Boolean).join(' ')).join(' · ')
}

function itemsSummary(attrs: RequestAttributes | null): string {
  const items = attrs?.items
  if (!items || items.length === 0) return '-'
  return items.length > 1 ? `${items[0].name} 외 ${items.length - 1}건` : items[0].name
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function dealStatusStyle(status: DealRow['status']): React.CSSProperties {
  if (status === 'completed') return { background: colors.goodBg, color: colors.good }
  if (status === 'disputed') return { background: colors.warnBg, color: colors.warn }
  return { background: '#E7EEF5', color: colors.navy }
}

function settlementStatusStyle(status: string): React.CSSProperties {
  if (status === 'completed') return { background: colors.goodBg, color: colors.good }
  if (status === 'disputed') return { background: colors.warnBg, color: colors.warn }
  return { background: '#E7EEF5', color: colors.navy }
}

const MONTH_START = new Date(new Date().getFullYear(), new Date().getMonth(), 1)


export default function PartnerDashboardPage() {
  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [partner, setPartner] = useState<Partner | null | undefined>(undefined)
  const [targets, setTargets] = useState<ReceivedRequest[]>([])
  const [deals, setDeals] = useState<DealRow[]>([])
  const [settlements, setSettlements] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)

  const [openId, setOpenId] = useState<string | null>(null)
  const [forms, setForms] = useState<
    Record<string, { price: string; eta: string; paymentTerms: string; note: string }>
  >({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<Record<string, string>>({})

  const [ledgerDealId, setLedgerDealId] = useState('')
  const [ledgerLineItems, setLedgerLineItems] = useState<LineItemRow[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerItemName, setLedgerItemName] = useState('')
  const [ledgerQty, setLedgerQty] = useState('')
  const [ledgerUnit, setLedgerUnit] = useState('개')
  const [ledgerPrice, setLedgerPrice] = useState('')
  const [ledgerIsCredit, setLedgerIsCredit] = useState(false)
  const [ledgerAdding, setLedgerAdding] = useState(false)
  const [ledgerError, setLedgerError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session: authSession } } = await supabase.auth.getSession()

      if (!authSession) {
        setSession(null)
        setLoading(false)
        return
      }
      setSession({ userId: authSession.user.id })

      const { data: partnerRow } = await supabase
        .from('partners')
        .select('id, name, region, description, verified_badge, status')
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!partnerRow) {
        setPartner(null)
        setLoading(false)
        return
      }
      setPartner(partnerRow)

      const [{ data: targetRows }, { data: dealRows }, { data: settlementRows }] = await Promise.all([
        supabase
          .from('quote_request_targets')
          .select(
            `id, sent_at,
             quote_requests (
               id, title, attributes, created_at,
               categories ( name ),
               buyer_profiles ( business_name, region, industry )
             )`
          )
          .eq('partner_id', partnerRow.id)
          .eq('status', 'waiting')
          .order('sent_at', { ascending: false }),
        supabase
          .from('deals')
          .select(
            `id, amount, status, confirmed_at,
             buyer_profiles ( business_name ),
             quotes ( id, quote_requests ( attributes ) )`
          )
          .eq('partner_id', partnerRow.id)
          .order('confirmed_at', { ascending: false }),
        supabase
          .from('settlements')
          .select(
            `id, gross_amount, commission_amount, net_amount, status, settled_at,
             deals ( id, confirmed_at, buyer_profiles ( business_name ) )`
          ),
      ])

      setTargets((targetRows || []) as unknown as ReceivedRequest[])
      setDeals((dealRows || []) as unknown as DealRow[])

      const settlementList = (settlementRows || []) as unknown as SettlementRow[]
      settlementList.sort((a, b) => {
        const aDate = a.deals?.confirmed_at || ''
        const bDate = b.deals?.confirmed_at || ''
        return aDate < bDate ? 1 : -1
      })
      setSettlements(settlementList)

      setLoading(false)
    }

    load()
  }, [])

  useEffect(() => {
    async function loadLineItems() {
      if (!ledgerDealId) {
        setLedgerLineItems([])
        return
      }
      setLedgerLoading(true)
      const { data } = await supabase
        .from('deal_line_items')
        .select('id, item_name, quantity, unit, unit_price, amount, is_credit, created_at')
        .eq('deal_id', ledgerDealId)
        .order('created_at', { ascending: false })
      setLedgerLineItems((data || []) as LineItemRow[])
      setLedgerLoading(false)
    }

    loadLineItems()
  }, [ledgerDealId])

  async function addLineItem() {
    setLedgerError('')

    if (!ledgerDealId) {
      setLedgerError('거래를 선택해주세요.')
      return
    }
    if (!ledgerItemName.trim()) {
      setLedgerError('품목명을 입력해주세요.')
      return
    }
    const qty = Number(ledgerQty)
    if (!ledgerQty.trim() || Number.isNaN(qty) || qty <= 0) {
      setLedgerError('수량은 0보다 큰 숫자로 입력해주세요.')
      return
    }
    const price = Number(ledgerPrice)
    if (!ledgerPrice.trim() || Number.isNaN(price) || price < 0) {
      setLedgerError('단가를 올바르게 입력해주세요.')
      return
    }

    setLedgerAdding(true)
    const { data, error } = await supabase
      .from('deal_line_items')
      .insert({
        deal_id: ledgerDealId,
        item_name: ledgerItemName.trim(),
        quantity: qty,
        unit: ledgerUnit.trim() || '개',
        unit_price: price,
        is_credit: ledgerIsCredit,
      })
      .select('id, item_name, quantity, unit, unit_price, amount, is_credit, created_at')
      .single()
    setLedgerAdding(false)

    if (error || !data) {
      setLedgerError('전표 등록 중 오류가 발생했습니다: ' + (error?.message || ''))
      return
    }

    setLedgerLineItems((prev) => [data as LineItemRow, ...prev])
    setLedgerItemName('')
    setLedgerQty('')
    setLedgerPrice('')
    setLedgerIsCredit(false)
  }

  function openForm(target: ReceivedRequest) {
    setOpenId(target.id)
    if (!forms[target.id]) {
      setForms((prev) => ({
        ...prev,
        [target.id]: {
          price: '',
          eta: target.quote_requests?.attributes?.desired_delivery_date || '',
          paymentTerms: target.quote_requests?.attributes?.payment_method || PAYMENT_METHODS[0],
          note: '',
        },
      }))
    }
  }

  function updateForm(id: string, field: 'price' | 'eta' | 'paymentTerms' | 'note', value: string) {
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function submitQuote(target: ReceivedRequest) {
    const form = forms[target.id]
    const price = Number(form?.price)

    if (!form || !form.price.trim() || Number.isNaN(price) || price <= 0) {
      setFormError((prev) => ({ ...prev, [target.id]: '가격을 올바르게 입력해주세요.' }))
      return
    }
    if (!partner || !target.quote_requests) {
      setFormError((prev) => ({ ...prev, [target.id]: '요청 정보를 불러오지 못했습니다.' }))
      return
    }

    setFormError((prev) => ({ ...prev, [target.id]: '' }))
    setSubmittingId(target.id)

    const { error: quoteError } = await supabase.from('quotes').insert({
      quote_request_id: target.quote_requests.id,
      partner_id: partner.id,
      price,
      match_score: null,
      eta_or_schedule: form.eta,
      payment_terms: form.paymentTerms,
      note: form.note,
      responded_at: new Date().toISOString(),
    })

    if (quoteError) {
      setSubmittingId(null)
      setFormError((prev) => ({ ...prev, [target.id]: '견적 저장 중 오류: ' + quoteError.message }))
      return
    }

    const { error: targetError } = await supabase
      .from('quote_request_targets')
      .update({ status: 'responded' })
      .eq('id', target.id)

    setSubmittingId(null)

    if (targetError) {
      setFormError((prev) => ({ ...prev, [target.id]: '요청 상태 업데이트 중 오류: ' + targetError.message }))
      return
    }

    setTargets((prev) => prev.filter((t) => t.id !== target.id))
    setOpenId(null)
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 공급업체 대시보드를 이용할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  if (partner === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>공급업체 대시보드는 공급업체 계정 전용입니다.</p>
        <a href="/" style={styles.btnPrimary}>
          홈으로
        </a>
      </div>
    )
  }

  const isThisMonth = (iso: string) => new Date(iso) >= MONTH_START
  const thisMonthSettlements = settlements.filter((s) => s.deals && isThisMonth(s.deals.confirmed_at))

  const nextSettlementAmount = settlements
    .filter((s) => s.status === 'pending')
    .reduce((sum, s) => sum + Number(s.net_amount), 0)
  const thisMonthDealAmount = thisMonthSettlements.reduce((sum, s) => sum + Number(s.gross_amount), 0)
  const thisMonthCommission = thisMonthSettlements.reduce((sum, s) => sum + Number(s.commission_amount), 0)
  const totalSettledAmount = settlements
    .filter((s) => s.status === 'completed')
    .reduce((sum, s) => sum + Number(s.net_amount), 0)

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <div
          className="responsive-two-col"
          style={{ ...styles.pageLayout, ['--rtc-cols' as string]: '230px 1fr', ['--rtc-gap' as string]: '36px' } as React.CSSProperties}
        >
          <div className="responsive-sidebar-divider" style={styles.sideMenu}>
            <div style={styles.bizCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={styles.bizName}>{partner!.name}</span>
                {partner!.verified_badge && <span style={styles.verifiedBadge}>✓ 검증</span>}
              </div>
              <div style={styles.bizMeta}>
                {[partner!.region, partner!.description].filter(Boolean).join(' · ') || '사업장 정보 미입력'}
              </div>
            </div>
            <a href="#requests" style={{ ...styles.menuItem, ...styles.menuItemActive }}>
              받은 견적요청
              {targets.length > 0 && <span style={styles.menuBadge}>{targets.length}</span>}
            </a>
            <a href="#deals" style={styles.menuItem}>
              진행 중인 거래
              {deals.length > 0 && <span style={styles.menuBadge}>{deals.length}</span>}
            </a>
            <a href="#ledger-entry" style={styles.menuItem}>
              거래전표 등록
            </a>
            <a href="/partner/ledger" style={styles.menuItem}>
              매출·재고 현황
            </a>
            <a href="#settlements" style={styles.menuItem}>
              정산
            </a>
            <a href="/partner/profile" style={styles.menuItem}>
              프로필 · 배송조건 관리
            </a>
            <a href="/partner/account" style={styles.menuItem}>
              계정 설정
            </a>
          </div>

          <div>
            <div style={styles.sectionTitle}>안녕하세요, {partner!.name}님</div>
            <div style={styles.sectionSub}>
              {targets.length > 0
                ? `새로 들어온 견적요청 ${targets.length}건이 있어요. 빠른 응답이 거래 성사율을 높여요.`
                : '아직 새로 들어온 견적요청이 없어요.'}
            </div>

            <div id="requests" style={{ ...styles.sectionTitle, fontSize: 19, marginTop: 8 }}>
              받은 견적요청
            </div>
            <div style={styles.sectionSub}>회신 대기 중인 소상공인의 견적요청입니다.</div>

            {targets.length === 0 ? (
              <div style={styles.emptyState}>
                <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>대기 중인 견적요청이 없어요</h3>
                <p style={{ fontSize: 13.5, color: colors.muted }}>
                  검색결과에 노출되면 소상공인의 견적요청이 이곳에 도착합니다.
                </p>
              </div>
            ) : (
              targets.map((target) => {
                const qr = target.quote_requests
                const form = forms[target.id]
                return (
                  <div key={target.id} style={styles.leadCard}>
                    <div style={styles.leadTop}>
                      <div>
                        <div style={styles.leadBuyer}>{qr?.buyer_profiles?.business_name || '요청자 정보 없음'} 사장님</div>
                        <div style={styles.leadMeta}>
                          {[qr?.buyer_profiles?.region, qr?.buyer_profiles?.industry, qr?.categories?.name]
                            .filter(Boolean)
                            .join(' · ') || '조건 정보 없음'}
                        </div>
                      </div>
                      <div style={styles.leadDate}>{qr ? new Date(qr.created_at).toLocaleDateString('ko-KR') : ''}</div>
                    </div>

                    <div style={styles.leadItems}>
                      {itemsText(qr?.attributes ?? null)}
                      {qr?.attributes?.desired_delivery_date && ` — 희망 배송일 ${qr.attributes.desired_delivery_date}`}
                    </div>

                    {qr?.attributes?.delivery_address && (
                      <div style={styles.leadDetailRow}>배송지: {qr.attributes.delivery_address}</div>
                    )}
                    {qr?.attributes?.payment_method && (
                      <div style={styles.leadDetailRow}>희망 결제방식: {qr.attributes.payment_method}</div>
                    )}
                    {qr?.attributes?.request_note && (
                      <div style={styles.leadDetailRow}>요청사항: {qr.attributes.request_note}</div>
                    )}

                    {openId !== target.id ? (
                      <div style={styles.leadActions}>
                        <button style={{ ...styles.btn, ...styles.btnPrimarySmall }} onClick={() => openForm(target)}>
                          견적 제출하기
                        </button>
                      </div>
                    ) : (
                      <div style={styles.quoteForm}>
                        <div style={styles.fieldRow}>
                          <div style={styles.field}>
                            <label style={styles.label}>가격 (원)</label>
                            <input
                              type="number"
                              style={styles.input}
                              placeholder="예) 103000"
                              value={form?.price || ''}
                              onChange={(e) => updateForm(target.id, 'price', e.target.value)}
                            />
                          </div>
                          <div style={styles.field}>
                            <label style={styles.label}>배송/착수 예정</label>
                            <input
                              type="text"
                              style={styles.input}
                              placeholder="예) 9.9(화) 오전"
                              value={form?.eta || ''}
                              onChange={(e) => updateForm(target.id, 'eta', e.target.value)}
                            />
                          </div>
                        </div>
                        <div style={styles.field}>
                          <label style={styles.label}>결제 조건</label>
                          <div style={styles.radioGroup}>
                            {PAYMENT_METHODS.map((m) => (
                              <div
                                key={m}
                                style={{
                                  ...styles.radioChip,
                                  ...(form?.paymentTerms === m ? styles.radioChipSel : {}),
                                }}
                                onClick={() => updateForm(target.id, 'paymentTerms', m)}
                              >
                                {m}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={styles.field}>
                          <label style={styles.label}>메모 (선택)</label>
                          <textarea
                            style={styles.textarea}
                            placeholder="예) 화요일 오전 배송 가능합니다."
                            value={form?.note || ''}
                            onChange={(e) => updateForm(target.id, 'note', e.target.value)}
                          />
                        </div>

                        {formError[target.id] && <div style={styles.errorBox}>{formError[target.id]}</div>}

                        <div style={styles.leadActions}>
                          <button
                            style={{ ...styles.btn, ...styles.btnOutlineSmall }}
                            onClick={() => setOpenId(null)}
                            disabled={submittingId === target.id}
                          >
                            취소
                          </button>
                          <button
                            style={{ ...styles.btn, ...styles.btnPrimarySmall }}
                            onClick={() => submitQuote(target)}
                            disabled={submittingId === target.id}
                          >
                            {submittingId === target.id ? '제출 중...' : '견적 제출하기'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}

            <div id="deals" style={{ ...styles.sectionTitle, marginTop: 44 }}>
              진행 중인 거래
            </div>
            <div style={styles.sectionSub}>확정된 거래 내역입니다. 상태가 바뀌면 이곳에서 확인할 수 있어요.</div>

            {deals.length === 0 ? (
              <div style={styles.emptyState}>
                <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>진행 중인 거래가 없어요</h3>
                <p style={{ fontSize: 13.5, color: colors.muted }}>
                  견적을 제출하고 소상공인이 확정하면 이곳에서 거래를 확인할 수 있어요.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: 44 }}>
                <table style={styles.historyTable}>
                  <thead>
                    <tr>
                      <th style={styles.th}>확정일</th>
                      <th style={styles.th}>소상공인</th>
                      <th style={styles.th}>품목</th>
                      <th style={styles.th}>거래액</th>
                      <th style={styles.th}>상태</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((row) => (
                      <tr key={row.id}>
                        <td style={styles.td}>{formatDate(row.confirmed_at)}</td>
                        <td style={styles.td}>{row.buyer_profiles?.business_name || '-'}</td>
                        <td style={styles.td}>{itemsSummary(row.quotes?.quote_requests?.attributes ?? null)}</td>
                        <td style={styles.td}>{Number(row.amount).toLocaleString('ko-KR')}원</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.htag, ...dealStatusStyle(row.status) }}>
                            {DEAL_STATUS_LABEL[row.status]}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <a href={`/partner/dashboard/deals/${row.id}/invoice`} style={styles.repeatLink}>
                            명세서 인쇄
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div id="ledger-entry" style={{ ...styles.sectionTitle, marginTop: 44 }}>
              거래전표 등록
            </div>
            <div style={styles.sectionSub}>
              진행 중인 거래를 선택하고 품목별로 전표를 등록하세요. 외상 거래는 외상잔액에, 등록한 수량은
              재고에 자동 반영됩니다(재고는 미리 등록해둔 품목만 차감돼요).
            </div>

            <div style={styles.card}>
              <div style={styles.field}>
                <label style={styles.label}>거래 선택</label>
                <select
                  style={styles.input}
                  value={ledgerDealId}
                  onChange={(e) => setLedgerDealId(e.target.value)}
                >
                  <option value="">진행 중인 거래를 선택하세요</option>
                  {deals
                    .filter((d) => d.status === 'in_progress')
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {formatDate(d.confirmed_at)} · {d.buyer_profiles?.business_name || '소상공인'} ·{' '}
                        {Number(d.amount).toLocaleString('ko-KR')}원
                      </option>
                    ))}
                </select>
              </div>

              {ledgerDealId && (
                <>
                  <div style={styles.field}>
                    <label style={styles.label}>품목명</label>
                    <input
                      type="text"
                      style={styles.input}
                      placeholder="예) 냉동 흰살생선"
                      value={ledgerItemName}
                      onChange={(e) => setLedgerItemName(e.target.value)}
                    />
                  </div>
                  <div style={styles.fieldRow}>
                    <div style={styles.field}>
                      <label style={styles.label}>수량</label>
                      <input
                        type="number"
                        style={styles.input}
                        placeholder="예) 10"
                        value={ledgerQty}
                        onChange={(e) => setLedgerQty(e.target.value)}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>단위</label>
                      <input
                        type="text"
                        style={styles.input}
                        placeholder="예) 박스"
                        value={ledgerUnit}
                        onChange={(e) => setLedgerUnit(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>단가 (원)</label>
                    <input
                      type="number"
                      style={styles.input}
                      placeholder="예) 12000"
                      value={ledgerPrice}
                      onChange={(e) => setLedgerPrice(e.target.value)}
                    />
                  </div>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.muted, marginBottom: 16, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={ledgerIsCredit}
                      onChange={(e) => setLedgerIsCredit(e.target.checked)}
                    />
                    외상 거래 (미수금으로 기록)
                  </label>

                  {ledgerError && <div style={styles.errorBox}>{ledgerError}</div>}

                  <button
                    style={{ ...styles.btn, ...styles.btnPrimarySmall, width: '100%' }}
                    onClick={addLineItem}
                    disabled={ledgerAdding}
                    type="button"
                  >
                    {ledgerAdding ? '등록 중...' : '품목 추가'}
                  </button>
                </>
              )}
            </div>

            {ledgerDealId && (
              <div style={{ overflowX: 'auto', marginBottom: 44 }}>
                {ledgerLoading ? (
                  <div style={{ padding: 30, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
                ) : ledgerLineItems.length === 0 ? (
                  <div style={styles.emptyState}>
                    <h3 style={{ fontSize: 15, color: colors.deep }}>이 거래에 등록된 전표가 없어요</h3>
                  </div>
                ) : (
                  <table style={styles.historyTable}>
                    <thead>
                      <tr>
                        <th style={styles.th}>등록일시</th>
                        <th style={styles.th}>품목</th>
                        <th style={styles.th}>수량</th>
                        <th style={styles.th}>단가</th>
                        <th style={styles.th}>금액</th>
                        <th style={styles.th}>구분</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerLineItems.map((li) => (
                        <tr key={li.id}>
                          <td style={styles.td}>{formatDate(li.created_at)}</td>
                          <td style={styles.td}>{li.item_name}</td>
                          <td style={styles.td}>
                            {Number(li.quantity).toLocaleString('ko-KR')}
                            {li.unit}
                          </td>
                          <td style={styles.td}>{Number(li.unit_price).toLocaleString('ko-KR')}원</td>
                          <td style={styles.td}>{Number(li.amount).toLocaleString('ko-KR')}원</td>
                          <td style={styles.td}>
                            <span
                              style={{
                                ...styles.htag,
                                ...(li.is_credit ? { background: colors.warnBg, color: colors.warn } : { background: colors.goodBg, color: colors.good }),
                              }}
                            >
                              {li.is_credit ? '외상' : '즉시결제'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <div id="settlements" style={{ ...styles.sectionTitle, marginTop: 44 }}>
              정산
            </div>
            <div style={styles.sectionSub}>거래 확정 시 자동으로 생성된 정산 내역입니다.</div>

            <div className="partner-stats-grid" style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>다음 정산 예정액</div>
                <div style={styles.statValue}>{nextSettlementAmount.toLocaleString('ko-KR')}원</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>이번 달 확정 거래액</div>
                <div style={styles.statValue}>{thisMonthDealAmount.toLocaleString('ko-KR')}원</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>이번 달 수수료 합계</div>
                <div style={styles.statValue}>{thisMonthCommission.toLocaleString('ko-KR')}원</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>누적 정산 완료액</div>
                <div style={styles.statValue}>{totalSettledAmount.toLocaleString('ko-KR')}원</div>
              </div>
            </div>

            {settlements.length === 0 ? (
              <div style={styles.emptyState}>
                <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>정산 내역이 없어요</h3>
                <p style={{ fontSize: 13.5, color: colors.muted }}>
                  거래가 확정되면 이곳에 정산 내역이 자동으로 생성됩니다.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.historyTable}>
                  <thead>
                    <tr>
                      <th style={styles.th}>거래확정일</th>
                      <th style={styles.th}>소상공인</th>
                      <th style={styles.th}>거래액</th>
                      <th style={styles.th}>적용 수수료율</th>
                      <th style={styles.th}>수수료</th>
                      <th style={styles.th}>정산액</th>
                      <th style={styles.th}>정산상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((row) => {
                      const rate =
                        Number(row.gross_amount) > 0
                          ? ((Number(row.commission_amount) / Number(row.gross_amount)) * 100).toFixed(1) + '%'
                          : '-'
                      return (
                        <tr key={row.id}>
                          <td style={styles.td}>{row.deals ? formatDate(row.deals.confirmed_at) : '-'}</td>
                          <td style={styles.td}>{row.deals?.buyer_profiles?.business_name || '-'}</td>
                          <td style={styles.td}>{Number(row.gross_amount).toLocaleString('ko-KR')}원</td>
                          <td style={styles.td}>{rate}</td>
                          <td style={styles.td}>{Number(row.commission_amount).toLocaleString('ko-KR')}원</td>
                          <td style={styles.td}>{Number(row.net_amount).toLocaleString('ko-KR')}원</td>
                          <td style={styles.td}>
                            <span style={{ ...styles.htag, ...settlementStatusStyle(row.status) }}>
                              {SETTLEMENT_STATUS_LABEL[row.status] || row.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
  wrap: { maxWidth: 1180, margin: '0 auto', padding: '0 32px' },
  pageLayout: { padding: '36px 0 90px' },
  sideMenu: { borderRight: `1px solid ${colors.line}`, paddingRight: 20 },
  bizCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 18, marginBottom: 20 },
  bizName: { fontSize: 15, fontWeight: 700 },
  verifiedBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, background: colors.goodBg, color: colors.good, fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20 },
  bizMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  menuItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px', fontSize: 14, color: colors.muted, fontWeight: 600, borderRadius: 6, textDecoration: 'none' },
  menuItemActive: { background: colors.paper2, color: colors.deep },
  menuBadge: { background: colors.amber, color: colors.deep, fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10 },
  sectionTitle: { fontSize: 19, marginBottom: 6, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
  sectionSub: { fontSize: 13.5, color: colors.muted, marginBottom: 22 },
  emptyState: { textAlign: 'center', padding: '50px 20px', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10 },
  leadCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 20, marginBottom: 12 },
  leadTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  leadBuyer: { fontSize: 14.5, fontWeight: 700 },
  leadMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  leadDate: { fontSize: 11.5, color: colors.muted, flexShrink: 0 },
  leadItems: { fontSize: 13, color: colors.ink, background: colors.paper2, borderRadius: 6, padding: '11px 13px', marginTop: 12, marginBottom: 6 },
  leadDetailRow: { fontSize: 12, color: colors.muted, marginTop: 6 },
  leadActions: { display: 'flex', gap: 10, marginTop: 14 },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', border: '1.5px solid transparent', flex: 1 },
  btnPrimarySmall: { background: colors.amber, color: colors.deep },
  btnOutlineSmall: { borderColor: colors.line, color: colors.navy, background: colors.white },
  quoteForm: { marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${colors.line}` },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12.5, color: colors.muted, fontWeight: 600, marginBottom: 6 },
  input: { width: '100%', border: `1px solid ${colors.line}`, borderRadius: 6, padding: '10px 12px', fontSize: 14, color: colors.ink, background: colors.paper2 },
  textarea: { width: '100%', border: `1px solid ${colors.line}`, borderRadius: 6, padding: '10px 12px', fontSize: 14, color: colors.ink, background: colors.paper2, minHeight: 70, resize: 'vertical', fontFamily: "'Noto Sans KR', sans-serif" },
  radioGroup: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  radioChip: { border: `1px solid ${colors.line}`, borderRadius: 20, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: colors.ink, cursor: 'pointer', background: colors.white },
  radioChipSel: { background: colors.deep, color: colors.white, borderColor: colors.deep },
  errorBox: { background: '#FDECEC', color: '#B3261E', borderRadius: 7, padding: '10px 12px', fontSize: 12.5, marginTop: 4 },
  btnPrimary: { background: colors.amber, color: colors.deep, border: 'none', borderRadius: 6, padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', marginTop: 20 },
  historyTable: { width: '100%', borderCollapse: 'collapse', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, overflow: 'hidden' },
  th: { background: colors.paper2, fontSize: 12.5, color: colors.muted, fontWeight: 700, padding: '12px 16px', textAlign: 'left' },
  td: { padding: '14px 16px', fontSize: 13.5, borderTop: `1px solid ${colors.paper2}` },
  htag: { fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 12 },
  repeatLink: { fontSize: 12.5, fontWeight: 700, color: colors.navy, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  statsGrid: { display: 'grid', gap: 14, marginBottom: 22 },
  statCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: '18px 20px' },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: 600, marginBottom: 8 },
  statValue: { fontSize: 19, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
}
