'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RoleAwareCta from '../components/RoleAwareCta'
import BuyerHomeFeed from '../components/BuyerHomeFeed'
import HomeHeroSearch from '../components/HomeHeroSearch'
import { supabase } from '../lib/supabaseClient'
import IconCircle from '../components/ui/IconCircle'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'

type RootStatus = 'checking' | 'guest' | 'buyer' | 'redirecting'

// "/"는 로그인 여부/role과 무관하게 항상 같은 마케팅 랜딩이 보이던 곳이었음
// (Header는 로그인 상태를 반영하는데 정작 메인 화면은 그대로였던 버그의 근본
// 원인). role별로 완전히 다른 홈을 보여주도록 분기:
// - 비로그인 → 기존 마케팅 랜딩 그대로
// - buyer → 매칭 공급업체 피드(BuyerHomeFeed)
// - partner → /partner/dashboard로 리다이렉트(이미 있는 대시보드가 곧 홈)
// - admin/sub_admin → /admin/dashboard로 리다이렉트
export default function RootPage() {
  const router = useRouter()
  const [status, setStatus] = useState<RootStatus>('checking')

  useEffect(() => {
    let cancelled = false

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        if (!cancelled) setStatus('guest')
        return
      }

      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      const role = userRow?.role

      if (role === 'partner') {
        if (!cancelled) setStatus('redirecting')
        router.replace('/partner/dashboard')
        return
      }

      if (role === 'admin') {
        if (!cancelled) setStatus('redirecting')
        router.replace('/admin/dashboard')
        return
      }

      if (role === 'buyer') {
        if (!cancelled) setStatus('buyer')
        return
      }

      // role 조회 실패 등 알 수 없는 상태는 비로그인과 동일하게 마케팅 랜딩으로.
      if (!cancelled) setStatus('guest')
    }

    check()
    return () => {
      cancelled = true
    }
  }, [router])

  if (status === 'checking' || status === 'redirecting') {
    return <div style={{ padding: 80, textAlign: 'center', color: '#5B6B79' }}>불러오는 중...</div>
  }

  if (status === 'buyer') {
    return <BuyerHomeFeed />
  }

  return <MarketingLanding />
}

function MarketingLanding() {
  return (
    <>
      <style>{homeCss}</style>

      <HomeHeroSearch />

      <section className="cat-nav">
        <div className="wrap cat-row">
          {['냉동·수산', '축산', '식자재', '공산품', '배송 파트너', '전국 권역별'].map((label) => (
            <a className="cat-item" href="/search" key={label}>
              <IconCircle>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="8" stroke="#065A82" strokeWidth="1.6" />
                </svg>
              </IconCircle>
              <span>{label}</span>
            </a>
          ))}
        </div>
      </section>

      <div className="ad-band">
        <div className="wrap">
          <div className="ad-slot">
            <div className="ad-label">광고 (준비 중)</div>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="htext">
              <h2>지금 조건에 맞는 공급업체</h2>
              <p>배송정시율·응답률이 검증된 업체를 조건에 맞게 먼저 보여드립니다.</p>
            </div>
            <a className="link-more" href="/search">
              전체 업체 보기 ›
            </a>
          </div>

          <div className="supplier-grid">
            <SupplierCard
              premium
              name="그린테이블 식자재"
              loc="서울 마포구 · 냉동수산"
              onTime="97%"
              response="95%"
              rating="4.8"
              tags={['화요일 오전', '최소주문 10만↓']}
            />
            <SupplierCard
              name="한우촌 축산유통"
              loc="경기 성남시 · 축산"
              onTime="94%"
              response="90%"
              rating="4.6"
              tags={['주 2회 배송', '신용거래 가능']}
            />
            <SupplierCard
              name="해오름식자재"
              loc="서울 은평구 · 식자재"
              onTime="91%"
              response="88%"
              rating="4.5"
              tags={['당일 발주', '소량 가능']}
            />
            <SupplierCard
              name="대양공산 유통"
              loc="인천 남동구 · 공산품"
              onTime="89%"
              response="92%"
              rating="4.4"
              tags={['전국 배송', '정기계약 할인']}
            />
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head">
            <div className="htext">
              <h2>
                거래처 하나 바꾸는 데,
                <br />
                왜 이렇게 오래 걸릴까요
              </h2>
              <p>검색부터 재거래까지, 다섯 단계로 정리했습니다.</p>
            </div>
          </div>
          <div className="steps">
            <Step num="01" title="조건 검색" desc="지역·품목·배송시간·온도조건으로 원하는 공급업체를 찾습니다." />
            <Step num="02" title="비교" desc="가격뿐 아니라 배송정시율, 평점, 거래조건까지 한눈에 비교합니다." />
            <Step num="03" title="견적" desc="하나의 요청서로 여러 업체에 동시에 견적을 요청합니다." />
            <Step num="04" title="거래 관리" desc="주문·배송·정산·거래이력을 한 곳에서 관리합니다." />
            <Step num="05" title="대체 업체" desc="문제가 생기면 같은 조건의 대체 업체를 바로 추천받습니다." />
          </div>
        </div>
      </section>

      <section className="section showcase">
        <div className="wrap">
          <div className="section-head">
            <div className="htext">
              <h2>
                가장 싼 곳이 아니라,
                <br />
                가장 맞는 곳을 추천합니다
              </h2>
              <p>가격만 보면 놓치는 것들이 있습니다. 배송정시율과 응답률까지 반영한 매칭 점수로 순위를 매깁니다.</p>
            </div>
          </div>
          <div className="showcase-grid">
            <Card className="compare-card" style={{ padding: 28 }}>
              <h3>가격만 봤을 때</h3>
              <div className="cand">
                <div>
                  <div className="name">A업체</div>
                  <div className="meta">정확도 97% · 응답 95%</div>
                </div>
                <div className="score">100,000원</div>
              </div>
              <div className="cand">
                <div>
                  <div className="name">B업체</div>
                  <div className="meta">정확도 82% · 응답 65%</div>
                </div>
                <div className="score">95,000원</div>
              </div>
              <div className="cand picked">
                <div>
                  <div className="name">C업체</div>
                  <div className="meta">정확도 99% · 응답 98%</div>
                </div>
                <div className="score">103,000원</div>
              </div>
            </Card>
            <Card
              className="compare-card result"
              style={{ padding: 28, background: 'var(--color-primary)', border: 'none' }}
            >
              <h3>고객님의 조건 기준</h3>
              <div className="result-headline">
                C업체가 <b>96% 일치</b>합니다
              </div>
              <ul className="checklist">
                <li>배송지역 · 냉동수산물 취급 일치</li>
                <li>화요일 오전 배송 가능</li>
                <li>최소주문 10만원 이하 충족</li>
                <li>배송정확도 99% · 응답률 98%</li>
              </ul>
              <div className="why-box">
                추천 이유 : 마포구 내 냉동수산물 거래 경험이 많고, 요청하신 화요일 오전 배송 조건을 충족합니다.
              </div>
            </Card>
          </div>
        </div>
      </section>

      <div className="ad-band on-paper2">
        <div className="wrap">
          <div className="ad-slot">
            <div className="ad-label">광고 (준비 중)</div>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="htext">
              <h2>실제 이용 중인 소상공인의 이야기</h2>
              <p>거래처를 바꾼 뒤 무엇이 달라졌는지 직접 남겨주신 후기입니다.</p>
            </div>
          </div>
          <div className="review-grid">
            <ReviewCard
              stars="★★★★★"
              text="기존 거래처 배송이 계속 늦어서 골치였는데, 조건 검색으로 대체업체를 찾아서 견적 세 곳에 동시에 넣어봤어요. 이틀 만에 새 거래처로 바꿨습니다."
              initial="김"
              name="김O수 사장님"
              biz="마포구 · 일식당 운영"
            />
            <ReviewCard
              stars="★★★★★"
              text="가격만 보고 고르면 항상 배송이 문제였는데, 배송정시율이랑 응답률이 같이 보이니까 비교가 쉬웠어요. 지금 거래처는 3개월째 재거래 중입니다."
              initial="박"
              name="박O진 사장님"
              biz="성남시 · 베이커리 운영"
            />
            <ReviewCard
              stars="★★★★☆"
              text="전화 돌리면서 거래처 찾던 시절과 비교하면 훨씬 편해요. 다만 아직 등록된 업체가 지역별로 편차가 있어서 그 부분은 더 늘어나면 좋겠어요."
              initial="이"
              name="이O훈 사장님"
              biz="은평구 · 소형 마트 운영"
            />
          </div>
        </div>
      </section>

      <section className="section promo" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head">
            <div className="htext">
              <h2>공급업체를 위한 노출 상품</h2>
              <p>등록은 무료입니다. 더 많은 소상공인에게 먼저 보이고 싶다면 노출 상품을 이용하세요.</p>
            </div>
          </div>
          <div className="promo-grid">
            <Card
              className="promo-card p1"
              style={{ padding: 24, background: 'linear-gradient(135deg,var(--navy),var(--deep))', border: 'none' }}
            >
              <div className="promo-eyebrow">우선 노출</div>
              <h3>검색 결과 상단 고정</h3>
              <p>조건이 맞는 검색 결과 상단에 업체 정보를 고정 노출합니다.</p>
              <a className="promo-cta" href="/login">
                상품 안내 보기 ›
              </a>
            </Card>
            <Card
              className="promo-card p2"
              style={{ padding: 24, background: 'linear-gradient(135deg,#0B7A6D,#0A4A44)', border: 'none' }}
            >
              <div className="promo-eyebrow">카테고리 배지</div>
              <h3>&apos;검증 업체&apos; 인증 배지</h3>
              <p>실사 및 서류 검증을 완료한 업체에 표시되는 신뢰 배지입니다.</p>
              <a className="promo-cta" href="/login">
                상품 안내 보기 ›
              </a>
            </Card>
            <Card
              className="promo-card p3"
              style={{ padding: 24, background: 'linear-gradient(135deg,var(--amber-deep),#8A5A0E)', border: 'none' }}
            >
              <div className="promo-eyebrow">리드 알림</div>
              <h3>실시간 견적 요청 알림</h3>
              <p>조건에 맞는 소상공인의 견적 요청을 가장 먼저 받아보세요.</p>
              <a className="promo-cta" href="/login">
                상품 안내 보기 ›
              </a>
            </Card>
          </div>
        </div>
      </section>

      <section className="supply">
        <div className="wrap">
          <Card className="supply-grid" style={{ padding: 40 }}>
            <div>
              <h2>
                이미 다니는 배송 노선에,
                <br />
                거래처 하나만 더 얹어보세요
              </h2>
              <p>전화 영업 대신 프로필과 배송조건만 등록하면, 조건이 맞는 소상공인에게 자동으로 연결됩니다.</p>
              <div className="supply-mini-stats">
                <div>
                  <b>312개</b>등록 공급업체
                </div>
                <div>
                  <b>3개월</b>수수료 무료 기간
                </div>
                <div>
                  <b>2~5%</b>거래 성사 시 수수료
                </div>
              </div>
            </div>
            <RoleAwareCta targetRole="partner" variant="primary">
              공급업체 무료 등록
            </RoleAwareCta>
          </Card>
        </div>
      </section>
    </>
  )
}

type HomepageStats = {
  deals_today: number
  quotes_waiting: number
  partners_approved: number
}

// 0부터 target까지 ease-out으로 올라가는 카운트업 애니메이션. target이
// null인 동안(RPC 응답 전)은 애니메이션을 시작하지 않음 - 0에서 멈춰있다가
// 실제 값이 오면 그때부터 올라감.
function useCountUp(target: number | null, durationMs = 1000) {
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

// 집계 전용 RPC(qd_public_homepage_stats, supabase/migrations/
// 20260921000000_public_homepage_stats_rpc.sql)를 호출 - deals/
// quote_request_targets는 비로그인 사용자에게 select 권한이 없어서
// (buyer/partner 본인 또는 admin만 조회 가능) 개별 행 대신 숫자 3개만
// 반환하는 함수를 통해서만 값을 가져올 수 있음.
function ActivityStats() {
  const [stats, setStats] = useState<HomepageStats | null>(null)

  useEffect(() => {
    supabase
      .rpc('qd_public_homepage_stats')
      .then(({ data, error }) => {
        if (error || !data) return
        const row = Array.isArray(data) ? data[0] : data
        if (row) {
          setStats({
            deals_today: Number(row.deals_today) || 0,
            quotes_waiting: Number(row.quotes_waiting) || 0,
            partners_approved: Number(row.partners_approved) || 0,
          })
        }
      })
  }, [])

  const dealsToday = useCountUp(stats ? stats.deals_today : null)
  const quotesWaiting = useCountUp(stats ? stats.quotes_waiting : null)
  const partnersApproved = useCountUp(stats ? stats.partners_approved : null)

  return (
    <section className="activity-stats-section">
      <div className="wrap">
        <div className="activity-stats-grid">
          <Card className="activity-stat-card">
            <div className="as-num">{dealsToday.toLocaleString('ko-KR')}건</div>
            <div className="as-label">오늘 등록된 신규 거래</div>
          </Card>
          <Card className="activity-stat-card">
            <div className="as-num">{quotesWaiting.toLocaleString('ko-KR')}건</div>
            <div className="as-label">현재 검토 중인 견적</div>
          </Card>
          <Card className="activity-stat-card">
            <div className="as-num">{partnersApproved.toLocaleString('ko-KR')}곳</div>
            <div className="as-label">등록된 공급업체</div>
          </Card>
        </div>
      </div>
    </section>
  )
}

function SupplierCard({
  premium,
  name,
  loc,
  onTime,
  response,
  rating,
  tags,
}: {
  premium?: boolean
  name: string
  loc: string
  onTime: string
  response: string
  rating: string
  tags: string[]
}) {
  return (
    <Card
      className={`supplier-card${premium ? ' premium' : ''}`}
      style={premium ? { border: '1.5px solid var(--color-accent)' } : undefined}
    >
      {premium && <Badge style={{ marginBottom: 12 }}>우선 노출</Badge>}
      <div className="sc-top">
        <div className="sc-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M4 12c2-3 4-4 8-4s6 1 8 4c-2 3-4 4-8 4s-6-1-8-4Z" stroke="#065A82" strokeWidth="1.6" />
          </svg>
        </div>
        <div>
          <div className="sc-name">{name}</div>
          <div className="sc-loc">{loc}</div>
        </div>
      </div>
      <div className="sc-stats">
        <div className="sc-stat">
          <b>{onTime}</b>
          <span>배송정시율</span>
        </div>
        <div className="sc-stat">
          <b>{response}</b>
          <span>응답률</span>
        </div>
        <div className="sc-stat">
          <b>{rating}</b>
          <span>거래 평점</span>
        </div>
      </div>
      <div className="sc-tags">
        {tags.map((t) => (
          <span className="sc-tag" key={t}>
            {t}
          </span>
        ))}
      </div>
      <Button variant="primary" size="sm" style={{ width: '100%' }}>
        무료 견적 요청
      </Button>
    </Card>
  )
}

function Step({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="step">
      <span className="num">{num}</span>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  )
}

function ReviewCard({
  stars,
  text,
  initial,
  name,
  biz,
}: {
  stars: string
  text: string
  initial: string
  name: string
  biz: string
}) {
  return (
    <Card className="review-card" style={{ padding: 22 }}>
      <div className="review-stars">{stars}</div>
      <p className="review-text">{text}</p>
      <div className="review-who">
        <div className="review-avatar">{initial}</div>
        <div>
          <div className="review-name">{name}</div>
          <div className="review-biz">{biz}</div>
        </div>
      </div>
    </Card>
  )
}

const homeCss = `
  :root{
    --deep:#0A1E3D; --navy:#065A82; --teal:#1C7293; --ink:#16233B;
    --amber:#F2A93B; --amber-deep:#D98D1F;
    --paper:#F7FAFC; --paper2:#EFF5F8; --line:#D9E3EA; --muted:#5B6B79; --white:#FFFFFF;
    --good:#0B7A6D; --good-bg:#E3F4F0;
  }
  body{ background:var(--paper); }
  h1,h2,h3{ font-family:'Noto Serif KR',serif; font-weight:600; margin:0; color:var(--deep); }
  .wrap{max-width:1180px;margin:0 auto;padding:0 32px;}
  .activity-stats-section{ padding:20px 0 0; }
  .activity-stats-grid{ display:grid;grid-template-columns:repeat(3,1fr);gap:16px; }
  .activity-stat-card{ text-align:center;padding:22px 16px; }
  .as-num{ font-family:'Noto Serif KR',serif;font-size:30px;font-weight:700;color:var(--navy); }
  .as-label{ font-size:13px;color:var(--muted);margin-top:6px; }
  .cat-nav{ margin:28px 0 8px; }
  .cat-row{ display:flex;justify-content:space-between;gap:8px; background:var(--white);border-radius:14px;padding:26px 20px; box-shadow:0 16px 40px rgba(5,20,40,0.25); }
  .cat-item{ display:flex;flex-direction:column;align-items:center;gap:9px;flex:1;padding:6px 4px;border-radius:8px; text-decoration:none; }
  .cat-item:hover{background:var(--paper2);}
  .cat-item span{font-size:13px;font-weight:500;color:var(--ink);}
  .section{padding:80px 0;}
  .section-head{ display:flex;justify-content:space-between;align-items:flex-end;max-width:100%;margin-bottom:44px;gap:24px; }
  .section-head .htext{max-width:640px;}
  .section-head h2{font-size:27px;line-height:1.4;}
  .section-head p{margin-top:12px;color:var(--muted);font-size:15px;max-width:56ch;}
  .link-more{font-size:14px;font-weight:700;color:var(--navy);white-space:nowrap;padding-bottom:4px;text-decoration:none;}
  .supplier-grid{ display:grid;grid-template-columns:repeat(4,1fr);gap:18px; }
  .sc-top{display:flex;align-items:center;gap:12px;margin-bottom:14px;}
  .sc-icon{ width:48px;height:48px;border-radius:9px;background:var(--paper2); display:flex;align-items:center;justify-content:center;flex-shrink:0; }
  .sc-name{font-size:15px;font-weight:700;color:var(--ink);}
  .sc-loc{font-size:12px;color:var(--muted);margin-top:2px;}
  .sc-stats{display:flex;gap:14px;margin:12px 0 14px;padding:12px 0;border-top:1px dashed var(--line);border-bottom:1px dashed var(--line);}
  .sc-stat{flex:1;text-align:center;}
  .sc-stat b{display:block;font-size:15px;color:var(--navy);font-family:'Noto Serif KR',serif;}
  .sc-stat span{font-size:11px;color:var(--muted);}
  .sc-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;}
  .sc-tag{font-size:11.5px;background:var(--paper2);color:var(--muted);padding:4px 9px;border-radius:14px;}
  .steps{ display:grid;grid-template-columns:repeat(5,1fr);gap:0;border-top:1px solid var(--line); }
  .step{ padding:28px 20px 0 0;border-right:1px solid var(--line); }
  .step:last-child{border-right:none;}
  .step .num{ font-family:'Noto Serif KR',serif;font-size:15px;color:var(--amber);font-weight:700; border-top:2px solid var(--amber);padding-top:10px;display:block;margin-top:-2px;width:34px; }
  .step h3{font-size:16px;margin-top:18px;color:var(--deep);}
  .step p{font-size:13px;color:var(--muted);margin-top:8px;}
  .showcase{background:var(--paper2);}
  .showcase-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:stretch;}
  .compare-card h3{font-size:15px;color:var(--muted);font-weight:500;margin-bottom:18px;font-family:'Noto Sans KR',sans-serif;}
  .compare-card.result h3{color:#9FC3D8;}
  .cand{display:flex;justify-content:space-between;align-items:baseline;padding:13px 0;border-bottom:1px solid var(--paper2);}
  .cand:last-child{border-bottom:none;}
  .cand .name{font-weight:700;font-size:14.5px;}
  .cand .meta{font-size:12.5px;color:var(--muted);margin-top:3px;}
  .cand .score{font-size:13.5px;color:var(--muted);}
  .cand.picked .name{color:var(--navy);}
  .result-headline{font-size:21px;color:var(--white);font-family:'Noto Serif KR',serif;margin-bottom:16px;}
  .result-headline b{color:var(--amber);}
  .checklist{list-style:none;padding:0;margin:0 0 18px;}
  .checklist li{color:#D5E4EC;font-size:13.5px;padding:6px 0;padding-left:22px;position:relative;}
  .checklist li::before{content:"";position:absolute;left:0;top:12px;width:8px;height:8px;border-radius:50%;background:var(--amber);}
  .why-box{background:rgba(255,255,255,0.06);border-radius:6px;padding:14px 16px;font-size:13px;color:#B9CFE0;line-height:1.6;}
  .review-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
  .review-stars{color:var(--amber);font-size:14px;letter-spacing:2px;margin-bottom:12px;}
  .review-text{font-size:14px;color:var(--ink);line-height:1.75;min-height:96px;}
  .review-who{display:flex;align-items:center;gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid var(--paper2);}
  .review-avatar{width:34px;height:34px;border-radius:50%;background:var(--paper2);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--navy);font-family:'Noto Serif KR',serif;}
  .review-name{font-size:13px;font-weight:700;}
  .review-biz{font-size:12px;color:var(--muted);}
  .promo{background:var(--white);}
  .promo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
  .promo-card{ color:var(--white);position:relative;overflow:hidden; }
  .promo-eyebrow{font-size:12px;font-weight:700;opacity:0.85;margin-bottom:10px;}
  .promo-card h3{color:var(--white);font-size:18px;margin-bottom:8px;}
  .promo-card p{font-size:13px;opacity:0.9;margin:0 0 18px;line-height:1.6;}
  .promo-cta{font-size:13px;font-weight:700;text-decoration:underline;color:var(--white);}
  .supply{ background:var(--paper2);padding:60px 0; }
  .supply-grid{display:flex;justify-content:space-between;align-items:center;gap:32px;flex-wrap:wrap;}
  .supply h2{font-size:24px;max-width:540px;}
  .supply p{color:var(--muted);margin-top:10px;max-width:480px;font-size:14px;}
  .supply-mini-stats{display:flex;gap:22px;margin-top:16px;}
  .supply-mini-stats div{font-size:13px;color:var(--muted);}
  .supply-mini-stats b{display:block;font-family:'Noto Serif KR',serif;font-size:20px;color:var(--navy);}
  .ad-slot{ background:var(--white);border:1px solid var(--line);border-radius:10px; padding:24px;text-align:center; color:var(--muted); font-size:12px; }
  .ad-slot .ad-label{ font-size:10.5px;color:var(--muted);text-align:left;margin-bottom:8px;letter-spacing:0.3px; }
  .ad-band{padding:28px 0;background:var(--white);}
  .ad-band.on-paper2{background:var(--paper2);}
  @media (max-width:900px){
    .steps{grid-template-columns:repeat(2,1fr);}
    .step{border-bottom:1px solid var(--line);padding-bottom:20px;}
    .showcase-grid{grid-template-columns:1fr;}
    .supplier-grid{grid-template-columns:repeat(2,1fr);}
    .review-grid{grid-template-columns:1fr;}
    .promo-grid{grid-template-columns:1fr;}
    .cat-row{flex-wrap:wrap;}
    .cat-item{flex:0 0 30%;}
    .activity-stats-grid{grid-template-columns:1fr;}
  }
  @media (max-width:640px){
    .cat-row{ display:grid;grid-template-columns:repeat(4,1fr);gap:18px 6px;padding:22px 14px; }
    .cat-item{padding:2px;}
    .cat-item span{font-size:12px;}
  }
  @media (max-width:380px){
    .cat-row{grid-template-columns:repeat(2,1fr);}
  }
`
