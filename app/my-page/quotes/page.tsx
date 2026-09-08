'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { colors, styles, formatDate } from '../_shared'
import { useMyPageLayout } from '../MyPageLayoutContext'

type QuoteRequestRow = {
  id: string
  title: string | null
  status: 'open' | 'matched' | 'closed'
  created_at: string
  quote_request_targets: { id: string; status: 'waiting' | 'responded' | 'declined' }[]
}

const REQUEST_STATUS_LABEL: Record<QuoteRequestRow['status'], string> = {
  open: '회신 대기',
  matched: '회신 도착',
  closed: '확정 완료',
}

export default function MyPageQuotesPage() {
  const { buyerProfile } = useMyPageLayout()
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequestRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('quote_requests')
        .select('id, title, status, created_at, quote_request_targets ( id, status )')
        .eq('buyer_id', buyerProfile.id)
        .order('created_at', { ascending: false })
      setQuoteRequests((data || []) as unknown as QuoteRequestRow[])
      setLoading(false)
    }

    load()
  }, [buyerProfile.id])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.muted }}>불러오는 중...</div>
  }

  return (
    <div>
      <div style={styles.sectionTitle}>견적 요청 현황</div>
      <div style={styles.sectionSub}>보낸 견적 요청과 회신 현황입니다. 항목을 클릭하면 받은 견적을 비교할 수 있어요.</div>

      {quoteRequests.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: colors.deep }}>보낸 견적 요청이 없어요</h3>
          <p style={{ fontSize: 13.5, color: colors.muted }}>
            공급업체를 검색해 견적을 요청하면 이곳에서 회신 현황을 확인할 수 있어요.
          </p>
          <a href="/search" style={{ ...styles.btnOutline, marginTop: 16 }}>
            공급업체 찾으러 가기
          </a>
        </div>
      ) : (
        <div>
          {quoteRequests.map((qr) => {
            const total = qr.quote_request_targets.length
            const responded = qr.quote_request_targets.filter((t) => t.status === 'responded').length
            return (
              <a key={qr.id} href={`/quote-compare/${qr.id}`} style={styles.reqCard}>
                <div style={styles.reqTop}>
                  <div>
                    <div style={styles.reqTitle}>{qr.title || '견적 요청'}</div>
                    <div style={styles.reqMeta}>
                      {formatDate(qr.created_at)} · {total}곳에 발송
                    </div>
                  </div>
                  <span
                    style={{
                      ...styles.reqStatus,
                      ...(qr.status === 'closed' ? styles.reqStatusReady : styles.reqStatusWaiting),
                    }}
                  >
                    {qr.status === 'closed' ? REQUEST_STATUS_LABEL.closed : `회신 ${responded}/${total} 완료`}
                  </span>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
