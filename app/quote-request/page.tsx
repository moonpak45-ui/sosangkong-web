'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

type SelectedPartner = {
  id: string
  name: string
  region: string | null
  categoryName: string | null
  matchScore: number
}

type ItemRow = {
  name: string
  qty: string
  unit: string
}

const PAYMENT_METHODS = ['계좌이체', '현금', '월말 정산']

function todayDateString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function QuoteRequestInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const partnerIds = (searchParams.get('partner_ids') || '').split(',').filter(Boolean)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [buyerProfileId, setBuyerProfileId] = useState<string | null>(null)
  const [buyerStatus, setBuyerStatus] = useState<string | null>(null)

  const [selectedPartners, setSelectedPartners] = useState<SelectedPartner[]>([])
  const [categoryId, setCategoryId] = useState<string | null>(null)

  const [items, setItems] = useState<ItemRow[]>([{ name: '', qty: '', unit: '' }])
  const [desiredDate, setDesiredDate] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [requestNote, setRequestNote] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    async function load() {
      if (partnerIds.length === 0) {
        setLoadError('견적을 요청할 업체가 선택되지 않았습니다. 검색결과에서 업체를 선택해주세요.')
        setLoading(false)
        return
      }

      const { data: { session: authSession } } = await supabase.auth.getSession()

      if (authSession) {
        setSession({ userId: authSession.user.id })
        const { data: buyerProfile } = await supabase
          .from('buyer_profiles')
          .select('id, address, users ( status )')
          .eq('user_id', authSession.user.id)
          .maybeSingle()

        if (buyerProfile) {
          setBuyerProfileId(buyerProfile.id)
          if (buyerProfile.address) setDeliveryAddress(buyerProfile.address)
          const userStatus = (buyerProfile.users as unknown as { status: string | null } | null)?.status ?? null
          setBuyerStatus(userStatus)
        }
      } else {
        setSession(null)
      }

      const [{ data: partnerRows }, { data: partnerCatRows }] = await Promise.all([
        supabase
          .from('partners')
          .select('id, name, region, verified_badge, rating_avg')
          .in('id', partnerIds),
        supabase
          .from('partner_categories')
          .select('partner_id, category_id, categories(name)')
          .in('partner_id', partnerIds),
      ])

      if (!partnerRows || partnerRows.length === 0) {
        setLoadError('선택한 업체 정보를 불러오지 못했습니다.')
        setLoading(false)
        return
      }

      const categoryByPartner = new Map<string, { id: string; name: string | null }>()
      ;(partnerCatRows || []).forEach((row) => {
        if (!categoryByPartner.has(row.partner_id)) {
          const cat = row.categories as unknown as { name: string } | null
          categoryByPartner.set(row.partner_id, { id: row.category_id, name: cat?.name ?? null })
        }
      })

      const partnersById = new Map(partnerRows.map((p) => [p.id, p]))
      const ordered: SelectedPartner[] = partnerIds
        .map((id) => partnersById.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => {
          const cat = categoryByPartner.get(p.id)
          const base = 70 + Number(p.rating_avg || 0) * 5 + (p.verified_badge ? 4 : 0)
          return {
            id: p.id,
            name: p.name,
            region: p.region,
            categoryName: cat?.name ?? null,
            matchScore: Math.min(99, Math.round(base)),
          }
        })

      setSelectedPartners(ordered)

      const firstCategory = partnerIds.map((id) => categoryByPartner.get(id)).find(Boolean)
      setCategoryId(firstCategory?.id ?? null)

      setLoading(false)
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function removePartner(id: string) {
    setSelectedPartners((prev) => prev.filter((p) => p.id !== id))
  }

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  function addItemRow() {
    setItems((prev) => [...prev, { name: '', qty: '', unit: '' }])
  }

  function removeItemRow(index: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  async function submitRequest() {
    setSubmitError('')

    if (selectedPartners.length === 0) {
      setSubmitError('견적을 요청할 업체를 1곳 이상 선택해주세요.')
      return
    }
    const validItems = items.filter((it) => it.name.trim())
    if (validItems.length === 0) {
      setSubmitError('요청 품목을 1개 이상 입력해주세요.')
      return
    }
    if (!session) {
      setSubmitError('로그인 후 이용해주세요.')
      return
    }
    if (!buyerProfileId) {
      setSubmitError('구매자(소상공인) 계정으로 로그인해주세요.')
      return
    }
    if (buyerStatus === 'suspended') {
      setSubmitError('계정이 정지되어 견적요청을 보낼 수 없습니다. 문의사항은 고객센터로 연락해주세요.')
      return
    }
    if (!categoryId) {
      setSubmitError('선택한 업체의 카테고리 정보를 확인할 수 없습니다.')
      return
    }

    setSubmitting(true)

    const title =
      validItems.length > 1 ? `${validItems[0].name} 외 ${validItems.length - 1}건` : validItems[0].name

    const { data: qr, error: qrError } = await supabase
      .from('quote_requests')
      .insert({
        buyer_id: buyerProfileId,
        category_id: categoryId,
        title,
        attributes: {
          items: validItems,
          desired_delivery_date: desiredDate,
          delivery_address: deliveryAddress,
          payment_method: paymentMethod,
          request_note: requestNote,
        },
      })
      .select('id')
      .single()

    if (qrError || !qr) {
      setSubmitting(false)
      setSubmitError('견적 요청서 저장 중 오류가 발생했습니다: ' + (qrError?.message || ''))
      return
    }

    const targets = selectedPartners.map((p) => ({
      quote_request_id: qr.id,
      partner_id: p.id,
      status: 'waiting',
    }))
    const { error: targetError } = await supabase.from('quote_request_targets').insert(targets)

    setSubmitting(false)

    if (targetError) {
      setSubmitError('업체에 요청을 전송하는 중 오류가 발생했습니다: ' + targetError.message)
      return
    }

    setSubmitted(true)
    window.scrollTo(0, 0)
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (loadError) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>{loadError}</p>
        <a href="/search" style={{ ...styles.btnPrimary, marginTop: 20, display: 'inline-flex' }}>
          업체 검색하러 가기
        </a>
      </div>
    )
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 견적 요청서를 작성할 수 있어요.</p>
        <a href="/login" style={{ ...styles.btnPrimary, marginTop: 20, display: 'inline-flex' }}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={styles.confirmView}>
        <div style={styles.confirmIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#0B7A6D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={styles.confirmH2}>견적 요청서가 전송됐어요</h2>
        <p style={styles.confirmP}>
          선택하신 {selectedPartners.length}곳에 동일한 요청서가 발송되었습니다. 업체가 회신하면 알림을 보내드리고,
          마이페이지에서 확인하실 수 있습니다.
        </p>
        <Card style={{ padding: '16px 20px', marginTop: 20, textAlign: 'left' }}>
          {selectedPartners.map((p) => (
            <div key={p.id} style={styles.confirmListRow}>
              <span>{p.name}</span>
              <span style={{ color: colors.good, fontWeight: 700, fontSize: 12.5 }}>발송 완료</span>
            </div>
          ))}
        </Card>
        <Button
          variant="primary"
          style={{ marginTop: 22, width: '100%' }}
          onClick={() => router.push('/my-page')}
        >
          마이페이지에서 확인하기
        </Button>
      </div>
    )
  }

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <div style={styles.pageHead}>
          <div style={styles.eyebrow}>견적 요청서 작성</div>
          <h1 style={styles.h1}>
            하나의 요청서로 {selectedPartners.length}곳에 동시에 견적을 요청하세요
          </h1>
          <p style={styles.headP}>
            필요한 품목과 조건을 한 번만 입력하면, 선택한 업체 모두에게 같은 내용으로 전송됩니다.
          </p>
        </div>

        <div
          className="responsive-two-col"
          style={{ ...styles.layout, ['--rtc-cols' as string]: '1fr 300px', ['--rtc-gap' as string]: '32px' } as React.CSSProperties}
        >
          <div>
            {/* 선택된 업체 */}
            <Card style={{ padding: 26, marginBottom: 16 }}>
              <h3 style={styles.cardH3}>견적을 요청할 업체 ({selectedPartners.length}곳)</h3>
              {selectedPartners.map((p) => (
                <div key={p.id} style={styles.selItem}>
                  <div style={styles.selIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
                    </svg>
                  </div>
                  <div>
                    <div style={styles.selName}>{p.name}</div>
                    <div style={styles.selMeta}>
                      {[p.region, p.categoryName].filter(Boolean).join(' · ') || '정보 없음'}
                    </div>
                  </div>
                  <span style={styles.selMatch}>{p.matchScore}% 일치</span>
                  <button style={styles.selRemove} onClick={() => removePartner(p.id)} type="button">
                    ✕
                  </button>
                </div>
              ))}
              {selectedPartners.length === 0 && (
                <p style={{ fontSize: 13, color: colors.muted, padding: '10px 0' }}>
                  선택된 업체가 없습니다. 검색결과에서 다시 업체를 선택해주세요.
                </p>
              )}
              <a href="/search" style={styles.selAdd}>
                + 검색결과에서 업체 더 추가하기
              </a>
            </Card>

            {/* 품목 */}
            <div style={styles.card}>
              <h3 style={styles.cardH3}>요청 품목</h3>
              <div style={styles.cardSub}>
                필요한 품목과 수량을 입력하세요. 업체별 재고에 따라 견적 금액이 달라질 수 있습니다.
              </div>
              {items.map((item, i) => (
                <div key={i} className="quote-item-row" style={styles.itemRow}>
                  <input
                    type="text"
                    placeholder="품목명 (예: 냉동 흰살생선)"
                    value={item.name}
                    onChange={(e) => updateItem(i, 'name', e.target.value)}
                    className="quote-item-name"
                    style={styles.itemInput}
                  />
                  <input
                    type="text"
                    placeholder="수량"
                    value={item.qty}
                    onChange={(e) => updateItem(i, 'qty', e.target.value)}
                    className="quote-item-qty"
                    style={styles.itemInput}
                  />
                  <input
                    type="text"
                    placeholder="단위"
                    value={item.unit}
                    onChange={(e) => updateItem(i, 'unit', e.target.value)}
                    className="quote-item-unit"
                    style={styles.itemInput}
                  />
                  <button
                    type="button"
                    className="quote-item-del"
                    style={styles.itemDel}
                    onClick={() => removeItemRow(i)}
                    disabled={items.length === 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <span style={styles.itemAdd} onClick={addItemRow}>
                + 품목 추가
              </span>
            </div>

            {/* 배송/조건 */}
            <div style={styles.card}>
              <h3 style={styles.cardH3}>배송 · 결제 조건</h3>
              <div style={styles.fieldRow}>
                <div style={styles.field}>
                  <label style={styles.label}>희망 배송일</label>
                  <input
                    type="date"
                    style={styles.input}
                    min={todayDateString()}
                    value={desiredDate}
                    onChange={(e) => setDesiredDate(e.target.value)}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>배송지</label>
                  <input
                    type="text"
                    style={styles.input}
                    placeholder="사업장 주소"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                  />
                </div>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>희망 결제 방식</label>
                <div style={styles.radioGroup}>
                  {PAYMENT_METHODS.map((m) => (
                    <div
                      key={m}
                      style={{ ...styles.radioChip, ...(paymentMethod === m ? styles.radioChipSel : {}) }}
                      onClick={() => setPaymentMethod(m)}
                    >
                      {m}
                    </div>
                  ))}
                </div>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>요청사항 (선택)</label>
                <textarea
                  style={styles.textarea}
                  placeholder="예: 냉동 상태 확인 부탁드립니다. 오전 11시 이전 도착 희망합니다."
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Sidebar summary */}
          <div>
            <Card style={{ padding: 26, marginBottom: 16 }}>
              <h4 style={styles.cardH4}>요청 요약</h4>
              <div style={styles.sideRow}>
                <span>발송 대상</span>
                <span>{selectedPartners.length}개 업체</span>
              </div>
              <div style={styles.sideRow}>
                <span>요청 품목</span>
                <span>{items.filter((it) => it.name.trim()).length}건</span>
              </div>
              <div style={styles.sideRow}>
                <span>희망 배송일</span>
                <span>{desiredDate || '미입력'}</span>
              </div>
              <div style={styles.sideRow}>
                <span>결제 방식</span>
                <span>{paymentMethod}</span>
              </div>

              {submitError && <div style={styles.errorBox}>{submitError}</div>}

              <Button
                variant="primary"
                style={{ width: '100%', marginTop: 6 }}
                onClick={submitRequest}
                disabled={submitting}
                type="button"
              >
                {submitting ? '전송 중...' : `${selectedPartners.length}곳에 동시 견적 요청하기`}
              </Button>
              <div style={styles.submitNote}>평균 3시간 내 회신 · 회신 도착 시 알림을 보내드려요</div>
              <div style={styles.sideNote}>
                요청서는 선택한 업체 모두에게 동시에 전송되며, 회신이 도착하는 대로 마이페이지에서 확인하실 수
                있습니다.
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function QuoteRequestPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60 }}>불러오는 중...</div>}>
      <QuoteRequestInner />
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
  wrap: { maxWidth: 1080, margin: '0 auto', padding: '0 32px' },
  pageHead: { padding: '30px 0 6px' },
  eyebrow: { fontSize: 13, color: colors.navy, fontWeight: 700, marginBottom: 8 },
  h1: { fontSize: 23, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  headP: { marginTop: 8, color: colors.muted, fontSize: 14 },
  layout: { paddingBottom: 90, alignItems: 'start' },
  card: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 26, marginBottom: 16 },
  cardH3: { fontSize: 16, marginBottom: 4, fontFamily: "'Noto Serif KR', serif", color: colors.deep },
  cardH4: { fontSize: 14, marginBottom: 14, fontFamily: "'Noto Serif KR', serif", color: colors.deep },
  cardSub: { fontSize: 12.8, color: colors.muted, marginBottom: 18 },
  selItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${colors.paper2}` },
  selIcon: { width: 38, height: 38, borderRadius: 8, background: colors.paper2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  selName: { fontSize: 13.8, fontWeight: 700 },
  selMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  selMatch: { marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: colors.good, whiteSpace: 'nowrap' },
  selRemove: { width: 22, height: 22, borderRadius: '50%', border: `1px solid ${colors.line}`, background: colors.white, color: colors.muted, fontSize: 13, lineHeight: 1, cursor: 'pointer', flexShrink: 0 },
  selAdd: { display: 'block', textAlign: 'center', fontSize: 13, fontWeight: 700, color: colors.navy, padding: '12px 0 2px', borderTop: `1px dashed ${colors.line}`, marginTop: 6, cursor: 'pointer', textDecoration: 'none' },
  itemRow: { marginBottom: 10, alignItems: 'center' },
  itemInput: { border: `1px solid ${colors.line}`, borderRadius: 6, padding: '10px 11px', fontSize: 13.5, background: colors.paper2, width: '100%', minWidth: 0 },
  itemDel: { width: 32, height: 32, borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.white, color: colors.muted, cursor: 'pointer', fontSize: 14 },
  itemAdd: { fontSize: 13, fontWeight: 700, color: colors.navy, cursor: 'pointer', padding: '2px 0', display: 'inline-block' },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12.8, color: colors.muted, fontWeight: 600, marginBottom: 7 },
  input: { width: '100%', border: `1px solid ${colors.line}`, borderRadius: 6, padding: '11px 12px', fontSize: 14, color: colors.ink, background: colors.paper2 },
  textarea: { width: '100%', border: `1px solid ${colors.line}`, borderRadius: 6, padding: '11px 12px', fontSize: 14, color: colors.ink, background: colors.paper2, minHeight: 84, resize: 'vertical', fontFamily: "'Noto Sans KR', sans-serif" },
  radioGroup: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  radioChip: { border: `1px solid ${colors.line}`, borderRadius: 20, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.ink, cursor: 'pointer', background: colors.white },
  radioChipSel: { background: colors.deep, color: colors.white, borderColor: colors.deep },
  sideRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: `1px solid ${colors.paper2}` },
  submitNote: { fontSize: 11.5, color: colors.muted, textAlign: 'center', marginTop: 10 },
  sideNote: { background: colors.paper2, borderRadius: 6, padding: '12px 14px', fontSize: 12, color: colors.muted, marginTop: 12, lineHeight: 1.6 },
  errorBox: { background: '#FDECEC', color: '#B3261E', borderRadius: 7, padding: '10px 12px', fontSize: 12.5, marginTop: 14 },
  btnPrimary: { background: colors.amber, color: colors.deep, border: 'none', borderRadius: 6, padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', alignItems: 'center', justifyContent: 'center', textAlign: 'center', textDecoration: 'none' },
  confirmView: { maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' },
  confirmIcon: { width: 60, height: 60, borderRadius: '50%', background: colors.goodBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' },
  confirmH2: { fontSize: 21, fontFamily: "'Noto Serif KR', serif", color: colors.deep, margin: 0 },
  confirmP: { color: colors.muted, fontSize: 14, marginTop: 10 },
  confirmListRow: { fontSize: 13.5, padding: '8px 0', borderBottom: `1px solid ${colors.paper2}`, display: 'flex', justifyContent: 'space-between' },
}
