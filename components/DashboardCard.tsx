'use client'

import { ReactNode } from 'react'
import Card from './ui/Card'

type Props = {
  title: string
  href?: string
  children: ReactNode
}

// 마이페이지/파트너 대시보드 카드 그리드의 공통 카드 껍데기. href가 있으면
// 카드 전체가 클릭 가능한 링크가 된다(쿠팡 윙 판매자센터 스타일처럼 카드
// 클릭 시 관련 상세 화면으로 이동).
export default function DashboardCard({ title, href, children }: Props) {
  const body = (
    <Card style={styles.card}>
      <div style={styles.title}>{title}</div>
      {children}
    </Card>
  )

  if (!href) return body
  return (
    <a href={href} style={styles.link}>
      {body}
    </a>
  )
}

const styles: { [k: string]: React.CSSProperties } = {
  link: { textDecoration: 'none', color: 'inherit', display: 'block' },
  card: { padding: 20, height: '100%', boxSizing: 'border-box' },
  title: { fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 14 },
}
