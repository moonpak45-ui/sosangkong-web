'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type BuyerProfileFields = {
  business_name: string
  biz_reg_no: string
  industry: string
  region: string
  address: string
  contact_name: string
  phone: string
}

const EMPTY_FORM: BuyerProfileFields = {
  business_name: '',
  biz_reg_no: '',
  industry: '',
  region: '',
  address: '',
  contact_name: '',
  phone: '',
}

const FIELD_LABELS: Record<keyof BuyerProfileFields, string> = {
  business_name: '사업장명',
  biz_reg_no: '사업자등록번호',
  industry: '업종',
  region: '지역',
  contact_name: '담당자명',
  address: '주소',
  phone: '연락처',
}

const FIELD_PARTICLE: Record<keyof BuyerProfileFields, string> = {
  business_name: '을',
  biz_reg_no: '를',
  industry: '을',
  region: '을',
  contact_name: '을',
  address: '를',
  phone: '를',
}

const REQUIRED_FIELDS: (keyof BuyerProfileFields)[] = [
  'business_name',
  'biz_reg_no',
  'industry',
  'region',
  'contact_name',
  'address',
]

function firstMissingFieldError(form: BuyerProfileFields): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (!form[field].trim()) {
      return `${FIELD_LABELS[field]}${FIELD_PARTICLE[field]} 입력해주세요.`
    }
  }
  return null
}

export default function BuyerProfileEditPage() {
  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [form, setForm] = useState<BuyerProfileFields>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
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

      const { data: profile } = await supabase
        .from('buyer_profiles')
        .select('id, business_name, biz_reg_no, industry, region, address, contact_name, phone')
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!profile) {
        setProfileId(null)
        setLoading(false)
        return
      }

      setProfileId(profile.id)
      setForm({
        business_name: profile.business_name || '',
        biz_reg_no: profile.biz_reg_no || '',
        industry: profile.industry || '',
        region: profile.region || '',
        address: profile.address || '',
        contact_name: profile.contact_name || '',
        phone: profile.phone || '',
      })
      setLoading(false)
    }

    load()
  }, [])

  function update(field: keyof BuyerProfileFields, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function save() {
    setSaveError('')
    setSaved(false)

    const missingError = firstMissingFieldError(form)
    if (missingError) {
      setSaveError(missingError)
      return
    }
    if (!profileId) return

    setSaving(true)
    const { error } = await supabase
      .from('buyer_profiles')
      .update({
        business_name: form.business_name.trim(),
        biz_reg_no: form.biz_reg_no.trim(),
        industry: form.industry.trim(),
        region: form.region.trim(),
        address: form.address.trim(),
        contact_name: form.contact_name.trim(),
        phone: form.phone.trim() || null,
      })
      .eq('id', profileId)
    setSaving(false)

    if (error) {
      setSaveError('저장 중 오류가 발생했습니다: ' + error.message)
      return
    }
    setSaved(true)
    window.scrollTo(0, 0)
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 사업장 정보를 수정할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  if (!profileId) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>사업장 정보 수정은 소상공인(구매자) 계정 전용입니다.</p>
        <a href="/" style={styles.btnPrimary}>
          홈으로
        </a>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.pageHead}>
        <h1 style={styles.h1}>사업장 정보 수정</h1>
        <p style={styles.headP}>정확한 사업장 정보를 입력하면 견적 요청과 거래가 더 원활해져요.</p>
      </div>

      <div style={styles.card}>
          {saved && <div style={styles.successBox}>사업장 정보가 저장되었습니다.</div>}
          {saveError && <div style={styles.errorBox}>{saveError}</div>}

          <div style={styles.field}>
            <label style={styles.label}>사업장명 *</label>
            <input
              style={styles.input}
              value={form.business_name}
              onChange={(e) => update('business_name', e.target.value)}
              placeholder="예) 상공식자재"
            />
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>사업자등록번호 *</label>
              <input
                style={styles.input}
                value={form.biz_reg_no}
                onChange={(e) => update('biz_reg_no', e.target.value)}
                placeholder="000-00-00000"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>업종 *</label>
              <input
                style={styles.input}
                value={form.industry}
                onChange={(e) => update('industry', e.target.value)}
                placeholder="예) 음식점"
              />
            </div>
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>지역 *</label>
              <input
                style={styles.input}
                value={form.region}
                onChange={(e) => update('region', e.target.value)}
                placeholder="예) 서울 마포구"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>담당자명 *</label>
              <input
                style={styles.input}
                value={form.contact_name}
                onChange={(e) => update('contact_name', e.target.value)}
                placeholder="예) 홍길동"
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>주소 *</label>
            <input
              style={styles.input}
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="사업장 주소"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>연락처</label>
            <input
              style={styles.input}
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="예) 010-1234-5678"
            />
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
  input: {
    width: '100%',
    border: `1px solid ${colors.line}`,
    borderRadius: 6,
    padding: '11px 12px',
    fontSize: 14,
    color: colors.ink,
    background: colors.paper2,
  },
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
