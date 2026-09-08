'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type Props = {
  backHref: string
  backLabel: string
}

const MIN_PASSWORD_LENGTH = 6

export default function AccountSettingsForm({ backHref, backLabel }: Props) {
  const [session, setSession] = useState<{ email: string } | null | undefined>(undefined)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()

      setSession(authSession ? { email: authSession.user.email || '' } : null)
    }

    load()
  }, [])

  async function changePassword() {
    setError('')
    setSaved(false)

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)

    if (updateError) {
      setError('비밀번호 변경 중 오류가 발생했습니다: ' + updateError.message)
      return
    }

    setSaved(true)
    setNewPassword('')
    setConfirmPassword('')
    window.scrollTo(0, 0)
  }

  if (session === undefined) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 계정 설정을 이용할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <a href={backHref} style={styles.backLink}>
          ← {backLabel}
        </a>

        <div style={styles.pageHead}>
          <div style={styles.eyebrow}>계정 설정</div>
          <h1 style={styles.h1}>로그인 정보 관리</h1>
          <p style={styles.headP}>로그인 아이디를 확인하고 비밀번호를 변경할 수 있어요.</p>
        </div>

        <div style={styles.card}>
          <div style={styles.field}>
            <label style={styles.label}>로그인 아이디 (이메일)</label>
            <input style={{ ...styles.input, ...styles.inputReadonly }} value={session.email} readOnly />
          </div>
        </div>

        <div style={styles.card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 16 }}>비밀번호 변경</div>

          {saved && <div style={styles.successBox}>비밀번호가 변경되었습니다.</div>}
          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={styles.field}>
            <label style={styles.label}>새 비밀번호</label>
            <input
              type="password"
              style={styles.input}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>새 비밀번호 확인</label>
            <input
              type="password"
              style={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호를 다시 입력해주세요"
            />
          </div>

          <button
            style={{ ...styles.btnPrimary, width: '100%', marginTop: 6 }}
            onClick={changePassword}
            disabled={saving}
            type="button"
          >
            {saving ? '변경 중...' : '변경하기'}
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
    margin: '22px 0',
  },
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
  inputReadonly: { color: colors.muted, cursor: 'not-allowed' },
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
