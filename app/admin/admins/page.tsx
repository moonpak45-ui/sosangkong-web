'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles } from '../_shared'
import { useAdminRole, AdminRole } from '../AdminRoleContext'
import Button from '../../../components/ui/Button'

type AdminRow = {
  id: string
  email: string | null
  admin_role: AdminRole | null
}

const MIN_PASSWORD_LENGTH = 6

export default function AdminAccountsPage() {
  const adminRole = useAdminRole()

  const [loading, setLoading] = useState(true)
  const [admins, setAdmins] = useState<AdminRow[]>([])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newRole, setNewRole] = useState<AdminRole>('sub_admin')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [roleError, setRoleError] = useState('')

  async function loadAdmins() {
    const { data } = await supabase
      .from('users')
      .select('id, email, admin_role')
      .eq('role', 'admin')
      .order('email', { ascending: true })
    setAdmins((data || []) as AdminRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadAdmins()
  }, [])

  async function createAdmin() {
    setCreateError('')
    setCreateSuccess('')

    if (!email.trim() || !email.includes('@')) {
      setCreateError('올바른 이메일을 입력해주세요.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setCreateError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
      return
    }

    setCreating(true)

    // service role key가 없어서 관리자 계정도 client의 signUp()으로
    // 만들 수밖에 없음 - signUp()은 이 프로젝트 설정상(이메일 확인 꺼짐)
    // 성공하면 브라우저 세션을 방금 만든 새 계정으로 즉시 바꿔버림. 그래서
    // signUp 전에 지금(super_admin) 세션을 미리 저장해뒀다가, 새 계정의
    // users 행을 insert한 직후 다시 원래 세션으로 복구함 - 이 화면을 쓰는
        // super_admin이 자기도 모르게 로그아웃되거나 새 계정으로 바뀌는 일이 없도록.
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession()

    if (!currentSession) {
      setCreating(false)
      setCreateError('세션이 만료되었어요. 다시 로그인해주세요.')
      return
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    if (signUpError) {
      setCreating(false)
      setCreateError('계정 생성 중 오류가 발생했습니다: ' + signUpError.message)
      return
    }
    // Supabase는 이미 가입된 이메일이어도 에러 대신 identities가 빈 배열인
    // "가짜" user를 돌려줄 수 있음(이메일 목록 유출 방지 정책) - 이 경우도
    // 실패로 처리.
    if (!signUpData.user || signUpData.user.identities?.length === 0) {
      await supabase.auth.setSession({
        access_token: currentSession.access_token,
        refresh_token: currentSession.refresh_token,
      })
      setCreating(false)
      setCreateError('이미 가입된 이메일이거나 계정 생성에 실패했습니다.')
      return
    }

    const { error: insertError } = await supabase.from('users').insert({
      id: signUpData.user.id,
      email: email.trim(),
      role: 'admin',
      admin_role: newRole,
    })

    // signUp()이 세션을 바꿨을 수 있으니 무조건 원래 세션으로 복구
    await supabase.auth.setSession({
      access_token: currentSession.access_token,
      refresh_token: currentSession.refresh_token,
    })

    setCreating(false)

    if (insertError) {
      setCreateError('계정 정보 저장 중 오류가 발생했습니다: ' + insertError.message)
      return
    }

    setCreateSuccess(`${email.trim()} 계정을 생성했습니다.`)
    setEmail('')
    setPassword('')
    setNewRole('sub_admin')
    loadAdmins()
  }

  async function changeRole(id: string, role: AdminRole) {
    setRoleError('')
    setUpdatingId(id)
    const { error } = await supabase.from('users').update({ admin_role: role }).eq('id', id)
    setUpdatingId(null)

    if (error) {
      setRoleError('역할 변경 중 오류가 발생했습니다: ' + error.message)
      return
    }
    setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, admin_role: role } : a)))
  }

  if (adminRole === 'sub_admin') {
    return (
      <div style={styles.emptyState}>
        <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>접근 권한이 없어요</h3>
        <p style={{ fontSize: 13.5, color: colors.muted }}>관리자 계정 관리는 최고 관리자만 이용할 수 있어요.</p>
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>관리자 계정 관리</div>
      <div style={styles.sectionSub}>관리자 계정을 생성하고 역할(최고 관리자/중급 관리자)을 지정하세요.</div>

      <div style={styles.card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 16 }}>새 관리자 계정 생성</div>

        {createSuccess && <div style={{ ...styles.errorBox, background: colors.goodBg, color: colors.good, marginBottom: 12 }}>{createSuccess}</div>}
        {createError && <div style={{ ...styles.errorBox, marginBottom: 12 }}>{createError}</div>}

        <div style={styles.field}>
          <label style={styles.label}>이메일 (로그인 아이디)</label>
          <input
            type="email"
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>초기 비밀번호</label>
          <input
            type="password"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>역할</label>
          <select
            style={styles.input}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as AdminRole)}
          >
            <option value="sub_admin">중급 관리자 (회원관리·거래견적관리)</option>
            <option value="super_admin">최고 관리자 (전체 기능)</option>
          </select>
        </div>

        <Button
          variant="primary"
          style={{ width: '100%', padding: '10px 14px' }}
          onClick={createAdmin}
          disabled={creating}
        >
          {creating ? '생성 중...' : '관리자 계정 생성'}
        </Button>
      </div>

      <div style={styles.card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 16 }}>
          관리자 목록 ({admins.length})
        </div>
        {roleError && <div style={{ ...styles.errorBox, marginBottom: 12 }}>{roleError}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>아이디</th>
                <th style={styles.th}>역할</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td style={styles.td}>{a.email || '-'}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.htag,
                        background: a.admin_role === 'super_admin' ? colors.goodBg : '#E7EEF5',
                        color: a.admin_role === 'super_admin' ? colors.good : colors.navy,
                      }}
                    >
                      {a.admin_role === 'super_admin' ? '최고 관리자' : '중급 관리자'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={updatingId === a.id || a.admin_role === 'sub_admin'}
                        onClick={() => changeRole(a.id, 'sub_admin')}
                      >
                        중급으로
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={updatingId === a.id || a.admin_role === 'super_admin'}
                        onClick={() => changeRole(a.id, 'super_admin')}
                      >
                        최고로
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
