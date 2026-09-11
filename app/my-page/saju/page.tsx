'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useMyPageLayout } from '../MyPageLayoutContext'
import { calcBazi } from '../../../lib/saju/buildBazi'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import Select from '../../../components/ui/Select'

type Gender = 'M' | 'F'

type FormState = {
  birthDate: string // YYYY-MM-DD
  isLunar: boolean
  isLeapMonth: boolean
  birthTime: string // HH:MM, 빈 문자열이면 모름
  gender: Gender | ''
}

const EMPTY_FORM: FormState = {
  birthDate: '',
  isLunar: false,
  isLeapMonth: false,
  birthTime: '',
  gender: '',
}

function parseDate(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  return { hour: Number(m[1]), minute: Number(m[2]) }
}

// 사주 프로필 등록/수정 폼. 저장 시점에 lib/saju/buildBazi로 년/월/일/시주와
// 오행 분포를 계산해 saju_profiles에 함께 저장해둔다(매번 다시 계산하지
// 않고 캐시해두는 방식 — /api/fortune/daily는 이 중 day_pillar만 읽음).
export default function SajuProfilePage() {
  const { session } = useMyPageLayout()

  const [profileId, setProfileId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: profile } = await supabase
        .from('saju_profiles')
        .select('id, birth_date, birth_time, is_lunar, gender')
        .eq('user_id', session.userId)
        .maybeSingle()

      if (profile) {
        setProfileId(profile.id)
        setForm({
          birthDate: profile.birth_date,
          isLunar: profile.is_lunar,
          isLeapMonth: false,
          birthTime: profile.birth_time ? profile.birth_time.slice(0, 5) : '',
          gender: (profile.gender as Gender) || '',
        })
      }
      setLoading(false)
    }

    load()
  }, [session.userId])

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function save() {
    setSaveError('')
    setSaved(false)

    const date = parseDate(form.birthDate)
    if (!date) {
      setSaveError('생년월일을 입력해주세요.')
      return
    }
    if (!form.gender) {
      setSaveError('성별을 선택해주세요.')
      return
    }

    const time = form.birthTime ? parseTime(form.birthTime) : null

    const bazi = calcBazi({
      year: date.year,
      month: date.month,
      day: date.day,
      hour: time ? time.hour : null,
      minute: time ? time.minute : null,
      isLunar: form.isLunar,
      isLeapMonth: form.isLunar && form.isLeapMonth,
    })

    setSaving(true)
    const { error } = await supabase.from('saju_profiles').upsert(
      {
        user_id: session.userId,
        birth_date: form.birthDate,
        birth_time: form.birthTime || null,
        is_lunar: form.isLunar,
        gender: form.gender,
        year_pillar: bazi.yearPillar,
        month_pillar: bazi.monthPillar,
        day_pillar: bazi.dayPillar,
        hour_pillar: bazi.hourPillar,
        ohaeng_distribution: bazi.ohaengDistribution,
        day_gan: bazi.dayGan,
      },
      { onConflict: 'user_id' }
    )
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

  return (
    <div style={styles.wrap}>
      <div style={styles.pageHead}>
        <h1 style={styles.h1}>사주 프로필</h1>
        <p style={styles.headP}>생년월일을 등록하면 홈 화면에서 오늘의 사업운·매출운·거래운을 볼 수 있어요.</p>
      </div>

      <div style={styles.card}>
        {saved && (
          <div style={styles.successBox}>
            저장됐어요.{' '}
            <a href="/" style={styles.successLink}>
              홈에서 오늘의 운세 보러가기 ›
            </a>
          </div>
        )}
        {saveError && <div style={styles.errorBox}>{saveError}</div>}

        <div style={styles.fieldRow}>
          <div style={styles.field}>
            <label style={styles.label}>생년월일 *</label>
            <Input type="date" value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>양력/음력 *</label>
            <Select
              value={form.isLunar ? 'lunar' : 'solar'}
              onChange={(e) => update('isLunar', e.target.value === 'lunar')}
            >
              <option value="solar">양력</option>
              <option value="lunar">음력</option>
            </Select>
          </div>
        </div>

        {form.isLunar && (
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={form.isLeapMonth}
              onChange={(e) => update('isLeapMonth', e.target.checked)}
            />
            윤달이에요
          </label>
        )}

        <div style={styles.field}>
          <label style={styles.label}>태어난 시간</label>
          <Input type="time" value={form.birthTime} onChange={(e) => update('birthTime', e.target.value)} />
          <div style={styles.hint}>모르면 비워두세요 — 시주(時柱) 계산만 빠지고 나머지는 그대로 나와요.</div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>성별 *</label>
          <Select value={form.gender} onChange={(e) => update('gender', e.target.value as Gender)}>
            <option value="">선택</option>
            <option value="M">남성</option>
            <option value="F">여성</option>
          </Select>
        </div>

        <Button variant="primary" style={{ width: '100%', marginTop: 6 }} onClick={save} disabled={saving} type="button">
          {saving ? '저장 중...' : profileId ? '수정하기' : '등록하기'}
        </Button>
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
  hint: { fontSize: 11.5, color: colors.muted, marginTop: 6 },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: colors.ink, marginBottom: 16 },
  successBox: {
    background: colors.goodBg,
    color: colors.good,
    borderRadius: 7,
    padding: '10px 12px',
    fontSize: 12.5,
    marginBottom: 18,
  },
  successLink: { color: colors.good, fontWeight: 700, textDecoration: 'underline' },
  errorBox: { background: '#FDECEC', color: '#B3261E', borderRadius: 7, padding: '10px 12px', fontSize: 12.5, marginBottom: 18 },
}
