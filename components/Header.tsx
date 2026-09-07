'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export default function Header() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<'buyer' | 'partner' | null>(null)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    async function loadRole(userId: string) {
      const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle()
      setRole((data?.role as 'buyer' | 'partner' | undefined) ?? null)
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadRole(data.session.user.id)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        loadRole(newSession.user.id)
      } else {
        setRole(null)
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (keyword.trim()) {
      router.push(`/search?q=${encodeURIComponent(keyword.trim())}`)
    }
  }

  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <a href="/" style={styles.logo}>
          <svg width="22" height="22" viewBox="0 0 26 26" fill="none">
            <path d="M2 18C5 15 8 15 11 18C14 21 17 21 20 18C21.5 16.5 23 16.5 24 18" stroke="#F2A93B" strokeWidth="2" strokeLinecap="round" />
            <path d="M2 12C5 9 8 9 11 12C14 15 17 15 20 12C21.5 10.5 23 10.5 24 12" stroke="#065A82" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          </svg>
          소상공
        </a>

        <form onSubmit={handleSearchSubmit} style={styles.searchForm}>
          <input
            type="text"
            placeholder="어떤 거래처를 찾으세요? (예: 냉동수산, 식자재)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={styles.searchInput}
          />
          <button type="submit" style={styles.searchBtn}>
            검색
          </button>
        </form>

        <nav style={styles.nav}>
          {session ? (
            <>
              {role === 'partner' ? (
                <a href="/partner/dashboard" style={styles.navLink}>
                  공급업체 마이페이지
                </a>
              ) : (
                <a href="/my-page" style={styles.navLink}>
                  마이페이지
                </a>
              )}
              <button onClick={handleLogout} style={styles.logoutBtn}>
                로그아웃
              </button>
            </>
          ) : (
            <a href="/login" style={styles.loginBtn}>
              로그인
            </a>
          )}
        </nav>
      </div>
    </header>
  )
}

const colors = {
  deep: '#0A1E3D',
  navy: '#065A82',
  ink: '#16233B',
  line: '#D9E3EA',
  muted: '#5B6B79',
  white: '#FFFFFF',
  paper2: '#EFF5F8',
}

const styles: { [k: string]: React.CSSProperties } = {
  header: {
    borderBottom: `1px solid ${colors.line}`,
    background: colors.white,
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  inner: {
    maxWidth: 1180,
    margin: '0 auto',
    padding: '14px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 24,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 700,
    fontSize: 18,
    color: colors.deep,
    textDecoration: 'none',
    flexShrink: 0,
  },
  searchForm: {
    flex: 1,
    display: 'flex',
    maxWidth: 480,
  },
  searchInput: {
    flex: 1,
    border: `1px solid ${colors.line}`,
    borderRight: 'none',
    borderRadius: '7px 0 0 7px',
    padding: '9px 12px',
    fontSize: 13.5,
    color: colors.ink,
    background: colors.paper2,
  },
  searchBtn: {
    border: 'none',
    borderRadius: '0 7px 7px 0',
    background: colors.navy,
    color: colors.white,
    padding: '0 16px',
    fontSize: 13.5,
    fontWeight: 700,
    cursor: 'pointer',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexShrink: 0,
  },
  navLink: {
    fontSize: 13.5,
    fontWeight: 600,
    color: colors.ink,
    textDecoration: 'none',
  },
  loginBtn: {
    fontSize: 13.5,
    fontWeight: 700,
    color: colors.white,
    background: colors.navy,
    padding: '9px 18px',
    borderRadius: 7,
    textDecoration: 'none',
  },
  logoutBtn: {
    fontSize: 13.5,
    fontWeight: 600,
    color: colors.muted,
    background: 'none',
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    padding: '8px 14px',
    cursor: 'pointer',
  },
}
