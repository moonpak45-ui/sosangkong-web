'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export default function Header() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<'buyer' | 'partner' | 'admin' | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [isMobileHeader, setIsMobileHeader] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    setIsMobileHeader(mq.matches)
    const handleChange = (e: MediaQueryListEvent) => setIsMobileHeader(e.matches)
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    async function loadRole(userId: string) {
      const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle()
      setRole((data?.role as 'buyer' | 'partner' | 'admin' | undefined) ?? null)
    }

    async function loadUnreadCount(userId: string) {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
      setUnreadCount(count || 0)
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        loadRole(data.session.user.id)
        loadUnreadCount(data.session.user.id)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        loadRole(newSession.user.id)
        loadUnreadCount(newSession.user.id)
      } else {
        setRole(null)
        setUnreadCount(0)
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
      setMobileSearchOpen(false)
      router.push(`/search?q=${encodeURIComponent(keyword.trim())}`)
    }
  }

  return (
    <header style={styles.header}>
      <div className="header-inner" style={styles.inner}>
        <a href="/" style={styles.logo} aria-label="소상공닷컴 홈">
          <img
            src="/brand/logo-lockup.png"
            alt="sosangKong 소상공닷컴"
            style={{ ...styles.logoImg, height: isMobileHeader ? 24 : 28 }}
          />
        </a>

        {!isMobileHeader && (
          <form onSubmit={handleSearchSubmit} className="header-search-form" style={styles.searchForm}>
            <input
              type="text"
              placeholder="어떤 거래처를 찾으세요? (예: 냉동수산, 식자재)"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="header-search-input"
              style={styles.searchInput}
            />
            <button type="submit" style={styles.searchBtn}>
              검색
            </button>
          </form>
        )}

        <button
          type="button"
          className="header-search-toggle"
          style={styles.searchToggleBtn}
          aria-label="검색창 열기"
          onClick={() => setMobileSearchOpen((v) => !v)}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke={colors.ink} strokeWidth="1.8" />
            <path d="M20 20L16.5 16.5" stroke={colors.ink} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <nav className="header-nav" style={styles.nav}>
          {session ? (
            <>
              <a href="/notifications" style={styles.bellLink} aria-label="알림함">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 10a6 6 0 1 1 12 0c0 3.4 1 5 2 6H4c1-1 2-2.6 2-6Z"
                    stroke={colors.ink}
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path d="M10 19a2 2 0 0 0 4 0" stroke={colors.ink} strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {unreadCount > 0 && (
                  <span style={styles.bellBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </a>
              {role === 'admin' ? (
                <a href="/admin/dashboard" style={styles.navLink}>
                  관리자 콘솔
                </a>
              ) : role === 'partner' ? (
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

      {mobileSearchOpen && (
        <form onSubmit={handleSearchSubmit} className="header-search-mobile-row">
          <input
            type="text"
            autoFocus
            placeholder="어떤 거래처를 찾으세요? (예: 냉동수산, 식자재)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="header-search-input"
            style={styles.searchInput}
          />
          <button type="submit" style={styles.searchBtn}>
            검색
          </button>
        </form>
      )}
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
    textDecoration: 'none',
    flexShrink: 0,
  },
  logoImg: {
    height: 28,
    width: 'auto',
    display: 'block',
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
  searchToggleBtn: {
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    background: colors.white,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
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
  bellLink: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
  },
  bellBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    background: '#B3261E',
    color: colors.white,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
    padding: '3px 5px',
    borderRadius: 20,
    minWidth: 15,
    textAlign: 'center',
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
