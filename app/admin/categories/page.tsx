'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles } from '../_shared'

type CategoryRow = { id: string; name: string }
type AttributeDefRow = { id: string; name: string; required: boolean | null }

export default function AdminCategoriesPage() {
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [attributeDefs, setAttributeDefs] = useState<AttributeDefRow[]>([])
  const [attrLoading, setAttrLoading] = useState(false)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState('')

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
        .select('id, name, required')
        .eq('category_id', selectedId)
        .order('name', { ascending: true })
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
      .insert({ name: newCategoryName.trim() })
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

    setAttributeDefs((prev) => [...prev, data as AttributeDefRow].sort((a, b) => a.name.localeCompare(b.name)))
    setNewAttrName('')
    setNewAttrRequired(false)
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
          <div style={styles.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.deep, marginBottom: 12 }}>
              카테고리 ({categories.length})
            </div>
            {categories.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.muted }}>등록된 카테고리가 없어요.</p>
            ) : (
              <div>
                {categories.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      padding: '9px 10px',
                      borderRadius: 6,
                      fontSize: 13.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginBottom: 2,
                      color: c.id === selectedId ? colors.deep : colors.muted,
                      background: c.id === selectedId ? colors.paper2 : 'transparent',
                    }}
                  >
                    {c.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.card}>
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
            <button
              style={{ ...styles.btn, ...styles.btnPrimarySmall, width: '100%', marginTop: 4 }}
              onClick={addCategory}
              disabled={addingCategory}
            >
              {addingCategory ? '추가 중...' : '카테고리 추가'}
            </button>
          </div>
        </div>

        <div>
          {!selectedCategory ? (
            <div style={styles.emptyState}>
              <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>카테고리를 먼저 추가해주세요</h3>
            </div>
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
                <div style={styles.emptyState}>
                  <h3 style={{ fontSize: 15, marginBottom: 8, color: colors.deep }}>등록된 속성이 없어요</h3>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', marginBottom: 20 }}>
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
                          <td style={styles.td}>{a.name}</td>
                          <td style={styles.td}>{a.required ? '필수' : '선택'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={styles.card}>
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
                  <button
                    style={{ ...styles.btn, ...styles.btnPrimarySmall }}
                    onClick={addAttributeDef}
                    disabled={addingAttr}
                  >
                    {addingAttr ? '추가 중...' : '속성 추가'}
                  </button>
                </div>
                {attrError && <div style={styles.errorBox}>{attrError}</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
