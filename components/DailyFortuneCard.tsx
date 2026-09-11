'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Card from './ui/Card'
import Badge from './ui/Badge'

type Tone = '길' | '중' | '흉'
type FortuneCard = { category: string; content: string; tone: Tone }

type LoadState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'needs-profile' }
  | { status: 'error'; message: string }
  | { status: 'ready'; date: string; cards: FortuneCard[] }

const TONE_LABEL: Record<Tone, string> = { '길': '길', '중': '중', '흉': '주의' }
const TONE_COLOR: Record<Tone, string> = { '길': '#0B7A6D', '중': '#8A6D1F', '흉': '#B5460B' }

// 로그인한 사용자의 오늘의 운세(사업운/매출운/거래운)를 보여주는 카드.
// /api/fortune/daily는 다른 라우트 핸들러(app/api/ai-parse-order)와 같은
// 방식으로 세션 쿠키가 아니라 Authorization: Bearer 토큰으로 인증하므로
// 여기서도 supabase.auth.getSession()의 access_token을 그대로 실어 보낸다.
export default function DailyFortuneCard() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        if (!cancelled) setState({ status: 'signed-out' })
        return
      }

      try {
        const res = await fetch('/api/fortune/daily', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const json = await res.json()

        if (cancelled) return

        if (res.status === 401) {
          setState({ status: 'signed-out' })
          return
        }
        if (res.status === 404 && json.needsProfile) {
          setState({ status: 'needs-profile' })
          return
        }
        if (!res.ok) {
          setState({ status: 'error', message: json.error || '오늘의 운세를 불러오지 못했어요.' })
          return
        }

        setState({ status: 'ready', date: json.date, cards: json.cards as FortuneCard[] })
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: '네트워크 오류로 오늘의 운세를 불러오지 못했어요.' })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading' || state.status === 'signed-out') return null

  return (
    <Card style={styles.card}>
      <div style={styles.header}>
        <span style={styles.title}>오늘의 운세</span>
        {state.status === 'ready' && <span style={styles.date}>{state.date}</span>}
      </div>

      {state.status === 'needs-profile' && (
        <p style={styles.notice}>사주 프로필을 등록하면 오늘의 운세를 확인할 수 있어요.</p>
      )}

      {state.status === 'error' && <p style={styles.notice}>{state.message}</p>}

      {state.status === 'ready' && (
        <div style={styles.grid}>
          {state.cards.map((c) => (
            <div key={c.category} style={styles.item}>
              <div style={styles.itemHead}>
                <b style={styles.category}>{c.category}</b>
                <Badge style={{ background: 'transparent', color: TONE_COLOR[c.tone], fontWeight: 700, padding: 0 }}>
                  {TONE_LABEL[c.tone]}
                </Badge>
              </div>
              <p style={styles.content}>{c.content}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

const styles: { [k: string]: React.CSSProperties } = {
  card: { marginBottom: 18 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--color-text)' },
  date: { fontSize: 11.5, color: 'var(--color-text-muted)' },
  notice: { fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 },
  grid: { display: 'grid', gap: 10 },
  item: { borderTop: '1px dashed var(--color-border)', paddingTop: 10 },
  itemHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  category: { fontSize: 13, color: 'var(--color-text)' },
  content: { fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 },
}
