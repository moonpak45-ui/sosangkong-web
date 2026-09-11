'use client'

import { useState } from 'react'
import type { MonthlyAmount } from '../lib/deals/monthlyAmounts'

type Props = {
  data: MonthlyAmount[]
  color?: string
}

const WIDTH = 560
const HEIGHT = 176
const PAD_LEFT = 44
const PAD_RIGHT = 8
const PAD_TOP = 10
const PAD_BOTTOM = 24

function niceMax(value: number): number {
  if (value <= 0) return 10
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const normalized = value / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function formatAxisValue(value: number): string {
  if (value >= 100000000) return `${Math.round(value / 100000000)}억`
  if (value >= 10000) return `${Math.round(value / 10000)}만`
  return value.toLocaleString('ko-KR')
}

// dataviz 스킬 마크 스펙 준수: 단일 시리즈(범례 불필요) 막대, <=24px 두께,
// 4px 라운드 데이터-엔드, 베이스라인은 각짐, 인접 막대 사이 최소 2px 간격,
// 막대보다 넓은 히트 영역 + 호버 툴팁, 회색 헤어라인 그리드. 접근성을 위해
// "표로 보기" 토글로 동일 데이터를 테이블로도 제공.
export default function MonthlyAmountChart({ data, color = 'var(--color-primary)' }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const max = niceMax(Math.max(...data.map((d) => d.amount), 1))
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const step = data.length > 0 ? plotWidth / data.length : plotWidth
  const barWidth = Math.max(4, Math.min(24, step - 6))

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: PAD_TOP + plotHeight * (1 - t),
    value: Math.round(max * t),
  }))

  const hovered = hoverIndex !== null ? data[hoverIndex] : null
  const hoveredLeftPct = hoverIndex !== null ? ((PAD_LEFT + hoverIndex * step + step / 2) / WIDTH) * 100 : 0

  return (
    <div>
      <div style={styles.toggleRow}>
        <button type="button" onClick={() => setShowTable((s) => !s)} style={styles.toggleBtn}>
          {showTable ? '차트로 보기' : '표로 보기'}
        </button>
      </div>

      {showTable ? (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>월</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>금액</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.monthKey}>
                <td style={styles.td}>{d.label}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{d.amount.toLocaleString('ko-KR')}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {gridTicks.map((g) => (
              <g key={g.value}>
                <line
                  x1={PAD_LEFT}
                  x2={WIDTH - PAD_RIGHT}
                  y1={g.y}
                  y2={g.y}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
                <text x={PAD_LEFT - 6} y={g.y + 3} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">
                  {formatAxisValue(g.value)}
                </text>
              </g>
            ))}

            {data.map((d, i) => {
              const barHeight = max > 0 ? Math.max((d.amount / max) * plotHeight, d.amount > 0 ? 2 : 0) : 0
              const x = PAD_LEFT + i * step + (step - barWidth) / 2
              const y = PAD_TOP + plotHeight - barHeight
              const isHover = hoverIndex === i
              return (
                <g key={d.monthKey}>
                  <rect x={x} y={y} width={barWidth} height={barHeight} rx={4} fill={color} opacity={isHover ? 1 : 0.82} />
                  <rect
                    x={PAD_LEFT + i * step}
                    y={PAD_TOP}
                    width={step}
                    height={plotHeight}
                    fill="transparent"
                    onMouseEnter={() => setHoverIndex(i)}
                    onMouseLeave={() => setHoverIndex(null)}
                    onFocus={() => setHoverIndex(i)}
                    onBlur={() => setHoverIndex(null)}
                    tabIndex={0}
                  />
                  <text
                    x={PAD_LEFT + i * step + step / 2}
                    y={HEIGHT - PAD_BOTTOM + 15}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill="var(--color-text-muted)"
                  >
                    {d.label}
                  </text>
                </g>
              )
            })}
          </svg>

          {hovered && (
            <div style={{ ...styles.tooltip, left: `${hoveredLeftPct}%` }}>
              <b>{hovered.label}</b> {hovered.amount.toLocaleString('ko-KR')}원
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const styles: { [k: string]: React.CSSProperties } = {
  toggleRow: { display: 'flex', justifyContent: 'flex-end', marginBottom: 6 },
  toggleBtn: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    background: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '3px 9px',
    cursor: 'pointer',
  },
  tooltip: {
    position: 'absolute',
    top: 0,
    transform: 'translateX(-50%)',
    background: 'var(--color-text)',
    color: 'var(--color-on-primary)',
    fontSize: 11.5,
    padding: '4px 9px',
    borderRadius: 6,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    fontSize: 11,
    color: 'var(--color-text-muted)',
    padding: '6px 4px',
    borderBottom: '1px solid var(--color-border)',
  },
  td: { fontSize: 12.5, color: 'var(--color-text)', padding: '6px 4px', borderBottom: '1px solid var(--color-border)' },
}
