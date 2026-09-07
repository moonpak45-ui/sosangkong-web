'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type PartnerFields = {
  name: string
  biz_reg_no: string
  region: string
  description: string
}

const EMPTY_FORM: PartnerFields = {
  name: '',
  biz_reg_no: '',
  region: '',
  description: '',
}

type CategoryRow = { id: string; name: string }

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
        .select('id, name, biz_reg_no, region, description')
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
      })

      const [{ data: categoryRows }, { data: partnerCategoryRows }] = await Promise.all([
        supabase.from('categories').select('id, name').order('name', { ascending: true }),
        supabase.from('partner_categories').select('category_id').eq('partner_id', partner.id),
      ])

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
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <a href="/partner/dashboard" style={styles.backLink}>
          ← 공급업체 마이페이지로
        </a>

        <div style={styles.pageHead}>
          <div style={styles.eyebrow}>공급업체 마이페이지</div>
          <h1 style={styles.h1}>프로필 · 배송조건 관리</h1>
          <p style={styles.headP}>업체 정보와 취급 카테고리를 최신 상태로 관리하세요.</p>
        </div>

        <div style={styles.card}>
          {saved && <div style={styles.successBox}>저장되었습니다.</div>}
          {saveError && <div style={styles.errorBox}>{saveError}</div>}

          <div style={styles.field}>
            <label style={styles.label}>업체명 *</label>
            <input
              style={styles.input}
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="예) 고푸드"
            />
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>사업자등록번호</label>
              <input
                style={styles.input}
                value={form.biz_reg_no}
                onChange={(e) => update('biz_reg_no', e.target.value)}
                placeholder="000-00-00000"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>지역</label>
              <input
                style={styles.input}
                value={form.region}
                onChange={(e) => update('region', e.target.value)}
                placeholder="예) 서울 마포구"
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>소개 (취급 품목 등)</label>
            <textarea
              style={styles.textarea}
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
  wrap: { maxWidth: 640, margin: '0 auto', padding: '0 32px' },
  backLink: { display: 'inline-block', marginTop: 26, fontSize: 13, color: colors.muted, textDecoration: 'none' },
  pageHead: { padding: '18px 0 6px' },
  eyebrow: { fontSize: 13, color: colors.navy, fontWeight: 700, marginBottom: 8 },
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
  input: {
    width: '100%',
    border: `1px solid ${colors.line}`,
    borderRadius: 6,
    padding: '11px 12px',
    fontSize: 14,
    color: colors.ink,
    background: colors.paper2,
  },
  textarea: {
    width: '100%',
    border: `1px solid ${colors.line}`,
    borderRadius: 6,
    padding: '11px 12px',
    fontSize: 14,
    color: colors.ink,
    background: colors.paper2,
    minHeight: 84,
    resize: 'vertical',
    fontFamily: "'Noto Sans KR', sans-serif",
  },
  chipGroup: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: {
    border: `1px solid ${colors.line}`,
    borderRadius: 20,
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink,
    cursor: 'pointer',
    background: colors.white,
  },
  chipSelected: { background: colors.deep, color: colors.white, borderColor: colors.deep },
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
