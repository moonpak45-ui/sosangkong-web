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
| test3@test.com | 123456789 | admin (super_admin) |
| subadmin-test@test.com | subAdmin987! | admin (sub_admin) — sub_admin 권한 테스트용으로 생성, 계정 자체는 계속 남겨둠 |

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
- 재고관리북(ledgerbook) 3단계 — 거래명세서 A4 인쇄(v1~v9, 여러 차례 수정)
- **관리자 콘솔 3건** (이번 작업, 아래 상세) — 회원 목록 로그인 ID 표시,
  관리자 비밀번호 변경, 중급 관리자(sub_admin) 권한 체계

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

**폰트 한 단계 확대 (v7)**

v6까지의 폰트(품목 표 7~8px 등)로 여백이 47mm(약 33%)나 남는 게 확인돼서,
가독성을 위해 폰트/padding을 한 단계씩 키움. `half` 블록 높이(140.5mm)와
`pageSheet` 높이(281mm)는 그대로 - 구조는 안 건드리고 안에 들어가는 값만
키움. v5/v6에서 자리잡은 "화면·인쇄 공용 inline style 한 곳" 원칙도 계속
유지 - 이번에도 `@media print` 전용 분기 추가하지 않음.

| 요소 | v6 | v7 |
|---|---|---|
| 품목 표 본문(`itemTd`/`itemTdTotal`) | 7px, padding 1px/3px | 9px, padding 2px/3px |
| 품목 표 헤더(`itemTh`) | 8px, padding 1px/3px | 10px, padding 2px/4px |
| 정보박스(`infoTh`/`infoTd`) | 8px, padding 1px/4px | 10px, padding 2px/5px |
| 정산요약(`summaryTh`/`summaryTd`) | 8px, padding 2px/5px(유지) | 10px, padding 2px/5px(유지) |
| 제목(`title`) | 14px | 16px |
| 부제(`subtitle`) | 9px | 10px |
| `sheetHead` 아래 여백 | 4px | 6px |

**검증**: 다시 puppeteer-core로 로컬 Chrome 띄워 확인(방식은 v6과 동일 -
실제 로그인 → 실제 거래 페이지 → 화면/인쇄 모드 각각 측정 → 실제
print-to-PDF 생성). 결과:
- 사본 1개 콘텐츠 실제 높이: 화면·인쇄 모드 공통 **121.576mm** (v6의
  93.41mm에서 증가, `half` 한도 140.5mm 대비 약 19mm/13% 여유 남음 - 아직
  안전 마진 있음, 실제 품목이 더 많거나 이름이 길어지는 경우를 위해 더는
  키우지 않는 게 안전).
- 점선 위치: 화면·인쇄 모드 공통 카드 상단 기준 **140.498mm**(목표
  140.5mm) - `half` 높이가 고정이라 콘텐츠 크기와 무관하게 그대로 유지됨.
- `pageSheet` 높이: 정확히 **281.000mm** 그대로.
- 실제 print-to-PDF `/Pages` `/Count` = **1** 재확인(빈 2페이지 회귀 없음).
- 검증에 쓴 puppeteer-core는 확인 후 다시 제거.

**@page margin 8mm → 12mm로 상향, 실물 프린터 2페이지 회귀 수정 (v8)**

v7 배포 직후 "실제 프린터로 인쇄하면 2장으로 넘친다"는 리포트를 받음
(Chrome 인쇄 미리보기의 "용지 2장" 표시 스크린샷으로 확인, 물리 프린터
인쇄 - "다른 이름으로 저장(PDF)"이 아님, 실제 품목 개수는 테스트 계정과
비슷한 15개 이하).

- **puppeteer-core로 먼저 정확한 수치부터 재확인**(감으로 줄이지 않기
  위해). 같은 테스트 거래(품목 3개 + 빈 행 12개, 유일하게 접근 가능한
  테스트 데이터)로 v7 상태를 재측정한 결과: 사본 1개 콘텐츠 높이
  **121.576mm** (`half` 한도 140.5mm 대비 여유 18.9mm), `page.pdf()`
  `/Count` = **1**. 즉 **헤드리스 Chrome의 print-to-PDF 파이프라인으로는
  전혀 재현되지 않음** - 콘텐츠가 넘쳐서 생긴 문제가 아니라는 뜻.
- 이 결과를 근거로 사용자에게 재현 방법(실물 프린터 vs PDF 저장)과 품목
  개수를 확인 요청 → "실물 프린터로 인쇄", "품목 15개 이하(테스트와
  비슷)"라는 답을 받음. 콘텐츠 양은 같은데 헤드리스에서는 안 넘치고 실물
  프린터에서만 넘친다는 건, **문제가 콘텐츠 쪽이 아니라 "인쇄 가능 영역
  자체가 우리 가정(8mm 여백)보다 작다"는 쪽**을 가리킴 - 많은 프린터
  드라이버가 CSS `@page margin`이 하드웨어가 지원하는 최소 인쇄 가능
  여백보다 작으면 그 최소값으로 강제 대체하는 동작이 있고(가상 프린터인
  "PDF로 저장"이나 헤드리스 `page.pdf()`는 이런 하드웨어 제약이 없어서
  요청한 8mm를 그대로 존중함 - 그래서 그쪽에서만 재현이 안 됨), 실제
  인쇄 가능 영역이 8mm 기준보다 작아지면 정확히 281mm로 맞춰둔 wrapper
  자체가 그 실제 영역보다 커져서 두 번째 페이지로 넘침(내부 콘텐츠가
  아무리 작아도, `height: 281mm`로 고정된 박스 자체가 실제 페이지보다
  크면 넘친다 - **패딩/폰트를 줄여도 이 문제는 해결되지 않음**, 그래서
  이번엔 사용자가 지시한 "패딩→폰트 순서 축소" 대신 여백 자체를 더 안전한
  값으로 올리는 쪽을 택함).
- **조치**: `app/globals.css`의 `@page margin`을 `8mm → 12mm`로 올림(대부분
  프린터가 지원하는 보수적인 값 - 0.5인치=12.7mm가 인쇄 업계에서 널리 쓰이는
  "안전한 여백" 기준이라 그와 가까운 값을 선택). 이에 맞춰
  `app/partner/dashboard/deals/[id]/invoice/page.tsx`의 계산값도 갱신:
  `pageSheet` 높이 `281mm → 273mm`(`297 - 12*2`), `half` 높이
  `140.5mm → 136.5mm`, `pageSheet` `maxWidth` `194mm → 186mm`(`210 - 12*2`).
  점선 위치(용지 기준 148.5mm = 용지 전체 297mm의 정확히 50%)는 margin을
  얼마로 잡든 "여백 + 사용 가능 영역의 절반"이 항상 148.5mm로 계산되므로
  이번 변경으로도 자동으로 그대로 유지됨(margin + (297-2*margin)/2 =
  148.5, margin 값과 무관).
- **재검증**(puppeteer-core, 12mm 기준으로 재계산된 목표치 사용): 사본 1개
  콘텐츠 높이 **121.576mm로 동일**(폭이 194mm→186mm로 좁아졌지만 줄바꿈이
  추가로 발생하지 않음), `half` 한도 136.5mm 대비 여유 **14.924mm(약
  10.9%)**로 확정. 점선 위치 카드 상단 기준 **136.496mm**(목표 136.5mm),
  용지 기준 물리적 위치 `12mm + 136.496mm ≈ 148.5mm`로 여전히 정중앙.
  `page.pdf({ preferCSSPageSize: true })` `/Pages` `/Count` = **1** 재확인.
  화면·인쇄 모드 측정값 완전히 동일(폭 185.998mm, 높이 272.996mm 둘 다).
  검증에 쓴 puppeteer-core는 확인 후 다시 제거(`package.json`/
  `package-lock.json`에 반영 안 됨).
- **최종 확정 수치**: `@page margin: 12mm`, `pageSheet: 273mm × 186mm`,
  `half: 136.5mm`, 콘텐츠 실사용 121.576mm, **여유 14.924mm(약 10.9%)**.
  이 정도 여유는 실제 프린터가 8mm보다 조금 더 큰 최소 여백을 요구하는
  경우까지는 흡수 가능하지만, 다른 프린터에서도 여전히 재현된다면 12mm로도
  부족한 것이므로 margin을 더 올리거나(예: 15mm) 폰트를 v6 수준으로
  되돌리는 것도 고려 필요 - 현재로선 재현 리포트를 기다리는 중.
  **→ v9에서 재현됨. 진짜 원인은 여백 크기가 아니었음, 아래 참고.**

**⚠ v8에서 "해결됐다"고 판단한 근거 자체가 잘못됐던 걸 발견 (v9) — 진짜
원인은 `.responsive-two-col`의 768px 브레이크포인트였음**

v8 배포 후에도 사용자가 실물 프린터로 여전히 2장이 나온다고 재확인
(Canon G1010 series, "PDF로 저장"으로 바꿔도 동일하게 2장 — 이 시점에
프린터 하드웨어 문제가 아니라 CSS/렌더링 문제라는 게 확정됨).

**내 검증 방법 자체가 처음부터 잘못돼 있었다는 걸 이번에 발견함**:
v6~v8 내내 `page.pdf({ preferCSSPageSize: true })`를 호출할 때 `margin`
옵션을 준 적이 없었음. Puppeteer의 `page.pdf()`는 `preferCSSPageSize:
true`를 줘도 **`@page`가 선언한 margin 값을 자동으로 읽어오지 않고,
margin을 명시적으로 안 주면 0으로 처리**한다(사이즈만 `@page`를 따르고
여백은 별도 파라미터). 즉 지금까지의 모든 "1페이지 확인됨" 검증은 실제로
**여백 0mm**로 렌더링된 PDF를 보고 통과 판정한 것이었고, 진짜 12mm(또는
8mm) 여백이 적용된 상태를 한 번도 제대로 테스트하지 못했음.

`page.pdf()`에 `margin: { top:'12mm', bottom:'12mm', left:'12mm',
right:'12mm' }`를 명시적으로 줘서 실제 여백을 재현하자 **즉시 2페이지로
재현됨**(v8의 273mm/136.5mm 그대로). 이제서야 처음으로 실물 프린터 상황을
정확히 흉내 낼 수 있게 된 것.

**진짜 원인 규명**: 재현된 PDF를 열어 직접 확인하니, 공급자/공급받는자
정보박스 2개가 **나란히가 아니라 위아래로 쌓여** 있었음(`app/globals.css`의
`.responsive-two-col` 클래스를 그대로 갖다 쓰고 있었는데, 이 클래스는
`@media (max-width: 768px)`에서 1열로 접히도록 설계된 반응형 공용
유틸리티임). margin이 진짜로 적용되면 인쇄 가능 폭이 `210mm - 12mm*2 =
186mm ≈ 703px`가 되는데, 이는 항상 768px보다 좁음 - 즉 **이 인쇄 페이지는
설계상 절대로 "모바일 아닌" 폭으로 렌더링될 수 없는데, 반응형 유틸을
그대로 써버려서 실제 인쇄/PDF 저장에서는 매번 예외 없이 모바일 취급되어
정보박스가 세로로 쌓였던 것**. 폭이 800px→194mm→186mm로 계속 좁아져
왔지만 전부 768px 미만이었으니 이 버그는 v5부터 계속 있었던 셈 - margin이
0으로(=전체 A4 폭 794px, 768px 초과) 렌더링되는 내 검증 방법에서만 우연히
숨겨져 있었던 것.

**조치**: `app/partner/dashboard/deals/[id]/invoice/page.tsx`에서 정보박스
2단 배치에 `className="responsive-two-col"`을 쓰던 걸 제거하고, 뷰포트
폭과 무관하게 항상 2열을 유지하는 순수 인라인 grid(`display:'grid',
gridTemplateColumns:'1fr 1fr'`)로 교체 — 공용 유틸리티의 768px 브레이크
포인트 자체는 다른 페이지(마이페이지·파트너 대시보드·관리자 콘솔·검색
결과)에서 여전히 필요하므로 건드리지 않음, 이 페이지만 그 의존을 끊음.
이 인쇄 문서는 애초에 "반응형"이 아니라 항상 고정된 인쇄용 레이아웃이라야
하므로, 뷰포트 폭에 따라 달라지는 공용 유틸을 쓴 것 자체가 설계상
잘못이었음.

**재검증**(이번엔 `margin` 옵션을 명시적으로 준, 제대로 된 방법으로):
puppeteer-core로 뷰포트 폭도 실제 인쇄 폭(703px≈186mm)에 맞춰 측정 —
정보박스 2개의 `top` 좌표가 완전히 동일(64.25px, 64.25px = 나란히 배치
확인), 사본 1개 콘텐츠 높이 **121.576mm**(v7/v8과 동일 - 나란히 배치가
정상 작동하면 애초에 이 값이 맞았음), `half` 한도 136.5mm 대비 여유
**14.924mm(약 10.9%)**. `page.pdf()`에 `margin: 12mm` 명시적으로 준 상태로
`/Pages` `/Count` = **1** 확인. 점선 위치 카드 상단 기준 136.496mm(물리
위치 148.5mm) 그대로. `Read` 툴로 실제 PDF를 열어 정보박스가 나란히
배치된 것과 1페이지에 두 사본이 다 들어간 것을 직접 확인함. 검증에 쓴
puppeteer-core는 확인 후 다시 제거.

**교훈**: 자동화 검증 도구를 만들 때 그 도구 자체가 실제 조건(여기선
"진짜로 여백이 적용된 상태")을 충실히 재현하는지부터 의심할 것 - "헤드리스
Chrome의 PDF 생성 결과가 1페이지다"라는 검증이 여러 차례(v6, v7, v8)
반복적으로 "통과"를 줬지만, 파라미터 하나(`margin`)를 빠뜨린 탓에 매번
실제보다 훨씬 관대한 조건에서 테스트되고 있었음. 사용자가 준 재현 정보
("PDF로 저장해도 2장" - 프린터 하드웨어 문제를 배제시켜준 결정적 단서)가
없었다면 계속 "8mm/12mm 여백이 부족한가 보다"는 잘못된 가설로 삽질했을
가능성이 큼.

**정보 박스**: 공급자/공급받는자 각각 `<table>`(사업자번호/상호·성명/주소/
연락처, 공급받는자는 성명·담당자·연락처까지) 형태로, 남색(`colors.navy`)
테두리를 씀. **2단 배치는 (v9부터) `.responsive-two-col` 대신 뷰포트
폭과 무관하게 항상 2열을 유지하는 전용 인라인 grid** - 위 v9 섹션 참고.
공급자는 담당자 이름에 대응하는 컬럼이 없어(`partners`에 그런 필드 없음)
"성명"에 `partners.name`(상호와 동일)을 그대로 다시 보여줌 — 스펙이 명시한
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
인쇄 대상이 늘어나면 재검토 필요). `@page { size: A4 portrait; margin: 12mm; }`
로 용지 규격·여백 고정(15mm → 8mm → **12mm**, v8에서 최종 확정 - 실물
프린터가 8mm보다 큰 하드웨어 최소 여백을 강제해 2페이지로 넘치는 문제가
있었음, 위 v8 섹션 참고). **v5부터 이 화면 전용 `@media print` 오버라이드는
완전히 없앰** — 표/카드/제목 스타일은 전부 컴포넌트 inline style 한 곳에서
화면·인쇄 공용으로 관리(위 v5 섹션 참고, 이 분리 자체가 화면-인쇄 불일치의
원인이었음).

### 이번 단계에서 하지 않은 것 (스펙에서 명시적으로 제외됨)

카카오 알림톡 발송 — 건당 비용 + 발송대행사 계약이 필요해 매출 발생 이후
유료 addon으로 별도 진행 예정. 관련 버튼/placeholder도 추가하지 않음.

## 관리자 콘솔 3건 (회원 로그인 ID 표시 / 관리자 비밀번호 변경 / sub_admin 권한 체계)

### 1. 회원 목록에 로그인 ID(이메일) 컬럼 추가

`app/admin/members/page.tsx`. `users.email`은 이미 회원가입 시 채워지는
컬럼이라(로그인 화면 코드 참고) `auth.users`를 별도로 조인할 필요 없이,
기존 PostgREST 임베딩에 `email`만 추가하면 됐음:
- 소상공인 탭: `buyer_profiles` 조회에 이미 있던 `users ( status )`를
  `users ( status, email )`로 확장.
- 공급업체 탭: `partners` 조회에 `user_id`와 `users ( email )`을 새로
  추가 — `partners → users` 임베딩이 이 리포에서 처음 쓰인 사례인데
  실제로도 FK가 잡혀 있어서 별도 조치 없이 바로 됐음(실제 계정으로
  확인함).

### 2. 관리자 비밀번호 변경

새 파일 없이 기존 `components/AccountSettingsForm.tsx`(마이페이지/파트너
"계정 설정"에서 이미 쓰던 공용 컴포넌트 - 이메일 조회 + 비밀번호 2회 입력
+ `supabase.auth.updateUser({password})`)를 그대로 재사용.
`app/admin/account/page.tsx`에서 `backHref="/admin/dashboard"`로 감싸기만
하고, `AdminLayout`의 NAV_ITEMS에 "내 계정" 추가. 별도 접근 제어 코드
없음 - `/admin/*`는 이미 `AdminLayout`이 관리자 세션을 요구하므로
자동으로 보호됨.

실제 계정(test3@test.com)으로 비밀번호를 임시값으로 바꿨다가 재로그인
없이 세션이 유지되는 것과 다른 관리자 페이지 접근이 계속 되는 것을 확인,
이후 원래 비밀번호로 다시 돌려놓음(테스트 계정 상태 보존).

### 3. 중급 관리자(sub_admin) 권한 체계

**스키마/RLS** (`supabase/migrations/20260908130000_admin_subadmin_roles.sql`,
실행 완료됨):
- `users.role`(`'buyer'|'partner'|'admin'`)은 그대로 두고, 새 컬럼
  `users.admin_role`(`'super_admin'|'sub_admin'|null`)을 추가 —
  role≠'admin'인 행은 항상 null. 기존 admin 계정은 전부 super_admin으로
  백필해서 기존 관리자가 권한을 잃지 않게 함.
- `qd_is_super_admin()` 함수 신설(`qd_is_admin()`과 동일 패턴, users
  테이블만 조회). `qd_is_admin()`은 그대로 둬서 회원관리·거래견적관리
  정책(둘 다 sub_admin도 가능해야 함)은 안 건드림.
- `categories`의 insert/update/delete 정책만 `qd_is_admin()` →
  `qd_is_super_admin()`으로 좁힘(select는 공개 정책 그대로 - `/search`
  등에서 비로그인도 카테고리 조회 가능해야 함).
- **`users` 테이블의 기존 "admin은 전체 select/update" 정책을 쪼갬** —
  이게 이번 작업에서 가장 중요한 RLS 변경: 기존엔 `qd_is_admin()` 하나로
  role='admin'이면 무조건 `users` 테이블 전체(다른 관리자 행 포함)를
  select/update할 수 있었음. sub_admin이 "관리자 계정 관리" 화면에 URL로
  직접 들어와도 RLS로 막히려면 이 테이블 접근 자체가 나뉘어야 해서,
  `users_select_admin_members`/`users_update_admin_members`(`qd_is_admin()
  and role in ('buyer','partner')` - 회원관리용, sub_admin도 가능)와
  `users_select_super_admin_all`/`users_update_super_admin_all`
  (`qd_is_super_admin()` - 관리자 행 포함 전체, super_admin 전용) 두
  쌍으로 나눔. sub_admin은 여전히 본인 행은 `users_select_own`으로 보임.
  **실제 REST API를 직접 호출해서 확인함**: sub_admin 세션으로
  `GET /rest/v1/users?role=eq.admin`을 호출하면 본인 행(sub_admin 자신)만
  오고 다른 super_admin 행은 안 옴.
- `users_insert_super_admin` 정책 신설 - 관리자 계정 생성 시 필요(아래
  참고).

**화면**:
- `AdminLayout`(`app/admin/layout.tsx`)이 세션 확인 시 `role`뿐 아니라
  `admin_role`도 같이 조회해서 `AdminRoleContext`(새 파일
  `app/admin/AdminRoleContext.tsx`)로 하위 페이지에 내려줌. NAV_ITEMS에
  `superAdminOnly: true` 플래그를 단 항목("카테고리 관리", "관리자 계정
  관리")은 sub_admin 세션이면 사이드바에서 아예 안 보임(필터링).
- `app/admin/categories/page.tsx`와 새 `app/admin/admins/page.tsx`
  둘 다 `useAdminRole()`로 `admin_role === 'sub_admin'`이면 본문 렌더링
  전에 "접근 권한이 없어요" 안내만 보여주고 끝냄 - 사이드바에 안 보여도
  URL 직접 입력하면 들어와지므로 이 가드가 필요(RLS와 별개의 UX용 방어).
- 새 화면 `/admin/admins`(관리자 계정 관리, super_admin 전용): 관리자
  목록(이메일/역할) 조회, 새 관리자 계정 생성 폼(이메일/초기 비밀번호/역할
  선택), 기존 관리자의 역할을 "중급으로"/"최고로" 버튼으로 전환.

**관리자 계정 생성 - service role key 없이 처리한 방법** (`app/admin/
admins/page.tsx`의 `createAdmin()`): 이 프로젝트는 service role key가
없어서(`.env.local`에 anon/publishable key만 있음) Admin API로 "세션
안 건드리고 새 유저 생성"을 할 수 없음. 유일한 방법은 클라이언트에서
`supabase.auth.signUp()`을 쓰는 건데, 이 프로젝트는 이메일 확인이
꺼져 있어서(회원가입 후 바로 로그인되는 기존 코드로 확인) signUp()이
성공하면 **브라우저 세션이 방금 만든 새 계정으로 즉시 바뀜** - super_admin이
관리자를 하나 만들 때마다 자기도 모르게 로그아웃되거나 새 계정으로
전환되면 안 되므로:
1. signUp() 호출 **전에** `supabase.auth.getSession()`으로 지금(super_admin)
   세션의 access_token/refresh_token을 미리 저장.
2. `signUp({email, password})` 호출 - 세션이 새 계정으로 바뀔 수 있음.
3. 그 상태에서 새 계정의 `users` 행을 insert(`role:'admin', admin_role`) -
   세션이 새 계정으로 바뀌어 있으면 기존 `users_insert_own`(`id =
   auth.uid()`)으로, 혹시 안 바뀌어 있으면(프로젝트 설정이 나중에
   바뀌어 이메일 확인이 켜지는 경우 대비) 새로 추가한
   `users_insert_super_admin`(`qd_is_super_admin()`) 정책으로 - 두 정책이
   OR로 결합되므로 어느 쪽이든 성공함.
4. `supabase.auth.setSession({access_token, refresh_token})`으로 저장해둔
   원래 super_admin 세션을 무조건 복구(1번에서 세션이 안 바뀐 경우엔
   그냥 같은 값으로 덮어써서 무해함).

실제로 이 흐름이 세션을 안 건드리는지 REST API로 직접 진단해서 확인함
(signUp 응답에 session이 즉시 포함되는지, 곧바로 같은 계정으로 로그인이
되는지 별도 스크립트로 확인 - 이메일 확인 꺼져있음을 재확인). 이미 가입된
이메일로 다시 생성 시도하면(Supabase가 이메일 열거 방지를 위해 에러
대신 `identities: []`인 가짜 user를 돌려주는 경우 포함) "이미 가입된
이메일이거나 계정 생성에 실패했습니다" 에러로 처리함.

**⚠ 알아두면 좋은 기존 구멍(이번에 만든 건 아니고, 이번 작업 중 발견함)**:
`users_insert_own` 정책(`with check (id = auth.uid())`)은 `role` 값 자체를
검증하지 않음 - 즉 이론적으로는 아무나 회원가입 시 자기 `users` 행의
`role`을 `'admin'`으로 직접 보내도 RLS가 막지 못함(지금까지 실제로 이
경로로 악용된 적은 없어 보이지만, `role` 컬럼에 check 제약이나 트리거로
"본인이 스스로 admin이 될 수 없다"를 강제하는 게 더 안전함 - 이번 작업
범위 밖이라 손대지 않았고, 여기 기록만 남김).

**실제 로그인으로 검증한 것** (test3@test.com=super_admin,
subadmin-test@test.com=sub_admin, 둘 다 위 표 참고):
- super_admin: 사이드바 6개 항목(대시보드/회원관리/거래견적관리/카테고리
  관리/관리자 계정 관리/내 계정) 전부 보임, `/admin/admins`에서 새
  sub_admin 계정 생성 성공, 생성 직후에도 여전히 test3@test.com으로
  로그인된 상태 유지(세션 안 바뀜) 확인.
- sub_admin: 사이드바 4개 항목만 보임(카테고리 관리·관리자 계정 관리
  없음), `/admin/members`·`/admin/deals`는 정상 접근, `/admin/categories`·
  `/admin/admins`는 URL 직접 입력해도 "접근 권한이 없어요" 화면.
- **RLS 자체도 화면을 거치지 않고 REST API를 직접 호출해서 검증함**(UI
  가드는 우회 가능하므로 이게 진짜 방어선): sub_admin 세션으로
  `categories` insert 시도 → `403 new row violates row-level security
  policy`, `users?role=eq.admin` select → 본인 행만 반환.
- super_admin의 "중급으로"/"최고로" 역할 전환 버튼도 실제로 admin_role이
  바뀌는 것까지 확인(테스트 후 sub_admin으로 원복해둠).

## 다음에 할 만한 것 (제안, 확정 아님)

- ledgerbook 4단계 후보: 재고 수량 직접 조정 UI, 매입 추적, 다수 거래 동시
  선택/월별 필터링 같은 `/partner/ledger` 사용성 개선
- 카카오 알림톡 발송 연동 (유료 addon, 매출 발생 이후 예정)
- `category_attribute_defs` 실제 스키마에 맞춘 관리 UI (보류 중)
- `users_insert_own` 정책에 `role` 값 검증 추가 - 지금은 회원가입 시
  누구나 자기 `role`을 `'admin'`으로 직접 보낼 수 있는 구멍이 있음(위
  "관리자 콘솔 3건" 섹션 참고, 이번 작업 범위 밖이라 손 안 댐)
