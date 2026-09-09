'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { colors, styles } from './_shared'
import { PartnerLayoutContext, PartnerInfo } from './PartnerLayoutContext'

const NAV_ITEMS = [
  { href: '/partner/dashboard', label: '받은 견적요청', badge: 'request' as const },
  { href: '/partner/dashboard/deals', label: '진행 중인 거래', badge: 'deal' as const },
  { href: '/partner/dashboard/ledger-entry', label: '거래전표 등록' },
  { href: '/partner/ledger', label: '매출·재고 현황' },
  { href: '/partner/dashboard/settlement', label: '정산' },
  { href: '/partner/profile', label: '프로필 · 배송조건 관리' },
  { href: '/partner/order-groups', label: '거래처 주문그룹 관리' },
  { href: '/partner/ads/apply', label: '광고 신청' },
  { href: '/partner/account', label: '계정 설정' },
]

// 이 레이아웃은 /partner/* 전체에 적용되지만, 아래 두 종류는 사이드바가
// 있는 "공급업체 마이페이지"가 아니라서 제외해야 함:
// - /partner/[id] : 소상공인에게 보여지는 공개 업체 상세 페이지
// - /partner/dashboard/deals/[id]/invoice : 인쇄 전용 명세서(별도 크롬 없음)
// 폴더를 물리적으로 옮기는 대신(참조 경로가 많아 위험), pathname으로
// 판별해서 이 두 경우엔 children을 그대로 통과시킴.
const MYPAGE_SEGMENTS = new Set(['dashboard', 'profile', 'account', 'ledger', 'ads', 'order-groups'])
const INVOICE_PATTERN = /^\/partner\/dashboard\/deals\/[^/]+\/invoice$/

function isMyPageRoute(pathname: string): boolean {
  if (INVOICE_PATTERN.test(pathname)) return false
  const seg = pathname.split('/')[2]
  return MYPAGE_SEGMENTS.has(seg)
}

export default function PartnerRootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const withSidebar = isMyPageRoute(pathname)

  const [status, setStatus] = useState<'loading' | 'denied' | 'ok'>('loading')
  const [partner, setPartner] = useState<PartnerInfo | null>(null)
  const [requestCount, setRequestCount] = useState(0)
  const [dealCount, setDealCount] = useState(0)

  useEffect(() => {
    if (!withSidebar) return

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        setStatus('denied')
        return
      }

      const { data: partnerRow } = await supabase
        .from('partners')
        .select('id, name, region, description, verified_badge, status')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!partnerRow) {
        setStatus('denied')
        return
      }

      setPartner(partnerRow as PartnerInfo)
      setStatus('ok')
      await loadCounts(partnerRow.id)
    }

    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withSidebar])

  async function loadCounts(partnerId: string) {
    const [{ count: reqCount }, { count: dCount }] = await Promise.all([
      supabase
        .from('quote_request_targets')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .eq('status', 'waiting'),
      supabase.from('deals').select('id', { count: 'exact', head: true }).eq('partner_id', partnerId),
    ])
    setRequestCount(reqCount || 0)
    setDealCount(dCount || 0)
  }

  function refreshCounts() {
    if (partner) loadCounts(partner.id)
  }

  if (!withSidebar) {
    return <>{children}</>
  }

  if (status === 'loading') {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (status === 'denied') {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>공급업체 계정으로 로그인해야 이용할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
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
          style={{ ...styles.pageLayout, ['--rtc-cols' as string]: '230px 1fr', ['--rtc-gap' as string]: '36px' } as React.CSSProperties}
        >
          <div className="responsive-sidebar-divider" style={styles.sideMenu}>
            <div style={styles.bizCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={styles.bizName}>{partner!.name}</span>
                {partner!.verified_badge && <span style={styles.verifiedBadge}>✓ 검증</span>}
              </div>
              <div style={styles.bizMeta}>
                {[partner!.region, partner!.description].filter(Boolean).join(' · ') || '사업장 정보 미입력'}
              </div>
            </div>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              const badgeCount = item.badge === 'request' ? requestCount : item.badge === 'deal' ? dealCount : 0
              return (
                <a
                  key={item.href}
                  href={item.href}
                  style={{ ...styles.menuItem, ...(active ? styles.menuItemActive : {}) }}
                >
                  {item.label}
                  {item.badge && badgeCount > 0 && <span style={styles.menuBadge}>{badgeCount}</span>}
                </a>
              )
            })}
          </div>

          <div>
            <PartnerLayoutContext.Provider value={{ partner: partner!, requestCount, dealCount, refreshCounts }}>
              {children}
            </PartnerLayoutContext.Provider>
          </div>
        </div>
      </div>
    </div>
  )
}
