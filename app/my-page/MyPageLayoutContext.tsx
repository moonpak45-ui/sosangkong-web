'use client'

import { createContext, useContext } from 'react'

export type BuyerProfile = {
  id: string
  business_name: string
  region: string | null
  industry: string | null
  biz_reg_no: string | null
  address: string | null
  contact_name: string | null
  phone?: string | null
}

export type MyPageLayoutData = {
  session: { userId: string }
  buyerProfile: BuyerProfile
  favoriteCount: number
  refreshFavoriteCount: () => void
}

// app/my-page/layout.tsx가 로그인/소상공인 확인을 한 번만 수행하고 그 결과를
// 하위 페이지(거래처 관리/거래 이력/견적 요청 현황/찜한 업체 등)에 내려줌.
export const MyPageLayoutContext = createContext<MyPageLayoutData | null>(null)

export function useMyPageLayout() {
  const ctx = useContext(MyPageLayoutContext)
  if (!ctx) {
    throw new Error('useMyPageLayout은 app/my-page/layout.tsx 하위(사이드바가 있는 페이지)에서만 쓸 수 있어요.')
  }
  return ctx
}
