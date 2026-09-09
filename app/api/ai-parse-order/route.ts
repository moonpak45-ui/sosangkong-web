import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

// "AI 거래전표 빠른입력"의 서버 쪽 절반. 이 프로젝트는 지금까지 전부
// 클라이언트에서 anon key로 직접 Supabase를 호출하는 구조였는데(Route
// Handler를 쓴 적이 없음), ANTHROPIC_API_KEY를 브라우저에 노출할 수는
// 없어서 이 라우트를 처음으로 신설함. 이 라우트는 Claude 호출만 담당하고
// DB 쓰기(item_aliases/ai_parse_logs/deal_line_items)는 전부 클라이언트가
// 기존 방식대로(사용자 세션 + RLS) 직접 처리함 — 이 라우트 자체는 DB에
// 아무것도 쓰지 않음.

const ParsedLineItemSchema = z.object({
  raw_phrase: z.string(),
  item_name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unit_price: z.number().nullable(),
  is_credit_guess: z.boolean(),
  matched_existing_item: z.boolean(),
})

const ParsedOrderSchema = z.object({
  items: z.array(ParsedLineItemSchema),
})

const MAX_RAW_TEXT_LENGTH = 6000

const SYSTEM_PROMPT = `당신은 한국 식자재/도소매 공급업체가 카카오톡 등 메신저로 받은 주문 대화를 읽고, 거래전표 등록에 필요한 품목 정보를 추출하는 도우미입니다.

규칙:
1. 대화에서 실제로 주문/발주된 품목만 추출하세요(인사말, 배송 안내, 잡담은 무시).
2. "기존 등록 품목 목록"에 있는 이름과 조금이라도 비슷하면 그 이름을 그대로 item_name으로 쓰고 matched_existing_item을 true로 설정하세요.
3. "기존 별칭 매핑"에 있는 표현이 대화에 나오면 그 매핑을 최우선으로 따르세요.
4. 기존 품목/별칭 어디에도 매칭되지 않으면 대화에 쓰인 표현을 최대한 그대로 item_name으로 쓰고 matched_existing_item을 false로 설정하세요. 무리하게 기존 품목에 끼워맞추지 마세요 - 애매하면 false로 두고 사람이 확인하게 하세요.
5. raw_phrase에는 이 품목을 추출한 원문 표현을 그대로 넣으세요(예: "새우20박스").
6. quantity/unit은 대화에서 언급된 숫자와 단위를 그대로 반영하세요(박스/개/kg/포 등). 단위 표기가 없으면 "개"로 두세요.
7. unit_price는 대화에 명시된 경우에만 숫자로 넣고, 언급이 없으면 null로 두세요(추측해서 채우지 마세요).
8. is_credit_guess는 "외상", "월말정산", "이체할게요" 등 후불/외상을 암시하는 표현이 있으면 true, 즉시결제를 암시하면 false, 판단하기 어려우면 false로 두세요.
9. 확신이 없는 항목을 억지로 추측하지 마세요 - 이후 사람이 반드시 확인·수정하는 화면을 거칩니다.`

export async function POST(request: NextRequest) {
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

  // 유료 API를 호출하는 엔드포인트라, 로그인 여부뿐 아니라 실제 공급업체
  // 계정인지까지 확인함(users_select_own RLS로 본인 행만 조회 가능).
  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (userRow?.role !== 'partner') {
    return NextResponse.json({ error: '공급업체 계정만 이용할 수 있어요.' }, { status: 403 })
  }

  let body: { rawText?: string; stockItemNames?: string[]; aliases?: { alias_text: string; matched_item_name: string }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않아요.' }, { status: 400 })
  }

  const rawText = (body.rawText || '').trim()
  const stockItemNames = Array.isArray(body.stockItemNames) ? body.stockItemNames : []
  const aliases = Array.isArray(body.aliases) ? body.aliases : []

  if (!rawText) {
    return NextResponse.json({ error: '분석할 텍스트를 입력해주세요.' }, { status: 400 })
  }
  if (rawText.length > MAX_RAW_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `텍스트가 너무 길어요(최대 ${MAX_RAW_TEXT_LENGTH}자). 주문 관련 내용만 추려서 다시 시도해주세요.` },
      { status: 400 }
    )
  }

  const userContent = `# 기존 등록 품목 목록
${stockItemNames.length ? stockItemNames.map((n) => `- ${n}`).join('\n') : '(등록된 품목 없음)'}

# 기존 별칭 매핑 (원문 표현 → 실제 품목명)
${aliases.length ? aliases.map((a) => `- "${a.alias_text}" → "${a.matched_item_name}"`).join('\n') : '(저장된 매핑 없음)'}

# 카카오톡 대화 원문
${rawText}`

  const anthropic = new Anthropic()

  try {
    const response = await anthropic.messages.parse({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: zodOutputFormat(ParsedOrderSchema) },
    })

    if (!response.parsed_output) {
      return NextResponse.json({ error: 'AI 분석 결과를 해석하지 못했어요. 다시 시도해주세요.' }, { status: 502 })
    }

    return NextResponse.json({ items: response.parsed_output.items })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'AI 서비스 인증에 실패했어요. 관리자에게 문의해주세요.' }, { status: 500 })
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'AI 서비스 이용량이 많아요. 잠시 후 다시 시도해주세요.' }, { status: 429 })
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: 'AI 분석 중 오류가 발생했어요: ' + error.message }, { status: 502 })
    }
    return NextResponse.json({ error: 'AI 분석 중 알 수 없는 오류가 발생했어요.' }, { status: 500 })
  }
}
