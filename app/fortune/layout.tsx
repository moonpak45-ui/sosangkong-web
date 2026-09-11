'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// /my-page와 달리 buyer_profiles 존재 여부는 확인하지 않고 로그인 여부만
// 확인한다 - 오늘의 운세는 buyer/partner 계정 모두 이용 가능해야 하기 때문.
export default function FortuneLayout({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'denied' | 'ok'>('loading')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? 'ok' : 'denied')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'ok' : 'denied')
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  if (status === 'loading') {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (status === 'denied') {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 이용할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  return <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 24px 90px' }}>{children}</div>
}

const colors = {
  deep: '#0A1E3D',
  muted: '#5B6B79',
}

const styles: { [k: string]: React.CSSProperties } = {
  btnPrimary: {
    display: 'inline-flex',
    marginTop: 20,
    background: '#F2A93B',
    color: colors.deep,
    border: 'none',
    borderRadius: 6,
    padding: '13px 24px',
    fontSize: 15,
    fontWeight: 700,
    textDecoration: 'none',
  },
}
