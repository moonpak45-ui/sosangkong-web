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
  bizCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 18, marginBottom: 20 },
  bizName: { fontSize: 15, fontWeight: 700 },
  verifiedBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, background: colors.goodBg, color: colors.good, fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20 },
  bizMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  menuItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px', fontSize: 14, color: colors.muted, fontWeight: 600, borderRadius: 6, textDecoration: 'none' },
  menuItemActive: { background: colors.paper2, color: colors.deep },
  menuBadge: { background: colors.amber, color: colors.deep, fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10 },
  sectionTitle: { fontSize: 19, marginBottom: 6, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
  sectionSub: { fontSize: 13.5, color: colors.muted, marginBottom: 22 },
  emptyState: { textAlign: 'center', padding: '50px 20px', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10 },
  card: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 20, marginBottom: 20 },
  field: { marginBottom: 14 },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'block', fontSize: 12.5, color: colors.muted, fontWeight: 600, marginBottom: 6 },
  input: { width: '100%', border: `1px solid ${colors.line}`, borderRadius: 6, padding: '10px 12px', fontSize: 14, color: colors.ink, background: colors.paper2 },
  textarea: { width: '100%', border: `1px solid ${colors.line}`, borderRadius: 6, padding: '10px 12px', fontSize: 14, color: colors.ink, background: colors.paper2, minHeight: 70, resize: 'vertical', fontFamily: "'Noto Sans KR', sans-serif" },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', border: '1.5px solid transparent' },
  btnPrimarySmall: { background: colors.amber, color: colors.deep },
  btnOutlineSmall: { border: `1.5px solid ${colors.line}`, color: colors.navy, background: colors.white },
  errorBox: { background: '#FDECEC', color: '#B3261E', borderRadius: 7, padding: '10px 12px', fontSize: 12.5, marginTop: 4, marginBottom: 12 },
  successBox: { background: '#E3F4F0', color: '#0B7A6D', borderRadius: 7, padding: '10px 12px', fontSize: 12.5, marginBottom: 12 },
  btnPrimary: { background: colors.amber, color: colors.deep, border: 'none', borderRadius: 6, padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', marginTop: 20 },
  historyTable: { width: '100%', borderCollapse: 'collapse', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, overflow: 'hidden' },
  th: { background: colors.paper2, fontSize: 12.5, color: colors.muted, fontWeight: 700, padding: '12px 16px', textAlign: 'left' },
  td: { padding: '14px 16px', fontSize: 13.5, borderTop: `1px solid ${colors.paper2}` },
  htag: { fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 12 },
  repeatLink: { fontSize: 12.5, fontWeight: 700, color: colors.navy, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  statsGrid: { display: 'grid', gap: 14, marginBottom: 22 },
  statCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: '18px 20px' },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: 600, marginBottom: 8 },
  statValue: { fontSize: 19, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
}

export function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}
