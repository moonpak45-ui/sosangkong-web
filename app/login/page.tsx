'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import Button from '../../components/ui/Button'

type AccountType = 'buyer' | 'supplier'
type Category = { id: string; name: string }

export default function LoginPage() {
  // 메인페이지의 "소상공인으로 시작하기"/"공급업체로 등록하기" 버튼이
  // ?view=signup&type=buyer|supplier로 딥링크함 - useSearchParams()를 쓰는
  // 부분만 Suspense로 감싸야 정적 렌더링과 충돌 없음.
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialView = searchParams.get('view') === 'signup' ? 'signup' : 'login'
  const initialType = searchParams.get('type') === 'supplier' ? 'supplier' : 'buyer'

  // 로그인/회원가입 탭
  const [view, setView] = useState<'login' | 'signup'>(initialView)

  // 공통 입력값
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // 회원가입 전용 입력값
  const [accountType, setAccountType] = useState<AccountType>(initialType)
  const [bizName, setBizName] = useState('')
  const [bizRegNo, setBizRegNo] = useState('')
  const [mainItems, setMainItems] = useState('')
  const [agreed, setAgreed] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setCategories(data as Category[])
      })
  }, [])

  function toggleCategory(id: string) {
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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) {
      setErrorMsg('이메일 또는 비밀번호가 올바르지 않습니다.')
      return
    }
    router.push('/')
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (!bizName.trim()) {
      setErrorMsg(accountType === 'buyer' ? '사업장명을 입력해주세요.' : '업체명을 입력해주세요.')
      return
    }
    if (accountType === 'supplier' && selectedCategoryIds.size === 0) {
      setErrorMsg('취급 카테고리를 최소 1개 선택해주세요.')
      return
    }
    if (!agreed) {
      setErrorMsg('이용약관 및 개인정보처리방침에 동의해주세요.')
      return
    }

    setLoading(true)

    // 1) Supabase Auth 계정 생성
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError || !authData.user) {
      setLoading(false)
      setErrorMsg(authError?.message || '회원가입 중 오류가 발생했습니다.')
      return
    }

    const userId = authData.user.id

    // 2) 우리 서비스의 users 테이블에 동일 id로 프로필 행 생성
    const { error: userInsertError } = await supabase.from('users').insert({
      id: userId,
      email,
      role: accountType === 'buyer' ? 'buyer' : 'partner',
    })

    if (userInsertError) {
      setLoading(false)
      setErrorMsg('회원 정보 저장 중 오류: ' + userInsertError.message)
      return
    }

    // 3) 유형별 상세 프로필 테이블에 insert
    if (accountType === 'buyer') {
      const { error } = await supabase.from('buyer_profiles').insert({
        user_id: userId,
        business_name: bizName,
      })
      if (error) {
        setLoading(false)
        setErrorMsg('사업장 정보 저장 중 오류: ' + error.message)
        return
      }
    } else {
      const { data: partnerRow, error } = await supabase
        .from('partners')
        .insert({
          user_id: userId,
          name: bizName,
          biz_reg_no: bizRegNo,
          description: mainItems,
        })
        .select('id')
        .single()
      if (error || !partnerRow) {
        setLoading(false)
        setErrorMsg('업체 정보 저장 중 오류: ' + (error?.message || ''))
        return
      }

      const { error: catError } = await supabase
        .from('partner_categories')
        .insert([...selectedCategoryIds].map((category_id) => ({ partner_id: partnerRow.id, category_id })))
      if (catError) {
        setLoading(false)
        setErrorMsg('취급 카테고리 저장 중 오류: ' + catError.message)
        return
      }
    }

    setLoading(false)
    router.push('/')
  }

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <a href="/" style={styles.logo} aria-label="소상공닷컴 홈">
          <img src="/brand/logo-lockup-white.png" alt="sosangKong 소상공닷컴" style={{ height: 30, width: 'auto', display: 'block' }} />
        </a>
      </div>

      <div style={styles.authWrap}>
        <div style={styles.authCard}>
          <div style={styles.tabs}>
            <Button type="button" variant="secondary" style={tabButtonStyle(view === 'login')} onClick={() => setView('login')}>
              로그인
            </Button>
            <Button type="button" variant="secondary" style={tabButtonStyle(view === 'signup')} onClick={() => setView('signup')}>
              회원가입
            </Button>
          </div>

          {errorMsg && <div style={styles.errorBox}>{errorMsg}</div>}

          {view === 'login' ? (
            <form onSubmit={handleLogin}>
              <div style={styles.headLine}>
                <h2 style={styles.h2}>다시 오셨네요</h2>
                <p style={styles.pMuted}>로그인하고 거래처 관리와 견적 비교를 이어가세요.</p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>이메일</label>
                <input
                  style={styles.input}
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>비밀번호</label>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="비밀번호 입력"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button variant="primary" style={{ width: '100%', marginTop: 4 }} type="submit" disabled={loading}>
                {loading ? '로그인 중...' : '로그인'}
              </Button>

              <div style={styles.divider}>또는</div>
              <div style={styles.socialRow}>
                <button type="button" style={styles.kakaoBtn} disabled>
                  카카오로 3초만에 시작하기
                </button>
                <button type="button" style={styles.naverBtn} disabled>
                  네이버로 시작하기
                </button>
              </div>

              <div style={styles.switchNote}>
                아직 계정이 없으신가요?{' '}
                <b style={styles.switchLink} onClick={() => setView('signup')}>
                  회원가입
                </b>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSignup}>
              <div style={styles.headLine}>
                <h2 style={styles.h2}>어떤 목적으로 가입하시나요?</h2>
                <p style={styles.pMuted}>계정 유형에 따라 이후 화면 구성이 달라집니다.</p>
              </div>

              <div style={styles.typeGrid}>
                <div
                  style={{ ...styles.typeCard, ...(accountType === 'buyer' ? styles.typeCardSel : {}) }}
                  onClick={() => setAccountType('buyer')}
                >
                  <div style={styles.typeTitle}>소상공인으로 시작</div>
                  <div style={styles.typeSub}>거래처를 찾고 싶어요</div>
                </div>
                <div
                  style={{ ...styles.typeCard, ...(accountType === 'supplier' ? styles.typeCardSel : {}) }}
                  onClick={() => setAccountType('supplier')}
                >
                  <div style={styles.typeTitle}>공급업체로 시작</div>
                  <div style={styles.typeSub}>거래처를 확보하고 싶어요</div>
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>이메일</label>
                <input
                  style={styles.input}
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>비밀번호</label>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="8자 이상, 영문·숫자 포함"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>{accountType === 'buyer' ? '사업장명' : '업체명'}</label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder={accountType === 'buyer' ? '예) 마포 소담식당' : '예) 그린테이블 식자재'}
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  required
                />
              </div>

              {accountType === 'supplier' && (
                <>
                  <div style={styles.field}>
                    <label style={styles.label}>사업자등록번호</label>
                    <input
                      style={styles.input}
                      type="text"
                      placeholder="000-00-00000"
                      value={bizRegNo}
                      onChange={(e) => setBizRegNo(e.target.value)}
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>주요 취급 품목</label>
                    <input
                      style={styles.input}
                      type="text"
                      placeholder="예) 냉동수산, 축산, 식자재"
                      value={mainItems}
                      onChange={(e) => setMainItems(e.target.value)}
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>취급 카테고리 *</label>
                    {categories.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: colors.muted }}>카테고리 목록을 불러오는 중...</p>
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
                </>
              )}

              <div style={styles.termsRow}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  만 14세 이상이며, <a href="#" style={styles.link}>이용약관</a> 및{' '}
                  <a href="#" style={styles.link}>개인정보처리방침</a>에 동의합니다.
                </span>
              </div>

              <Button variant="primary" style={{ width: '100%', marginTop: 4 }} type="submit" disabled={loading}>
                {loading
                  ? '가입 처리 중...'
                  : accountType === 'buyer'
                  ? '소상공인으로 가입하기'
                  : '공급업체로 가입하기'}
              </Button>

              <div style={styles.switchNote}>
                이미 계정이 있으신가요?{' '}
                <b style={styles.switchLink} onClick={() => setView('login')}>
                  로그인
                </b>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

const colors = {
  deep: '#0A1E3D',
  navy: '#065A82',
  ink: '#16233B',
  paper2: '#EFF5F8',
  line: '#D9E3EA',
  muted: '#5B6B79',
  white: '#FFFFFF',
}

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '11px 0',
    fontSize: 14.5,
    border: 'none',
    background: active ? colors.white : 'transparent',
    color: active ? colors.deep : colors.muted,
    boxShadow: active ? '0 3px 10px rgba(10,30,61,0.1)' : 'none',
  }
}

const styles: { [k: string]: React.CSSProperties } = {
  page: {
    fontFamily: "'Noto Sans KR', sans-serif",
    color: colors.ink,
    background: colors.deep,
    backgroundImage: 'radial-gradient(ellipse at 85% 10%, rgba(28,114,147,0.35), transparent 55%)',
    minHeight: '100vh',
  },
  top: { padding: '26px 32px' },
  logo: {
    display: 'flex',
    alignItems: 'center',
    color: colors.white,
    width: 'fit-content',
    textDecoration: 'none',
  },
  authWrap: { display: 'flex', justifyContent: 'center', padding: '24px 20px 80px' },
  authCard: {
    width: '100%',
    maxWidth: 440,
    background: colors.white,
    borderRadius: 14,
    padding: '36px 34px 32px',
    boxShadow: '0 30px 70px rgba(5,20,40,0.4)',
  },
  tabs: { display: 'flex', background: colors.paper2, borderRadius: 9, padding: 4, marginBottom: 26 },
  headLine: { marginBottom: 22 },
  h2: { fontSize: 19, margin: 0, color: colors.deep },
  pMuted: { fontSize: 13, color: colors.muted, marginTop: 6 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12.5, color: colors.muted, fontWeight: 600, marginBottom: 6 },
  input: {
    width: '100%',
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    padding: '12px 13px',
    fontSize: 14.5,
    color: colors.ink,
    background: colors.paper2,
  },
  divider: { display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0', color: colors.muted, fontSize: 12 },
  socialRow: { display: 'flex', flexDirection: 'column', gap: 10 },
  kakaoBtn: {
    width: '100%',
    padding: 12,
    borderRadius: 7,
    border: '1px solid #FEE500',
    background: '#FEE500',
    color: '#181600',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'not-allowed',
  },
  naverBtn: {
    width: '100%',
    padding: 12,
    borderRadius: 7,
    border: '1px solid #03C75A',
    background: '#03C75A',
    color: colors.white,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'not-allowed',
  },
  switchNote: { textAlign: 'center', fontSize: 13, color: colors.muted, marginTop: 22 },
  switchLink: { color: colors.navy, cursor: 'pointer' },
  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 },
  typeCard: { border: `1.5px solid ${colors.line}`, borderRadius: 10, padding: '18px 14px', textAlign: 'center', cursor: 'pointer' },
  typeCardSel: { borderColor: colors.navy, background: colors.paper2 },
  typeTitle: { fontSize: 13.8, fontWeight: 700, color: colors.ink },
  typeSub: { fontSize: 11.5, color: colors.muted, marginTop: 4 },
  chipGroup: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: {
    border: `1px solid ${colors.line}`,
    borderRadius: 20,
    padding: '8px 14px',
    fontSize: 12.5,
    fontWeight: 600,
    color: colors.ink,
    cursor: 'pointer',
    background: colors.white,
  },
  chipSelected: { background: colors.deep, color: colors.white, borderColor: colors.deep },
  termsRow: { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: colors.muted, margin: '16px 0 4px' },
  link: { color: colors.navy, fontWeight: 600 },
  errorBox: {
    background: '#FDECEC',
    color: '#B3261E',
    borderRadius: 7,
    padding: '10px 12px',
    fontSize: 13,
    marginBottom: 16,
  },
}
