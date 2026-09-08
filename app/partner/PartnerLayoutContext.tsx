'use client'

import { createContext, useContext } from 'react'

export type PartnerInfo = {
  id: string
  name: string
  region: string | null
  description: string | null
  verified_badge: boolean
  status: string
}

export type PartnerLayoutData = {
  partner: PartnerInfo
  requestCount: number
  dealCount: number
  refreshCounts: () => void
}

// app/partner/layout.tsx가 로그인/공급업체 확인을 한 번만 수행하고 그 결과를
// 하위 페이지(받은 견적요청/진행 중인 거래/거래전표 등록/정산 등)에 내려줌 -
// 각 페이지가 매번 세션+partners 행을 다시 조회하지 않아도 되도록.
export const PartnerLayoutContext = createContext<PartnerLayoutData | null>(null)

export function usePartnerLayout() {
  const ctx = useContext(PartnerLayoutContext)
  if (!ctx) {
    throw new Error('usePartnerLayout은 app/partner/layout.tsx 하위(사이드바가 있는 페이지)에서만 쓸 수 있어요.')
  }
  return ctx
}
