// 이용약관/개인정보처리방침처럼 정적 마크다운 문서를 "특별한 디자인 없이
// 읽기 쉬운 텍스트 레이아웃"으로 렌더링하기 위한 최소 마크다운 렌더러.
// 별도 마크다운 라이브러리 의존성을 추가하지 않고, 이 두 문서에 실제로
// 쓰인 문법(#/##/###, blockquote, -bullet, 숫자.목록, **bold**, ---)만 지원한다.

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'hr' }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: { num: string; text: string }[] }
  | { type: 'p'; text: string }

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (trimmed === '') {
      i++
      continue
    }

    if (trimmed === '---') {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4) })
      i++
      continue
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3) })
      i++
      continue
    }
    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2) })
      i++
      continue
    }
    if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'quote', text: trimmed.slice(2) })
      i++
      continue
    }

    if (/^-\s/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^-\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().slice(2))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    // 번호는 원문 그대로 보존 - 목록 중간에 하위 불릿(-)이 끼어들어 블록이
    // 나뉘어도(예: "1./2." 다음 하위 불릿, 이어서 "3./4.") <ol> 자동 번호가
    // 다시 1부터 시작하며 번호가 틀어지는 걸 방지하기 위해 직접 렌더링.
    const olMatch = /^(\d+)\.\s(.*)$/.exec(trimmed)
    if (olMatch) {
      const items: { num: string; text: string }[] = []
      let m: RegExpExecArray | null = olMatch
      while (i < lines.length && m) {
        items.push({ num: m[1], text: m[2] })
        i++
        m = i < lines.length ? /^(\d+)\.\s(.*)$/.exec(lines[i].trim()) : null
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    blocks.push({ type: 'p', text: trimmed })
    i++
  }

  return blocks
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={idx}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={idx}>{part}</span>
    )
  )
}

export default function MarkdownLite({ content }: { content: string }) {
  const blocks = parse(content)

  return (
    <div style={styles.doc}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h1':
            return (
              <h1 key={idx} style={styles.h1}>
                {renderInline(block.text)}
              </h1>
            )
          case 'h2':
            return (
              <h2 key={idx} style={styles.h2}>
                {renderInline(block.text)}
              </h2>
            )
          case 'h3':
            return (
              <h3 key={idx} style={styles.h3}>
                {renderInline(block.text)}
              </h3>
            )
          case 'hr':
            return <hr key={idx} style={styles.hr} />
          case 'quote':
            return (
              <div key={idx} style={styles.quote}>
                {renderInline(block.text)}
              </div>
            )
          case 'ul':
            return (
              <ul key={idx} style={styles.ul}>
                {block.items.map((item, j) => (
                  <li key={j} style={styles.li}>
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <div key={idx} style={styles.ol}>
                {block.items.map((item, j) => (
                  <div key={j} style={styles.olItem}>
                    <span style={styles.olNum}>{item.num}.</span>
                    <span>{renderInline(item.text)}</span>
                  </div>
                ))}
              </div>
            )
          case 'p':
            return (
              <p key={idx} style={styles.p}>
                {renderInline(block.text)}
              </p>
            )
        }
      })}
    </div>
  )
}

const colors = {
  deep: '#0A1E3D',
  ink: '#16233B',
  line: '#D9E3EA',
  muted: '#5B6B79',
  paper2: '#EFF5F8',
  warnBg: '#FBEAE0',
  warn: '#8A5A0E',
}

const styles: { [k: string]: React.CSSProperties } = {
  doc: { maxWidth: 760, margin: '0 auto', padding: '48px 24px 90px', color: colors.ink, fontSize: 14.5, lineHeight: 1.75 },
  h1: {
    fontSize: 24,
    fontFamily: "'Noto Serif KR', serif",
    fontWeight: 600,
    color: colors.deep,
    margin: '0 0 24px',
  },
  h2: {
    fontSize: 18,
    fontFamily: "'Noto Serif KR', serif",
    fontWeight: 600,
    color: colors.deep,
    margin: '32px 0 12px',
    paddingBottom: 8,
    borderBottom: `1px solid ${colors.line}`,
  },
  h3: { fontSize: 15.5, fontWeight: 700, color: colors.ink, margin: '20px 0 8px' },
  p: { margin: '0 0 12px' },
  hr: { border: 'none', borderTop: `1px solid ${colors.line}`, margin: '28px 0' },
  quote: {
    background: colors.warnBg,
    color: colors.warn,
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13.5,
    margin: '0 0 24px',
  },
  ul: { margin: '0 0 12px', paddingLeft: 22 },
  li: { marginBottom: 4 },
  ol: { margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 4 },
  olItem: { display: 'flex', gap: 8 },
  olNum: { flexShrink: 0, color: colors.muted, fontWeight: 600 },
}
