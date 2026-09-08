'use client'

import { createContext, useContext } from 'react'

export type AdminRole = 'super_admin' | 'sub_admin'

// AdminLayout이 세션 확인 시점에 한 번 조회해서 내려주는 값 - 카테고리
// 관리/관리자 계정 관리처럼 super_admin 전용 화면이 스스로 한 번 더
// 가드할 때 씀(사이드바 메뉴 숨김과는 별개로, URL 직접 접근 방어용).
export const AdminRoleContext = createContext<AdminRole | null>(null)

export function useAdminRole() {
  return useContext(AdminRoleContext)
}
