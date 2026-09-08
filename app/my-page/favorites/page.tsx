'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles } from '../_shared'
import { useMyPageLayout } from '../MyPageLayoutContext'

type FavoriteRow = {
  id: string
  partners: {
    id: string
    name: string
    region: string | null
    rating_avg: number
    partner_categories: { categories: { name: string } | null }[]
  } | null
}

export default function MyPageFavoritesPage() {
  const { buyerProfile, refreshFavoriteCount } = useMyPageLayout()
  const [favorites, setFavorites] = useState<FavoriteRow[]>([])
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('favorites')
        .select(`id, partners ( id, name, region, rating_avg, partner_categories ( categories ( name ) ) )`)
        .eq('buyer_id', buyerProfile.id)
        .order('created_at', { ascending: false })
      setFavorites((data || []) as unknown as FavoriteRow[])
      setLoading(false)
    }

    load()
  }, [buyerProfile.id])

  async function removeFavorite(favoriteId: string) {
    setRemovingId(favoriteId)
    const { error } = await supabase.from('favorites').delete().eq('id', favoriteId)
    setRemovingId(null)
    if (!error) {
      setFavorites((prev) => prev.filter((f) => f.id !== favoriteId))
      refreshFavoriteCount()
    }
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>찜한 업체</div>
      <div style={styles.sectionSub}>관심 있는 공급업체를 모아두고 필요할 때 바로 견적을 요청하세요.</div>

      {favorites.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>찜한 업체가 없어요</h3>
          <p style={{ fontSize: 13.5, color: colors.muted }}>
            검색결과나 업체 상세페이지에서 하트 아이콘을 누르면 이곳에 모아둘 수 있어요.
          </p>
          <a href="/search" style={{ ...styles.btnOutline, marginTop: 16 }}>
            공급업체 찾으러 가기
          </a>
        </div>
      ) : (
        <div style={styles.activeGrid}>
          {favorites.map((f) => {
            const partner = f.partners
            if (!partner) return null
            const categoryNames = (partner.partner_categories || [])
              .map((pc) => pc.categories?.name)
              .filter((n): n is string => Boolean(n))
            return (
              <div key={f.id} style={styles.activeCard}>
                <div style={styles.acTop}>
                  <div style={styles.acIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
                    </svg>
                  </div>
                  <div>
                    <a href={`/partner/${partner.id}`} style={styles.acName}>
                      {partner.name}
                    </a>
                    <div style={styles.acMeta}>
                      {[partner.region, categoryNames.join(', ')].filter(Boolean).join(' · ') || '정보 없음'}
                    </div>
                  </div>
                </div>
                <div style={styles.acStats}>
                  <div style={styles.acStat}>
                    <b>{Number(partner.rating_avg || 0).toFixed(1)}</b>
                    <span>평점</span>
                  </div>
                </div>
                <div style={styles.acActions}>
                  <a href={`/quote-request?partner_ids=${partner.id}`} style={{ ...styles.acBtn, ...styles.acBtnPrimary }}>
                    견적 요청하기
                  </a>
                  <button
                    onClick={() => removeFavorite(f.id)}
                    disabled={removingId === f.id}
                    style={{ ...styles.acBtn, ...styles.acBtnOutline }}
                  >
                    {removingId === f.id ? '해제 중...' : '찜 해제'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
