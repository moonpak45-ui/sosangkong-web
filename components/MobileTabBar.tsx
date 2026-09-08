'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export default function MobileTabBar() {
  const pathname = usePathname()
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<'buyer' | 'partner' | 'admin' | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

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

  const myPageHref = role === 'admin' ? '/admin/dashboard' : role === 'partner' ? '/partner/dashboard' : '/my-page'

  const isHome = pathname === '/'
  const isSearch = pathname.startsWith('/search')
  const isQuote = pathname.startsWith('/quote-request')
  const isNotifications = pathname.startsWith('/notifications')
  const isMyPage = pathname.startsWith('/my-page') || pathname.startsWith('/partner/dashboard') || pathname.startsWith('/admin/dashboard')

  return (
    <nav className="mobile-tabbar" style={styles.bar} aria-label="모바일 하단 탭바">
      <a href="/" style={styles.tab} aria-current={isHome ? 'page' : undefined}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 11.5 12 4l8 7.5"
            stroke={isHome ? colors.active : colors.inactive}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6 10v9h12v-9"
            stroke={isHome ? colors.active : colors.inactive}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ ...styles.label, color: isHome ? colors.active : colors.inactive }}>홈</span>
      </a>

      <a href="/search" style={styles.tab} aria-current={isSearch ? 'page' : undefined}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke={isSearch ? colors.active : colors.inactive} strokeWidth="1.8" />
          <path d="M20 20L16.5 16.5" stroke={isSearch ? colors.active : colors.inactive} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span style={{ ...styles.label, color: isSearch ? colors.active : colors.inactive }}>검색</span>
      </a>

      <a href="/quote-request" style={styles.centerTab} aria-current={isQuote ? 'page' : undefined}>
        <span style={{ ...styles.centerCircle, background: isQuote ? colors.active : colors.navy }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M7 4h7l4 4v12H7z"
              stroke="#FFFFFF"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <path d="M14 4v4h4" stroke="#FFFFFF" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M9.5 13h5M9.5 16h5" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <span style={{ ...styles.label, color: isQuote ? colors.active : colors.inactive }}>견적요청</span>
      </a>

      <a href="/notifications" style={styles.tab} aria-current={isNotifications ? 'page' : undefined}>
        <span style={styles.bellWrap}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 10a6 6 0 1 1 12 0c0 3.4 1 5 2 6H4c1-1 2-2.6 2-6Z"
              stroke={isNotifications ? colors.active : colors.inactive}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M10 19a2 2 0 0 0 4 0" stroke={isNotifications ? colors.active : colors.inactive} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {unreadCount > 0 && <span style={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </span>
        <span style={{ ...styles.label, color: isNotifications ? colors.active : colors.inactive }}>알림</span>
      </a>

      <a href={session ? myPageHref : '/login'} style={styles.tab} aria-current={isMyPage ? 'page' : undefined}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="3.2" stroke={isMyPage ? colors.active : colors.inactive} strokeWidth="1.8" />
          <path
            d="M5 20c1.2-3.6 4-5.4 7-5.4s5.8 1.8 7 5.4"
            stroke={isMyPage ? colors.active : colors.inactive}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span style={{ ...styles.label, color: isMyPage ? colors.active : colors.inactive }}>마이페이지</span>
      </a>
    </nav>
  )
}

const colors = {
  navy: '#065A82',
  active: '#065A82',
  inactive: '#8A97A3',
  line: '#D9E3EA',
  white: '#FFFFFF',
  danger: '#B3261E',
}

const styles: { [k: string]: React.CSSProperties } = {
  bar: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    background: colors.white,
    borderTop: `1px solid ${colors.line}`,
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingTop: 6,
    paddingBottom: 'calc(6px + env(safe-area-inset-bottom))',
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    textDecoration: 'none',
    flex: 1,
    minWidth: 0,
  },
  centerTab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    textDecoration: 'none',
    flex: 1,
    minWidth: 0,
    marginTop: -22,
  },
  centerCircle: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 10px rgba(6, 90, 130, 0.35)',
    border: `3px solid ${colors.white}`,
  },
  bellWrap: {
    position: 'relative',
    display: 'inline-flex',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    background: colors.danger,
    color: colors.white,
    fontSize: 9,
    fontWeight: 700,
    lineHeight: 1,
    padding: '2.5px 4.5px',
    borderRadius: 20,
    minWidth: 13,
    textAlign: 'center',
  },
  label: {
    fontSize: 10.5,
    fontWeight: 600,
  },
}
