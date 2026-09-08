# HANDOFF

이 문서는 다음 작업자(사람이든 다른 Claude 세션이든)가 이 저장소에서 바로 이어서
작업할 수 있도록, 코드만 봐서는 알기 어려운 맥락을 정리한 것입니다. 최신 상태로
유지해주세요 — 큰 기능 하나를 완료할 때마다 이 문서도 같이 갱신하는 걸 권장합니다.

## 마이그레이션 실행 방식 (중요)

이 프로젝트는 Supabase CLI로 로컬-원격을 연결하지 않았습니다(`supabase/config.toml`
없음). `supabase/migrations/*.sql` 파일들은 **자동으로 적용되지 않습니다** — 각
파일 상단 주석에 적혀 있듯, 사람이 Supabase 대시보드의 SQL Editor에 내용을
그대로 붙여넣어 직접 실행해야 합니다. Claude(에이전트)는 anon/publishable key만
갖고 있어서 DDL을 실행할 권한이 없습니다.

파일명은 `YYYYMMDDHHMMSS_설명.sql` 규칙을 따르고, 전부 재실행해도 안전하도록
작성되어 있습니다(`create table if not exists`, `create or replace function`,
`drop policy if exists` → `create policy` 등).

## ⚠ 이 저장소의 마이그레이션 파일 = 실제 DB 스키마의 100% 정확한 기록이 아님

여러 마이그레이션 파일 자체에 "이 테이블/컬럼이 이미 존재한다고 가정합니다"라는
주석이 있는데, 실제로 라이브 DB와 다른 경우가 여러 번 있었습니다. 예:

- `disputes` 테이블: 코드가 가정한 `reason`/`created_at` 컬럼이 실제로는 없었고
  (`description`, 컬럼 자체 없음), `status`는 `received`/`reviewing`/`resolved`
  세 값만 있는 ENUM이었음(반려에 해당하는 `rejected`는 없어서 나중에 추가함).
- `categories` 테이블: `group_type`(NOT NULL) 컬럼을 기존 "카테고리 추가" 코드가
  모르고 안 보내서, 이 기능이 계속 조용히 실패하고 있었음.
- `category_attribute_defs`: 기존 관리자 화면이 가정한 `name`/`required` 구조가
  아니라 `applies_to`(ENUM)/`attribute_key`/`attribute_label`/`data_type`을 가진,
  훨씬 복잡하고 지금 앱 어디서도 안 쓰이는 동적 폼 필드 스키마였음. **아직 손대지
  않음** — 다음에 이 테이블을 다루게 되면 반드시 실제 컬럼부터 확인할 것.

**교훈**: 새 기능이 기존 테이블(특히 리포에 `CREATE TABLE` 구문이 없는 테이블)을
건드릴 때는, 코드/마이그레이션 주석의 스키마 가정을 곧이곧대로 믿지 말고 먼저
실제 컬럼을 확인하세요. Service role key가 없어서 `information_schema`를 직접
조회할 수 없는 경우, PostgREST가 존재하지 않는 컬럼에 내는 에러 메시지
(`column X does not exist`, `null value in column Y violates not-null
constraint`)를 이용해 실제 컬럼을 하나씩 알아낼 수 있습니다(이번 세션에서 여러
번 이 방법으로 확인했습니다).

## 테스트 계정

| 이메일 | 비밀번호 | role |
|---|---|---|
| test01@test.com | 123456789 | buyer (소상공인, 사업장명 "all식당") |
| test4@email.com | 123456789 | partner (공급업체, "test공급식자재") |
| test3@test.com | 123456789 | admin |

그 외 seed 데이터에 "핫한 핫도그"(buyer) × "고푸드"(partner) 조합으로 실제 거래
내역(`deals`, `quote_requests` 등)이 여러 건 들어있습니다 — 로그인 정보는 모름,
관리자 계정으로만 조회 가능.

## 완료된 기능 (최근 작업 순)

- 모바일 반응형 전면 재작업 (헤더 검색폼, 하단 탭바, `.responsive-two-col` 그리드
  패턴, 각종 그리드의 `minmax(0,1fr)` 오버플로 수정)
- 관리자 콘솔: 분쟁·클레임 해결/반려 처리, 소상공인 계정 활성/정지(+정지 시
  견적요청 차단), 카테고리 수정/삭제(사용 중 카테고리는 FK로 삭제 차단)
- 마이페이지/파트너 대시보드 공용 "계정 설정"(이메일 조회, 비밀번호 변경)
- 재고관리북(ledgerbook) 1단계 — 거래전표/외상잔액/재고, 파트너 전용
- 재고관리북(ledgerbook) 2단계 — 소상공인 조회 화면(미결제 배지, 품목 드릴다운)
- **재고관리북(ledgerbook) 3단계** (이번 작업, 아래 상세) — 거래명세서 A4 인쇄

## 재고관리북(ledgerbook) 1단계

### 스키마 (`supabase/migrations/20260909000000_ledgerbook_phase1.sql`)

신규 테이블 3개:

- **`deal_line_items`**: 거래(`deals`) 하나에 여러 품목 행. `amount`는
  `quantity * unit_price`의 generated column.
- **`ar_balances`**: `partner_id` + `buyer_id`(=`auth.users.id`) 유니크. 외상잔액
  누적. 클라이언트 직접 write 불가 — 트리거로만 갱신.
- **`stock_levels`**: `partner_id` + `item_name` 유니크. 초기 등록은 파트너 본인이
  프로필 화면에서 insert, 이후 차감은 트리거로만.

트리거 `ledgerbook_on_line_item_insert()` (`deal_line_items` INSERT 후 실행,
`settlements_generate_on_deal_insert()`와 동일 패턴):

1. `is_credit = true`면 `ar_balances`에 upsert(같은 partner+buyer면 잔액 누적).
2. `stock_levels`에서 같은 `partner_id` + `item_name` 행의 `quantity_on_hand`를
   차감. **해당 품목 행이 없으면 매칭되는 행이 없어 조용히 아무 일도 안 일어남**
   (자동 생성 안 함 — 의도된 동작. 파트너가 프로필 화면에서 미리 등록해둔 품목만
   자동 차감됨).

**⚠ 스펙에서 명시적으로 벗어난 부분**: 스펙이 준 트리거 SQL은 `deals.buyer_id`를
그대로 `ar_balances.buyer_id`에 넣는데, 실제로는 이 둘이 다른 id 공간입니다 —
`deals.buyer_id`는 `buyer_profiles.id`이고, `ar_balances.buyer_id`는 스펙 정의상
`auth.users(id)` FK입니다. 그대로 쓰면 외상 거래를 등록할 때마다 FK 위반으로
실패합니다. 트리거 안에서 `buyer_profiles.user_id`로 한 번 더 변환하도록
고쳤습니다(마이그레이션 파일 안에 상세 주석 있음).

RLS: `deal_line_items`는 해당 거래의 buyer/partner 당사자만 select, partner
본인만 insert(`qd_is_my_partner_id()` 재사용). `ar_balances`/`stock_levels`는
partner 본인만 select. `stock_levels`는 초기 등록용 insert만 partner 본인에게
허용, 그 외(둘 다 update, ar_balances insert)는 정책을 아예 안 만들어서
기본 거부 → SECURITY DEFINER 트리거로만 값이 들어갑니다.

### 화면

- **`/partner/dashboard`** — "거래전표 등록" 사이드 메뉴(같은 페이지 내
  `#ledger-entry` 앵커) 추가: 진행 중(`in_progress`)인 거래 선택 → 품목명/수량/
  단위/단가/외상여부 입력 → 등록. 선택한 거래에 이미 등록된 전표 목록도 표시.
  "매출·재고 현황"(→ `/partner/ledger`) 링크도 함께 추가.
- **`/partner/ledger`** (신규, 조회 전용) — 이번 달 매출/전표건수/외상잔액합계/
  재고품목수 요약 카드(기존 `.partner-stats-grid` 재사용 — 데스크톱 4열, 640px
  이하 모바일 2열), 월별 매출 요약 표, 일자별 거래전표 내역, 외상잔액 현황,
  재고 현황. **쓰기 로직 없음.**
- **`/partner/profile`** — 기존 "프로필 · 배송조건 관리" 화면 하단에 "초기 재고
  등록" 카드 추가: 품목명/초기 수량/단위 입력해 `stock_levels`에 insert. 이미
  등록된 품목명이면(유니크 제약 위반, `23505`) "이미 등록된 품목이에요" 메시지.
  기존 재고 목록도 표시.

### 이번 단계에서 하지 않은 것 (스펙에서 명시적으로 제외됨)

- 세금계산서 발행 연동
- AI 요약 리포트
- 다중 사용자 권한
- 소상공인(buyer) 쪽 UI (자기 외상잔액 조회 등) — **2단계에서 완료됨, 아래 참고**
- `category_attribute_defs` 관리 UI (별도 사안, 위 스키마 불일치 섹션 참고)

### 추가로 알아둘 것 (스펙엔 없지만 구현하며 발견한 것)

- **"매입" 데이터 소스 없음**: `/partner/ledger`가 "월별·일자별 매입/매출"을
  보여주도록 스펙에 적혀 있지만, 이 스키마는 파트너가 **판매한** 품목만
  `deal_line_items`에 기록합니다(매입 스키마 없음). 그래서 이번 페이지는 매출만
  보여주고, 안내 문구로 그 사실을 명시했습니다. 파트너 자신의 매입(자기 상위
  공급처로부터의 구매)을 추적하려면 별도 테이블/플로우가 필요합니다.
- `stock_levels`는 **초기 등록만** 가능하고 이미 등록한 품목의 수량을 UI에서
  직접 수정하는 기능은 없습니다(재고 조정/실사 반영 등은 다음 단계 후보).
- 거래전표 등록 폼은 진행 중(`in_progress`)인 거래만 선택 가능하게 필터링했습니다
  (완료/분쟁 상태 거래에는 전표를 못 붙임 — 필요하면 범위 넓히는 걸 논의).

## 재고관리북(ledgerbook) 2단계 — 소상공인(buyer) 조회 화면

새 테이블 없음. 1단계 테이블에 buyer용 RLS만 추가하고 기존 마이페이지 메뉴
2곳을 확장.

### RLS (`supabase/migrations/20260910000000_ledgerbook_phase2_buyer_rls.sql`)

- `ar_balances`: `buyer_id = auth.uid()`인 행을 select 허용하는 정책
  (`ar_balances_select_buyer`)을 추가.
- `deal_line_items`: **변경 없음** — 1단계의 `deal_line_items_select_participant`
  정책이 이미 "그 거래의 buyer 또는 partner"를 허용하고 있어서, 별도 정책 추가
  없이 소상공인이 이미 자신의 거래전표를 조회할 수 있었습니다(작업 전 test01
  계정으로 실제 확인함).
- `stock_levels`: 스펙대로 buyer용 정책을 의도적으로 추가하지 않음 — 공급업체
  재고는 소상공인에게 노출되지 않습니다(실제로 빈 배열이 오는 것까지 확인).

### 화면 (새 메뉴 없음 — 기존 `/my-page` 메뉴 2곳만 확장)

- **"현재 거래처"** 카드: `ar_balances`를 `buyer_id = auth.uid()`로 조회해
  거래처별 잔액을 매핑(주의: `buyer_profiles.id`가 아니라 세션의
  `auth.users.id`로 조회해야 함 — 1단계와 같은 id 공간 문제). 잔액이 0보다 크면
  업체명 옆에 주황색 "미결제 OO원" 배지, 0이면 배지 자체를 렌더링하지 않음.
- **"거래 이력"** 표: 품목 셀(`itemsSummary` 텍스트)을 클릭하면 그 거래의
  `deal_line_items`를 지연 로딩(최초 클릭 시 1회 fetch, 이후 캐시)해서 바로
  아래에 품목명/수량/단가/금액/구분(외상·즉시결제 배지) 표를 펼쳐서 보여줌.
  한 번에 하나의 거래만 펼쳐지도록(`expandedDealId` 단일 상태) 구현. 결제/정산
  액션 버튼 없음 — 순수 조회.

실제 계정(test01)으로 미결제 배지 노출·품목 드릴다운·`stock_levels` 여전히
비노출까지 라이브 데이터로 검증함.

## 재고관리북(ledgerbook) 3단계 — 거래명세서 A4 인쇄

새 테이블/RLS 없음(마이그레이션 파일도 없음). 기존 `deals`/`deal_line_items`/
`partners`/`buyer_profiles`/`ar_balances` 조회만으로 구성. PDF 라이브러리
없이 `window.print()` + `@media print`/`@page` CSS만 사용.

### 라우트

`/partner/dashboard/deals/[id]/invoice`
(`app/partner/dashboard/deals/[id]/invoice/page.tsx`) — `/partner/dashboard`의
서브 라우트가 아니라 독립된 Next.js 라우트입니다(App Router는 같은 경로
아래 여러 `page.tsx`를 자유롭게 둘 수 있음). `lib/supabaseClient`까지의
상대 경로가 6단계(`../../../../../../lib/supabaseClient`)라 깊이가 헷갈리기
쉬운데, `tsconfig.json`에 `@/*` alias가 설정되어 있으니(현재 다른 파일들은
전부 상대경로를 씀 - 일관성 위해 이번에도 상대경로 사용) 다음에 이런 깊은
라우트를 또 만들면 `@/lib/...`을 쓰는 것도 고려해볼 것.

### 접근 권한

별도 정책 불필요 — `deals_select_buyer_or_partner`(1단계 이전부터 있던 기존
정책)가 이미 해당 거래의 buyer 또는 partner 본인만 select 가능하게 막아줌.
작업 전에 실제로 확인한 것:

- `buyer_profiles_select_partner_target` 정책(거래처가 자신에게 견적요청을
  보낸 적 있는 소상공인의 buyer_profiles를 조회 가능하게 함)이 명세서에
  필요한 주소/담당자명까지 포함한 **전체 컬럼**을 파트너에게 노출하는지 실제
  계정으로 확인함(RLS는 컬럼이 아니라 행 단위라, 해당 행이 보이면 전체
  컬럼이 다 보임 — 확인 완료).
- test01(buyer), test4(partner) 둘 다 같은 거래의 명세서에 접근 가능함을
  확인, 세션 없는 익명 요청은 거부됨(권한 없음 안내 문구)을 확인함.

### "연락처"/"주소" 컬럼 — 처음엔 없었지만 이후 추가됨

3단계 최초 작업 당시엔 `partners`/`buyer_profiles` 어디에도 전화번호류
컬럼이 없어서 임시로 담당자 이름을 연락처 자리에 넣거나 `-`로 표시했습니다.
이후 두 마이그레이션으로 실제 데이터를 채웠습니다:

- `20260909120000_add_phone_columns.sql` — `partners.phone`,
  `buyer_profiles.phone` (둘 다 nullable) 추가, `/partner/profile`·
  `/my-page/profile`에 "연락처" 입력 필드 추가.
- `20260911000000_add_partners_address.sql` — `partners.address`(nullable)
  추가. `buyer_profiles.address`는 이미 있었음(확인 완료).
  `/partner/profile`에 "주소" 입력 필드 추가.

지금은 명세서에 실제 연락처/주소 값이 표시되고, 값이 비어 있으면 `-`로
fallback합니다(이 앱 전체에서 쓰는 관례).

### 표준 거래명세서 양식으로 전면 재작업 (v2)

최초 버전(공급자/공급받는자 요약 박스 + 단순 품목 표)을 표준 거래명세표
양식에 맞춰 완전히 다시 만들었습니다. 이전 버전 코드는 남아있지 않고
완전히 대체됨.

**공급자용/공급받는자용 두 장, 인쇄 버튼 1개로 A4 "1장" 안에 위/아래로
출력 (v5, 현재 상태)**

v2(화면 토글 + 인쇄 3버튼) → v3("버튼 1개, 항상 2페이지") → v4("버튼 1개,
항상 A4 1페이지, 위/아래 배치")까지 왔는데, v4는 여전히 실제 브라우저
인쇄에서 1장에 안 들어간다는 리포트를 받아 v5에서 다시 손봄.

- **v4의 진짜 문제는 폰트 크기가 아니라 "화면용과 인쇄용 스타일을 분리한
  것" 그 자체였을 가능성이 큼.** v4는 표/정보박스 폰트는 화면·인쇄
  공용이었지만, 바깥 카드(`pageSheet`)의 margin/padding/border/box-shadow와
  제목 크기만 `@media print`로 한 번 더 줄이는 이중 구조였음. 이 카드
  래퍼가 화면에서는 `maxWidth: 800px`(px 고정값)였는데, 인쇄 가능 영역
  폭은 `210mm - 8mm*2 = 194mm ≈ 733px`로 800px보다 좁음 → **화면에서
  줄바꿈 안 되던 텍스트(품명, 참고사항 안내문, 주소 등)가 인쇄에서는 더
  좁은 폭 때문에 줄바꿈되면서 행 높이가 늘어나고, 이게 화면 미리보기에서는
  안 보이던 방식으로 세로 길이를 초과시켰을 것**으로 추정(화면 800px vs
  인쇄 733px 폭 불일치 → 줄바꿈 위치가 달라짐 → 화면에서 "괜찮아 보였던"
  높이가 인쇄에서는 실제로 더 컸을 가능성). v5에서는 이 폭 불일치와 이중
  스타일 구조를 모두 없앰.
- **v5 변경**: `app/globals.css`의 `.invoice-page-sheet`/`.invoice-title`/
  `.invoice-sheet-head`/`.invoice-cut-line`에 대한 `@media print` 오버라이드
  블록을 통째로 삭제. 이제 이 화면의 모든 스타일(표/정보박스/정산요약
  폰트·padding, 카드 여백, 제목 크기, 절취선 margin)이 컴포넌트 inline
  style **한 곳**에만 존재하고 화면·인쇄가 완전히 동일한 값을 씀. 카드
  폭도 `maxWidth: 800px` → `maxWidth: '194mm'`(인쇄 가능 영역 폭과 정확히
  일치)로 바꿔서, 화면에서 보이는 줄바꿈 위치가 인쇄에서도 그대로 재현됨.
  바깥 wrapper의 `minHeight: '100vh'`도 제거(인쇄에서 `vh` 단위는 브라우저마다
  해석이 갈릴 수 있어 잠재 위험 요소라 판단 - 화면에서는 배경색이 뷰포트
  전체를 못 채울 수 있지만 기능상 문제 없음).
- **v5 구체 수치** (요청받은 값 그대로 적용): 품목 표 데이터 셀 7px(padding
  1px/3px), 품목 표 헤더 8px(padding 1px/3px), 정보박스 라벨·값 8px(padding
  1px/4px), 정산요약 8px(padding 상하 2px), 제목 14px, 부제 9px, 제목
  영역(`sheetHead`) 아래 여백 4px. 절취선 `border-top: 1px dashed #999`,
  위아래 margin 4mm. `@page { size: A4 portrait; margin: 8mm; }`.
  행 높이는 padding+line-height로만 결정되고 별도 `min-height` 없음(요청대로).
- **실제 검증**: `npm install --no-save puppeteer-core`로 로컬 Chrome을
  직접 띄워(이 프로젝트엔 Playwright 등 브라우저 자동화 도구가 기본
  설치돼 있지 않음) 실제 로그인(test4@email.com) → 실제 거래
  (`37dbc5d5-...`, 품목 3개 실데이터 + 12개 빈 행) 명세서 페이지에 접속 후:
  1) 화면 상태 그대로 스크린샷 + `getBoundingClientRect` 측정
  2) `page.emulateMediaType('print')`로 전환 후 동일 스크린샷 + 측정
  3) `page.pdf({ preferCSSPageSize: true })`로 실제 인쇄 렌더링 PDF 생성

  결과: 화면과 인쇄 모드에서 카드 폭(193.997mm ≈ 194mm)과 사본 1개 높이
  (93.410mm)가 **소수점까지 완전히 동일** — 화면에 보이는 그대로가 인쇄
  결과임을 확인. PDF의 `/Pages` `/Count` 값 1 확인, `Read` 툴로 PDF 내용도
  직접 검토 - 15행 품목표(빈 행 포함) + 정보박스 + 정산요약까지 전부 한
  페이지(위: 공급자용, 아래: 공급받는자용, 점선 구분) 안에 정상 출력됨.
  사본 1개 높이 93.41mm는 사용 가능한 절반 영역(약 140.5mm,
  `(297-2*8)/2`)보다 약 47mm 여유가 있어, 실제 품목이 더 많거나 텍스트가
  길어져도 상당한 여유가 있음. 검증에 쓴 puppeteer-core는 확인 후 다시
  제거(`package.json`/`package-lock.json`에 반영 안 됨).

**점선 구분선을 용지 정중앙(148.5mm 지점)에 고정 (v6)**

v5까지는 각 사본이 실제 콘텐츠 높이(~93mm)만큼만 차지하고 위쪽에 붙어
있어서, 점선이 정중앙(140.5mm 지점)이 아니라 그보다 위(~93mm 지점)에
있고 페이지 하단에 빈 공간이 몰려 있었음. v6에서 이를 고정 높이 레이아웃
으로 바꿔서 해결.

- `pageSheet`(카드 wrapper)에 `height: '281mm'`(인쇄 가능 영역 높이,
  `297mm - 8mm*2`)를 고정으로 주고 `display: 'flex', flexDirection:
  'column'`으로 바꿈. 두 사본(`renderCopy`가 반환하는 `half` 블록)은 각각
  `height: '140.5mm'`(정확히 절반)로 고정하고 `boxSizing: 'border-box'`를
  줌 - 실제 콘텐츠가 이보다 작으면 블록 하단에 자연스럽게 여백이 남고,
  콘텐츠를 억지로 늘리지 않음(요청대로).
- 점선 구분선은 더 이상 두 사본 사이의 별도 `<div>`가 아니라, **공급자용
  블록(위쪽)의 `border-bottom: 1px dashed #999`**로 바뀜 - 두 블록이 항상
  정확히 절반씩이므로 이 경계선 자체가 항상 정중앙에 옴(`styles.halfDivider`,
  `renderCopy` 안에서 `variant === 'supplier'`일 때만 병합).
- **처음 이 방식대로 구현했을 때 빈 페이지 2장으로 늘어나는 회귀가
  발생함** - `pageSheet`에 남아있던 `margin: '10px auto'`(화면에서 카드를
  가운데 정렬하려던 용도) 때문. `pageSheet` 높이가 이미 인쇄 가능 영역과
  정확히 같은 281mm라서, 위아래로 조금이라도 margin이 붙으면 그만큼
  인쇄 흐름상 281mm를 초과해 버려 빈 2페이지가 추가로 생김. `margin: '0
  auto'`(좌우만 auto, 위아래는 0)로 고쳐서 해결 - **높이가 인쇄 가능
  영역과 정확히 같은 박스에는 세로 margin을 절대 주면 안 된다**는 게 이번에
  얻은 교훈.
- **검증**: 다시 `npm install --no-save puppeteer-core`로 로컬 Chrome을
  띄워 확인. `getBoundingClientRect`로 공급자용 블록의 `border-bottom`
  y좌표(=점선 위치)를 카드 상단 기준으로 측정한 결과, 화면·인쇄 모드
  둘 다 **140.498mm**(목표 140.5mm, 오차 0.002mm)로 완전히 일치. 카드
  자체 높이도 정확히 281.000mm. 카드가 인쇄 흐름의 첫 콘텐츠이고 위
  margin이 0이므로, 용지 맨 위 기준 점선의 실제 물리적 위치는 `8mm(@page
  margin) + 140.498mm ≈ 148.5mm` - 용지 전체 297mm의 정확히 50.0% 지점.
  `page.pdf({ preferCSSPageSize: true })`로 생성한 실제 인쇄 PDF도 `/Count`
  1(정확히 1장)로 재확인, `Read` 툴로 PDF를 직접 열어 점선이 위아래 여백을
  균등하게 남기며 정중앙에 있는 것도 눈으로 확인함. 검증에 쓴
  puppeteer-core는 이번에도 확인 후 제거.

**정보 박스**: 공급자/공급받는자 각각 `<table>`(사업자번호/상호·성명/주소/
연락처, 공급받는자는 성명·담당자·연락처까지) 형태로, 남색(`colors.navy`)
테두리를 씀. 2단 배치는 `.responsive-two-col` 재사용. 공급자는 담당자
이름에 대응하는 컬럼이 없어(`partners`에 그런 필드 없음) "성명"에
`partners.name`(상호와 동일)을 그대로 다시 보여줌 — 스펙이 명시한
fallback. 공급받는자는 "성명"과 "담당자" 두 행 모두 `buyer_profiles.
contact_name`(유일하게 있는 이름 필드)을 그대로 사용 — 스펙이 두 라벨을
요구했지만 스키마엔 값이 하나뿐이라 값을 중복 표시함.

**거래일자-NO**: `deals`에는 `created_at`이 따로 없고(`confirmed_at`만
있음 — 실제 컬럼 확인함, 이 앱에서는 거래 확정 시점이 곧 생성 시점이라
동일하게 취급) `confirmed_at`을 거래일자로 씀. NO는 `deal.id`의 앞 8자리를
대문자로.

**품목 테이블**: 순번/품명 및 규격/BOX/EA/총수량/단가/금액/비고/참고사항
9열. `unit`이 `box` 또는 `박스`를 포함하면(대소문자 무관) BOX 컬럼에,
그 외엔 EA 컬럼에 수량을 넣고 총수량엔 항상 `quantity`를 그대로 표시.
비고엔 `is_credit`이면 "외상". 참고사항은 스펙 그대로 **첫 행에만**
"정산 내역은 소상공 마이페이지에서 확인 가능합니다."(별도 계좌 정보가
없어 이 안내로 대체 — 스펙 지시). 합계 행에 BOX/EA/총수량/금액 합계.

**최소 15행 고정 (v3 추가)**: 실제 품목이 15개 미만이면 순번 1~15까지
항상 표시 — 부족한 행은 순번 숫자만 있고 나머지 칸은 공백인 빈 행으로
채움(`li ?? null`을 매핑해서 실데이터 행과 동일한 `styles.itemTd`를 그대로
쓰므로 테두리·높이는 완전히 동일). 실제 품목이 15개를 넘으면 그만큼
그대로 늘려서 전부 표시(데이터 누락 없음) — 행 수는
`Math.max(15, lineItems.length)`로 계산. 합계 행은 `<tfoot>`이라 항상
`<tbody>`의 모든 행(빈 행 포함/15행 초과 포함) 다음에 위치.

**정산 요약**: 전미수금/총미수금/금일입금/금일매출액/총합계를 계산합니다.
`ar_balances.balance`는 파트너-소상공인 쌍의 **누적** 외상잔액이라(여러
거래에 걸쳐 쌓임) 스펙이 제안한 "간단한 쪽"(트리거 스냅샷 컬럼 대신 역산)
으로 구현:
- `creditTotal` = 이번 거래 라인 중 `is_credit=true`인 것들의 amount 합
- `cashTotal`(금일입금) = `is_credit=false`인 것들의 amount 합
- `전미수금` = 현재 `ar_balances.balance` − `creditTotal` (이번 거래가
  반영하기 전 잔액을 역산)
- `총미수금` = 현재 `ar_balances.balance` 그대로
- `금일매출액` = `creditTotal + cashTotal`
- `총합계` = `전미수금 + 금일매출액` (스펙이 준 공식 그대로 — 외상/현금
  구분과 무관하게 "이 거래 전체 가치 + 이전 잔액"을 보여주는 용도로, 다음
  달로 넘어갈 실제 외상잔액은 `총미수금` 쪽이 정확한 값)
- `인수자`는 빈 서명란

실제 데이터(전미수금 0원 + 금일매출액 115,000원 = 총합계 115,000원)로
계산이 맞는 것까지 확인함.

**진입점**: `/partner/dashboard` "진행 중인 거래" 표의 "명세서 인쇄" 링크는
그대로 유지(변경 없음).

### 인쇄 CSS (`app/globals.css` 맨 아래)

`@media print`로 `header`/`footer`/`.mobile-tabbar`/`.invoice-no-print`를
전역으로 숨김(Header/Footer/MobileTabBar가 루트 레이아웃에서 모든 페이지에
렌더링되기 때문 — 페이지 단위로 숨기는 방법이 마땅치 않아 전역 규칙으로
처리함. 이건 매체별 "표시 여부"라 화면/인쇄 스타일 불일치 문제와는 무관 —
인쇄 대상이 늘어나면 재검토 필요). `@page { size: A4 portrait; margin: 8mm; }`
로 용지 규격·여백 고정(15mm → 8mm). **v5부터 이 화면 전용 `@media print`
오버라이드는 완전히 없앰** — 표/카드/제목 스타일은 전부 컴포넌트 inline
style 한 곳에서 화면·인쇄 공용으로 관리(위 v5 섹션 참고, 이 분리 자체가
화면-인쇄 불일치의 원인이었음).

### 이번 단계에서 하지 않은 것 (스펙에서 명시적으로 제외됨)

카카오 알림톡 발송 — 건당 비용 + 발송대행사 계약이 필요해 매출 발생 이후
유료 addon으로 별도 진행 예정. 관련 버튼/placeholder도 추가하지 않음.

## 다음에 할 만한 것 (제안, 확정 아님)

- ledgerbook 4단계 후보: 재고 수량 직접 조정 UI, 매입 추적, 다수 거래 동시
  선택/월별 필터링 같은 `/partner/ledger` 사용성 개선
- 카카오 알림톡 발송 연동 (유료 addon, 매출 발생 이후 예정)
- `category_attribute_defs` 실제 스키마에 맞춘 관리 UI (보류 중)
