'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles } from '../_shared'
import { usePartnerLayout } from '../PartnerLayoutContext'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'

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

const PAYMENT_METHODS = ['계좌이체', '현금', '월말 정산']

function itemsText(attrs: RequestAttributes | null): string {
  const items = attrs?.items
  if (!items || items.length === 0) return '품목 정보 없음'
  return items.map((it) => [it.name, it.qty, it.unit].filter(Boolean).join(' ')).join(' · ')
}

export default function PartnerRequestsPage() {
  const { partner, refreshCounts } = usePartnerLayout()

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
        .eq('partner_id', partner.id)
        .eq('status', 'waiting')
        .order('sent_at', { ascending: false })

      setTargets((targetRows || []) as unknown as ReceivedRequest[])
      setLoading(false)
    }

    load()
  }, [partner.id])

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
    if (!target.quote_requests) {
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
    refreshCounts()
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>안녕하세요, {partner.name}님</div>
      <div style={styles.sectionSub}>
        {targets.length > 0
          ? `새로 들어온 견적요청 ${targets.length}건이 있어요. 빠른 응답이 거래 성사율을 높여요.`
          : '아직 새로 들어온 견적요청이 없어요.'}
      </div>

      <div style={{ ...styles.sectionTitle, fontSize: 19, marginTop: 8 }}>받은 견적요청</div>
      <div style={styles.sectionSub}>회신 대기 중인 소상공인의 견적요청입니다.</div>

      {targets.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>대기 중인 견적요청이 없어요</h3>
          <p style={{ fontSize: 13.5, color: colors.muted }}>
            검색결과에 노출되면 소상공인의 견적요청이 이곳에 도착합니다.
          </p>
        </Card>
      ) : (
        targets.map((target) => {
          const qr = target.quote_requests
          const form = forms[target.id]
          return (
            <Card key={target.id} style={{ padding: 20, marginBottom: 12 }}>
              <div style={styleLeadTop}>
                <div>
                  <div style={styleLeadBuyer}>{qr?.buyer_profiles?.business_name || '요청자 정보 없음'} 사장님</div>
                  <div style={styleLeadMeta}>
                    {[qr?.buyer_profiles?.region, qr?.buyer_profiles?.industry, qr?.categories?.name]
                      .filter(Boolean)
                      .join(' · ') || '조건 정보 없음'}
                  </div>
                </div>
                <div style={styleLeadDate}>{qr ? new Date(qr.created_at).toLocaleDateString('ko-KR') : ''}</div>
              </div>

              <div style={styleLeadItems}>
                {itemsText(qr?.attributes ?? null)}
                {qr?.attributes?.desired_delivery_date && ` — 희망 배송일 ${qr.attributes.desired_delivery_date}`}
              </div>

              {qr?.attributes?.delivery_address && (
                <div style={styleLeadDetailRow}>배송지: {qr.attributes.delivery_address}</div>
              )}
              {qr?.attributes?.payment_method && (
                <div style={styleLeadDetailRow}>희망 결제방식: {qr.attributes.payment_method}</div>
              )}
              {qr?.attributes?.request_note && (
                <div style={styleLeadDetailRow}>요청사항: {qr.attributes.request_note}</div>
              )}

              {openId !== target.id ? (
                <div style={styleLeadActions}>
                  <Button variant="primary" size="sm" style={{ flex: 1 }} onClick={() => openForm(target)}>
                    견적 제출하기
                  </Button>
                </div>
              ) : (
                <div style={styleQuoteForm}>
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
                    <div style={styleRadioGroup}>
                      {PAYMENT_METHODS.map((m) => (
                        <div
                          key={m}
                          style={{
                            ...styleRadioChip,
                            ...(form?.paymentTerms === m ? styleRadioChipSel : {}),
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

                  <div style={styleLeadActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      style={{ flex: 1 }}
                      onClick={() => setOpenId(null)}
                      disabled={submittingId === target.id}
                    >
                      취소
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      style={{ flex: 1 }}
                      onClick={() => submitQuote(target)}
                      disabled={submittingId === target.id}
                    >
                      {submittingId === target.id ? '제출 중...' : '견적 제출하기'}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )
        })
      )}
    </div>
  )
}

const styleLeadTop: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }
const styleLeadBuyer: React.CSSProperties = { fontSize: 14.5, fontWeight: 700 }
const styleLeadMeta: React.CSSProperties = { fontSize: 12, color: colors.muted, marginTop: 3 }
const styleLeadDate: React.CSSProperties = { fontSize: 11.5, color: colors.muted, flexShrink: 0 }
const styleLeadItems: React.CSSProperties = { fontSize: 13, color: colors.ink, background: colors.paper2, borderRadius: 6, padding: '11px 13px', marginTop: 12, marginBottom: 6 }
const styleLeadDetailRow: React.CSSProperties = { fontSize: 12, color: colors.muted, marginTop: 6 }
const styleLeadActions: React.CSSProperties = { display: 'flex', gap: 10, marginTop: 14 }
const styleQuoteForm: React.CSSProperties = { marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${colors.line}` }
const styleRadioGroup: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' }
const styleRadioChip: React.CSSProperties = { border: `1px solid ${colors.line}`, borderRadius: 20, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: colors.ink, cursor: 'pointer', background: colors.white }
const styleRadioChipSel: React.CSSProperties = { background: colors.deep, color: colors.white, border: `1px solid ${colors.deep}` }
