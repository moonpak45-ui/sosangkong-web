'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import Card from '../../../components/ui/Card'

type NoticeDetail = {
  id: string
  title: string
  content: string
  created_at: string
}

type LoadState = { status: 'loading' } | { status: 'not-found' } | { status: 'ready'; notice: NoticeDetail }

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function NoticeDetailPage() {
  const params = useParams<{ id: string }>()
  const noticeId = params.id
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    supabase
      .from('notices')
      .select('id, title, content, created_at')
      .eq('id', noticeId)
      .eq('is_published', true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (!data) {
          setState({ status: 'not-found' })
          return
        }
        setState({ status: 'ready', notice: data as NoticeDetail })
      })

    return () => {
      cancelled = true
    }
  }, [noticeId])

  return (
    <div style={styles.wrap}>
      <a href="/notices" style={styles.back}>
        ‹ 공지사항 목록
      </a>

      {state.status === 'loading' && <p style={{ color: colors.muted, padding: '40px 0' }}>불러오는 중...</p>}

      {state.status === 'not-found' && <div style={styles.emptyState}>존재하지 않거나 삭제된 공지예요.</div>}

      {state.status === 'ready' && (
        <Card style={styles.card}>
          <h1 style={styles.h1}>{state.notice.title}</h1>
          <div style={styles.date}>{formatDate(state.notice.created_at)}</div>
          <div style={styles.content}>{state.notice.content}</div>
        </Card>
      )}
    </div>
  )
}

const colors = {
  deep: '#0A1E3D',
  navy: '#065A82',
  ink: '#16233B',
  line: '#D9E3EA',
  muted: '#5B6B79',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: '48px 24px 90px' },
  back: { display: 'inline-block', fontSize: 13, color: colors.navy, textDecoration: 'none', marginBottom: 20, fontWeight: 600 },
  card: { padding: 28 },
  h1: { fontSize: 20, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  date: { fontSize: 12, color: colors.muted, marginTop: 8, paddingBottom: 20, borderBottom: `1px solid ${colors.line}` },
  content: { fontSize: 14, color: colors.ink, lineHeight: 1.8, whiteSpace: 'pre-wrap', marginTop: 20 },
  emptyState: { textAlign: 'center', padding: '70px 0', color: colors.muted },
}
