'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

type NotificationRow = {
  id: string
  type: string
  title: string
  body: string | null
  related_id: string | null
  is_read: boolean
  created_at: string
}

type FilterKey = 'all' | 'quote' | 'deal' | 'etc'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'quote', label: '견적' },
  { key: 'deal', label: '거래' },
  { key: 'etc', label: '공지·기타' },
]

const TYPE_LABEL: Record<string, string> = {
  quote: '견적',
  deal: '거래',
  review: '리뷰',
}

function matchesFilter(n: NotificationRow, filter: FilterKey) {
  if (filter === 'all') return true
  if (filter === 'quote') return n.type === 'quote'
  if (filter === 'deal') return n.type === 'deal'
  return n.type !== 'quote' && n.type !== 'deal'
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}.${m}.${day} ${hh}:${mm}`
}

export default function NotificationsPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ userId: string } | null | undefined>(undefined)
  const [role, setRole] = useState<'buyer' | 'partner' | 'admin' | null>(null)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    async function load() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()

      if (!authSession) {
        setSession(null)
        setLoading(false)
        return
      }
      setSession({ userId: authSession.user.id })

      const [{ data: userRow }, { data: notificationRows }] = await Promise.all([
        supabase.from('users').select('role').eq('id', authSession.user.id).maybeSingle(),
        supabase
          .from('notifications')
          .select('id, type, title, body, related_id, is_read, created_at')
          .eq('user_id', authSession.user.id)
          .order('created_at', { ascending: false }),
      ])

      setRole((userRow?.role as 'buyer' | 'partner' | 'admin' | undefined) ?? null)
      setNotifications((notificationRows || []) as NotificationRow[])
      setLoading(false)
    }

    load()
  }, [])

  function targetHref(n: NotificationRow): string {
    if (n.type === 'quote') {
      if (role === 'partner') return '/partner/dashboard#requests'
      return n.related_id ? `/quote-compare/${n.related_id}` : '/my-page'
    }
    if (n.type === 'deal') {
      return role === 'partner' ? '/partner/dashboard#deals' : '/my-page#history'
    }
    if (n.type === 'review') {
      return '/partner/dashboard#deals'
    }
    return role === 'partner' ? '/partner/dashboard' : role === 'admin' ? '/admin/dashboard' : '/my-page'
  }

  async function openNotification(n: NotificationRow) {
    if (!n.is_read) {
      setNotifications((prev) => prev.map((row) => (row.id === n.id ? { ...row, is_read: true } : row)))
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    }
    router.push(targetHref(n))
  }

  async function markAllRead() {
    if (!session) return
    setMarkingAll(true)
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', session.userId)
      .eq('is_read', false)
    setMarkingAll(false)

    if (!error) {
      setNotifications((prev) => prev.map((row) => ({ ...row, is_read: true })))
    }
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  if (session === null) {
    return (
      <div style={{ maxWidth: 480, margin: '70px auto', textAlign: 'center', padding: '0 32px' }}>
        <p style={{ color: colors.muted, fontSize: 14 }}>로그인 후 알림함을 이용할 수 있어요.</p>
        <a href="/login" style={styles.btnPrimary}>
          로그인하러 가기
        </a>
      </div>
    )
  }

  const filtered = notifications.filter((n) => matchesFilter(n, filter))
  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div style={{ background: colors.paper }}>
      <div style={styles.wrap}>
        <div style={styles.pageHead}>
          <h1 style={styles.h1}>알림함</h1>
          <p style={styles.headP}>견적 응답, 거래 확정, 리뷰 등 새 소식을 모아 확인하세요.</p>
        </div>

        <div style={styles.toolbar}>
          <div style={styles.tabRow}>
            {FILTERS.map((f) => (
              <div
                key={f.key}
                style={{ ...styles.tab, ...(filter === f.key ? styles.tabActive : {}) }}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </div>
            ))}
          </div>
          <button
            style={styles.markAllBtn}
            onClick={markAllRead}
            disabled={markingAll || unreadCount === 0}
            type="button"
          >
            모두 읽음 처리
          </button>
        </div>

        {filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>알림이 없어요</h3>
            <p style={{ fontSize: 13.5, color: colors.muted }}>새 소식이 도착하면 이곳에서 확인할 수 있어요.</p>
          </div>
        ) : (
          <div>
            {filtered.map((n) => (
              <div
                key={n.id}
                onClick={() => openNotification(n)}
                style={{ ...styles.item, ...(n.is_read ? {} : styles.itemUnread) }}
              >
                <div style={styles.itemTop}>
                  <span style={styles.itemType}>{TYPE_LABEL[n.type] || '공지'}</span>
                  <span style={styles.itemDate}>{formatDateTime(n.created_at)}</span>
                </div>
                <div style={styles.itemTitle}>{n.title}</div>
                {n.body && <div style={styles.itemBody}>{n.body}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const colors = {
  deep: '#0A1E3D',
  navy: '#065A82',
  ink: '#16233B',
  paper: '#F7FAFC',
  paper2: '#EFF5F8',
  line: '#D9E3EA',
  muted: '#5B6B79',
  white: '#FFFFFF',
  amber: '#F2A93B',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 720, margin: '0 auto', padding: '0 32px 90px' },
  pageHead: { padding: '30px 0 20px' },
  h1: { fontSize: 22, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: 0 },
  headP: { marginTop: 8, color: colors.muted, fontSize: 14 },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 },
  tabRow: { display: 'flex', gap: 8 },
  tab: { padding: '9px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `1px solid ${colors.line}`, background: colors.white, color: colors.muted },
  tabActive: { background: colors.deep, color: colors.white, borderColor: colors.deep },
  markAllBtn: { border: `1px solid ${colors.line}`, background: colors.white, color: colors.navy, fontSize: 12.5, fontWeight: 700, padding: '9px 14px', borderRadius: 6, cursor: 'pointer' },
  emptyState: { textAlign: 'center', padding: '50px 20px', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10 },
  item: { background: colors.white, border: `1px solid ${colors.line}`, borderLeft: `4px solid ${colors.line}`, borderRadius: 8, padding: '14px 18px', marginBottom: 10, cursor: 'pointer' },
  itemUnread: { borderLeftColor: colors.amber, background: colors.paper2 },
  itemTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemType: { fontSize: 11, fontWeight: 700, color: colors.navy, background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 20, padding: '2px 9px' },
  itemDate: { fontSize: 11.5, color: colors.muted },
  itemTitle: { fontSize: 14, fontWeight: 700, color: colors.ink },
  itemBody: { fontSize: 12.8, color: colors.muted, marginTop: 4 },
  btnPrimary: { background: colors.amber, color: colors.deep, border: 'none', borderRadius: 6, padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', marginTop: 20 },
}
