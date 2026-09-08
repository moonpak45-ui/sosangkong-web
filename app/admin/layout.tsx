'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { colors, styles } from './_shared'

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: '대시보드' },
  { href: '/admin/members', label: '회원 관리' },
  { href: '/admin/deals', label: '거래·견적 관리' },
  { href: '/admin/categories', label: '카테고리 관리' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [status, setStatus] = useState<'loading' | 'denied' | 'ok'>('loading')

  useEffect(() => {
    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        setStatus('denied')
        return
      }

      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      setStatus(userRow?.role === 'admin' ? 'ok' : 'denied')
    }

    check()
  }, [])

  if (status === 'loading') {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (status === 'denied') {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>관리자 계정으로 로그인해야 이용할 수 있어요.</p>
        <a
          href="/login"
          style={{
            background: colors.amber,
            color: colors.deep,
            border: 'none',
            borderRadius: 6,
            padding: '13px 24px',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'inline-flex',
            marginTop: 20,
          }}
        >
          로그인하러 가기
        </a>
      </div>
    )
  }

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <div
          className="responsive-two-col"
          style={{ ...styles.pageLayout, ['--rtc-cols' as string]: '210px 1fr', ['--rtc-gap' as string]: '36px' } as React.CSSProperties}
        >
          <div className="responsive-sidebar-divider" style={styles.sideMenu}>
            <div style={styles.brand}>관리자 콘솔</div>
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                style={{
                  ...styles.menuItem,
                  ...(pathname === item.href || pathname?.startsWith(item.href + '/') ? styles.menuItemActive : {}),
                }}
              >
                {item.label}
              </a>
            ))}
          </div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  )
}
