'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles, formatDate } from '../_shared'
import Card from '../../../components/ui/Card'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import Textarea from '../../../components/ui/Textarea'

type NoticeRow = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_published: boolean
  created_at: string
}

type FormState = {
  title: string
  content: string
  isPinned: boolean
  isPublished: boolean
}

const EMPTY_FORM: FormState = { title: '', content: '', isPinned: false, isPublished: true }

// 관리자용 공지사항 CRUD. notices RLS는 이미 qd_is_admin() FOR ALL로
// 열려있어(20260929000000_inquiries_and_notices.sql) 스키마 변경 없이
// 이 화면만 추가하면 됨. 작성 화면 자체가 이번에 처음 생기는 것이라,
// 지금까지 등록된 공지는 없다는 전제(Supabase 대시보드에서 직접 넣은
// 데이터가 있다면 여기서도 그대로 보임 - 별도 마이그레이션 불필요).
export default function AdminNoticesPage() {
  const [notices, setNotices] = useState<NoticeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'form'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [listError, setListError] = useState('')

  function load() {
    setLoading(true)
    supabase
      .from('notices')
      .select('id, title, content, is_pinned, is_published, created_at')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setListError('목록을 불러오지 못했습니다: ' + error.message)
        }
        setNotices((data || []) as NoticeRow[])
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSaveError('')
    setMode('form')
  }

  function startEdit(n: NoticeRow) {
    setEditingId(n.id)
    setForm({ title: n.title, content: n.content, isPinned: n.is_pinned, isPublished: n.is_published })
    setSaveError('')
    setMode('form')
  }

  function cancelForm() {
    setMode('list')
    setEditingId(null)
    setSaveError('')
  }

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function save() {
    setSaveError('')

    if (!form.title.trim()) {
      setSaveError('제목을 입력해주세요.')
      return
    }
    if (!form.content.trim()) {
      setSaveError('내용을 입력해주세요.')
      return
    }

    setSaving(true)

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      is_pinned: form.isPinned,
      is_published: form.isPublished,
    }

    const { error } = editingId
      ? await supabase.from('notices').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId)
      : await supabase.from('notices').insert(payload)

    setSaving(false)

    if (error) {
      setSaveError((editingId ? '수정' : '등록') + ' 중 오류가 발생했습니다: ' + error.message)
      return
    }

    setMode('list')
    setEditingId(null)
    load()
  }

  async function deleteNotice(id: string) {
    if (!window.confirm('정말 이 공지사항을 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없습니다.')) return

    setListError('')
    setDeletingId(id)
    const { error } = await supabase.from('notices').delete().eq('id', id)
    setDeletingId(null)

    if (error) {
      setListError('삭제 중 오류가 발생했습니다: ' + error.message)
      return
    }

    setNotices((prev) => prev.filter((n) => n.id !== id))
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>공지사항 관리</div>
      <div style={styles.sectionSub}>서비스 공지사항을 작성·수정·삭제하세요.</div>

      {mode === 'list' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Button variant="primary" onClick={startCreate}>
              새 공지 작성
            </Button>
          </div>

          {listError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{listError}</div>}

          {notices.length === 0 ? (
            <Card style={styles.emptyState}>
              <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>등록된 공지사항이 없어요</h3>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflowX: 'auto' }}>
              <table style={styles.historyTable}>
                <thead>
                  <tr>
                    <th style={styles.th}>제목</th>
                    <th style={styles.th}>게시여부</th>
                    <th style={styles.th}>고정여부</th>
                    <th style={styles.th}>작성일</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map((n) => (
                    <tr key={n.id}>
                      <td style={styles.td}>{n.title}</td>
                      <td style={styles.td}>
                        <Badge style={n.is_published ? { background: colors.goodBg, color: colors.good } : { background: colors.warnBg, color: colors.warn }}>
                          {n.is_published ? '게시중' : '비공개'}
                        </Badge>
                      </td>
                      <td style={styles.td}>
                        {n.is_pinned ? <Badge style={{ background: colors.paper2, color: colors.navy }}>고정</Badge> : '-'}
                      </td>
                      <td style={styles.td}>{formatDate(n.created_at)}</td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button variant="secondary" size="sm" onClick={() => startEdit(n)}>
                            수정
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            style={{ color: colors.warn, border: `1px solid ${colors.warn}` }}
                            disabled={deletingId === n.id}
                            onClick={() => deleteNotice(n.id)}
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {mode === 'form' && (
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 16 }}>
            {editingId ? '공지 수정' : '새 공지 작성'}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>제목 *</label>
            <Input value={form.title} onChange={(e) => update('title', e.target.value)} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>내용 *</label>
            <Textarea rows={10} value={form.content} onChange={(e) => update('content', e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isPinned} onChange={(e) => update('isPinned', e.target.checked)} />
              상단 고정
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isPublished} onChange={(e) => update('isPublished', e.target.checked)} />
              게시함
            </label>
          </div>

          {saveError && <div style={{ ...styles.errorBox, marginBottom: 16 }}>{saveError}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? '저장 중...' : editingId ? '수정 저장' : '등록'}
            </Button>
            <Button variant="secondary" onClick={cancelForm} disabled={saving}>
              취소
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
