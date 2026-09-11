'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Card from './ui/Card'
import Badge from './ui/Badge'
import { formatDate } from '../app/my-page/_shared'

type DealRow = {
  id: string
  status: 'in_progress' | 'completed' | 'disputed'
  confirmed_at: string
  partners: { id: string; name: string } | null
}

type ArRow = {
  partner_id: string
  balance: number
  partners: { name: string } | null
}

type NewPartner = { id: string; name: string; region: string | null; created_at: string }

type RiskItem = { key: string; label: string; detail: string }

type PanelState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | {
      status: 'ready'
      inProgressCount: number
      totalUnpaid: number
      lastDeal: { partnerName: string; date: string } | null
      risks: RiskItem[]
      newPartners: NewPartner[]
    }

// /search 우측 개인화 패널. buyer로 로그인했을 때만(비로그인/공급업체
// 계정은 status:'hidden' → null 렌더) 노출. "리스크 알림"은 새 개념을
// 만들지 않고, 이미 my-page/page.tsx가 쓰는 두 가지 실제 필드만 재사용:
// deals.status='disputed'(분쟁 중 거래)와 ar_balances.balance>0(미결제
// 외상) — 둘 다 이미 검증된 RLS/쿼리라 안전하다.
export default function SearchPersonalizationPanel() {
  const [state, setState] = useState<PanelState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        if (!cancelled) setState({ status: 'hidden' })
        return
      }

      const { data: buyerProfile } = await supabase
        .from('buyer_profiles')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!buyerProfile) {
        if (!cancelled) setState({ status: 'hidden' })
        return
      }

      const [{ data: dealRows }, { data: arRows }, { data: newPartnerRows }] = await Promise.all([
        supabase
          .from('deals')
          .select('id, status, confirmed_at, partners ( id, name )')
          .eq('buyer_id', buyerProfile.id)
          .order('confirmed_at', { ascending: false })
          .limit(50),
        // ar_balances.buyer_id는 buyer_profiles.id가 아니라 auth.users.id
        // (my-page/page.tsx와 동일한 주의사항).
        supabase.from('ar_balances').select('partner_id, balance, partners ( name )').eq('buyer_id', session.user.id),
        supabase
          .from('partners')
          .select('id, name, region, created_at')
          .neq('status', 'suspended')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (cancelled) return

      const deals = (dealRows || []) as unknown as DealRow[]
      const arBalances = (arRows || []) as unknown as ArRow[]

      const inProgressCount = deals.filter((d) => d.status === 'in_progress').length
      const totalUnpaid = arBalances.reduce((sum, r) => sum + Number(r.balance || 0), 0)
      const lastDeal = deals[0]?.partners
        ? { partnerName: deals[0].partners.name, date: deals[0].confirmed_at }
        : null

      const risks: RiskItem[] = []
      for (const d of deals) {
        if (d.status === 'disputed' && d.partners) {
          risks.push({ key: `dispute-${d.id}`, label: d.partners.name, detail: '분쟁 중인 거래가 있어요' })
        }
      }
      for (const r of arBalances) {
        if (Number(r.balance) > 0 && r.partners) {
          risks.push({
            key: `unpaid-${r.partner_id}`,
            label: r.partners.name,
            detail: `미결제 외상 ${Number(r.balance).toLocaleString('ko-KR')}원`,
          })
        }
      }

      setState({
        status: 'ready',
        inProgressCount,
        totalUnpaid,
        lastDeal,
        risks,
        newPartners: (newPartnerRows || []) as NewPartner[],
      })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading' || state.status === 'hidden') return null

  return (
    <div style={styles.wrap}>
      <Card style={styles.card}>
        <div style={styles.title}>내 거래 현황</div>
        <div style={styles.statsRow}>
          <div style={styles.stat}>
            <b style={styles.statValue}>{state.inProgressCount}건</b>
            <span style={styles.statLabel}>진행 중인 거래</span>
          </div>
          <div style={styles.stat}>
            <b style={{ ...styles.statValue, color: state.totalUnpaid > 0 ? colors.warn : colors.navy }}>
              {state.totalUnpaid.toLocaleString('ko-KR')}원
            </b>
            <span style={styles.statLabel}>미결제 외상 합계</span>
          </div>
        </div>
        {state.lastDeal ? (
          <div style={styles.lastDeal}>
            최근 거래: <b>{state.lastDeal.partnerName}</b> · {formatDate(state.lastDeal.date)}
          </div>
        ) : (
          <div style={styles.emptyText}>아직 거래 이력이 없어요.</div>
        )}
        <a href="/my-page" style={styles.link}>
          거래처 관리에서 자세히 보기 ›
        </a>
      </Card>

      <Card style={styles.card}>
        <div style={styles.title}>리스크 알림</div>
        {state.risks.length === 0 ? (
          <div style={styles.emptyText}>지금은 특별한 리스크가 없어요.</div>
        ) : (
          <div style={styles.riskList}>
            {state.risks.map((r) => (
              <div key={r.key} style={styles.riskItem}>
                <Badge style={{ background: colors.warnBg, color: colors.warn }}>{r.label}</Badge>
                <span style={styles.riskDetail}>{r.detail}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={styles.card}>
        <div style={styles.title}>신규등록 업체</div>
        {state.newPartners.length === 0 ? (
          <div style={styles.emptyText}>새로 등록된 업체가 아직 없어요.</div>
        ) : (
          <div style={styles.newPartnerList}>
            {state.newPartners.map((p) => (
              <a key={p.id} href={`/partner/${p.id}`} style={styles.newPartnerItem}>
                <span style={styles.newPartnerName}>{p.name}</span>
                <span style={styles.newPartnerRegion}>{p.region || '지역 정보 없음'}</span>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

const colors = {
  deep: '#0A1E3D',
  navy: '#065A82',
  ink: '#16233B',
  paper2: '#EFF5F8',
  line: '#D9E3EA',
  muted: '#5B6B79',
  warn: '#B5460B',
  warnBg: '#FBEAE0',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16, flex: '0 0 260px', minWidth: 260 },
  card: { padding: 18 },
  title: { fontSize: 14, fontWeight: 700, color: colors.deep, marginBottom: 12 },
  statsRow: {
    display: 'flex',
    gap: 10,
    paddingBottom: 12,
    marginBottom: 10,
    borderBottom: `1px dashed ${colors.line}`,
  },
  stat: { flex: 1, textAlign: 'center' },
  statValue: { display: 'block', fontSize: 15, fontFamily: "'Noto Serif KR', serif", color: colors.navy },
  statLabel: { fontSize: 10.5, color: colors.muted },
  lastDeal: { fontSize: 12, color: colors.ink, marginBottom: 10 },
  emptyText: { fontSize: 12, color: colors.muted, marginBottom: 10 },
  link: { fontSize: 12, fontWeight: 700, color: colors.navy, textDecoration: 'none' },
  riskList: { display: 'flex', flexDirection: 'column', gap: 8 },
  riskItem: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  riskDetail: { fontSize: 11.5, color: colors.muted },
  newPartnerList: { display: 'flex', flexDirection: 'column', gap: 8 },
  newPartnerItem: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 12.5,
    color: colors.ink,
    textDecoration: 'none',
    paddingBottom: 8,
    borderBottom: `1px solid ${colors.paper2}`,
  },
  newPartnerName: { fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  newPartnerRegion: { color: colors.muted, flexShrink: 0 },
}
