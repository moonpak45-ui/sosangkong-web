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
  wrap: { maxWidth: 1140, margin: '0 auto', padding: '0 32px' },
  pageLayout: { padding: '36px 0 90px' },
  sideMenu: { borderRight: `1px solid ${colors.line}`, paddingRight: 20 },
  bizCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 18, marginBottom: 20 },
  bizName: { fontSize: 15, fontWeight: 700 },
  bizMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  menuItem: { display: 'block', padding: '10px 8px', fontSize: 14, color: colors.muted, fontWeight: 600, borderRadius: 6, textDecoration: 'none' },
  menuItemActive: { background: colors.paper2, color: colors.deep },
  menuBadge: { background: colors.amber, color: colors.deep, fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, marginLeft: 6 },
  sectionTitle: { fontSize: 19, marginBottom: 6, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep },
  sectionSub: { fontSize: 13.5, color: colors.muted, marginBottom: 22 },
  activeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  acTop: { display: 'flex', alignItems: 'center', gap: 12 },
  acIcon: { width: 40, height: 40, borderRadius: 9, background: colors.paper2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  acName: { fontSize: 14.5, fontWeight: 700, color: colors.ink, textDecoration: 'none' },
  acMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  acSince: { marginLeft: 'auto', fontSize: 11.5, color: colors.muted, textAlign: 'right' },
  acStats: { display: 'flex', gap: 14, margin: '14px 0', padding: '12px 0', borderTop: `1px dashed ${colors.line}`, borderBottom: `1px dashed ${colors.line}` },
  acStat: { flex: 1, textAlign: 'center' },
  acActions: { display: 'flex', gap: 8 },
  reqTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  reqTitle: { fontSize: 14.5, fontWeight: 700, color: colors.ink },
  reqMeta: { fontSize: 12.5, color: colors.muted, marginTop: 4 },
  historyTable: { width: '100%', borderCollapse: 'collapse', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, overflow: 'hidden' },
  th: { background: colors.paper2, fontSize: 12.5, color: colors.muted, fontWeight: 700, padding: '12px 16px', textAlign: 'left' },
  td: { padding: '14px 16px', fontSize: 13.5, borderTop: `1px solid ${colors.paper2}` },
  htag: { fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 12 },
  itemsToggle: { cursor: 'pointer', color: colors.navy, fontWeight: 600 },
  tdDetail: { padding: '0 16px 16px', borderTop: 'none', background: colors.paper2 },
  detailTable: { width: '100%', borderCollapse: 'collapse', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 8, overflow: 'hidden' },
  detailTh: { background: colors.paper2, fontSize: 11.5, color: colors.muted, fontWeight: 700, padding: '9px 12px', textAlign: 'left' },
  detailTd: { padding: '10px 12px', fontSize: 12.8, borderTop: `1px solid ${colors.paper2}` },
  repeatLink: { fontSize: 12.5, fontWeight: 700, color: colors.navy, cursor: 'pointer', textDecoration: 'none' },
  emptyState: { textAlign: 'center', padding: '50px 20px', background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10 },
  adSlot: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 24, textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 20 },
  adLabel: { fontSize: 10.5, color: colors.muted, textAlign: 'left', marginBottom: 8, letterSpacing: 0.3 },
  btnPrimary: { background: colors.amber, color: colors.deep, border: 'none', borderRadius: 6, padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', marginTop: 20 },
  btnOutline: { border: `1px solid ${colors.line}`, color: colors.navy, background: colors.white, borderRadius: 6, padding: '11px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex' },
}

export function formatDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}
