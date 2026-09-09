'use client'

import { colors } from '../app/partner/_shared'
import { computeExpectedDelivery, formatDeliveryLabel, OrderGroup } from '../lib/orderGroups'

type Props = { group: OrderGroup | null }

// "거래전표 등록"/"AI 빠른입력" 양쪽에서 공용으로 쓰는 예상 배송일 안내
// 배너. 선택된 거래의 buyer가 배정된 주문그룹(있으면)을 넘겨받아 그
// 자리에서 계산해 보여줌 - 실제 저장 시점의 계산은 각 화면의 저장
// 로직에서 별도로(저장 버튼 누른 시점 기준) 수행함.
export default function DeliveryEstimateBanner({ group }: Props) {
  if (!group) {
    return (
      <div style={boxStyle(false)}>
        이 거래처는 주문그룹이 지정되지 않았어요 — 마감시간 제한 없이 바로 처리돼요.
      </div>
    )
  }

  if (group.allow_after_cutoff) {
    return (
      <div style={boxStyle(false)}>
        &quot;{group.group_name}&quot; 그룹은 시간외 주문이 허용돼 있어 마감시간과 무관하게 바로 처리돼요.
      </div>
    )
  }

  const estimate = computeExpectedDelivery(group)
  if (!estimate) {
    return (
      <div style={boxStyle(false)}>
        &quot;{group.group_name}&quot; 그룹에 배송 요일이 설정돼 있지 않아 마감시간 제한 없이 바로 처리돼요.
      </div>
    )
  }

  const cutoffLabel = group.cutoff_time.slice(0, 5)
  return (
    <div style={boxStyle(estimate.wasAfterCutoff)}>
      {estimate.wasAfterCutoff
        ? `"${group.group_name}" 마감시간(${cutoffLabel})이 지나 ${formatDeliveryLabel(estimate.date)} 배송으로 예약돼요.`
        : `"${group.group_name}" 예상 배송일: ${formatDeliveryLabel(estimate.date)} (마감시간 ${cutoffLabel} 전)`}
    </div>
  )
}

function boxStyle(warn: boolean): React.CSSProperties {
  return {
    background: warn ? '#FBEAE0' : colors.paper2,
    color: warn ? colors.warn : colors.navy,
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 12.8,
    fontWeight: 600,
    marginBottom: 14,
  }
}
