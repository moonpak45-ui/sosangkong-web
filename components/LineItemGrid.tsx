'use client'

import { useEffect, useRef } from 'react'
import { colors } from '../app/partner/_shared'

export type GridRow = {
  item_name: string
  quantity: string
  unit: string
  unit_price: string
  is_credit: boolean
}

export function emptyGridRow(): GridRow {
  return { item_name: '', quantity: '', unit: '개', unit_price: '', is_credit: false }
}

function hasAnyValue(r: GridRow): boolean {
  return Boolean(
    r.item_name.trim() || r.quantity.trim() || r.unit_price.trim() || r.is_credit || (r.unit.trim() && r.unit.trim() !== '개')
  )
}

type Props<T extends GridRow> = {
  rows: T[]
  onRowsChange: (rows: T[]) => void
  onSave: () => void
  saving?: boolean
  makeEmptyRow?: () => T
  rowStyle?: (row: T, index: number) => React.CSSProperties | undefined
  renderRowBadge?: (row: T, index: number) => React.ReactNode
}

// 마켓봄류 유통관리 프로그램처럼 "표 안에서 여러 행을 한 번에" 입력하는
// 그리드. 순수 UI/UX 컴포넌트 — 실제 저장(deal_line_items insert)은
// onSave 콜백으로 호출부(수동 입력/AI 빠른입력 둘 다)에 맡기고, 이
// 컴포넌트는 행 상태 편집 + 키보드 내비게이션만 담당함:
// - Tab/Shift+Tab: <table> 안 <input>이 자연스러운 DOM 순서(행→열)로
//   배치돼 있어 브라우저 기본 동작만으로 "다음 셀로 이동"이 이미 됨(별도
//   구현 불필요) — 삭제 버튼은 tabIndex=-1로 빼서 흐름을 안 끊게 함.
// - Enter: 같은 열의 다음 행으로 이동(요청 스펙 "Tab/Enter로 다음 셀/다음
//   행"). 마지막 행에서 Enter를 누르면 새 행을 만들고 그리로 이동.
// - Insert 키 또는 "+ 행 추가" 버튼: 맨 끝에 빈 행 추가.
// - Ctrl+S 또는 F8: onSave 호출(그리드 안 아무 셀에 포커스가 있을 때).
// - 마지막 행에 뭔가 입력되면 자동으로 빈 행을 하나 더 붙임(엑셀처럼
//   항상 입력 가능한 빈 줄이 마지막에 있도록) — 그래서 Enter가 항상
//   "다음 행"을 가질 수 있음.
export default function LineItemGrid<T extends GridRow>({
  rows,
  onRowsChange,
  onSave,
  saving,
  makeEmptyRow,
  rowStyle,
  renderRowBadge,
}: Props<T>) {
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([])
  const pendingFocus = useRef<{ row: number; col: number } | null>(null)

  const newRow = () => (makeEmptyRow ? makeEmptyRow() : (emptyGridRow() as T))

  useEffect(() => {
    if (pendingFocus.current) {
      const { row, col } = pendingFocus.current
      pendingFocus.current = null
      inputRefs.current[row]?.[col]?.focus()
    }
  }, [rows])

  function setCellRef(row: number, col: number) {
    return (el: HTMLInputElement | null) => {
      if (!inputRefs.current[row]) inputRefs.current[row] = []
      inputRefs.current[row][col] = el
    }
  }

  function updateRow(index: number, patch: Partial<GridRow>) {
    const next = rows.map((r, i) => (i === index ? ({ ...r, ...patch } as T) : r))
    const last = next[next.length - 1]
    if (index === next.length - 1 && hasAnyValue(last)) {
      next.push(newRow())
    }
    onRowsChange(next)
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return
    onRowsChange(rows.filter((_, i) => i !== index))
  }

  function addRow() {
    const next = [...rows, newRow()]
    onRowsChange(next)
    pendingFocus.current = { row: next.length - 1, col: 0 }
  }

  function handleCellKeyDown(e: React.KeyboardEvent, row: number, col: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (row === rows.length - 1) {
        const next = [...rows, newRow()]
        onRowsChange(next)
        pendingFocus.current = { row: row + 1, col }
      } else {
        inputRefs.current[row + 1]?.[col]?.focus()
      }
    } else if (e.key === 'Insert') {
      e.preventDefault()
      addRow()
    }
  }

  function handleContainerKeyDown(e: React.KeyboardEvent) {
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') || e.key === 'F8') {
      e.preventDefault()
      if (!saving) onSave()
    }
  }

  return (
    <div onKeyDown={handleContainerKeyDown} className="line-item-grid">
      <style>{`
        .line-item-grid input[type="text"]:focus,
        .line-item-grid input[type="number"]:focus {
          background: #FFFBEA;
          outline: 1.5px solid ${colors.amber};
          border-radius: 4px;
        }
        .line-item-grid tbody tr:hover {
          background: ${colors.paper2};
        }
      `}</style>
      <div style={gridStyles.scrollWrap}>
        <table style={gridStyles.table}>
          <thead>
            <tr>
              <th style={{ ...gridStyles.th, width: '32%' }}>품목명</th>
              <th style={{ ...gridStyles.th, width: '14%' }}>수량</th>
              <th style={{ ...gridStyles.th, width: '14%' }}>단위</th>
              <th style={{ ...gridStyles.th, width: '18%' }}>단가</th>
              <th style={{ ...gridStyles.th, width: '10%' }}>외상</th>
              <th style={{ ...gridStyles.th, width: '12%' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={rowStyle?.(row, i)}>
                <td style={gridStyles.td}>
                  <input
                    ref={setCellRef(i, 0)}
                    type="text"
                    value={row.item_name}
                    onChange={(e) => updateRow(i, { item_name: e.target.value })}
                    onKeyDown={(e) => handleCellKeyDown(e, i, 0)}
                    style={gridStyles.cellInput}
                    placeholder="품목명"
                  />
                  {renderRowBadge?.(row, i)}
                </td>
                <td style={gridStyles.td}>
                  <input
                    ref={setCellRef(i, 1)}
                    type="number"
                    value={row.quantity}
                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                    onKeyDown={(e) => handleCellKeyDown(e, i, 1)}
                    style={{ ...gridStyles.cellInput, textAlign: 'right' }}
                    placeholder="0"
                  />
                </td>
                <td style={gridStyles.td}>
                  <input
                    ref={setCellRef(i, 2)}
                    type="text"
                    value={row.unit}
                    onChange={(e) => updateRow(i, { unit: e.target.value })}
                    onKeyDown={(e) => handleCellKeyDown(e, i, 2)}
                    style={gridStyles.cellInput}
                  />
                </td>
                <td style={gridStyles.td}>
                  <input
                    ref={setCellRef(i, 3)}
                    type="number"
                    value={row.unit_price}
                    onChange={(e) => updateRow(i, { unit_price: e.target.value })}
                    onKeyDown={(e) => handleCellKeyDown(e, i, 3)}
                    style={{ ...gridStyles.cellInput, textAlign: 'right' }}
                    placeholder="0"
                  />
                </td>
                <td style={{ ...gridStyles.td, textAlign: 'center' }}>
                  <input
                    ref={setCellRef(i, 4)}
                    type="checkbox"
                    checked={row.is_credit}
                    onChange={(e) => updateRow(i, { is_credit: e.target.checked })}
                    onKeyDown={(e) => handleCellKeyDown(e, i, 4)}
                  />
                </td>
                <td style={{ ...gridStyles.td, textAlign: 'center' }}>
                  {rows.length > 1 && (
                    <button type="button" tabIndex={-1} onClick={() => removeRow(i)} style={gridStyles.removeBtn}>
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={gridStyles.toolbar}>
        <button type="button" tabIndex={-1} onClick={addRow} style={gridStyles.addBtn}>
          + 행 추가 (Insert)
        </button>
        <button type="button" tabIndex={-1} onClick={onSave} disabled={saving} style={gridStyles.saveBtn}>
          {saving ? '저장 중...' : '저장 (Ctrl+S / F8)'}
        </button>
      </div>
    </div>
  )
}

const gridStyles: { [k: string]: React.CSSProperties } = {
  scrollWrap: { overflowX: 'auto', border: `1px solid ${colors.line}`, borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 520 },
  th: {
    background: colors.paper2,
    fontSize: 11.5,
    color: colors.muted,
    fontWeight: 700,
    padding: '8px 8px',
    textAlign: 'left',
    borderBottom: `1px solid ${colors.line}`,
  },
  td: { padding: '4px 6px', borderBottom: `1px solid ${colors.paper2}`, borderRight: `1px solid ${colors.paper2}` },
  cellInput: {
    width: '100%',
    border: '1px solid transparent',
    borderRadius: 4,
    padding: '7px 8px',
    fontSize: 13,
    color: colors.ink,
    background: 'transparent',
  },
  removeBtn: { border: 'none', background: 'none', color: colors.warn, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 10, flexWrap: 'wrap' },
  addBtn: {
    border: `1.5px solid ${colors.line}`,
    background: colors.white,
    color: colors.navy,
    borderRadius: 6,
    padding: '9px 14px',
    fontSize: 12.8,
    fontWeight: 700,
    cursor: 'pointer',
  },
  saveBtn: {
    border: 'none',
    background: colors.amber,
    color: colors.deep,
    borderRadius: 6,
    padding: '9px 18px',
    fontSize: 12.8,
    fontWeight: 700,
    cursor: 'pointer',
  },
}
