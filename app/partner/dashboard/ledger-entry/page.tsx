'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { colors, styles, formatDate } from '../../_shared'
import { usePartnerLayout } from '../../PartnerLayoutContext'
import AiQuickEntryModal from '../../../../components/AiQuickEntryModal'
import DealPicker from '../../../../components/DealPicker'

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
  const [ledgerItemName, setLedgerItemName] = useState('')
  const [ledgerQty, setLedgerQty] = useState('')
  const [ledgerUnit, setLedgerUnit] = useState('개')
  const [ledgerPrice, setLedgerPrice] = useState('')
  const [ledgerIsCredit, setLedgerIsCredit] = useState(false)
  const [ledgerAdding, setLedgerAdding] = useState(false)
  const [ledgerError, setLedgerError] = useState('')

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
  }, [ledgerDealId])

  function handleAiConfirmed(dealId: string) {
    setShowAiModal(false)
    setLedgerDealId(dealId)
    loadLineItemsFor(dealId)
    loadAiUsageCount()
  }

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
              <input type="checkbox" checked={ledgerIsCredit} onChange={(e) => setLedgerIsCredit(e.target.checked)} />
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
