'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { colors, styles, formatDate } from '../../_shared'
import { usePartnerLayout } from '../../PartnerLayoutContext'
import AiQuickEntryModal from '../../../../components/AiQuickEntryModal'
import DealPicker from '../../../../components/DealPicker'
import LineItemGrid, { GridRow, emptyGridRow } from '../../../../components/LineItemGrid'

type DealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  buyer_profiles: { business_name: string } | null
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

export default function PartnerLedgerEntryPage() {
  const { partner } = usePartnerLayout()

  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)

  const [ledgerDealId, setLedgerDealId] = useState('')
  const [ledgerLineItems, setLedgerLineItems] = useState<LineItemRow[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [gridRows, setGridRows] = useState<GridRow[]>([emptyGridRow()])
  const [gridSaving, setGridSaving] = useState(false)
  const [gridError, setGridError] = useState('')

  const [showAiModal, setShowAiModal] = useState(false)
  const [aiUsageCount, setAiUsageCount] = useState(0)

  async function loadDeals() {
    const { data } = await supabase
      .from('deals')
      .select('id, amount, status, confirmed_at, buyer_profiles ( business_name )')
      .eq('partner_id', partner.id)
      .order('confirmed_at', { ascending: false })
    setDeals((data || []) as unknown as DealRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadDeals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner.id])

  useEffect(() => {
    loadAiUsageCount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner.id])

  async function loadAiUsageCount() {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('ai_parse_logs')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', partner.id)
      .gte('created_at', monthStart.toISOString())
    setAiUsageCount(count || 0)
  }

  async function loadLineItemsFor(dealId: string) {
    if (!dealId) {
      setLedgerLineItems([])
      return
    }
    setLedgerLoading(true)
    const { data } = await supabase
      .from('deal_line_items')
      .select('id, item_name, quantity, unit, unit_price, amount, is_credit, created_at')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
    setLedgerLineItems((data || []) as LineItemRow[])
    setLedgerLoading(false)
  }

  useEffect(() => {
    loadLineItemsFor(ledgerDealId)
    setGridRows([emptyGridRow()])
    setGridError('')
  }, [ledgerDealId])

  function handleAiConfirmed(dealId: string) {
    setShowAiModal(false)
    setLedgerDealId(dealId)
    loadLineItemsFor(dealId)
    loadAiUsageCount()
  }

  async function handleGridSave() {
    setGridError('')

    if (!ledgerDealId) {
      setGridError('거래를 선택해주세요.')
      return
    }

    // 품목명이 채워진 행만 실제 등록 대상 - 그리드 맨 끝의 "항상 비어있는
    // 다음 줄"(LineItemGrid의 자동 추가 행)은 자연히 여기서 걸러짐.
    const filled = gridRows.filter((r) => r.item_name.trim())
    if (filled.length === 0) {
      setGridError('등록할 품목을 입력해주세요.')
      return
    }

    for (const r of filled) {
      const qty = Number(r.quantity)
      if (!r.quantity.trim() || Number.isNaN(qty) || qty <= 0) {
        setGridError(`"${r.item_name}"의 수량을 올바르게 입력해주세요.`)
        return
      }
      const price = Number(r.unit_price)
      if (!r.unit_price.trim() || Number.isNaN(price) || price < 0) {
        setGridError(`"${r.item_name}"의 단가를 올바르게 입력해주세요.`)
        return
      }
    }

    setGridSaving(true)
    const { error } = await supabase.from('deal_line_items').insert(
      filled.map((r) => ({
        deal_id: ledgerDealId,
        item_name: r.item_name.trim(),
        quantity: Number(r.quantity),
        unit: r.unit.trim() || '개',
        unit_price: Number(r.unit_price),
        is_credit: r.is_credit,
      }))
    )
    setGridSaving(false)

    if (error) {
      setGridError('전표 등록 중 오류가 발생했습니다: ' + error.message)
      return
    }

    setGridRows([emptyGridRow()])
    loadLineItemsFor(ledgerDealId)
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={styles.sectionTitle}>거래전표 등록</div>
          <div style={styles.sectionSub}>
            진행 중인 거래를 선택하고 품목별로 전표를 등록하세요. 외상 거래는 외상잔액에, 등록한 수량은
            재고에 자동 반영됩니다(재고는 미리 등록해둔 품목만 차감돼요).
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnPrimarySmall }}
            onClick={() => setShowAiModal(true)}
          >
            ✨ AI로 빠르게 입력
          </button>
          <div style={{ fontSize: 11.5, color: colors.muted, marginTop: 6 }}>이번 달 AI 입력 {aiUsageCount}건 사용</div>
        </div>
      </div>

      {showAiModal && (
        <AiQuickEntryModal
          partnerId={partner.id}
          deals={deals}
          onClose={() => setShowAiModal(false)}
          onConfirmed={handleAiConfirmed}
          onDealCreated={loadDeals}
        />
      )}

      <div style={styles.card}>
        <DealPicker partnerId={partner.id} deals={deals} value={ledgerDealId} onChange={setLedgerDealId} onDealCreated={loadDeals} />

        {ledgerDealId && (
          <>
            <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 10 }}>
              여러 품목을 표에 바로 입력하세요 — Enter로 다음 줄, Insert 키나 버튼으로 줄 추가, Ctrl+S(또는 F8)로 저장.
            </div>
            <LineItemGrid rows={gridRows} onRowsChange={setGridRows} onSave={handleGridSave} saving={gridSaving} />

            {gridError && <div style={{ ...styles.errorBox, marginTop: 12 }}>{gridError}</div>}
          </>
        )}
      </div>

      {ledgerDealId && (
        <div style={{ overflowX: 'auto' }}>
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
    </div>
  )
}
