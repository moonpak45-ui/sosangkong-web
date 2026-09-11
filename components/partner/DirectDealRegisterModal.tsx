'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { createWalkInDeal } from '../../lib/createWalkInDeal'
import { colors, styles } from '../../app/partner/_shared'
import Input from '../ui/Input'
import Select from '../ui/Select'
import LineItemGrid, { GridRow, emptyGridRow } from '../LineItemGrid'

type ExistingCounterpart = { id: string; business_name: string; region: string | null }
type Category = { id: string; name: string }

type Step = 'pick-existing' | 'pick-new' | 'items'

type Props = {
  partnerId: string
  onClose: () => void
  onCompleted: () => void
}

// "거래처 직접 등록" — 소상공닷컴이 매칭하지 않은, 공급업체가 원래 갖고
// 있던 거래처의 새 주문을 등록하는 화면. 스키마 변경 없이 기존 테이블/
// 트리거/RLS 그대로 재사용한다:
// - 기존 거래처 목록은 deals를 partner_id로 조회해 buyer_profiles를 함께
//   가져온 뒤 중복 제거 — buyer_profiles_select_partner_deal_target RLS
//   (20260915010000)가 이미 "이 partner와 deals로 연결된 buyer_profiles만
//   보이게" 필터링해주므로 별도 정책 불필요.
// - 기존 거래처를 고르면 그 buyer_id 그대로 deals를 새로 insert(반복 주문
//   = 새 거래 건).
// - 목록에 없는 새 거래처는 DealPicker.tsx의 "새 거래처로 시작하기"와
//   동일하게 createWalkInDeal()을 그대로 호출(수정 없이 재사용).
// - 품목 입력은 ledger-entry와 동일하게 LineItemGrid + deal_line_items
//   insert(기존 트리거 ledgerbook_on_line_item_insert가 외상잔액/재고를
//   그대로 자동 갱신함).
export default function DirectDealRegisterModal({ partnerId, onClose, onCompleted }: Props) {
  const [step, setStep] = useState<Step>('pick-existing')
  const [loadingInit, setLoadingInit] = useState(true)
  const [counterparts, setCounterparts] = useState<ExistingCounterpart[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [selectedBuyerId, setSelectedBuyerId] = useState('')
  const [existingCategoryId, setExistingCategoryId] = useState('')
  const [existingAmount, setExistingAmount] = useState('')
  const [existingError, setExistingError] = useState('')
  const [creatingExisting, setCreatingExisting] = useState(false)

  const [businessName, setBusinessName] = useState('')
  const [bizRegNo, setBizRegNo] = useState('')
  const [region, setRegion] = useState('')
  const [industry, setIndustry] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newError, setNewError] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)

  const [dealId, setDealId] = useState('')
  const [dealLabel, setDealLabel] = useState('')
  const [gridRows, setGridRows] = useState<GridRow[]>([emptyGridRow()])
  const [gridSaving, setGridSaving] = useState(false)
  const [gridError, setGridError] = useState('')
  const [gridSaved, setGridSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: dealRows }, { data: categoryRows }] = await Promise.all([
        supabase
          .from('deals')
          .select('buyer_id, buyer_profiles ( id, business_name, region )')
          .eq('partner_id', partnerId),
        supabase.from('categories').select('id, name').order('sort_order', { ascending: true }),
      ])

      const seen = new Map<string, ExistingCounterpart>()
      for (const row of (dealRows || []) as unknown as {
        buyer_id: string
        buyer_profiles: ExistingCounterpart | null
      }[]) {
        if (row.buyer_profiles && !seen.has(row.buyer_profiles.id)) {
          seen.set(row.buyer_profiles.id, row.buyer_profiles)
        }
      }
      setCounterparts(Array.from(seen.values()).sort((a, b) => a.business_name.localeCompare(b.business_name)))
      setCategories((categoryRows || []) as Category[])
      setLoadingInit(false)
    }

    load()
  }, [partnerId])

  async function handleCreateForExisting() {
    setExistingError('')
    if (!selectedBuyerId) {
      setExistingError('거래처를 선택해주세요.')
      return
    }
    if (!existingCategoryId) {
      setExistingError('카테고리를 선택해주세요.')
      return
    }
    const amt = Number(existingAmount)
    if (!existingAmount.trim() || Number.isNaN(amt) || amt <= 0) {
      setExistingError('거래 금액을 올바르게 입력해주세요.')
      return
    }

    setCreatingExisting(true)
    const { data, error } = await supabase
      .from('deals')
      .insert({
        buyer_id: selectedBuyerId,
        partner_id: partnerId,
        category_id: existingCategoryId,
        amount: amt,
        status: 'in_progress',
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    setCreatingExisting(false)

    if (error || !data) {
      setExistingError('거래 생성 중 오류가 발생했어요: ' + (error?.message || ''))
      return
    }

    setDealId(data.id)
    setDealLabel(counterparts.find((c) => c.id === selectedBuyerId)?.business_name || '거래처')
    setStep('items')
  }

  async function handleCreateForNew() {
    setNewError('')
    if (!businessName.trim()) {
      setNewError('상호명을 입력해주세요.')
      return
    }
    if (!newCategoryId) {
      setNewError('카테고리를 선택해주세요.')
      return
    }
    const amt = Number(newAmount)
    if (!newAmount.trim() || Number.isNaN(amt) || amt <= 0) {
      setNewError('거래 금액을 올바르게 입력해주세요.')
      return
    }

    setCreatingNew(true)
    const result = await createWalkInDeal({
      partnerId,
      businessName: businessName.trim(),
      bizRegNo: bizRegNo.trim(),
      region: region.trim(),
      industry: industry.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      categoryId: newCategoryId,
      amount: amt,
    })
    setCreatingNew(false)

    if ('error' in result) {
      setNewError(result.error)
      return
    }

    setDealId(result.dealId)
    setDealLabel(businessName.trim())
    setStep('items')
  }

  async function handleGridSave() {
    setGridError('')

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
        deal_id: dealId,
        item_name: r.item_name.trim(),
        quantity: Number(r.quantity),
        unit: r.unit.trim() || '개',
        unit_price: Number(r.unit_price),
        is_credit: r.is_credit,
      }))
    )
    setGridSaving(false)

    if (error) {
      setGridError('전표 등록 중 오류가 발생했어요: ' + error.message)
      return
    }

    setGridSaved(true)
    onCompleted()
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <b style={{ fontSize: 16, color: colors.deep }}>거래처 직접 등록</b>
          <button type="button" style={modalStyles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={modalStyles.body}>
          {loadingInit ? (
            <div style={{ padding: 30, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
          ) : step === 'pick-existing' ? (
            <>
              <div style={styles.field}>
                <label style={styles.label}>기존 거래처</label>
                <Select value={selectedBuyerId} onChange={(e) => setSelectedBuyerId(e.target.value)}>
                  <option value="">
                    {counterparts.length === 0 ? '등록된 거래처가 없어요' : '거래처를 선택하세요'}
                  </option>
                  {counterparts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.business_name}
                      {c.region ? ` · ${c.region}` : ''}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedBuyerId && (
                <div style={modalStyles.newDealBox}>
                  <div style={styles.fieldRow}>
                    <div style={styles.field}>
                      <label style={styles.label}>카테고리 *</label>
                      <Select value={existingCategoryId} onChange={(e) => setExistingCategoryId(e.target.value)}>
                        <option value="">선택하세요</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>거래 금액 (원) *</label>
                      <Input
                        type="number"
                        placeholder="예) 150000"
                        value={existingAmount}
                        onChange={(e) => setExistingAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  {existingError && <div style={styles.errorBox}>{existingError}</div>}
                  <button
                    type="button"
                    style={{ ...styles.btn, ...styles.btnPrimarySmall, width: '100%' }}
                    onClick={handleCreateForExisting}
                    disabled={creatingExisting}
                  >
                    {creatingExisting ? '등록 중...' : '거래 생성하고 품목 입력하기'}
                  </button>
                </div>
              )}

              <div style={modalStyles.divider}>또는</div>
              <button
                type="button"
                style={{ ...styles.btn, ...styles.btnOutlineSmall, width: '100%' }}
                onClick={() => setStep('pick-new')}
              >
                + 새 거래처 추가
              </button>
            </>
          ) : step === 'pick-new' ? (
            <>
              <div style={styles.fieldRow}>
                <div style={styles.field}>
                  <label style={styles.label}>상호명 *</label>
                  <Input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>사업자번호</label>
                  <Input type="text" value={bizRegNo} onChange={(e) => setBizRegNo(e.target.value)} />
                </div>
              </div>
              <div style={styles.fieldRow}>
                <div style={styles.field}>
                  <label style={styles.label}>지역</label>
                  <Input type="text" value={region} onChange={(e) => setRegion(e.target.value)} />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>업종</label>
                  <Input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} />
                </div>
              </div>
              <div style={styles.fieldRow}>
                <div style={styles.field}>
                  <label style={styles.label}>담당자명</label>
                  <Input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>연락처</label>
                  <Input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>주소</label>
                <Input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div style={styles.fieldRow}>
                <div style={styles.field}>
                  <label style={styles.label}>카테고리 *</label>
                  <Select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)}>
                    <option value="">선택하세요</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>거래 금액 (원) *</label>
                  <Input
                    type="number"
                    placeholder="예) 150000"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                </div>
              </div>

              {newError && <div style={styles.errorBox}>{newError}</div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnOutlineSmall, flex: 1 }}
                  onClick={() => setStep('pick-existing')}
                  disabled={creatingNew}
                >
                  뒤로
                </button>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnPrimarySmall, flex: 2 }}
                  onClick={handleCreateForNew}
                  disabled={creatingNew}
                >
                  {creatingNew ? '등록 중...' : '거래처 등록하고 품목 입력하기'}
                </button>
              </div>
            </>
          ) : (
            <>
              {gridSaved ? (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: colors.good, marginBottom: 10 }}>
                    ✓ {dealLabel} 거래가 등록됐어요
                  </div>
                  <button type="button" style={{ ...styles.btn, ...styles.btnPrimarySmall }} onClick={onClose}>
                    닫기
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.deep, marginBottom: 4 }}>
                    {dealLabel} — 품목 입력
                  </div>
                  <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 10 }}>
                    여러 품목을 표에 바로 입력하세요 — Enter로 다음 줄, Ctrl+S(또는 F8)로 저장.
                  </div>
                  <LineItemGrid rows={gridRows} onRowsChange={setGridRows} onSave={handleGridSave} saving={gridSaving} />
                  {gridError && <div style={{ ...styles.errorBox, marginTop: 12 }}>{gridError}</div>}
                </>
              )}
            </>
          )}
        </div>
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
    maxWidth: 640,
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
  newDealBox: { background: colors.paper2, border: `1px solid ${colors.line}`, borderRadius: 8, padding: 16, marginTop: 4 },
  divider: { textAlign: 'center', fontSize: 11.5, color: colors.muted, margin: '16px 0' },
}
