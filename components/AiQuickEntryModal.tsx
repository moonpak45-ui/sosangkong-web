'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { colors, styles } from '../app/partner/_shared'
import DealPicker, { DealOption } from './DealPicker'
import LineItemGrid from './LineItemGrid'
import DeliveryEstimateBanner from './DeliveryEstimateBanner'
import { computeExpectedDelivery, fetchOrderGroupForBuyer, OrderGroup, toDateOnlyString } from '../lib/orderGroups'

type ParsedItem = {
  raw_phrase: string
  item_name: string
  quantity: number
  unit: string
  unit_price: number | null
  is_credit_guess: boolean
  matched_existing_item: boolean
}

type EditableRow = {
  raw_phrase: string
  item_name: string
  quantity: string
  unit: string
  unit_price: string
  is_credit: boolean
  matched_existing_item: boolean
}

type Props = {
  partnerId: string
  deals: DealOption[]
  onClose: () => void
  onConfirmed: (dealId: string) => void
  onDealCreated?: () => void
}

function toEditableRow(p: ParsedItem): EditableRow {
  return {
    raw_phrase: p.raw_phrase,
    item_name: p.item_name,
    quantity: String(p.quantity),
    unit: p.unit,
    unit_price: p.unit_price === null ? '' : String(p.unit_price),
    is_credit: p.is_credit_guess,
    matched_existing_item: p.matched_existing_item,
  }
}

function emptyReviewRow(): EditableRow {
  return { raw_phrase: '', item_name: '', quantity: '', unit: '개', unit_price: '', is_credit: false, matched_existing_item: true }
}

// "AI 거래전표 빠른입력" 모달. 카톡 대화 텍스트를 붙여넣으면 AI가 초안을
// 만들고(Step 2), 사람이 반드시 확인·수정한 뒤(Step 3, 생략 불가) 저장해야만
// (Step 4) 실제 deal_line_items에 반영됨 - 완전자동이 아니라 "AI 초안 +
// 사람 확인"이 핵심.
//
// 저장 시 기존 "거래전표 등록"(app/partner/dashboard/ledger-entry/page.tsx
// handleGridSave)과 완전히 동일한 테이블(deal_line_items)에 완전히 동일한
// 컬럼으로 insert만 함 - 재고차감/외상잔액 자동갱신 트리거는 이 모달
// 코드가 전혀 모르는 채로 그대로 동작함(건드리지 않음).
//
// "거래 선택"은 공용 컴포넌트 DealPicker(../DealPicker.tsx)를 씀 - 기존
// "진행 중인 거래" 드롭다운에 "+ 새 거래처로 시작하기"를 추가해, 아직
// 계정이 없는 거래처의 첫 발주도 여기서 바로 만들 수 있음(lib/
// createWalkInDeal.ts 참고 - HANDOFF에 상세 기록).
//
// Step 3(확인·수정)의 표는 수동 입력 화면과 같은 LineItemGrid
// (../LineItemGrid.tsx)를 그대로 씀 - AI 초안 rows를 그리드에 그대로
// 채워 넣고, matched_existing_item=false인 행만 rowStyle/renderRowBadge로
// 노란 배경 + "확인 필요" 표시를 얹는 방식으로 연동함(그리드 자체는 이
// 필드를 모름 - EditableRow가 GridRow를 구조적으로 확장하고 있어서
// LineItemGrid<EditableRow>로 그대로 재사용 가능).
export default function AiQuickEntryModal({ partnerId, deals, onClose, onConfirmed, onDealCreated }: Props) {
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [dealId, setDealId] = useState('')
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  const [rows, setRows] = useState<EditableRow[]>([])
  const [originalParsed, setOriginalParsed] = useState<ParsedItem[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [orderGroup, setOrderGroup] = useState<OrderGroup | null>(null)

  useEffect(() => {
    const buyerId = deals.find((d) => d.id === dealId)?.buyer_id
    if (!dealId || !buyerId) {
      setOrderGroup(null)
      return
    }
    fetchOrderGroupForBuyer(partnerId, buyerId).then(setOrderGroup)
  }, [dealId, deals, partnerId])

  async function handleAnalyze() {
    setParseError('')

    if (!dealId) {
      setParseError('거래를 선택해주세요.')
      return
    }
    if (!rawText.trim()) {
      setParseError('분석할 대화 내용을 붙여넣어주세요.')
      return
    }

    setParsing(true)

    const [{ data: stockRows }, { data: aliasRows }, { data: sessionData }] = await Promise.all([
      supabase.from('stock_levels').select('item_name').eq('partner_id', partnerId),
      supabase.from('item_aliases').select('alias_text, matched_item_name').eq('partner_id', partnerId),
      supabase.auth.getSession(),
    ])

    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      setParsing(false)
      setParseError('로그인이 만료됐어요. 새로고침 후 다시 시도해주세요.')
      return
    }

    try {
      const res = await fetch('/api/ai-parse-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          rawText: rawText.trim(),
          stockItemNames: (stockRows || []).map((r) => r.item_name),
          aliases: aliasRows || [],
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setParseError(json.error || 'AI 분석 중 오류가 발생했어요.')
        setParsing(false)
        return
      }

      const items = (json.items || []) as ParsedItem[]
      if (items.length === 0) {
        setParseError('대화에서 품목을 찾지 못했어요. 텍스트를 확인하고 다시 시도해주세요.')
        setParsing(false)
        return
      }

      setOriginalParsed(items)
      // 맨 끝에 빈 행을 하나 더 붙여둠 - LineItemGrid의 "마지막 행에 값이
      // 있으면 자동으로 빈 행 추가" 로직은 사용자가 직접 편집할 때만
      // 발동하고(그리드 내부 updateRow 경유), 부모가 rows를 통째로 설정하는
      // 이 최초 진입 시점엔 안 걸리기 때문에 여기서 미리 넣어둠.
      setRows([...items.map(toEditableRow), emptyReviewRow()])
      setStep('review')
    } catch {
      setParseError('AI 분석 요청 중 네트워크 오류가 발생했어요.')
    }

    setParsing(false)
  }

  function wasEdited(filled: EditableRow[]): boolean {
    if (filled.length !== originalParsed.length) return true
    return filled.some((r, i) => {
      const o = originalParsed[i]
      return (
        r.item_name.trim() !== o.item_name ||
        Number(r.quantity) !== o.quantity ||
        r.unit.trim() !== o.unit ||
        (r.unit_price === '' ? null : Number(r.unit_price)) !== o.unit_price ||
        r.is_credit !== o.is_credit_guess
      )
    })
  }

  async function handleConfirm() {
    setSubmitError('')

    // LineItemGrid가 편집 편의를 위해 맨 끝에 항상 비워둔 행은 실제 등록
    // 대상이 아님 - 품목명이 채워진 행만 필터(수동 입력 화면
    // handleGridSave와 동일한 규칙).
    const filled = rows.filter((r) => r.item_name.trim())

    if (filled.length === 0) {
      setSubmitError('등록할 품목이 없어요.')
      return
    }

    for (const r of filled) {
      const qty = Number(r.quantity)
      if (!r.quantity.trim() || Number.isNaN(qty) || qty <= 0) {
        setSubmitError(`"${r.item_name}"의 수량을 올바르게 입력해주세요.`)
        return
      }
      const price = Number(r.unit_price)
      if (!r.unit_price.trim() || Number.isNaN(price) || price < 0) {
        setSubmitError(`"${r.item_name}"의 단가를 입력해주세요(AI가 원문에서 단가를 찾지 못한 품목이에요).`)
        return
      }
    }

    setSubmitting(true)

    const editedFlag = wasEdited(filled)

    // 저장 시점 기준으로 다시 계산(그리드 확인·수정하는 동안 마감시간을
    // 넘길 수도 있으므로) - ledger-entry의 handleGridSave와 동일한 방식.
    const estimate = orderGroup ? computeExpectedDelivery(orderGroup) : null
    const expectedDeliveryDate = estimate ? toDateOnlyString(estimate.date) : null

    const { error: insertError } = await supabase.from('deal_line_items').insert(
      filled.map((r) => ({
        deal_id: dealId,
        item_name: r.item_name.trim(),
        quantity: Number(r.quantity),
        unit: r.unit.trim() || '개',
        unit_price: Number(r.unit_price),
        is_credit: r.is_credit,
        expected_delivery_date: expectedDeliveryDate,
      }))
    )

    if (insertError) {
      setSubmitting(false)
      setSubmitError('전표 등록 중 오류가 발생했어요: ' + insertError.message)
      return
    }

    // 사람이 수정한 품목명이 원문 표현과 다르면 다음번엔 AI가 바로 인식하도록
    // item_aliases에 학습(있으면 use_count 증가, 없으면 신규 생성).
    for (const r of filled) {
      const alias = r.raw_phrase.trim()
      const finalName = r.item_name.trim()
      if (!alias || alias === finalName) continue

      const { data: existing } = await supabase
        .from('item_aliases')
        .select('id, use_count')
        .eq('partner_id', partnerId)
        .eq('alias_text', alias)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('item_aliases')
          .update({ matched_item_name: finalName, use_count: existing.use_count + 1, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('item_aliases').insert({ partner_id: partnerId, alias_text: alias, matched_item_name: finalName })
      }
    }

    await supabase.from('ai_parse_logs').insert({
      partner_id: partnerId,
      raw_text: rawText.trim(),
      parsed_result: originalParsed,
      was_edited: editedFlag,
    })

    setSubmitting(false)
    onConfirmed(dealId)
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <b style={{ fontSize: 16, color: colors.deep }}>AI로 빠르게 입력</b>
          <button type="button" style={modalStyles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {step === 'input' && (
          <div style={modalStyles.body}>
            <DealPicker partnerId={partnerId} deals={deals} value={dealId} onChange={setDealId} onDealCreated={onDealCreated} />

            <div style={styles.field}>
              <label style={styles.label}>대화 내용</label>
              <textarea
                style={{ ...styles.textarea, minHeight: 160 }}
                placeholder="카톡 대화 내용을 그대로 복사해서 붙여넣으세요"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
            </div>

            {parseError && <div style={styles.errorBox}>{parseError}</div>}

            <button
              type="button"
              style={{ ...styles.btn, ...styles.btnPrimarySmall, width: '100%' }}
              onClick={handleAnalyze}
              disabled={parsing}
            >
              {parsing ? 'AI가 분석 중...' : 'AI로 분석하기'}
            </button>
          </div>
        )}

        {step === 'review' && (
          <div style={modalStyles.body}>
            <div style={modalStyles.noticeBox}>AI가 초안을 만들었어요. 확인 후 저장해주세요.</div>
            <DeliveryEstimateBanner group={orderGroup} />

            <LineItemGrid
              rows={rows}
              onRowsChange={setRows}
              onSave={handleConfirm}
              saving={submitting}
              makeEmptyRow={emptyReviewRow}
              rowStyle={(r) => (r.matched_existing_item ? undefined : modalStyles.needsReviewRow)}
              renderRowBadge={(r) => (!r.matched_existing_item ? <div style={modalStyles.needsReviewTag}>확인 필요(신규 품목)</div> : null)}
            />

            {submitError && <div style={{ ...styles.errorBox, marginTop: 14 }}>{submitError}</div>}

            <button
              type="button"
              style={{ ...styles.btn, ...styles.btnOutlineSmall, marginTop: 12, width: '100%' }}
              onClick={() => setStep('input')}
              disabled={submitting}
            >
              다시 입력
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const modalStyles: { [k: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10,30,61,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 20,
  },
  card: {
    background: colors.white,
    borderRadius: 12,
    width: '100%',
    maxWidth: 680,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 24px 60px rgba(5,20,40,0.35)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 22px',
    borderBottom: `1px solid ${colors.line}`,
  },
  closeBtn: { border: 'none', background: 'none', fontSize: 16, color: colors.muted, cursor: 'pointer' },
  body: { padding: 22 },
  noticeBox: {
    background: colors.paper2,
    color: colors.navy,
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 16,
  },
  needsReviewRow: { background: '#FFFBEA' },
  needsReviewTag: { fontSize: 10.5, color: '#B5460B', fontWeight: 700, marginTop: 4 },
}
