import Card from '../../components/ui/Card'

export const metadata = {
  title: '수수료 안내 - 소상공닷컴',
}

const TIERS = [
  { range: '500만원 미만', rate: '5%' },
  { range: '500만원 ~ 2,000만원', rate: '3%' },
  { range: '2,000만원 이상', rate: '2%' },
]

export default function FeesPage() {
  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>수수료 안내</h1>
      <p style={styles.lead}>
        소상공인 회원의 서비스 이용은 전액 무료입니다. 공급업체 회원은 가입 자체는 무료이며, 매칭을
        통해 거래가 실제로 성사됐을 때만 아래 수수료율에 따라 중개수수료가 부과됩니다. 공급업체가
        기존에 보유한 거래처를 &quot;거래처 직접 등록&quot;으로 관리하는 자체관리 거래에는 수수료가
        부과되지 않습니다.
      </p>

      <Card style={styles.card}>
        <div style={styles.cardTitle}>월 누적 거래액 구간별 수수료율</div>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>월 누적 거래액</th>
              <th style={styles.th}>수수료율</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((t) => (
              <tr key={t.range}>
                <td style={styles.td}>{t.range}</td>
                <td style={styles.tdRate}>{t.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={styles.note}>
          매칭을 통해 성사된 거래 금액을 기준으로 산정하며, 자체관리 거래는 집계에 포함되지
          않습니다.
        </p>
      </Card>

      <Card style={styles.card}>
        <div style={styles.cardTitle}>가입 후 무료 기간</div>
        <p style={styles.note}>
          공급업체 회원은 가입일로부터 일정 기간 동안 중개수수료가 전액 면제됩니다. 정확한 면제
          기간은 가입 후 공급업체 대시보드에서 확인하실 수 있습니다.
        </p>
      </Card>

      <a href="/login?view=signup&type=supplier" style={styles.cta}>
        공급업체로 등록하기 ›
      </a>
    </div>
  )
}

const colors = {
  deep: '#0A1E3D',
  navy: '#065A82',
  ink: '#16233B',
  line: '#D9E3EA',
  muted: '#5B6B79',
  white: '#FFFFFF',
  paper2: '#EFF5F8',
  good: '#0B7A6D',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 720, margin: '0 auto', padding: '48px 24px 90px' },
  h1: { fontSize: 24, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: '0 0 16px' },
  lead: { fontSize: 14, color: colors.muted, lineHeight: 1.7, margin: '0 0 28px' },
  card: { padding: 24, marginBottom: 20 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: colors.deep, marginBottom: 16 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    fontSize: 12.5,
    color: colors.muted,
    fontWeight: 700,
    padding: '10px 12px',
    background: colors.paper2,
    borderBottom: `1px solid ${colors.line}`,
  },
  td: { padding: '12px 12px', fontSize: 13.5, color: colors.ink, borderBottom: `1px solid ${colors.paper2}` },
  tdRate: {
    padding: '12px 12px',
    fontSize: 14,
    fontWeight: 700,
    color: colors.good,
    borderBottom: `1px solid ${colors.paper2}`,
  },
  note: { fontSize: 12.5, color: colors.muted, marginTop: 14, lineHeight: 1.6 },
  cta: {
    display: 'inline-flex',
    marginTop: 8,
    fontSize: 14,
    fontWeight: 700,
    color: colors.navy,
    textDecoration: 'none',
  },
}
