'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles } from '../_shared'
import { usePartnerLayout } from '../PartnerLayoutContext'
import { WEEKDAY_LABELS } from '../../../lib/orderGroups'

type GroupRow = {
  id: string
  group_name: string
  delivery_days: number[]
  cutoff_time: string
  allow_after_cutoff: boolean
}

type BuyerRow = {
  buyer_id: string
  business_name: string
}

const EMPTY_FORM = { groupName: '', deliveryDays: new Set<number>(), cutoffTime: '17:00', allowAfterCutoff: false }

// "거래처 주문그룹 관리" - 배송요일+주문마감시간을 묶은 그룹을 만들고,
// 실제 거래한 적 있는 거래처(buyer)를 그룹에 배정하는 화면. 배정 정보는
// deal_line_items 저장 시점(거래전표 등록/AI 빠른입력)에
// lib/orderGroups.ts의 fetchOrderGroupForBuyer()로 조회돼 예상 배송일
// 계산에 쓰임 - 이 화면 자체는 그 계산을 하지 않고 그룹/배정 CRUD만 담당.
export default function PartnerOrderGroupsPage() {
  const { partner } = usePartnerLayout()

  const [groups, setGroups] = useState<GroupRow[]>([])
  const [buyers, setBuyers] = useState<BuyerRow[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({}) // buyer_id -> order_group_id
  const [loading, setLoading] = useState(true)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [assignError, setAssignError] = useState('')

  async function loadGroups() {
    const { data } = await supabase
      .from('partner_order_groups')
      .select('id, group_name, delivery_days, cutoff_time, allow_after_cutoff')
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: true })
    setGroups((data || []) as GroupRow[])
  }

  async function loadBuyersAndAssignments() {
    const [{ data: dealRows }, { data: assignRows }] = await Promise.all([
      supabase
        .from('deals')
        .select('buyer_id, buyer_profiles ( business_name )')
        .eq('partner_id', partner.id),
      supabase.from('partner_buyer_order_groups').select('buyer_id, order_group_id').eq('partner_id', partner.id),
    ])

    const buyerMap = new Map<string, string>()
    ;(dealRows || []).forEach((r) => {
      const bp = r.buyer_profiles as unknown as { business_name: string } | null
      if (r.buyer_id && !buyerMap.has(r.buyer_id)) buyerMap.set(r.buyer_id, bp?.business_name || '-')
    })
    setBuyers(
      Array.from(buyerMap.entries())
        .map(([buyer_id, business_name]) => ({ buyer_id, business_name }))
        .sort((a, b) => a.business_name.localeCompare(b.business_name))
    )

    const assignMap: Record<string, string> = {}
    ;(assignRows || []).forEach((r) => {
      assignMap[r.buyer_id as string] = r.order_group_id as string
    })
    setAssignments(assignMap)
  }

  useEffect(() => {
    Promise.all([loadGroups(), loadBuyersAndAssignments()]).then(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner.id])

  function toggleDay(day: number) {
    setForm((prev) => {
      const next = new Set(prev.deliveryDays)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return { ...prev, deliveryDays: next }
    })
  }

  function startEdit(g: GroupRow) {
    setEditingId(g.id)
    setForm({
      groupName: g.group_name,
      deliveryDays: new Set(g.delivery_days),
      cutoffTime: g.cutoff_time.slice(0, 5),
      allowAfterCutoff: g.allow_after_cutoff,
    })
    setFormError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function saveGroup() {
    setFormError('')

    if (!form.groupName.trim()) {
      setFormError('그룹명을 입력해주세요.')
      return
    }
    if (form.deliveryDays.size === 0) {
      setFormError('배송 요일을 1개 이상 선택해주세요.')
      return
    }
    if (!form.cutoffTime) {
      setFormError('주문 마감시간을 입력해주세요.')
      return
    }

    setSaving(true)
    const payload = {
      partner_id: partner.id,
      group_name: form.groupName.trim(),
      delivery_days: Array.from(form.deliveryDays).sort((a, b) => a - b),
      cutoff_time: `${form.cutoffTime}:00`,
      allow_after_cutoff: form.allowAfterCutoff,
    }

    const { error } = editingId
      ? await supabase.from('partner_order_groups').update(payload).eq('id', editingId)
      : await supabase.from('partner_order_groups').insert(payload)

    setSaving(false)

    if (error) {
      setFormError('주문그룹 저장 중 오류가 발생했습니다: ' + error.message)
      return
    }

    cancelEdit()
    loadGroups()
  }

  async function deleteGroup(g: GroupRow) {
    if (!window.confirm(`"${g.group_name}" 그룹을 삭제하시겠습니까? 이 그룹에 배정된 거래처는 모두 미지정 상태로 돌아갑니다.`)) return
    await supabase.from('partner_order_groups').delete().eq('id', g.id)
    if (editingId === g.id) cancelEdit()
    loadGroups()
    loadBuyersAndAssignments()
  }

  async function assignGroup(buyerId: string, orderGroupId: string) {
    setAssignError('')
    const prev = assignments[buyerId]
    setAssignments((m) => ({ ...m, [buyerId]: orderGroupId }))

    if (!orderGroupId) {
      const { error } = await supabase
        .from('partner_buyer_order_groups')
        .delete()
        .eq('partner_id', partner.id)
        .eq('buyer_id', buyerId)
      if (error) {
        setAssignError('배정 변경 중 오류가 발생했습니다: ' + error.message)
        setAssignments((m) => ({ ...m, [buyerId]: prev }))
      }
      return
    }

    const { error } = await supabase
      .from('partner_buyer_order_groups')
      .upsert(
        { partner_id: partner.id, buyer_id: buyerId, order_group_id: orderGroupId, updated_at: new Date().toISOString() },
        { onConflict: 'partner_id,buyer_id' }
      )
    if (error) {
      setAssignError('배정 변경 중 오류가 발생했습니다: ' + error.message)
      setAssignments((m) => ({ ...m, [buyerId]: prev }))
    }
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>거래처 주문그룹 관리</div>
      <div style={styles.sectionSub}>
        배송 요일과 주문 마감시간을 묶은 그룹을 만들고, 거래처를 배정하세요. 그룹이 배정된 거래처는 거래전표
        등록/AI 빠른입력 시 마감시간 기준 예상 배송일이 자동으로 안내돼요. 그룹이 배정되지 않은 거래처는 기존과
        동일하게 제한 없이 처리돼요.
      </div>

      <div style={ogStyles.card}>
        <div style={ogStyles.cardTitle}>{editingId ? '주문그룹 수정' : '새 주문그룹 만들기'}</div>

        {formError && <div style={{ ...styles.errorBox, marginTop: 0 }}>{formError}</div>}

        <div style={styles.field}>
          <label style={styles.label}>그룹명 *</label>
          <input
            style={styles.input}
            value={form.groupName}
            onChange={(e) => setForm((p) => ({ ...p, groupName: e.target.value }))}
            placeholder="예) 평일당일배송, 월수금 배송"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>배송 요일 * (복수 선택)</label>
          <div style={ogStyles.dayGroup}>
            {WEEKDAY_LABELS.map((label, day) => {
              const selected = form.deliveryDays.has(day)
              return (
                <div
                  key={day}
                  onClick={() => toggleDay(day)}
                  style={{ ...ogStyles.dayChip, ...(selected ? ogStyles.dayChipSelected : {}) }}
                >
                  {label}
                </div>
              )
            })}
          </div>
        </div>

        <div style={styles.fieldRow}>
          <div style={styles.field}>
            <label style={styles.label}>주문 마감시간 *</label>
            <input
              type="time"
              style={styles.input}
              value={form.cutoffTime}
              onChange={(e) => setForm((p) => ({ ...p, cutoffTime: e.target.value }))}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>시간외 주문 허용</label>
            <label style={ogStyles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.allowAfterCutoff}
                onChange={(e) => setForm((p) => ({ ...p, allowAfterCutoff: e.target.checked }))}
              />
              <span>허용 — 마감시간이 지나도 이월 없이 즉시 처리해요</span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {editingId && (
            <button type="button" style={{ ...styles.btn, ...styles.btnOutlineSmall, flex: 1 }} onClick={cancelEdit} disabled={saving}>
              취소
            </button>
          )}
          <button type="button" style={{ ...styles.btn, ...styles.btnPrimarySmall, flex: 2 }} onClick={saveGroup} disabled={saving}>
            {saving ? '저장 중...' : editingId ? '수정 저장' : '그룹 만들기'}
          </button>
        </div>
      </div>

      {groups.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 30 }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>그룹명</th>
                <th style={styles.th}>배송 요일</th>
                <th style={styles.th}>마감시간</th>
                <th style={styles.th}>시간외 주문</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td style={styles.td}>{g.group_name}</td>
                  <td style={styles.td}>{g.delivery_days.map((d) => WEEKDAY_LABELS[d]).join(', ') || '-'}</td>
                  <td style={styles.td}>{g.cutoff_time.slice(0, 5)}</td>
                  <td style={styles.td}>{g.allow_after_cutoff ? '허용' : '제한'}</td>
                  <td style={styles.td}>
                    <button type="button" style={{ ...ogStyles.linkBtn, marginRight: 12 }} onClick={() => startEdit(g)}>
                      수정
                    </button>
                    <button type="button" style={{ ...ogStyles.linkBtn, color: colors.warn }} onClick={() => deleteGroup(g)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ ...styles.sectionTitle, marginTop: 12 }}>거래처 그룹 배정</div>
      <div style={styles.sectionSub}>이 파트너와 실제 거래 이력이 있는 거래처 목록이에요.</div>

      {assignError && <div style={styles.errorBox}>{assignError}</div>}

      {buyers.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ fontSize: 15, color: colors.deep }}>아직 거래한 거래처가 없어요</h3>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.th}>소상공인</th>
                <th style={styles.th}>배정된 주문그룹</th>
              </tr>
            </thead>
            <tbody>
              {buyers.map((b) => (
                <tr key={b.buyer_id}>
                  <td style={styles.td}>{b.business_name}</td>
                  <td style={styles.td}>
                    <select
                      style={{ ...styles.input, padding: '8px 10px', fontSize: 13 }}
                      value={assignments[b.buyer_id] || ''}
                      onChange={(e) => assignGroup(b.buyer_id, e.target.value)}
                    >
                      <option value="">미지정 (제한 없음)</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.group_name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const ogStyles: { [k: string]: React.CSSProperties } = {
  card: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 20, marginBottom: 20 },
  cardTitle: { fontSize: 14.5, fontWeight: 700, color: colors.deep, marginBottom: 14 },
  dayGroup: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  dayChip: {
    border: `1px solid ${colors.line}`,
    borderRadius: 20,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink,
    cursor: 'pointer',
    background: colors.white,
  },
  dayChipSelected: { background: colors.deep, color: colors.white, borderColor: colors.deep },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.8, color: colors.muted, marginTop: 8 },
  linkBtn: { border: 'none', background: 'none', color: colors.navy, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 },
}
