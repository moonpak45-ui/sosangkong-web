'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { colors, styles } from './_shared'
import { MyPageLayoutContext, BuyerProfile } from './MyPageLayoutContext'

const NAV_ITEMS = [
  { href: '/my-page', label: '거래처 관리' },
  { href: '/my-page/history', label: '거래 이력' },
  { href: '/my-page/quotes', label: '견적 요청 현황' },
  { href: '/my-page/favorites', label: '찜한 업체', badge: true as const },
  { href: '/my-page/saju', label: '사주 프로필' },
  { href: '/my-page/profile', label: '사업장 정보 수정' },
  { href: '/my-page/account', label: '계정 설정' },
]

export default function MyPageRootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''

  const [status, setStatus] = useState<'loading' | 'denied' | 'ok'>('loading')
  const [session, setSession] = useState<{ userId: string } | null>(null)
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile | null>(null)
  const [favoriteCount, setFavoriteCount] = useState(0)

  useEffect(() => {
    async function check() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()

      if (!authSession) {
        setStatus('denied')
        return
      }

      const { data: profile } = await supabase
        .from('buyer_profiles')
        .select('id, business_name, region, industry, biz_reg_no, address, contact_name, phone')
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!profile) {
        setStatus('denied')
        return
      }

      setSession({ userId: authSession.user.id })
      setBuyerProfile(profile as BuyerProfile)
      setStatus('ok')
      await loadFavoriteCount(profile.id)
    }

    check()
  }, [])

  async function loadFavoriteCount(buyerId: string) {
    const { count } = await supabase
      .from('favorites')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', buyerId)
    setFavoriteCount(count || 0)
  }

  function refreshFavoriteCount() {
    if (buyerProfile) loadFavoriteCount(buyerProfile.id)
  }

  if (status === 'loading') {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (status === 'denied') {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>소상공인 계정으로 로그인해야 마이페이지를 이용할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  const infoComplete = Boolean(
    buyerProfile!.business_name &&
      buyerProfile!.biz_reg_no &&
      buyerProfile!.industry &&
      buyerProfile!.region &&
      buyerProfile!.contact_name &&
      buyerProfile!.address
  )

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <div
          className="responsive-two-col"
          style={{ ...styles.pageLayout, ['--rtc-cols' as string]: '230px 1fr', ['--rtc-gap' as string]: '36px' } as React.CSSProperties}
        >
          <div className="responsive-sidebar-divider" style={styles.sideMenu}>
            <div style={styles.bizCard}>
              <div style={styles.bizName}>{buyerProfile!.business_name}</div>
              <div style={styles.bizMeta}>{infoComplete ? '정보 입력완료' : '사업장 정보 미입력'}</div>
            </div>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              return (
                <a key={item.href} href={item.href} style={{ ...styles.menuItem, ...(active ? styles.menuItemActive : {}) }}>
                  {item.label}
                  {item.badge && favoriteCount > 0 && <span style={styles.menuBadge}>{favoriteCount}</span>}
                </a>
              )
            })}
          </div>

          <div>
            <MyPageLayoutContext.Provider value={{ session: session!, buyerProfile: buyerProfile!, favoriteCount, refreshFavoriteCount }}>
              {children}
            </MyPageLayoutContext.Provider>
          </div>
        </div>
      </div>
    </div>
  )
}
