'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabaseClient'

export function useFavorites() {
  const router = useRouter()
  const [buyerProfileId, setBuyerProfileId] = useState<string | null>(null)
  const [favoritePartnerIds, setFavoritePartnerIds] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setReady(true)
        return
      }

      const { data: profile } = await supabase
        .from('buyer_profiles')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!profile) {
        setReady(true)
        return
      }
      setBuyerProfileId(profile.id)

      const { data: rows } = await supabase
        .from('favorites')
        .select('partner_id')
        .eq('buyer_id', profile.id)

      setFavoritePartnerIds(new Set((rows || []).map((r) => r.partner_id)))
      setReady(true)
    }

    load()
  }, [])

  const toggleFavorite = useCallback(
    async (partnerId: string) => {
      if (!buyerProfileId) {
        router.push('/login')
        return
      }

      setPendingId(partnerId)
      const isFavorited = favoritePartnerIds.has(partnerId)

      if (isFavorited) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('buyer_id', buyerProfileId)
          .eq('partner_id', partnerId)

        if (!error) {
          setFavoritePartnerIds((prev) => {
            const next = new Set(prev)
            next.delete(partnerId)
            return next
          })
        }
      } else {
        const { error } = await supabase
          .from('favorites')
          .insert({ buyer_id: buyerProfileId, partner_id: partnerId })

        if (!error) {
          setFavoritePartnerIds((prev) => new Set(prev).add(partnerId))
        }
      }

      setPendingId(null)
    },
    [buyerProfileId, favoritePartnerIds, router]
  )

  return { buyerProfileId, favoritePartnerIds, toggleFavorite, ready, pendingId }
}
