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

const PAYMENT_METHODS = ['계좌이체', '현금', '월말 정산']

function itemsText(attrs: RequestAttributes | null): string {
  const items = attrs?.items
  if (!items || items.length === 0) return '품목 정보 없음'
  return items.map((it) => [it.name, it.qty, it.unit].filter(Boolean).join(' ')).join(' · ')
}

export default function PartnerDashboardPage() {
  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [partner, setPartner] = useState<Partner | null | undefined>(undefined)
  const [targets, setTargets] = useState<ReceivedRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [openId, setOpenId] = useState<string | null>(null)
  const [forms, setForms] = useState<
    Record<string, { price: string; eta: string; paymentTerms: string; note: string }>
  >({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<Record<string, string>>({})

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

      const { data: targetRows } = await supabase
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
        .order('sent_at', { ascending: false })

      setTargets((targetRows || []) as unknown as ReceivedRequest[])
      setLoading(false)
    }

    load()
  }, [])

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

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <div style={styles.pageLayout}>
          <div style={styles.sideMenu}>
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
            <span style={styles.menuItemDisabled}>진행 중인 거래 (준비 중)</span>
            <span style={styles.menuItemDisabled}>거래이력 · 정산 (준비 중)</span>
            <span style={styles.menuItemDisabled}>프로필 · 배송조건 관리 (준비 중)</span>
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
  pageLayout: { display: 'grid', gridTemplateColumns: '230px 1fr', gap: 36, padding: '36px 0 90px' },
  sideMenu: { borderRight: `1px solid ${colors.line}`, paddingRight: 20 },
  bizCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 18, marginBottom: 20 },
  bizName: { fontSize: 15, fontWeight: 700 },
  verifiedBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, background: colors.goodBg, color: colors.good, fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20 },
  bizMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  menuItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px', fontSize: 14, color: colors.muted, fontWeight: 600, borderRadius: 6, textDecoration: 'none' },
  menuItemActive: { background: colors.paper2, color: colors.deep },
  menuItemDisabled: { display: 'block', padding: '10px 8px', fontSize: 14, color: '#AAB6C0', fontWeight: 600, borderRadius: 6 },
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
}
