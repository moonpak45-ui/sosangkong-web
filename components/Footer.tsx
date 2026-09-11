type FooterLink = {
  label: string
  href: string | null
}

const SERVICE_LINKS: FooterLink[] = [
  { label: '공급업체 찾기', href: '/search' },
  { label: '견적 요청', href: '/quote-request' },
  { label: '마이페이지', href: '/my-page' },
  { label: '거래 이력', href: '/my-page/history' },
]

const PARTNER_LINKS: FooterLink[] = [
  { label: '공급업체 등록', href: '/login?view=signup&type=supplier' },
  { label: '공급업체 대시보드', href: '/partner/dashboard' },
  { label: '광고 상품 안내', href: '/partner/ads/apply' },
  { label: '수수료 안내', href: null },
]

// 자주 묻는 질문/문의하기/공지사항/이용약관/개인정보처리방침 전부 아직
// 실제 페이지가 없어서(이 리포에 해당 라우트 자체가 없음) href를 null로
// 두어 비활성(회색 텍스트)으로 표시함 - 페이지가 생기면 href만 채우면 됨.
const SUPPORT_LINKS: FooterLink[] = [
  { label: '자주 묻는 질문', href: null },
  { label: '문의하기', href: null },
  { label: '공지사항', href: null },
  { label: '이용약관', href: null },
  { label: '개인정보처리방침', href: null },
]

export default function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.inner}>
        <div style={styles.top}>
          <div style={styles.brandCol}>
            <img src="/brand/logo-full.png" alt="sosangKong 소상공닷컴" style={styles.logoImg} />
            <p style={styles.brandSub}>전국 소상공인 납품 파트너 매칭 플랫폼</p>
            <p style={styles.contactLine}>고객센터 운영시간: 평일 09:00–18:00 (주말·공휴일 휴무)</p>
          </div>

          <div style={styles.linkGrid}>
            <FooterColumn title="서비스" links={SERVICE_LINKS} />
            <FooterColumn title="공급업체" links={PARTNER_LINKS} />
            <FooterColumn title="고객지원" links={SUPPORT_LINKS} />
          </div>
        </div>

        {/* 사업자 정보(전자상거래법상 통신판매업자 표시 의무 항목) - 실제
            상호 외 대표자/사업자등록번호/통신판매업신고번호/주소 등은 실제
            값을 지어낼 수 없어 비워둠. 운영사 쪽에서 실제 값을 알려주면
            아래 bizInfo 값만 채우면 됨. */}
        <div style={styles.bizInfo}>
          상호: 소상공닷컴 · 대표자·사업자등록번호·통신판매업신고번호·주소 등 사업자 정보는 등록 후 표시됩니다.
        </div>

        <p style={styles.copyright}>© {new Date().getFullYear()} 소상공닷컴. All rights reserved.</p>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div style={styles.col}>
      <div style={styles.colTitle}>{title}</div>
      <ul style={styles.colList}>
        {links.map((l) => (
          <li key={l.label}>
            {l.href ? (
              <a href={l.href} style={styles.link}>
                {l.label}
              </a>
            ) : (
              <span style={styles.linkDisabled}>{l.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const styles: { [k: string]: React.CSSProperties } = {
  footer: {
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    marginTop: 60,
  },
  inner: {
    maxWidth: 1180,
    margin: '0 auto',
    padding: '44px 24px 28px',
  },
  top: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 48,
    justifyContent: 'space-between',
    paddingBottom: 32,
    borderBottom: '1px solid var(--color-border)',
  },
  brandCol: { flex: '1 1 260px', minWidth: 220, maxWidth: 340 },
  logoImg: { height: 30, width: 'auto', display: 'block', marginBottom: 12 },
  brandSub: { fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 },
  contactLine: { fontSize: 12.5, color: 'var(--color-text-muted)', margin: '10px 0 0' },
  linkGrid: { display: 'flex', flexWrap: 'wrap', gap: 40, flex: '2 1 480px' },
  col: { minWidth: 140 },
  colTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: 14,
  },
  colList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  link: { fontSize: 13, color: 'var(--color-text-secondary)', textDecoration: 'none' },
  linkDisabled: { fontSize: 13, color: 'var(--color-text-muted)' },
  bizInfo: {
    fontSize: 11.5,
    color: 'var(--color-text-muted)',
    margin: '20px 0 0',
    lineHeight: 1.6,
  },
  copyright: {
    fontSize: 11.5,
    color: 'var(--color-text-muted)',
    margin: '8px 0 0',
  },
}
