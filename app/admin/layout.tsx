'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { colors, styles } from './_shared'
import { AdminRoleContext, AdminRole } from './AdminRoleContext'

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: '대시보드' },
  { href: '/admin/members', label: '회원 관리' },
  { href: '/admin/deals', label: '거래·견적 관리' },
  { href: '/admin/ads', label: '광고 관리' },
  { href: '/admin/categories', label: '카테고리 관리', superAdminOnly: true },
  { href: '/admin/admins', label: '관리자 계정 관리', superAdminOnly: true },
  { href: '/admin/account', label: '내 계정' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [status, setStatus] = useState<'loading' | 'denied' | 'ok'>('loading')
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null)

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
        .select('role, admin_role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (userRow?.role !== 'admin') {
        setStatus('denied')
        return
      }

      // admin_role이 비어있는 기존 계정도 있을 수 있어(마이그레이션 실행
      // 전이거나 데이터 누락) super_admin으로 안전하게 취급 - sub_admin은
      // 명시적으로 'sub_admin'인 경우에만 제한됨.
      setAdminRole(userRow.admin_role === 'sub_admin' ? 'sub_admin' : 'super_admin')
      setStatus('ok')
    }

    check()
  }, [])

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.superAdminOnly || adminRole === 'super_admin')

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
            {visibleNavItems.map((item) => (
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
          <div>
            <AdminRoleContext.Provider value={adminRole}>{children}</AdminRoleContext.Provider>
          </div>
        </div>
      </div>
    </div>
  )
}
