'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles } from '../_shared'
import { useAdminRole } from '../AdminRoleContext'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'

type CategoryRow = { id: string; name: string }
// category_attribute_defs 실제 컬럼(HANDOFF.md 참고, live schema로 재확인함) —
// 관리자 화면이 원래 가정했던 name/required는 존재하지 않음(42703). 조회만
// 실제 컬럼(attribute_label/is_required)에 맞춤 — "속성 추가" 폼(INSERT)은
// applies_to/data_type ENUM 허용값을 몰라 아직 스키마와 안 맞고, 별도 과제.
type AttributeDefRow = { id: string; attribute_label: string; is_required: boolean | null }

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

  const [newAttrName, setNewAttrName] = useState('')
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
        .select('id, attribute_label, is_required')
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

  async function addAttributeDef() {
    setAttrError('')
    if (!selectedId) return
    if (!newAttrName.trim()) {
      setAttrError('속성명을 입력해주세요.')
      return
    }

    setAddingAttr(true)
    const { data, error } = await supabase
      .from('category_attribute_defs')
      .insert({ category_id: selectedId, name: newAttrName.trim(), required: newAttrRequired })
      .select('id, name, required')
      .single()
    setAddingAttr(false)

    if (error || !data) {
      setAttrError('속성 추가 중 오류가 발생했습니다: ' + (error?.message || ''))
      return
    }

    setAttributeDefs((prev) =>
      [...prev, data as unknown as AttributeDefRow].sort((a, b) => a.attribute_label.localeCompare(b.attribute_label))
    )
    setNewAttrName('')
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
        style={{ alignItems: 'start', ['--rtc-cols' as string]: '300px 1fr', ['--rtc-gap' as string]: '24px' } as React.CSSProperties}
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
                        <th style={styles.th}>필수여부</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attributeDefs.map((a) => (
                        <tr key={a.id}>
                          <td style={styles.td}>{a.attribute_label}</td>
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
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ ...styles.field, flex: 1, marginBottom: 0 }}>
                    <label style={styles.label}>속성명</label>
                    <input
                      type="text"
                      style={styles.input}
                      placeholder="예) 중량"
                      value={newAttrName}
                      onChange={(e) => setNewAttrName(e.target.value)}
                    />
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      color: colors.muted,
                      paddingBottom: 10,
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
