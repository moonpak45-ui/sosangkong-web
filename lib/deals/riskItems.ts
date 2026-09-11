// lib/deals/riskItems.ts
//
// "리스크 알림" 카드/패널 공통 로직. 새 개념을 만들지 않고 이미 앱 전체에서
// 검증된 필드 두 가지만 재사용: deals.status='disputed'(분쟁 중 거래),
// ar_balances.balance>0(미결제 외상) — components/SearchPersonalizationPanel.tsx
// 최초 도입.

export type RiskItem = { key: string; label: string; detail: string }

export function buildRiskItems(
  disputedDeals: { id: string; counterpartName: string }[],
  unpaidBalances: { id: string; counterpartName: string; balance: number }[]
): RiskItem[] {
  const risks: RiskItem[] = []

  for (const d of disputedDeals) {
    risks.push({ key: `dispute-${d.id}`, label: d.counterpartName, detail: '분쟁 중인 거래가 있어요' })
  }
  for (const b of unpaidBalances) {
    if (b.balance > 0) {
      risks.push({
        key: `unpaid-${b.id}`,
        label: b.counterpartName,
        detail: `미결제 외상 ${b.balance.toLocaleString('ko-KR')}원`,
      })
    }
  }

  return risks
}
