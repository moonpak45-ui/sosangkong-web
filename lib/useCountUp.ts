import { useEffect, useState } from 'react'

// 0부터 target까지 ease-out으로 올라가는 카운트업 애니메이션. target이
// null인 동안(예: 비동기 데이터 로드 전)은 애니메이션을 시작하지 않고
// 0에서 멈춰있다가 실제 값이 오면 그때부터 올라감.
export function useCountUp(target: number | null, durationMs = 1000) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (target === null) return
    if (target <= 0) {
      setValue(0)
      return
    }

    let raf = 0
    const start = performance.now()

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round((target as number) * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return value
}
