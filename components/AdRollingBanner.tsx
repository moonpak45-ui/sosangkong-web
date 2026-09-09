'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type BannerAd = {
  id: string
  partner_id: string
  banner_image_url: string
  partners: { name: string } | null
}

const ROTATE_MS = 4500

// buyer 홈 피드 상단에 들어가는 롤링 배너 캐러셀. status='active'이고
// ad_type='banner'인 광고만 자동 슬라이드로 보여줌(app/admin/ads에서
// 승인된 것만 여기 노출됨). 활성 배너가 없으면 렌더링 자체를 생략하고,
// 1개뿐이면 화살표/도트 없이 고정 노출.
export default function AdRollingBanner() {
  const [banners, setBanners] = useState<BannerAd[] | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    supabase
      .from('ads')
      .select('id, partner_id, banner_image_url, partners ( name )')
      .eq('status', 'active')
      .eq('ad_type', 'banner')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setBanners((data || []) as unknown as BannerAd[])
      })
  }, [])

  useEffect(() => {
    if (!banners || banners.length <= 1) return
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % banners.length)
    }, ROTATE_MS)
    return () => clearInterval(timer)
  }, [banners])

  if (!banners || banners.length === 0) return null

  const current = banners[index]
  const showControls = banners.length > 1

  return (
    <div style={styles.wrap}>
      <a href={`/partner/${current.partner_id}`} style={styles.slide}>
        <img src={current.banner_image_url} alt={current.partners?.name || '광고 배너'} style={styles.img} />
      </a>

      {showControls && (
        <>
          <button
            type="button"
            aria-label="이전 배너"
            style={{ ...styles.arrow, left: 10 }}
            onClick={() => setIndex((i) => (i - 1 + banners.length) % banners.length)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="다음 배너"
            style={{ ...styles.arrow, right: 10 }}
            onClick={() => setIndex((i) => (i + 1) % banners.length)}
          >
            ›
          </button>
          <div style={styles.dots}>
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`${i + 1}번째 배너로 이동`}
                onClick={() => setIndex(i)}
                style={{ ...styles.dot, ...(i === index ? styles.dotActive : {}) }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: {
    position: 'relative',
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 22,
    background: '#EFF5F8',
  },
  slide: { display: 'block' },
  img: { width: '100%', height: 'clamp(90px, 16vw, 180px)', objectFit: 'cover', display: 'block' },
  arrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 30,
    height: 30,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(10,30,61,0.55)',
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: '28px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255,255,255,0.55)',
    cursor: 'pointer',
    padding: 0,
  },
  dotActive: { background: '#FFFFFF' },
}
