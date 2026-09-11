'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'

type NoticeRow = {
  id: string
  title: string
  is_pinned: boolean
  created_at: string
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function NoticesPage() {
  const [notices, setNotices] = useState<NoticeRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('notices')
      .select('id, title, is_pinned, created_at')
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setNotices((data || []) as NoticeRow[])
        setLoading(false)
      })
  }, [])

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>공지사항</h1>

      {loading && <p style={{ color: colors.muted, padding: '40px 0' }}>불러오는 중...</p>}

      {!loading && notices.length === 0 && (
        <div style={styles.emptyState}>등록된 공지사항이 아직 없어요.</div>
      )}

      {!loading && notices.length > 0 && (
        <Card style={styles.card}>
          <ul style={styles.list}>
            {notices.map((n) => (
              <li key={n.id}>
                <a href={`/notices/${n.id}`} style={styles.item}>
                  <span style={styles.itemTitleRow}>
                    {n.is_pinned && <Badge style={{ background: colors.paper2, color: colors.navy }}>고정</Badge>}
                    <span style={styles.itemTitle}>{n.title}</span>
                  </span>
                  <span style={styles.itemDate}>{formatDate(n.created_at)}</span>
                </a>
              </li>
            ))}
          </ul>
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
  paper2: '#EFF5F8',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: '48px 24px 90px' },
  h1: { fontSize: 24, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: '0 0 24px' },
  card: { padding: 0 },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '16px 20px',
    borderBottom: `1px solid ${colors.paper2}`,
    textDecoration: 'none',
    color: colors.ink,
  },
  itemTitleRow: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  itemTitle: { fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemDate: { fontSize: 12, color: colors.muted, flexShrink: 0 },
  emptyState: { textAlign: 'center', padding: '70px 0', color: colors.muted },
}
