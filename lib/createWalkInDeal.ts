import { supabase } from './supabaseClient'

export type WalkInDealInput = {
  partnerId: string
  businessName: string
  bizRegNo: string
  region: string
  industry: string
  contactName: string
  phone: string
  address: string
  categoryId: string
  amount: number
}

export type WalkInDealResult = { dealId: string } | { error: string }

// "새 거래처로 시작하기" - 이 앱에는 원래 partner가 직접 deals 행을 만드는
// 경로가 전혀 없었음(deals는 항상 buyer가 견적을 수락할 때 본인 세션으로
// insert함 - deals_insert_buyer 정책이 qd_is_my_buyer_id(buyer_id)만
// 허용, partner insert 정책 자체가 없음). 완전히 새로운 거래처(아직 이
// 시스템에 계정이 없는 상대방)의 첫 발주를 등록하려면 그 거래처의
// buyer_profiles가 먼저 있어야 하는데, buyer_profiles.insert도 본인
// (user_id = auth.uid())만 가능함.
//
// 그래서 이 함수는 admin/admins/page.tsx의 createAdmin()과 완전히 동일한
// 패턴을 씀: 1) partner의 현재 세션을 저장 2) signUp()으로 이 거래처용
// "그림자" 계정을 만듦(세션이 그 계정으로 즉시 전환됨 - 이메일 확인이
// 꺼져 있는 이 프로젝트 설정 때문) 3) 그 세션인 채로 users/buyer_profiles/
// deals를 본인 명의로 insert(각각의 기존 self-insert 정책을 그대로 만족)
// 4) 성공/실패 여부와 무관하게 partner의 원래 세션으로 반드시 복구.
//
// 이렇게 만든 buyer 계정은 실제로 로그인 가능한 진짜 계정이지만(이메일은
// .invalid 도메인이라 아무도 로그인할 수 없음), deals/settlements/
// ar_balances/notifications 등 기존 트리거·RLS·마이페이지 어디에서도
// "진짜 buyer_profiles가 딸린 정상적인 거래"와 완전히 동일하게 취급됨 -
// deals나 그 트리거를 전혀 건드리지 않고 기존 시스템 그대로 재사용하기
// 위한 선택.
export async function createWalkInDeal(input: WalkInDealInput): Promise<WalkInDealResult> {
  const {
    data: { session: originalSession },
  } = await supabase.auth.getSession()

  if (!originalSession) {
    return { error: '세션이 만료됐어요. 새로고침 후 다시 시도해주세요.' }
  }

  const uid = crypto.randomUUID()
  const email = `walkin-${uid}@sosangkong-walkin.invalid`
  const password = `Wk${uid.replace(/-/g, '')}!1`

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })

  if (signUpError || !signUpData.user || signUpData.user.identities?.length === 0) {
    await supabase.auth.setSession({
      access_token: originalSession.access_token,
      refresh_token: originalSession.refresh_token,
    })
    return { error: '거래처 계정 생성 중 오류가 발생했어요: ' + (signUpError?.message || '알 수 없는 오류') }
  }

  const newUserId = signUpData.user.id
  let dealId: string | null = null
  let stepError: string | null = null

  const { error: userInsertError } = await supabase.from('users').insert({
    id: newUserId,
    email,
    role: 'buyer',
  })

  if (userInsertError) {
    stepError = '거래처 계정 정보 저장 중 오류가 발생했어요: ' + userInsertError.message
  } else {
    const { data: profileRow, error: profileError } = await supabase
      .from('buyer_profiles')
      .insert({
        user_id: newUserId,
        business_name: input.businessName,
        biz_reg_no: input.bizRegNo || null,
        region: input.region || null,
        industry: input.industry || null,
        contact_name: input.contactName || null,
        phone: input.phone || null,
        address: input.address || null,
      })
      .select('id')
      .single()

    if (profileError || !profileRow) {
      stepError = '거래처 정보 저장 중 오류가 발생했어요: ' + (profileError?.message || '')
    } else {
      const { data: dealRow, error: dealError } = await supabase
        .from('deals')
        .insert({
          buyer_id: profileRow.id,
          partner_id: input.partnerId,
          category_id: input.categoryId,
          amount: input.amount,
          status: 'in_progress',
          confirmed_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (dealError || !dealRow) {
        stepError = '거래 생성 중 오류가 발생했어요: ' + (dealError?.message || '')
      } else {
        dealId = dealRow.id
      }
    }
  }

  // signUp()이 세션을 새 거래처 계정으로 바꿨으므로, 성공/실패와 무관하게
  // 반드시 partner의 원래 세션으로 복구함.
  await supabase.auth.setSession({
    access_token: originalSession.access_token,
    refresh_token: originalSession.refresh_token,
  })

  if (stepError || !dealId) {
    return { error: stepError || '거래 생성에 실패했어요.' }
  }

  return { dealId }
}
