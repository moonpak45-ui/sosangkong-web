'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { colors, styles, formatDate } from './_shared'
import { useMyPageLayout } from './MyPageLayoutContext'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'

type DealPartner = {
  id: string
  name: string
  region: string | null
  rating_avg: number
}

type DealRow = {
  id: string
  amount: number
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  partners: DealPartner | null
}

type PartnerSummary = {
  partner: DealPartner
  dealCount: number
  lastDealAt: string
}

function buildPartnerSummaries(rows: DealRow[]): PartnerSummary[] {
  const map = new Map<string, PartnerSummary>()
  for (const row of rows) {
    if (!row.partners) continue
    const existing = map.get(row.partners.id)
    if (existing) {
      existing.dealCount += 1
      if (row.confirmed_at > existing.lastDealAt) existing.lastDealAt = row.confirmed_at
    } else {
      map.set(row.partners.id, { partner: row.partners, dealCount: 1, lastDealAt: row.confirmed_at })
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.lastDealAt < b.lastDealAt ? 1 : -1))
}

export default function MyPagePartnersPage() {
  const router = useRouter()
  const { buyerProfile, session } = useMyPageLayout()
  const [deals, setDeals] = useState<DealRow[]>([])
  const [arBalanceByPartner, setArBalanceByPartner] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: dealRows }, { data: arRows }] = await Promise.all([
        supabase
          .from('deals')
          .select(`id, amount, status, confirmed_at, partners ( id, name, region, rating_avg )`)
          .eq('buyer_id', buyerProfile.id)
          .order('confirmed_at', { ascending: false }),
        // ar_balances.buyer_id는 buyer_profiles.id가 아니라 auth.users.id라
        // buyerProfile.id가 아닌 session.userId로 조회해야 함
        supabase.from('ar_balances').select('partner_id, balance').eq('buyer_id', session.userId),
      ])

      setDeals((dealRows || []) as unknown as DealRow[])

      const balanceMap: Record<string, number> = {}
      ;(arRows || []).forEach((r) => {
        balanceMap[r.partner_id as string] = Number(r.balance)
      })
      setArBalanceByPartner(balanceMap)
      setLoading(false)
    }

    load()
  }, [buyerProfile.id, session.userId])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  const partnerSummaries = buildPartnerSummaries(deals)

  return (
    <div>
      <div style={styles.sectionTitle}>현재 거래처</div>
      <div style={styles.sectionSub}>지금까지 거래한 공급업체입니다.</div>

      {partnerSummaries.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>아직 거래 중인 업체가 없어요</h3>
          <p style={{ fontSize: 13.5, color: colors.muted }}>
            검색에서 공급업체를 찾아 견적을 요청하면 이곳에서 거래처를 관리할 수 있어요.
          </p>
          <a href="/search" style={{ ...styles.btnOutline, marginTop: 16 }}>
            공급업체 찾으러 가기
          </a>
        </Card>
      ) : (
        <div style={styles.activeGrid}>
          {partnerSummaries.map(({ partner, dealCount, lastDealAt }) => (
            <Card key={partner.id} style={{ padding: 20 }}>
              <div style={styles.acTop}>
                <div style={styles.acIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
                  </svg>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={styles.acName}>{partner.name}</div>
                    {Number(arBalanceByPartner[partner.id] || 0) > 0 && (
                      <Badge style={{ background: colors.warnBg, color: colors.warn, whiteSpace: 'nowrap' }}>
                        미결제 {Number(arBalanceByPartner[partner.id]).toLocaleString('ko-KR')}원
                      </Badge>
                    )}
                  </div>
                  <div style={styles.acMeta}>{partner.region || '지역 정보 없음'}</div>
                </div>
                <div style={styles.acSince}>
                  최근 거래일
                  <br />
                  {formatDate(lastDealAt)}
                </div>
              </div>
              <div style={styles.acStats}>
                <div style={styles.acStat}>
                  <b>{dealCount}건</b>
                  <span>누적 거래</span>
                </div>
                <div style={styles.acStat}>
                  <b>{Number(partner.rating_avg || 0).toFixed(1)}</b>
                  <span>배송정시율(평점 대체)</span>
                </div>
              </div>
              <div style={styles.acActions}>
                <Button
                  variant="primary"
                  size="sm"
                  style={{ flex: 1 }}
                  onClick={() => router.push(`/quote-request?partner_ids=${partner.id}`)}
                >
                  재거래 요청
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  style={{ flex: 1 }}
                  onClick={() => router.push('/my-page/history')}
                >
                  거래 이력 보기
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
