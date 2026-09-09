'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { createWalkInDeal } from '../lib/createWalkInDeal'
import { colors, styles } from '../app/partner/_shared'

export type DealOption = {
  id: string
  status: string
  amount: number
  confirmed_at: string
  buyer_id: string
  buyer_profiles: { business_name: string } | null
}

type Category = { id: string; name: string }

const NEW_DEAL_SENTINEL = '__new__'

type Props = {
  partnerId: string
  deals: DealOption[]
  value: string
  onChange: (dealId: string) => void
  onDealCreated?: () => void
}

// "거래전표 등록"(수동 입력 + AI 빠른입력) 양쪽에서 공용으로 쓰는 거래
// 선택 컴포넌트. 기존 "진행 중인 거래" 드롭다운에 "+ 새 거래처로
// 시작하기" 옵션을 추가해서, 아직 이 시스템에 계정이 없는 거래처의 첫
// 발주도 같은 화면에서 등록할 수 있게 함(lib/createWalkInDeal.ts 참고).
export default function DealPicker({ partnerId, deals, value, onChange, onDealCreated }: Props) {
  const [mode, setMode] = useState<'existing' | 'new' | 'created'>('existing')
  const [createdLabel, setCreatedLabel] = useState('')

  const [categories, setCategories] = useState<Category[]>([])
  const [businessName, setBusinessName] = useState('')
  const [bizRegNo, setBizRegNo] = useState('')
  const [region, setRegion] = useState('')
  const [industry, setIndustry] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setCategories(data as Category[])
      })
  }, [])

  const inProgressDeals = deals.filter((d) => d.status === 'in_progress')

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value
    if (v === NEW_DEAL_SENTINEL) {
      setMode('new')
      setCreateError('')
      onChange('')
      return
    }
    onChange(v)
  }

  async function handleCreate() {
    setCreateError('')

    if (!businessName.trim()) {
      setCreateError('상호명을 입력해주세요.')
      return
    }
    if (!categoryId) {
      setCreateError('카테고리를 선택해주세요.')
      return
    }
    const amt = Number(amount)
    if (!amount.trim() || Number.isNaN(amt) || amt <= 0) {
      setCreateError('거래 금액을 올바르게 입력해주세요.')
      return
    }

    setCreating(true)
    const result = await createWalkInDeal({
      partnerId,
      businessName: businessName.trim(),
      bizRegNo: bizRegNo.trim(),
      region: region.trim(),
      industry: industry.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      categoryId,
      amount: amt,
    })
    setCreating(false)

    if ('error' in result) {
      setCreateError(result.error)
      return
    }

    setCreatedLabel(businessName.trim())
    setMode('created')
    onChange(result.dealId)
    onDealCreated?.()
  }

  function handleReset() {
    setMode('existing')
    setCreatedLabel('')
    setBusinessName('')
    setBizRegNo('')
    setRegion('')
    setIndustry('')
    setContactName('')
    setPhone('')
    setAddress('')
    setCategoryId('')
    setAmount('')
    onChange('')
  }

  if (mode === 'created') {
    return (
      <div style={styles.field}>
        <label style={styles.label}>거래 선택</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...styles.input, background: colors.goodBg }}>
          <span style={{ color: colors.good, fontWeight: 700 }}>✓ 새 거래처 &quot;{createdLabel}&quot; 등록됨</span>
          <button type="button" style={{ ...detailStyles.linkBtn, marginLeft: 'auto' }} onClick={handleReset}>
            다른 거래 선택
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'new') {
    return (
      <div style={styles.field}>
        <label style={styles.label}>새 거래처 정보</label>
        <div style={detailStyles.newDealBox}>
          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>상호명 *</label>
              <input type="text" style={styles.input} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>사업자번호</label>
              <input type="text" style={styles.input} value={bizRegNo} onChange={(e) => setBizRegNo(e.target.value)} />
            </div>
          </div>
          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>지역</label>
              <input type="text" style={styles.input} value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>업종</label>
              <input type="text" style={styles.input} value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
          </div>
          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>담당자명</label>
              <input type="text" style={styles.input} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>연락처</label>
              <input type="text" style={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>주소</label>
            <input type="text" style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>카테고리 *</label>
              <select style={styles.input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">선택하세요</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>거래 금액 (원) *</label>
              <input type="number" style={styles.input} placeholder="예) 150000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          {createError && <div style={styles.errorBox}>{createError}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={{ ...styles.btn, ...styles.btnOutlineSmall, flex: 1 }} onClick={handleReset} disabled={creating}>
              취소
            </button>
            <button
              type="button"
              style={{ ...styles.btn, ...styles.btnPrimarySmall, flex: 2 }}
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? '등록 중...' : '거래처 등록하고 계속하기'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.field}>
      <label style={styles.label}>거래 선택</label>
      <select style={styles.input} value={value} onChange={handleSelectChange}>
        <option value="">진행 중인 거래를 선택하세요</option>
        {inProgressDeals.map((d) => (
          <option key={d.id} value={d.id}>
            {d.buyer_profiles?.business_name || '소상공인'} · {Number(d.amount).toLocaleString('ko-KR')}원
          </option>
        ))}
        <option value={NEW_DEAL_SENTINEL}>+ 새 거래처로 시작하기</option>
      </select>
    </div>
  )
}

const detailStyles: { [k: string]: React.CSSProperties } = {
  newDealBox: { background: colors.paper2, border: `1px solid ${colors.line}`, borderRadius: 8, padding: 16 },
  linkBtn: { border: 'none', background: 'none', color: colors.navy, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' },
}
