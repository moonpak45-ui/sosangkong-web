'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Button from '../../components/ui/Button'

type Category = '이용문의' | '거래문의' | '수수료문의' | '기술오류' | '기타'
const CATEGORIES: Category[] = ['이용문의', '거래문의', '수수료문의', '기술오류', '기타']

// 로그인 상태면 inquiries.user_id를 같이 저장하지만(본인 문의 내역 조회용),
// 비로그인이어도 문의 등록은 가능해야 해서(inquiries_insert_anyone 정책,
// 20260929000000_inquiries_and_notices.sql) 로그인 여부로 폼 자체를 막지 않는다.
export default function ContactPage() {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [category, setCategory] = useState<Category>('기타')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitted(false)

    if (!name.trim() || !contact.trim() || !title.trim() || !content.trim()) {
      setError('이름, 연락처, 제목, 내용을 모두 입력해주세요.')
      return
    }

    setSubmitting(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const { error: insertError } = await supabase.from('inquiries').insert({
      user_id: session?.user.id ?? null,
      name: name.trim(),
      contact: contact.trim(),
      category,
      title: title.trim(),
      content: content.trim(),
    })

    setSubmitting(false)

    if (insertError) {
      setError('문의 접수 중 오류가 발생했습니다: ' + insertError.message)
      return
    }

    setSubmitted(true)
    setName('')
    setContact('')
    setCategory('기타')
    setTitle('')
    setContent('')
  }

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>문의하기</h1>
      <p style={styles.lead}>서비스 이용 중 궁금한 점이나 불편사항을 남겨주시면 확인 후 답변드리겠습니다.</p>

      <Card style={styles.card}>
        {submitted && <div style={styles.successBox}>문의가 접수되었습니다. 확인 후 안내드릴게요.</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>이름 *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>연락처 *</label>
              <Input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="이메일 또는 전화번호"
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>문의 유형 *</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>제목 *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>내용 *</label>
            <Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>

          <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%', marginTop: 6 }}>
            {submitting ? '접수 중...' : '문의 접수하기'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

const colors = {
  deep: '#0A1E3D',
  ink: '#16233B',
  line: '#D9E3EA',
  muted: '#5B6B79',
  good: '#0B7A6D',
  goodBg: '#E3F4F0',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 640, margin: '0 auto', padding: '48px 24px 90px' },
  h1: { fontSize: 24, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: '0 0 8px' },
  lead: { fontSize: 14, color: colors.muted, margin: '0 0 24px' },
  card: { padding: 26 },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12.8, color: colors.muted, fontWeight: 600, marginBottom: 7 },
  successBox: {
    background: colors.goodBg,
    color: colors.good,
    borderRadius: 7,
    padding: '10px 12px',
    fontSize: 12.5,
    marginBottom: 18,
  },
  errorBox: { background: '#FDECEC', color: '#B3261E', borderRadius: 7, padding: '10px 12px', fontSize: 12.5, marginBottom: 18 },
}
