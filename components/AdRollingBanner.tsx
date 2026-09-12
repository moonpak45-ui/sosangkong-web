'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type BannerAd = {
  id: string
  partner_id: string | null
  advertiser_name: string | null
  banner_image_url: string
  partners: { name: string } | null
}

// /search 박스광고 그리드 바로 위에 들어가는 가로 스크롤 광고 배너(알바천국
// 스타일). status='active'이고 ad_type='banner'인 광고를 전부 가로로 나란히
// 배치해 오른쪽에서 왼쪽으로 천천히 무한 스크롤한다(app/admin/ads에서
// 승인된 것만 여기 노출됨). end_date가 지난 건 자동 제외(null이면 무기한).
// CSS 마퀴 방식은 /fortune 페이지(DailyFortuneCard.tsx, app/globals.css의
// .fortune-marquee-*)와 같은 패턴 — @keyframes/:hover 일시정지/
// prefers-reduced-motion만 globals.css의 .ad-marquee-* 클래스로 분리하고
// 나머지 레이아웃은 여기 inline style 그대로 유지. 활성 배너가 없으면
// 렌더링 자체를 생략.
export default function AdRollingBanner() {
  const [banners, setBanners] = useState<BannerAd[] | null>(null)

  useEffect(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    supabase
      .from('ads')
      .select('id, partner_id, advertiser_name, banner_image_url, partners ( name )')
      .eq('status', 'active')
      .eq('ad_type', 'banner')
      .or(`end_date.is.null,end_date.gte.${todayIso}`)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setBanners((data || []) as unknown as BannerAd[])
      })
  }, [])

  if (!banners || banners.length === 0) return null

  // 배너 개수가 늘어나도 체감 속도(px/초)가 비슷하게 유지되도록 개수에
  // 비례해 한 사이클 길이를 늘린다 — 최소 8초(기존 대비 2배 이상 빠른 속도).
  const durationSec = Math.max(8, banners.length * 2.5)

  return (
    <div className="ad-marquee" style={styles.wrap}>
      <div className="ad-marquee-track" style={{ ...styles.track, animationDuration: `${durationSec}s` }}>
        <div className="ad-marquee-group" style={styles.group}>
          {banners.map((b) => (
            <BannerItem key={b.id} banner={b} />
          ))}
        </div>
        {/* 이음매 없는 무한 반복을 위한 복제본 — 스크린리더에는 노출하지 않음 */}
        <div className="ad-marquee-group ad-marquee-clone" aria-hidden="true" style={styles.group}>
          {banners.map((b) => (
            <BannerItem key={`clone-${b.id}`} banner={b} />
          ))}
        </div>
      </div>
    </div>
  )
}

function BannerItem({ banner }: { banner: BannerAd }) {
  const alt = banner.partners?.name || banner.advertiser_name || '광고 배너'
  const img = <img src={banner.banner_image_url} alt={alt} style={styles.img} />

  // 관리자가 파트너 없이 직접 등록한(제3자 광고주) 배너는 연결할 상세
  // 페이지가 없으므로 링크 없이 이미지만 표시.
  if (!banner.partner_id) {
    return <div style={styles.item}>{img}</div>
  }

  return (
    <a href={`/partner/${banner.partner_id}`} style={styles.item}>
      {img}
    </a>
  )
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: {
    overflow: 'hidden',
    borderRadius: 10,
    marginBottom: 22,
    background: '#EFF5F8',
    padding: '10px 0',
  },
  track: { display: 'flex', width: 'max-content' },
  group: { display: 'flex' },
  item: {
    display: 'block',
    flexShrink: 0,
    height: 90,
    marginRight: 14,
    borderRadius: 8,
    overflow: 'hidden',
  },
  img: { height: '100%', width: 'auto', display: 'block' },
}
