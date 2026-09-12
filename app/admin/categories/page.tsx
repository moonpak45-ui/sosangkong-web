'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles } from '../_shared'
import { useAdminRole } from '../AdminRoleContext'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import Select from '../../../components/ui/Select'
import Textarea from '../../../components/ui/Textarea'

type CategoryRow = { id: string; name: string }

// category_attribute_defs 실제 컬럼(HANDOFF.md 참고, live schema로 재확인함) —
// 관리자 화면이 원래 가정했던 name/required 대신 attribute_key/attribute_label/
// applies_to/data_type/is_required/options 구조. 두 ENUM 허용값은 사용자가
// Supabase 대시보드에서 직접 확인해 알려준 값.
type AppliesTo = 'partner_profile' | 'quote_request'
type AttrDataType = 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'date'

type AttributeDefRow = {
  id: string
  attribute_key: string
  attribute_label: string
  applies_to: AppliesTo
  data_type: AttrDataType
  is_required: boolean | null
  options: string[] | null
}

const APPLIES_TO_LABEL: Record<AppliesTo, string> = {
  partner_profile: '공급업체 프로필용',
  quote_request: '견적요청용',
}

const DATA_TYPE_LABEL: Record<AttrDataType, string> = {
  text: '텍스트',
  number: '숫자',
  boolean: '참/거짓',
  select: '단일 선택',
  multiselect: '다중 선택',
  date: '날짜',
}

const OPTIONS_DATA_TYPES: AttrDataType[] = ['select', 'multiselect']

export default function AdminCategoriesPage() {
  const adminRole = useAdminRole()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [attributeDefs, setAttributeDefs] = useState<AttributeDefRow[]>([])
  const [attrLoading, setAttrLoading] = useState(false)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const [newAttrKey, setNewAttrKey] = useState('')
  const [newAttrName, setNewAttrName] = useState('')
  const [newAttrAppliesTo, setNewAttrAppliesTo] = useState<AppliesTo>('quote_request')
  const [newAttrDataType, setNewAttrDataType] = useState<AttrDataType>('text')
  const [newAttrOptionsText, setNewAttrOptionsText] = useState('')
  const [newAttrRequired, setNewAttrRequired] = useState(false)
  const [addingAttr, setAddingAttr] = useState(false)
  const [attrError, setAttrError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('categories').select('id, name').order('name', { ascending: true })
      const rows = (data || []) as CategoryRow[]
      setCategories(rows)
      if (rows.length > 0) setSelectedId(rows[0].id)
      setLoading(false)
    }

    load()
  }, [])

  useEffect(() => {
    async function loadAttrs() {
      if (!selectedId) {
        setAttributeDefs([])
        return
      }
      setAttrLoading(true)
      const { data } = await supabase
        .from('category_attribute_defs')
        .select('id, attribute_key, attribute_label, applies_to, data_type, is_required, options')
        .eq('category_id', selectedId)
        .order('attribute_label', { ascending: true })
      setAttributeDefs((data || []) as AttributeDefRow[])
      setAttrLoading(false)
    }

    loadAttrs()
  }, [selectedId])

  async function addCategory() {
    setCategoryError('')
    if (!newCategoryName.trim()) {
      setCategoryError('카테고리명을 입력해주세요.')
      return
    }

    setAddingCategory(true)
    const { data, error } = await supabase
      .from('categories')
      // group_type은 관리자 화면에 별도 입력이 없고, 지금까지 등록된 카테고리가
      // 전부 'goods_supply'라 그 값을 그대로 씀.
      .insert({ name: newCategoryName.trim(), group_type: 'goods_supply' })
      .select('id, name')
      .single()
    setAddingCategory(false)

    if (error || !data) {
      setCategoryError('카테고리 추가 중 오류가 발생했습니다: ' + (error?.message || ''))
      return
    }

    setCategories((prev) => [...prev, data as CategoryRow].sort((a, b) => a.name.localeCompare(b.name)))
    setNewCategoryName('')
    setSelectedId(data.id)
  }

  function startEditCategory(c: CategoryRow) {
    setEditingId(c.id)
    setEditingName(c.name)
    setEditError('')
  }

  function cancelEditCategory() {
    setEditingId(null)
    setEditingName('')
    setEditError('')
  }

  async function saveEditCategory(id: string) {
    setEditError('')
    if (!editingName.trim()) {
      setEditError('카테고리명을 입력해주세요.')
      return
    }

    setSavingEdit(true)
    const { error } = await supabase.from('categories').update({ name: editingName.trim() }).eq('id', id)
    setSavingEdit(false)

    if (error) {
      setEditError('수정 중 오류가 발생했습니다: ' + error.message)
      return
    }

    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: editingName.trim() } : c)).sort((a, b) => a.name.localeCompare(b.name))
    )
    setEditingId(null)
    setEditingName('')
  }

  async function deleteCategory(id: string) {
    if (!window.confirm('정말 이 카테고리를 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없습니다.')) return

    setDeleteError('')
    setDeletingId(id)
    const { error } = await supabase.from('categories').delete().eq('id', id)
    setDeletingId(null)

    if (error) {
      // 23503 = foreign_key_violation: 이미 partner_categories/quote_requests 등에서
      // 참조 중인 카테고리라 DB가 삭제를 막은 경우
      if (error.code === '23503') {
        setDeleteError('사용 중인 카테고리는 삭제할 수 없습니다. 이미 등록된 업체나 견적요청이 있어요.')
      } else {
        setDeleteError('삭제 중 오류가 발생했습니다: ' + error.message)
      }
      return
    }

    setCategories((prev) => prev.filter((c) => c.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
    }
  }

  const newAttrNeedsOptions = OPTIONS_DATA_TYPES.includes(newAttrDataType)

  async function addAttributeDef() {
    setAttrError('')
    if (!selectedId) return

    const key = newAttrKey.trim()
    if (!key) {
      setAttrError('내부 키를 입력해주세요.')
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      setAttrError('내부 키는 영문 소문자로 시작하고, 영문 소문자/숫자/밑줄(_)만 사용할 수 있어요.')
      return
    }
    if (!newAttrName.trim()) {
      setAttrError('표시명을 입력해주세요.')
      return
    }

    const optionList = newAttrOptionsText
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (newAttrNeedsOptions && optionList.length === 0) {
      setAttrError('선택지를 1개 이상 입력해주세요.')
      return
    }

    setAddingAttr(true)
    const { data, error } = await supabase
      .from('category_attribute_defs')
      .insert({
        category_id: selectedId,
        attribute_key: key,
        attribute_label: newAttrName.trim(),
        applies_to: newAttrAppliesTo,
        data_type: newAttrDataType,
        is_required: newAttrRequired,
        options: newAttrNeedsOptions ? optionList : null,
      })
      .select('id, attribute_key, attribute_label, applies_to, data_type, is_required, options')
      .single()
    setAddingAttr(false)

    if (error || !data) {
      setAttrError('속성 추가 중 오류가 발생했습니다: ' + (error?.message || ''))
      return
    }

    setAttributeDefs((prev) =>
      [...prev, data as AttributeDefRow].sort((a, b) => a.attribute_label.localeCompare(b.attribute_label))
    )
    setNewAttrKey('')
    setNewAttrName('')
    setNewAttrAppliesTo('quote_request')
    setNewAttrDataType('text')
    setNewAttrOptionsText('')
    setNewAttrRequired(false)
  }

  // URL 직접 접근 방어(사이드바 메뉴는 AdminLayout이 이미 숨김) - RLS도
  // categories insert/update/delete를 super_admin 전용으로 막아뒀지만,
  // sub_admin이 화면 자체에 들어와서 "권한 없음" 에러만 잔뜩 보는 대신
  // 여기서 먼저 막아 안내 문구를 보여줌.
  if (adminRole === 'sub_admin') {
    return (
      <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>접근 권한이 없어요</h3>
        <p style={{ fontSize: 13.5, color: colors.muted }}>카테고리 관리는 최고 관리자만 이용할 수 있어요.</p>
      </Card>
    )
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  const selectedCategory = categories.find((c) => c.id === selectedId) || null

  return (
    <div>
      <div style={styles.sectionTitle}>카테고리 관리</div>
      <div style={styles.sectionSub}>거래 카테고리와 카테고리별 속성 정의를 관리하세요.</div>

      <div
        className="responsive-two-col"
        // minmax(0, 1fr), not bare 1fr - 안 그러면 이 트랙 안의 콘텐츠가
        // 자기 max-content 기준으로 커지면서 트랙과 페이지 전체를
        // 뷰포트보다 넓게 밀어내 가로 스크롤이 생긴다(app/search/page.tsx와
        // 동일한 문제, globals.css의 .responsive-two-col 모바일 대응
        // 주석 참고).
        style={{ alignItems: 'start', ['--rtc-cols' as string]: '300px minmax(0, 1fr)', ['--rtc-gap' as string]: '24px' } as React.CSSProperties}
      >
        <div>
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.deep, marginBottom: 12 }}>
              카테고리 ({categories.length})
            </div>
            {(editError || deleteError) && (
              <div style={{ ...styles.errorBox, marginBottom: 10 }}>{editError || deleteError}</div>
            )}
            {categories.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.muted }}>등록된 카테고리가 없어요.</p>
            ) : (
              <div>
                {categories.map((c) =>
                  editingId === c.id ? (
                    <div key={c.id} style={{ display: 'flex', gap: 6, padding: '4px 0', marginBottom: 2 }}>
                      <input
                        type="text"
                        style={{ ...styles.input, padding: '6px 8px', fontSize: 13 }}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        style={{ padding: '6px 10px' }}
                        onClick={() => saveEditCategory(c.id)}
                        disabled={savingEdit}
                      >
                        저장
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        style={{ padding: '6px 10px' }}
                        onClick={cancelEditCategory}
                        disabled={savingEdit}
                      >
                        취소
                      </Button>
                    </div>
                  ) : (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        padding: '9px 10px',
                        borderRadius: 6,
                        marginBottom: 2,
                        background: c.id === selectedId ? colors.paper2 : 'transparent',
                      }}
                    >
                      <span
                        onClick={() => setSelectedId(c.id)}
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: c.id === selectedId ? colors.deep : colors.muted,
                          flex: 1,
                        }}
                      >
                        {c.name}
                      </span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          style={{ padding: '4px 8px', fontSize: 11.5 }}
                          onClick={() => startEditCategory(c)}
                        >
                          수정
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          style={{ padding: '4px 8px', fontSize: 11.5, color: colors.warn, border: `1px solid ${colors.warn}` }}
                          disabled={deletingId === c.id}
                          onClick={() => deleteCategory(c.id)}
                        >
                          삭제
                        </Button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </Card>

          <Card style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.deep, marginBottom: 12 }}>
              새 카테고리 추가
            </div>
            <div style={styles.field}>
              <input
                type="text"
                style={styles.input}
                placeholder="예) 냉동수산"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
            </div>
            {categoryError && <div style={styles.errorBox}>{categoryError}</div>}
            <Button variant="primary" style={{ width: '100%', marginTop: 4 }} onClick={addCategory} disabled={addingCategory}>
              {addingCategory ? '추가 중...' : '카테고리 추가'}
            </Button>
          </Card>
        </div>

        <div>
          {!selectedCategory ? (
            <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
              <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>카테고리를 먼저 추가해주세요</h3>
            </Card>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 4 }}>
                {selectedCategory.name}의 속성 정의
              </div>
              <div style={{ fontSize: 12.5, color: colors.muted, marginBottom: 16 }}>
                견적 요청 시 이 카테고리에서 입력받을 속성 항목입니다.
              </div>

              {attrLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
              ) : attributeDefs.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '50px 20px', marginBottom: 20 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 8, color: colors.deep }}>등록된 속성이 없어요</h3>
                </Card>
              ) : (
                <Card style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
                  <table style={styles.historyTable}>
                    <thead>
                      <tr>
                        <th style={styles.th}>속성명</th>
                        <th style={styles.th}>내부 키</th>
                        <th style={styles.th}>적용 대상</th>
                        <th style={styles.th}>입력 형식</th>
                        <th style={styles.th}>필수여부</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attributeDefs.map((a) => (
                        <tr key={a.id}>
                          <td style={styles.td}>{a.attribute_label}</td>
                          <td style={{ ...styles.td, color: colors.muted, fontFamily: 'monospace' }}>{a.attribute_key}</td>
                          <td style={styles.td}>{APPLIES_TO_LABEL[a.applies_to] || a.applies_to}</td>
                          <td style={styles.td}>
                            {DATA_TYPE_LABEL[a.data_type] || a.data_type}
                            {OPTIONS_DATA_TYPES.includes(a.data_type) && a.options && a.options.length > 0
                              ? ` (${a.options.join(', ')})`
                              : ''}
                          </td>
                          <td style={styles.td}>{a.is_required ? '필수' : '선택'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              <Card style={{ padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.deep, marginBottom: 12 }}>
                  속성 추가
                </div>

                <div style={styles.fieldRow}>
                  <div style={{ ...styles.field, marginBottom: 0 }}>
                    <label style={styles.label}>내부 키</label>
                    <Input
                      type="text"
                      placeholder="예) weight_kg"
                      value={newAttrKey}
                      onChange={(e) => setNewAttrKey(e.target.value)}
                    />
                  </div>
                  <div style={{ ...styles.field, marginBottom: 0 }}>
                    <label style={styles.label}>표시명</label>
                    <Input
                      type="text"
                      placeholder="예) 중량"
                      value={newAttrName}
                      onChange={(e) => setNewAttrName(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ ...styles.fieldRow, marginTop: 14 }}>
                  <div style={{ ...styles.field, marginBottom: 0 }}>
                    <label style={styles.label}>적용 대상</label>
                    <Select
                      value={newAttrAppliesTo}
                      onChange={(e) => setNewAttrAppliesTo(e.target.value as AppliesTo)}
                    >
                      {(Object.keys(APPLIES_TO_LABEL) as AppliesTo[]).map((v) => (
                        <option key={v} value={v}>
                          {APPLIES_TO_LABEL[v]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ ...styles.field, marginBottom: 0 }}>
                    <label style={styles.label}>입력 형식</label>
                    <Select
                      value={newAttrDataType}
                      onChange={(e) => setNewAttrDataType(e.target.value as AttrDataType)}
                    >
                      {(Object.keys(DATA_TYPE_LABEL) as AttrDataType[]).map((v) => (
                        <option key={v} value={v}>
                          {DATA_TYPE_LABEL[v]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {newAttrNeedsOptions && (
                  <div style={{ ...styles.field, marginTop: 14, marginBottom: 0 }}>
                    <label style={styles.label}>선택지 (쉼표 또는 줄바꿈으로 구분)</label>
                    <Textarea
                      placeholder="예) 빨강, 파랑, 초록"
                      value={newAttrOptionsText}
                      onChange={(e) => setNewAttrOptionsText(e.target.value)}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      color: colors.muted,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newAttrRequired}
                      onChange={(e) => setNewAttrRequired(e.target.checked)}
                    />
                    필수
                  </label>
                  <Button variant="primary" onClick={addAttributeDef} disabled={addingAttr}>
                    {addingAttr ? '추가 중...' : '속성 추가'}
                  </Button>
                </div>
                {attrError && <div style={styles.errorBox}>{attrError}</div>}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
