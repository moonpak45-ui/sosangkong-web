export default function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.inner}>
        <div style={styles.logo}>소상공</div>
        <p style={styles.line}>
          소상공인과 공급업체를 연결하는 B2B 거래처 매칭 플랫폼
        </p>
        <div style={styles.links}>
          <a href="#" style={styles.link}>이용약관</a>
          <span style={styles.dot}>·</span>
          <a href="#" style={styles.link}>개인정보처리방침</a>
          <span style={styles.dot}>·</span>
          <a href="/partner-landing" style={styles.link}>공급업체 등록 안내</a>
        </div>
        <p style={styles.copyright}>© {new Date().getFullYear()} 소상공. All rights reserved.</p>
      </div>
    </footer>
  )
}

const colors = {
  deep: '#0A1E3D',
  line: '#D9E3EA',
  muted: '#5B6B79',
  white: '#FFFFFF',
}

const styles: { [k: string]: React.CSSProperties } = {
  footer: {
    borderTop: `1px solid ${colors.line}`,
    background: colors.white,
    marginTop: 60,
  },
  inner: {
    maxWidth: 1180,
    margin: '0 auto',
    padding: '36px 24px 44px',
    textAlign: 'center',
  },
  logo: {
    fontWeight: 700,
    fontSize: 16,
    color: colors.deep,
    marginBottom: 8,
  },
  line: {
    fontSize: 13,
    color: colors.muted,
    margin: '0 0 16px',
  },
  links: {
    fontSize: 12.5,
    color: colors.muted,
    marginBottom: 16,
  },
  link: {
    color: colors.muted,
    textDecoration: 'none',
  },
  dot: {
    margin: '0 8px',
  },
  copyright: {
    fontSize: 11.5,
    color: '#9AA7B2',
    margin: 0,
  },
}
