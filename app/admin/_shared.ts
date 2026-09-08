export const colors = {
  deep: '#0A1E3D',
  navy: '#065A82',
  ink: '#16233B',
  paper: '#F7FAFC',
  paper2: '#EFF5F8',
  line: '#D9E3EA',
  muted: '#5B6B79',
  white: '#FFFFFF',
  amber: '#F2A93B',
  good: '#0B7A6D',
  goodBg: '#E3F4F0',
  warn: '#B5460B',
  warnBg: '#FBEAE0',
}

export const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 1180, margin: '0 auto', padding: '0 32px' },
  pageLayout: { padding: '36px 0 90px' },
  sideMenu: { borderRight: `1px solid ${colors.line}`, paddingRight: 20 },
  brand: { fontSize: 13, fontWeight: 700, color: colors.navy, marginBottom: 16, letterSpacing: 0.2 },
  menuItem: { display: 'block', padding: '10px 8px', fontSize: 14, color: colors.muted, fontWeight: 600, borderRadius: 6, textDecoration: 'none', marginBottom: 2 },
  menuItemActive: { background: colors.paper2, color: colors.deep },
  sectionTitle: { fontSize: 19, marginBottom: 6, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
  sectionSub: { fontSize: 13.5, color: colors.muted, marginBottom: 22 },
  emptyState: { textAlign: 'center', padding: '50px 20px', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 },
  statCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: '18px 20px' },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: 600, marginBottom: 8 },
  statValue: { fontSize: 19, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
  historyTable: { width: '100%', borderCollapse: 'collapse', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, overflow: 'hidden' },
  th: { background: colors.paper2, fontSize: 12.5, color: colors.muted, fontWeight: 700, padding: '12px 16px', textAlign: 'left' },
  td: { padding: '14px 16px', fontSize: 13.5, borderTop: `1px solid ${colors.paper2}` },
  htag: { fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 12, whiteSpace: 'nowrap' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 14px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', border: '1.5px solid transparent' },
  btnPrimarySmall: { background: colors.amber, color: colors.deep },
  btnOutlineSmall: { borderColor: colors.line, color: colors.navy, background: colors.white },
  btnDangerSmall: { borderColor: colors.warn, color: colors.warn, background: colors.white },
  tabRow: { display: 'flex', gap: 8, marginBottom: 22 },
  tab: { padding: '9px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `1px solid ${colors.line}`, background: colors.white, color: colors.muted },
  tabActive: { background: colors.deep, color: colors.white, borderColor: colors.deep },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12.5, color: colors.muted, fontWeight: 600, marginBottom: 6 },
  input: { width: '100%', border: `1px solid ${colors.line}`, borderRadius: 6, padding: '10px 12px', fontSize: 14, color: colors.ink, background: colors.paper2 },
  card: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 20, marginBottom: 16 },
  errorBox: { background: '#FDECEC', color: '#B3261E', borderRadius: 7, padding: '10px 12px', fontSize: 12.5, marginTop: 4 },
}

export const DEAL_STATUS_LABEL: Record<string, string> = {
  in_progress: '진행중',
  completed: '거래완료',
  disputed: '분쟁중',
}

export const PARTNER_STATUS_LABEL: Record<string, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  suspended: '정지',
}

export const BUYER_STATUS_LABEL: Record<string, string> = {
  active: '활성',
  suspended: '정지',
}

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  open: '회신 대기',
  matched: '회신 도착',
  closed: '확정 완료',
}

export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  received: '접수됨',
  reviewing: '검토중',
  resolved: '해결됨',
  rejected: '반려됨',
}

export function statusBadgeStyle(status: string): React.CSSProperties {
  if (status === 'completed' || status === 'approved' || status === 'closed' || status === 'resolved' || status === 'active') {
    return { background: colors.goodBg, color: colors.good }
  }
  if (status === 'disputed' || status === 'suspended' || status === 'rejected') {
    return { background: colors.warnBg, color: colors.warn }
  }
  return { background: '#E7EEF5', color: colors.navy }
}

export function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

export function won(n: number | null | undefined) {
  return `${Number(n || 0).toLocaleString('ko-KR')}원`
}
