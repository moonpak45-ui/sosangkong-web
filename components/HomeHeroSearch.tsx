'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'
import Card from './ui/Card'
import Button from './ui/Button'
import Select from './ui/Select'
import Input from './ui/Input'
import RoleAwareCta from './RoleAwareCta'

type SimpleCategory = { id: string; name: string }

const STATIC_STATS = [
  { num: '312개', label: '등록 공급업체 (전국)' },
  { num: '468곳', label: '이용 중인 소상공인 사업장' },
  { num: '96%', label: '평균 조건 매칭 정확도' },
  { num: '92%', label: '첫 거래 후 재거래율' },
]

const POPULAR_TAGS = ['당일배송', '소량주문가능', '신용거래', '냉장물류', '정기계약할인']

// 메인 홈 상단(히어로+검색바+통계)을 하나로 묶은 컴포넌트. 나중에 /search
// 상단에도 그대로 재사용할 수 있도록, 특정 페이지의 로컬 CSS/커스텀 변수에
// 기대지 않고 tokens.css 브랜드 변수(--color-primary/--color-accent 등)만
// 인라인 스타일로 사용함.
export default function HomeHeroSearch() {
  const router = useRouter()
  const [categories, setCategories] = useState<SimpleCategory[]>([])
  const [category, setCategory] = useState('')
  const [region, setRegion] = useState('')

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setCategories(data as SimpleCategory[])
      })
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (region) params.set('region', region)
    router.push(`/search?${params.toString()}`)
  }

  return (
    <header style={styles.hero}>
      <div style={styles.wrap}>
        <div style={styles.topRow}>
          <div style={styles.headlineCol}>
            <div style={styles.eyebrow}>
              <span style={styles.eyebrowDash} />
              <span style={styles.eyebrowText}>전국 소상공인을 위한 납품 파트너 매칭</span>
            </div>
            <h1 style={styles.h1}>
              거래처를 찾는 게 아니라,
              <br />
              <em style={styles.em}>나에게 맞는 파트너</em>를 찾으세요
            </h1>
            <p style={styles.sub}>
              지역·품목·배송시간·온도조건까지 맞춰 공급업체를 비교하고, 여러 곳에 동시에 견적을 요청하세요.
              거래처에 문제가 생기면 대체 업체도 바로 추천해드립니다.
            </p>
            <div style={styles.ctaRow}>
              <RoleAwareCta targetRole="buyer" variant="primary">
                소상공인으로 시작하기
              </RoleAwareCta>
              <RoleAwareCta targetRole="partner" variant="outline-light">
                공급업체로 등록하기
              </RoleAwareCta>
            </div>
          </div>

          <div style={styles.statsCol}>
            {STATIC_STATS.map((s) => (
              <div key={s.label} style={styles.statCell}>
                <div style={styles.statNum}>{s.num}</div>
                <div style={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <Card style={styles.searchCard}>
          <form onSubmit={handleSubmit} style={styles.searchForm}>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>카테고리</label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">전체</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>지역</label>
              <Input type="text" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="예) 서울 마포구" />
            </div>
            <Button type="submit" variant="primary" style={{ padding: '0 28px', height: 44, flexShrink: 0 }}>
              검색
            </Button>
          </form>
        </Card>

        <div style={styles.tagRow}>
          <span style={styles.tagRowLabel}>인기조건</span>
          {POPULAR_TAGS.map((t) => (
            <span key={t} style={styles.tag}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </header>
  )
}

const styles: { [k: string]: React.CSSProperties } = {
  hero: {
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
    padding: '40px 0 32px',
  },
  wrap: { maxWidth: 1180, margin: '0 auto', padding: '0 32px' },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 40, flexWrap: 'wrap' },
  headlineCol: { flex: '1 1 480px', maxWidth: 640 },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 },
  eyebrowDash: { width: 28, height: 2, background: 'var(--color-accent)' },
  eyebrowText: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 500 },
  h1: {
    fontSize: 34,
    lineHeight: 1.34,
    color: 'var(--color-on-primary)',
    letterSpacing: '-0.5px',
    margin: 0,
    fontWeight: 700,
    fontFamily: "'Noto Serif KR', serif",
  },
  em: { fontStyle: 'normal', color: 'var(--color-accent)' },
  sub: { marginTop: 16, fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', maxWidth: '50ch' },
  ctaRow: { display: 'flex', gap: 14, marginTop: 24, flexWrap: 'wrap' },
  statsCol: { display: 'flex', gap: 20, flexWrap: 'wrap', paddingTop: 4 },
  statCell: { textAlign: 'center', minWidth: 92 },
  statNum: { fontSize: 22, fontWeight: 700, color: 'var(--color-on-primary)', fontFamily: "'Noto Serif KR', serif" },
  statLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 4, maxWidth: 112, wordBreak: 'keep-all' },
  searchCard: { marginTop: 28, padding: 20, boxShadow: '0 16px 40px rgba(5,20,40,0.25)' },
  searchForm: { display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' },
  field: { flex: 1, minWidth: 180 },
  fieldLabel: { fontSize: 12.5, color: 'var(--color-text-secondary)', fontWeight: 500, marginBottom: 6, display: 'block' },
  tagRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' },
  tagRowLabel: { fontSize: 12.5, color: 'rgba(255,255,255,0.6)', fontWeight: 500, marginRight: 4 },
  tag: {
    fontSize: 12.5,
    color: 'var(--color-on-primary)',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.25)',
    padding: '6px 14px',
    borderRadius: 'var(--radius-pill)',
  },
}
