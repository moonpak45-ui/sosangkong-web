'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import Button from './ui/Button'
import RoleAwareCta from './RoleAwareCta'

type Role = 'buyer' | 'partner' | 'admin' | null

type NavItem = { label: string; href: string }

// 역할별 메뉴 구성 - 비로그인/buyer/partner가 서로 완전히 다름(관리자는
// 이 메뉴 대상이 아니라 빈 배열 - 관리자는 우측의 "관리자 콘솔" 링크로
// 충분히 이동 가능).
function getNavItems(session: Session | null, role: Role): NavItem[] {
  if (!session) {
    return [
      { label: '공급업체 찾기', href: '/search' },
      // "공급업체 유치 랜딩" 페이지가 따로 없어서(리포에 해당 라우트 없음),
      // RoleAwareCta/풋터와 동일한 실제 가입 딥링크로 연결.
      { label: '공급업체 등록하기', href: '/login?view=signup&type=supplier' },
      { label: '광고 상품 안내', href: '/partner/ads/apply' },
    ]
  }
  if (role === 'buyer') {
    return [
      { label: '공급업체 찾기', href: '/search' },
      { label: '견적 요청', href: '/quote-request' },
      { label: '거래 관리', href: '/my-page' },
    ]
  }
  if (role === 'partner') {
    // 파트너 본인이 공급업체라 "공급업체 찾기"는 의미가 없고, "견적 요청"/
    // "공급업체 등록"도 이미 등록된 업체 입장에선 해당 없음.
    return [
      { label: '거래 관리', href: '/partner/dashboard' },
      { label: '광고 상품', href: '/partner/ads/apply' },
    ]
  }
  return []
}

function isNavActive(pathname: string, href: string) {
  const hrefPath = href.split('?')[0]
  if (hrefPath === '/') return pathname === '/'
  return pathname.startsWith(hrefPath)
}

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role>(null)
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

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const navItems = getNavItems(session, role)

  return (
    <header style={styles.header}>
      <div className="header-inner" style={styles.inner}>
        <a href="/" style={styles.logo} aria-label="소상공닷컴 홈">
          <img src="/brand/logo-lockup.png" alt="sosangKong 소상공닷컴" style={styles.logoImg} />
        </a>

        <nav className="header-nav-menu" style={styles.navMenu} aria-label="주요 메뉴">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.href)
            return (
              <a key={item.label} href={item.href} style={{ ...styles.navMenuLink, ...(active ? styles.navMenuLinkActive : {}) }}>
                {item.label}
              </a>
            )
          })}
        </nav>

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
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/login')}>
                로그인
              </Button>
              <RoleAwareCta targetRole="buyer" variant="primary" size="sm">
                무료 시작
              </RoleAwareCta>
            </>
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
    textDecoration: 'none',
    flexShrink: 0,
  },
  logoImg: {
    height: 28,
    width: 'auto',
    display: 'block',
  },
  // display는 여기 넣지 않음 - app/globals.css의 .header-nav-menu가
  // 담당(기본 flex, 640px 이하에서 none). 인라인 style은 항상 외부 CSS보다
  // 우선하므로, 반응형으로 바뀌어야 하는 속성은 인라인에 넣으면 안 됨
  // (이 리포의 기존 관례, app/globals.css 상단 주석 참고).
  navMenu: {
    flex: 1,
    alignItems: 'center',
    gap: 28,
  },
  navMenuLink: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.muted,
    textDecoration: 'none',
    padding: '4px 0',
    borderBottom: '2px solid transparent',
  },
  navMenuLinkActive: {
    color: 'var(--color-primary)',
    borderBottom: '2px solid var(--color-accent)',
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
