'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import Input from '../../../components/ui/Input'
import Textarea from '../../../components/ui/Textarea'

type PartnerFields = {
  name: string
  biz_reg_no: string
  region: string
  description: string
  phone: string
  address: string
}

const EMPTY_FORM: PartnerFields = {
  name: '',
  biz_reg_no: '',
  region: '',
  description: '',
  phone: '',
  address: '',
}

type CategoryRow = { id: string; name: string }

type StockRow = {
  id: string
  item_name: string
  quantity_on_hand: number
  unit: string
}

export default function PartnerProfileEditPage() {
  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [form, setForm] = useState<PartnerFields>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)

  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [originalCategoryIds, setOriginalCategoryIds] = useState<Set<string>>(new Set())
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const [stockList, setStockList] = useState<StockRow[]>([])
  const [stockItemName, setStockItemName] = useState('')
  const [stockQty, setStockQty] = useState('')
  const [stockUnit, setStockUnit] = useState('개')
  const [addingStock, setAddingStock] = useState(false)
  const [stockError, setStockError] = useState('')

  useEffect(() => {
    async function load() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()

      if (!authSession) {
        setSession(null)
        setLoading(false)
        return
      }
      setSession({ userId: authSession.user.id })

      const { data: partner } = await supabase
        .from('partners')
        .select('id, name, biz_reg_no, region, description, phone, address')
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!partner) {
        setPartnerId(null)
        setLoading(false)
        return
      }

      setPartnerId(partner.id)
      setForm({
        name: partner.name || '',
        biz_reg_no: partner.biz_reg_no || '',
        region: partner.region || '',
        description: partner.description || '',
        phone: partner.phone || '',
        address: partner.address || '',
      })

      const [{ data: categoryRows }, { data: partnerCategoryRows }, { data: stockRows }] = await Promise.all([
        supabase.from('categories').select('id, name').order('name', { ascending: true }),
        supabase.from('partner_categories').select('category_id').eq('partner_id', partner.id),
        supabase
          .from('stock_levels')
          .select('id, item_name, quantity_on_hand, unit')
          .eq('partner_id', partner.id)
          .order('item_name', { ascending: true }),
      ])

      setStockList((stockRows || []) as StockRow[])

      setCategories((categoryRows || []) as CategoryRow[])
      const currentIds = new Set((partnerCategoryRows || []).map((r) => r.category_id as string))
      setOriginalCategoryIds(currentIds)
      setSelectedCategoryIds(new Set(currentIds))

      setLoading(false)
    }

    load()
  }, [])

  function update(field: keyof PartnerFields, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  function toggleCategory(id: string) {
    setSaved(false)
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function save() {
    setSaveError('')
    setSaved(false)

    if (!form.name.trim()) {
      setSaveError('업체명을 입력해주세요.')
      return
    }
    if (selectedCategoryIds.size === 0) {
      setSaveError('취급 카테고리를 최소 1개 선택해주세요.')
      return
    }
    if (!partnerId) return

    setSaving(true)

    const { error: partnerError } = await supabase
      .from('partners')
      .update({
        name: form.name.trim(),
        biz_reg_no: form.biz_reg_no.trim() || null,
        region: form.region.trim() || null,
        description: form.description.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      })
      .eq('id', partnerId)

    if (partnerError) {
      setSaving(false)
      setSaveError('업체 정보 저장 중 오류가 발생했습니다: ' + partnerError.message)
      return
    }

    const toAdd = [...selectedCategoryIds].filter((id) => !originalCategoryIds.has(id))
    const toRemove = [...originalCategoryIds].filter((id) => !selectedCategoryIds.has(id))

    if (toAdd.length > 0) {
      const { error: insertError } = await supabase
        .from('partner_categories')
        .insert(toAdd.map((category_id) => ({ partner_id: partnerId, category_id })))

      if (insertError) {
        setSaving(false)
        setSaveError('취급 카테고리 저장 중 오류가 발생했습니다: ' + insertError.message)
        return
      }
    }

    if (toRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('partner_categories')
        .delete()
        .eq('partner_id', partnerId)
        .in('category_id', toRemove)

      if (deleteError) {
        setSaving(false)
        setSaveError('취급 카테고리 저장 중 오류가 발생했습니다: ' + deleteError.message)
        return
      }
    }

    setSaving(false)
    setOriginalCategoryIds(new Set(selectedCategoryIds))
    setSaved(true)
    window.scrollTo(0, 0)
  }

  async function addStock() {
    setStockError('')

    if (!stockItemName.trim()) {
      setStockError('품목명을 입력해주세요.')
      return
    }
    const qty = Number(stockQty)
    if (!stockQty.trim() || Number.isNaN(qty) || qty < 0) {
      setStockError('초기 수량을 올바르게 입력해주세요.')
      return
    }
    if (!partnerId) return

    setAddingStock(true)
    const { data, error } = await supabase
      .from('stock_levels')
      .insert({
        partner_id: partnerId,
        item_name: stockItemName.trim(),
        quantity_on_hand: qty,
        unit: stockUnit.trim() || '개',
      })
      .select('id, item_name, quantity_on_hand, unit')
      .single()
    setAddingStock(false)

    if (error || !data) {
      // 23505 = unique_violation: 이미 같은 품목명으로 등록된 재고 행이 있음
      if (error?.code === '23505') {
        setStockError('이미 등록된 품목이에요. 다른 품목명을 입력해주세요.')
      } else {
        setStockError('재고 등록 중 오류가 발생했습니다: ' + (error?.message || ''))
      }
      return
    }

    setStockList((prev) => [...prev, data as StockRow].sort((a, b) => a.item_name.localeCompare(b.item_name)))
    setStockItemName('')
    setStockQty('')
    setStockUnit('개')
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 프로필을 수정할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  if (!partnerId) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>프로필 · 배송조건 관리는 공급업체 계정 전용입니다.</p>
        <a href="/" style={styles.btnPrimary}>
          홈으로
        </a>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.pageHead}>
        <h1 style={styles.h1}>프로필 · 배송조건 관리</h1>
        <p style={styles.headP}>업체 정보와 취급 카테고리를 최신 상태로 관리하세요.</p>
      </div>

      <div style={styles.card}>
          {saved && <div style={styles.successBox}>저장되었습니다.</div>}
          {saveError && <div style={styles.errorBox}>{saveError}</div>}

          <div style={styles.field}>
            <label style={styles.label}>업체명 *</label>
            <Input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="예) 고푸드"
            />
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>사업자등록번호</label>
              <Input
                value={form.biz_reg_no}
                onChange={(e) => update('biz_reg_no', e.target.value)}
                placeholder="000-00-00000"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>지역</label>
              <Input
                value={form.region}
                onChange={(e) => update('region', e.target.value)}
                placeholder="예) 서울 마포구"
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>연락처</label>
            <Input
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="예) 02-1234-5678"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>주소</label>
            <Input
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="사업장 주소"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>소개 (취급 품목 등)</label>
            <Textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="예) 냉동 수산물 전문, 당일 배송 가능"
            />
          </div>

          <div style={{ ...styles.field, marginTop: 8 }}>
            <label style={styles.label}>취급 카테고리(업종) *</label>
            {categories.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.muted }}>등록된 카테고리가 없어요.</p>
            ) : (
              <div style={styles.chipGroup}>
                {categories.map((c) => {
                  const selected = selectedCategoryIds.has(c.id)
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleCategory(c.id)}
                      style={{ ...styles.chip, ...(selected ? styles.chipSelected : {}) }}
                    >
                      {c.name}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <button
            style={{ ...styles.btnPrimary, width: '100%', marginTop: 6 }}
            onClick={save}
            disabled={saving}
            type="button"
          >
            {saving ? '저장 중...' : '저장하기'}
          </button>
        </div>

        <div style={styles.card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 4 }}>초기 재고 등록</div>
          <p style={{ fontSize: 12.5, color: colors.muted, marginBottom: 16 }}>
            여기서 미리 등록해둔 품목만 거래전표 등록 시 재고가 자동으로 차감돼요.
          </p>

          {stockList.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>품목명</th>
                    <th style={styles.th}>현재 재고</th>
                  </tr>
                </thead>
                <tbody>
                  {stockList.map((s) => (
                    <tr key={s.id}>
                      <td style={styles.td}>{s.item_name}</td>
                      <td style={styles.td}>
                        {Number(s.quantity_on_hand).toLocaleString('ko-KR')}
                        {s.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {stockError && <div style={styles.errorBox}>{stockError}</div>}

          <div style={styles.field}>
            <label style={styles.label}>품목명</label>
            <Input
              value={stockItemName}
              onChange={(e) => setStockItemName(e.target.value)}
              placeholder="예) 냉동 흰살생선"
            />
          </div>
          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>초기 수량</label>
              <Input
                type="number"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                placeholder="예) 100"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>단위</label>
              <Input
                value={stockUnit}
                onChange={(e) => setStockUnit(e.target.value)}
                placeholder="예) 박스"
              />
            </div>
          </div>

          <button
            style={{ ...styles.btnPrimary, width: '100%', marginTop: 6 }}
            onClick={addStock}
            disabled={addingStock}
            type="button"
          >
            {addingStock ? '등록 중...' : '재고 추가'}
          </button>
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
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 640 },
  pageHead: { padding: '0 0 6px' },
  h1: { fontSize: 23, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  headP: { marginTop: 8, color: colors.muted, fontSize: 14 },
  card: {
    background: colors.white,
    border: `1px solid ${colors.line}`,
    borderRadius: 10,
    padding: 26,
    margin: '22px 0 90px',
  },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12.8, color: colors.muted, fontWeight: 600, marginBottom: 7 },
  chipGroup: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: {
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
    cursor: 'pointer',
    background: 'var(--color-surface)',
  },
  chipSelected: {
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: '1px solid var(--color-primary)',
  },
  table: { width: '100%', borderCollapse: 'collapse', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, overflow: 'hidden' },
  th: { background: colors.paper2, fontSize: 12, color: colors.muted, fontWeight: 700, padding: '10px 14px', textAlign: 'left' },
  td: { padding: '12px 14px', fontSize: 13.5, borderTop: `1px solid ${colors.paper2}` },
  successBox: {
    background: colors.goodBg,
    color: colors.good,
    borderRadius: 7,
    padding: '10px 12px',
    fontSize: 12.5,
    marginBottom: 18,
  },
  errorBox: { background: '#FDECEC', color: '#B3261E', borderRadius: 7, padding: '10px 12px', fontSize: 12.5, marginBottom: 18 },
  btnPrimary: {
    background: colors.amber,
    color: colors.deep,
    border: 'none',
    borderRadius: 6,
    padding: '13px 24px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center',
    textDecoration: 'none',
  },
}
