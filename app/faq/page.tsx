'use client'

import { useState } from 'react'

const FAQ_MARKDOWN = `# 자주 묻는 질문

## 이용 전반

**Q. 소상공닷컴은 어떤 서비스인가요?**
전국 소상공인과 식자재·공산품 등 납품 공급업체를 지역·품목·배송조건 기준으로 매칭해드리는 B2B 플랫폼입니다. 여러 공급업체에 동시에 견적을 요청하고 비교할 수 있습니다.

**Q. 가입 비용이 있나요?**
소상공인 회원은 가입 및 서비스 이용이 전액 무료입니다. 공급업체 회원도 가입 자체는 무료이며, 매칭 거래가 실제로 성사됐을 때만 수수료가 부과됩니다.

**Q. 회원 유형은 어떻게 구분되나요?**
식자재 등을 구매하는 "소상공인 회원"과, 납품하는 "공급업체 회원"으로 나뉘며, 가입 시 선택한 유형에 따라 이용할 수 있는 화면과 기능이 다릅니다.

## 수수료 및 정산

**Q. 공급업체 수수료는 어떻게 산정되나요?**
매칭을 통해 성사된 거래에 한해, 월 누적 거래액 구간별로 500만원 미만 5%, 500만~2,000만원 3%, 2,000만원 이상 2%의 수수료가 적용됩니다.

**Q. 가입하면 바로 수수료가 부과되나요?**
아니요. 공급업체 회원은 가입일로부터 일정 기간 동안 수수료가 전액 면제됩니다. 정확한 면제 기간은 가입 시 대시보드에서 확인하실 수 있습니다.

**Q. 제가 원래 거래하던 거래처(플랫폼 매칭이 아닌)도 수수료가 부과되나요?**
아니요. 공급업체가 기존에 보유한 거래처를 "거래처 직접 등록" 기능으로 관리하는 거래(자체관리 거래)에는 수수료가 부과되지 않습니다. 이 기능은 무료로 계속 제공됩니다.

**Q. 정산은 언제, 어떻게 이루어지나요?**
거래가 확정되면 자동으로 정산 내역이 생성되며, 공급업체 대시보드의 "정산" 메뉴에서 거래별 수수료·정산액을 확인할 수 있습니다.

## 거래 관련

**Q. 소상공닷컴이 거래대금을 직접 받나요?**
아니요. 회사는 매칭과 거래 관리 도구만 제공하며, 대금 결제는 소상공인과 공급업체 간 직접 이루어집니다.

**Q. 거래 중 문제가 생기면 어떻게 하나요?**
우선 거래 상대방과 직접 협의하시고, 원만히 해결되지 않는 경우 "문의하기"를 통해 회사에 알려주시면 확인 후 안내해드립니다.

**Q. 거래명세서는 어디서 확인하나요?**
마이페이지(소상공인) 또는 공급업체 대시보드의 "거래명세서" 메뉴에서 확정된 거래별 명세서를 조회·인쇄할 수 있습니다.

## 계정 관리

**Q. 회원 탈퇴는 어떻게 하나요?**
계정 설정 메뉴에서 언제든지 탈퇴를 신청할 수 있습니다. 단, 법령에 따라 일부 거래 기록은 일정 기간 보관될 수 있습니다.

**Q. 사업자 정보나 연락처가 바뀌면 어떻게 하나요?**
소상공인은 마이페이지 "사업장 정보 수정", 공급업체는 대시보드 "프로필·배송조건 관리"에서 언제든지 직접 수정하실 수 있습니다.
`

type FaqItem = { question: string; answer: string }
type FaqSection = { title: string; items: FaqItem[] }

function parseFaq(markdown: string): FaqSection[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const sections: FaqSection[] = []
  let current: FaqSection | null = null
  let pendingQuestion: string | null = null

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '' || line.startsWith('# ')) continue

    if (line.startsWith('## ')) {
      current = { title: line.slice(3), items: [] }
      sections.push(current)
      pendingQuestion = null
      continue
    }

    const qMatch = /^\*\*Q\.\s*(.+?)\*\*$/.exec(line)
    if (qMatch) {
      pendingQuestion = qMatch[1]
      continue
    }

    if (pendingQuestion && current) {
      current.items.push({ question: pendingQuestion, answer: line })
      pendingQuestion = null
    }
  }

  return sections
}

const SECTIONS = parseFaq(FAQ_MARKDOWN)

export default function FaqPage() {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>자주 묻는 질문</h1>

      {SECTIONS.map((section, si) => (
        <section key={si} style={styles.section}>
          <h2 style={styles.h2}>{section.title}</h2>
          <div style={styles.list}>
            {section.items.map((item, ii) => {
              const key = `${si}-${ii}`
              const open = openKeys.has(key)
              return (
                <div key={key} style={styles.item}>
                  <button type="button" style={styles.question} onClick={() => toggle(key)}>
                    <span>Q. {item.question}</span>
                    <span style={styles.chevron}>{open ? '−' : '+'}</span>
                  </button>
                  {open && <div style={styles.answer}>{item.answer}</div>}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

const colors = {
  deep: '#0A1E3D',
  ink: '#16233B',
  line: '#D9E3EA',
  muted: '#5B6B79',
  paper2: '#EFF5F8',
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: { maxWidth: 720, margin: '0 auto', padding: '48px 24px 90px' },
  h1: { fontSize: 24, fontFamily: "'Noto Serif KR', serif", fontWeight: 600, color: colors.deep, margin: '0 0 24px' },
  section: { marginBottom: 28 },
  h2: {
    fontSize: 16,
    fontWeight: 700,
    color: colors.deep,
    margin: '0 0 12px',
    paddingBottom: 8,
    borderBottom: `1px solid ${colors.line}`,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { border: `1px solid ${colors.line}`, borderRadius: 8, overflow: 'hidden' },
  question: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '13px 16px',
    background: colors.paper2,
    border: 'none',
    textAlign: 'left',
    fontSize: 13.5,
    fontWeight: 600,
    color: colors.ink,
    cursor: 'pointer',
  },
  chevron: { flexShrink: 0, color: colors.muted, fontWeight: 700 },
  answer: {
    padding: '14px 16px',
    fontSize: 13,
    color: colors.muted,
    lineHeight: 1.7,
    borderTop: `1px solid ${colors.line}`,
  },
}
