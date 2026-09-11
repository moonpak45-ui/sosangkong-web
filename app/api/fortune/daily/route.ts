// app/api/fortune/daily/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calcTodayIljin } from '@/lib/saju/calcSaju'
import { getRelationTypePrecise } from '@/lib/saju/relationType'

const CATEGORIES = ['사업운', '매출운', '거래운'] as const

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser(token)

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  // 1. 사용자 사주 프로필 조회
  const { data: profile, error: profileError } = await supabase
    .from('saju_profiles')
    .select('day_pillar')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: '사주 프로필이 등록되어 있지 않습니다.', needsProfile: true },
      { status: 404 }
    )
  }

  // 2. 오늘 일진(한국 시간 기준) 계산 + 일자별 캐시 확인
  const { pillar: todayPillar, date: today } = calcTodayIljin()

  const { data: cached } = await supabase
    .from('daily_fortune_cache')
    .select('cards, premium_teaser')
    .eq('user_id', user.id)
    .eq('fortune_date', today)
    .maybeSingle()

  if (cached) {
    return NextResponse.json({
      date: today,
      cards: cached.cards,
      premiumTeaser: cached.premium_teaser,
      premiumLocked: true,
    })
  }

  // 3. 사용자 일주 vs 오늘 일진 관계 판정
  const relationType = getRelationTypePrecise(profile.day_pillar, todayPillar)

  // 4. 카테고리별 문구뱅크에서 랜덤 1개씩 조회
  const cards = await Promise.all(
    CATEGORIES.map(async (category) => {
      const { data: candidates } = await supabase
        .from('fortune_content_bank')
        .select('content, tone')
        .eq('category', category)
        .eq('relation_type', relationType)
        .eq('is_active', true)

      const pick =
        candidates && candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : { content: '오늘의 운세를 준비 중입니다.', tone: '중' }

      return { category, ...pick }
    })
  )

  // 5. 심화 리포트(유료 예정) 미리보기 문구 생성
  const { data: premiumCandidates } = await supabase
    .from('fortune_content_bank')
    .select('content')
    .eq('category', '상세조언')
    .eq('relation_type', relationType)
    .eq('is_active', true)

  const premiumContent =
    premiumCandidates && premiumCandidates.length > 0
      ? premiumCandidates[Math.floor(Math.random() * premiumCandidates.length)].content
      : '오늘의 심화 리포트를 준비 중입니다.'

  const premiumTeaser = premiumContent.slice(0, 20)

  // 6. 하루 1회 캐싱 저장
  await supabase.from('daily_fortune_cache').upsert(
    {
      user_id: user.id,
      fortune_date: today,
      relation_type: relationType,
      cards,
      premium_teaser: premiumTeaser,
    },
    { onConflict: 'user_id,fortune_date' }
  )

  return NextResponse.json({ date: today, cards, premiumTeaser, premiumLocked: true })
}
