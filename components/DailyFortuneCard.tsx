'use client'

import { useEffect, useState } from 'react'
import {
  Compass,
  Coins,
  Handshake,
  Sprout,
  Swords,
  Link2,
  Zap,
  CircleEqual,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Card from './ui/Card'
import Badge from './ui/Badge'
import IconCircle from './ui/IconCircle'

type Tone = '길' | '중' | '흉'
type RelationType = '생' | '극' | '합' | '충' | '비화'
type FortuneCard = { category: string; content: string; tone: Tone }

type LoadState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'needs-profile' }
  | { status: 'error'; message: string }
  | { status: 'ready'; date: string; cards: FortuneCard[]; premiumTeaser: string | null; relationType: RelationType }

const TONE_LABEL: Record<Tone, string> = { '길': '길', '중': '중', '흉': '주의' }
const TONE_VARIANT: Record<Tone, 'success' | 'neutral' | 'danger'> = { '길': 'success', '중': 'neutral', '흉': 'danger' }
const TONE_BORDER_COLOR: Record<Tone, string> = {
  '길': 'var(--color-success)',
  '중': 'var(--color-neutral-tone)',
  '흉': 'var(--color-danger)',
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  '사업운': Compass,
  '매출운': Coins,
  '거래운': Handshake,
}

const RELATION_INFO: Record<
  RelationType,
  { hanja: string; description: string; color: string; Icon: LucideIcon }
> = {
  '생': { hanja: '生', description: '도움을 주고받는 날', color: 'var(--color-success)', Icon: Sprout },
  '극': { hanja: '剋', description: '충돌을 조심할 날', color: 'var(--color-danger)', Icon: Swords },
  '합': { hanja: '合', description: '화합이 잘 되는 날', color: 'var(--color-accent)', Icon: Link2 },
  '충': { hanja: '沖', description: '변수가 많은 날', color: 'var(--color-danger)', Icon: Zap },
  '비화': { hanja: '比', description: '평소와 같은 날', color: 'var(--color-neutral-tone)', Icon: CircleEqual },
}

const RELATION_DIRECTION: Record<RelationType, string> = {
  '생': '동쪽',
  '극': '남쪽',
  '합': '중앙',
  '충': '서쪽',
  '비화': '북쪽',
}

const LUCKY_COLORS: { name: string; hex: string }[] = [
  { name: '레드', hex: '#c23b3b' },
  { name: '오렌지', hex: '#f2891d' },
  { name: '옐로우', hex: '#d4a017' },
  { name: '그린', hex: '#0b7a6d' },
  { name: '블루', hex: '#14315e' },
]

// 날짜(YYYY-MM-DD) 숫자 합 % 5로 색을 고른다 — 같은 날짜엔 항상 같은 색.
function pickLuckyColor(dateStr: string) {
  const digitSum = dateStr.replace(/\D/g, '').split('').reduce((sum, d) => sum + Number(d), 0)
  return LUCKY_COLORS[digitSum % LUCKY_COLORS.length]
}

// 로그인한 사용자의 오늘의 운세(사업운/매출운/거래운)를 보여주는 카드.
// /api/fortune/daily는 다른 라우트 핸들러(app/api/ai-parse-order)와 같은
// 방식으로 세션 쿠키가 아니라 Authorization: Bearer 토큰으로 인증하므로
// 여기서도 supabase.auth.getSession()의 access_token을 그대로 실어 보낸다.
export default function DailyFortuneCard() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [showPremiumNotice, setShowPremiumNotice] = useState(false)

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

        setState({
          status: 'ready',
          date: json.date,
          cards: json.cards as FortuneCard[],
          premiumTeaser: json.premiumTeaser ?? null,
          relationType: json.relationType as RelationType,
        })
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

  const relation = state.status === 'ready' ? RELATION_INFO[state.relationType] : null
  const luckyColor = state.status === 'ready' ? pickLuckyColor(state.date) : null

  return (
    <>
      <div className="fortune-marquee" style={styles.marqueeWrap}>
        <Sparkles className="fortune-marquee-icon" size={14} color="var(--color-accent)" style={styles.marqueeIcon} />
        <div className="fortune-marquee-viewport" style={styles.marqueeViewport}>
          <span className="fortune-marquee-track" style={styles.marqueeTrack}>
            매일매일 사장님의 오늘의 운세를 제공합니다
          </span>
        </div>
      </div>

      <Card style={styles.card}>
        {state.status !== 'ready' && (
          <div style={styles.header}>
            <span style={styles.title}>오늘의 운세</span>
          </div>
        )}

        {state.status === 'ready' && relation && luckyColor && (
          <div style={styles.energyHeader}>
            <IconCircle size={48}>
              <relation.Icon size={22} color={relation.color} />
            </IconCircle>
            <div style={styles.energyBody}>
              <span style={styles.date}>{state.date}</span>
              <p style={styles.energyHeadline}>
                오늘은 <b style={{ color: relation.color }}>{state.relationType}({relation.hanja})</b>의 기운입니다
              </p>
              <p style={styles.energyDesc}>{relation.description}</p>
              <p style={styles.luckyFlavor}>
                오늘의 행운 컬러{' '}
                <span style={{ ...styles.luckyDot, background: luckyColor.hex }} aria-hidden="true" />
                {luckyColor.name} · 행운의 방향 {RELATION_DIRECTION[state.relationType]}
              </p>
            </div>
          </div>
        )}

        {state.status === 'needs-profile' && (
          <p style={styles.notice}>
            사주 프로필을 등록하면 오늘의 운세를 확인할 수 있어요.{' '}
            <a href="/fortune/register" style={styles.noticeLink}>
              지금 등록하기 ›
            </a>
          </p>
        )}

        {state.status === 'error' && <p style={styles.notice}>{state.message}</p>}

        {state.status === 'ready' && (
          <div style={styles.grid}>
            {state.cards.map((c) => {
              const Icon = CATEGORY_ICON[c.category]
              return (
                <div key={c.category} style={{ ...styles.item, borderLeftColor: TONE_BORDER_COLOR[c.tone] }}>
                  <div style={styles.itemHead}>
                    <div style={styles.itemTitleRow}>
                      {Icon && (
                        <IconCircle size={28}>
                          <Icon size={14} color="var(--color-accent)" />
                        </IconCircle>
                      )}
                      <b style={styles.category}>{c.category}</b>
                    </div>
                    <Badge variant={TONE_VARIANT[c.tone]}>{TONE_LABEL[c.tone]}</Badge>
                  </div>
                  <p style={styles.content}>{c.content}</p>
                </div>
              )
            })}
          </div>
        )}

        {state.status === 'ready' && state.premiumTeaser && (
          <div style={styles.premiumSection}>
            <div style={styles.premiumHeader}>
              <span style={styles.lockIcon} aria-hidden="true">🔒</span>
              <b style={styles.premiumTitle}>오늘의 심화 리포트</b>
            </div>
            <p style={styles.premiumTeaser}>{state.premiumTeaser}...</p>
            <button
              type="button"
              style={styles.premiumButton}
              onClick={() => setShowPremiumNotice(true)}
            >
              심화 리포트 보기
            </button>
            {showPremiumNotice && (
              <p style={styles.premiumNotice}>결제 기능은 준비 중입니다.</p>
            )}
          </div>
        )}
      </Card>
    </>
  )
}

const styles: { [k: string]: React.CSSProperties } = {
  marqueeWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    padding: '7px 12px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-accent-bg)',
  },
  marqueeIcon: { flexShrink: 0 },
  marqueeViewport: { flex: 1, minWidth: 0 },
  marqueeTrack: { fontSize: 12, fontWeight: 500, color: 'var(--color-primary)' },

  card: { marginBottom: 18 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--color-text)' },
  date: { fontSize: 11.5, color: 'var(--color-text-muted)' },
  notice: { fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 },
  noticeLink: { color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'underline' },

  energyHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 14,
    borderBottom: '1px solid var(--color-border)',
  },
  energyBody: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  energyHeadline: { fontSize: 16.5, fontWeight: 700, color: 'var(--color-text)', margin: '2px 0 0' },
  energyDesc: { fontSize: 12.5, color: 'var(--color-text-secondary)', margin: 0 },
  luckyFlavor: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11.5,
    color: 'var(--color-text-muted)',
    margin: '4px 0 0',
  },
  luckyDot: {
    display: 'inline-block',
    width: 9,
    height: 9,
    borderRadius: '50%',
    marginRight: 2,
  },

  grid: { display: 'grid', gap: 10 },
  item: {
    borderLeft: '3px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface-muted)',
    padding: '10px 12px',
  },
  itemHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemTitleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  category: { fontSize: 13, color: 'var(--color-text)' },
  content: { fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 },

  premiumSection: {
    marginTop: 14,
    paddingTop: 14,
    paddingBottom: 4,
    borderTop: '1px solid var(--color-border)',
  },
  premiumHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 },
  lockIcon: { fontSize: 13 },
  premiumTitle: { fontSize: 13, color: 'var(--color-text)' },
  premiumTeaser: {
    fontSize: 12.5,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    margin: '0 0 12px',
    padding: '12px 14px',
    borderRadius: 'var(--radius-sm)',
    border: '1px dashed var(--color-border-strong)',
    background:
      'repeating-linear-gradient(135deg, var(--color-surface-muted), var(--color-surface-muted) 10px, var(--color-accent-bg) 10px, var(--color-accent-bg) 20px)',
    filter: 'blur(6px)',
    userSelect: 'none',
  },
  premiumButton: {
    width: '100%',
    padding: '10px 0',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--color-primary)',
    background: 'transparent',
    border: '1px solid var(--color-primary)',
    borderRadius: 8,
    cursor: 'pointer',
  },
  premiumNotice: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    margin: '8px 0 0',
    textAlign: 'center',
  },
}
