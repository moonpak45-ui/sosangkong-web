'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'

type TargetRole = 'buyer' | 'partner'

type Props = {
  targetRole: TargetRole
  className?: string
  children: React.ReactNode
}

type SessionState = { role: 'buyer' | 'partner' | 'admin' } | null | undefined // undefined = 확인 중

const DASHBOARD_HREF: Record<'buyer' | 'partner', string> = {
  buyer: '/my-page',
  partner: '/partner/dashboard',
}

const SIGNUP_TYPE_PARAM: Record<TargetRole, string> = {
  buyer: 'buyer',
  partner: 'supplier',
}

const ROLE_LABEL: Record<'buyer' | 'partner' | 'admin', string> = {
  buyer: '소상공인',
  partner: '공급업체',
  admin: '관리자',
}

// "소상공인" → 받침 있음 → "으로", "공급업체"/"관리자" → 받침 없음 → "로"
const ROLE_LABEL_WITH_PARTICLE: Record<'buyer' | 'partner' | 'admin', string> = {
  buyer: '소상공인으로',
  partner: '공급업체로',
  admin: '관리자로',
}

// 메인페이지의 "소상공인으로 시작하기"/"공급업체로 등록하기"류 CTA 버튼.
// 예전엔 그냥 <a href="/login">이라 로그인 여부/역할과 무관하게 항상
// 로그인 화면으로 보냈음 - 이미 그 역할로 로그인된 사용자가 눌러도
// /login으로 튕겨버리는 버그가 있었음(공급업체 계정으로 "공급업체로
// 등록하기"를 누르면 로그인 화면이 뜨는 식). 로그인 상태를 확인해서
// 세 가지 경우를 구분함:
// 1) 비로그인 → 해당 역할의 회원가입 폼으로 딥링크(/login?view=signup&type=...)
// 2) 이미 같은 역할로 로그인 → 그 역할의 마이페이지로 바로 이동
// 3) 다른 역할로 로그인 중(예: 소상공인이 "공급업체로 등록하기" 클릭) →
//    새 계정 가입 시 기존 로그인이 풀린다는 걸 확인받고 진행
export default function RoleAwareCta({ targetRole, className, children }: Props) {
  const router = useRouter()
  const [session, setSession] = useState<SessionState>(undefined)

  useEffect(() => {
    let cancelled = false

    async function check() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()

      if (!authSession) {
        if (!cancelled) setSession(null)
        return
      }

      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', authSession.user.id)
        .maybeSingle()

      if (!cancelled) {
        setSession(userRow ? { role: userRow.role as 'buyer' | 'partner' | 'admin' } : null)
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [])

  const signupHref = `/login?view=signup&type=${SIGNUP_TYPE_PARAM[targetRole]}`

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()

    // 세션 확인이 아직 안 끝났으면(거의 순간적으로 끝나지만) 무시 - 확인
    // 전에 잘못된 곳으로 보내는 것보다 한 번 더 누르게 하는 게 안전함.
    if (session === undefined) return

    if (session === null) {
      router.push(signupHref)
      return
    }

    if (session.role === targetRole) {
      router.push(DASHBOARD_HREF[targetRole])
      return
    }

    const confirmed = window.confirm(
      `현재 ${ROLE_LABEL[session.role]} 계정으로 로그인되어 있어요. ${ROLE_LABEL_WITH_PARTICLE[targetRole]} 새로 가입하려면 계속 진행해주세요(기존 로그인은 해제돼요).`
    )
    if (confirmed) {
      router.push(signupHref)
    }
  }

  return (
    <a className={className} href={signupHref} onClick={handleClick}>
      {children}
    </a>
  )
}
