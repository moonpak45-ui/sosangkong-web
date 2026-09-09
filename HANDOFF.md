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

**✅ (해결됨) test4@email.com에 남았던 E2E 테스트 데이터 정리**: "AI
거래전표 빠른입력"/"새 거래처로 시작하기" 검증 중 생긴 그림자 buyer
계정은 실제로는 3개가 아니라 **5개**였음(quote_id 에러로 실패한 시도
2개도 `users`/`buyer_profiles`까지는 만들어져 있었음 - `deals`는 없음).
anon key로 만든 별도 조회 스크립트(admin/partner 세션으로 로그인해 관련
테이블을 조회, 전부 `@sosangkong-walkin.invalid` 이메일로 정확히 식별 -
실제 서비스 계정과 겹칠 수 없는 고유 마커)로 정확한 대상(계정 5개, 거래
3건, 품목 5행, 정산 3건, 외상잔액 1건, 알림 6건, AI 로그 1건, 별칭 3건 -
전부 test4 소유임을 확인)을 특정한 뒤,
`supabase/migrations/20260916000000_cleanup_e2e_test_data.sql`(1회성
정리 스크립트)로 정리함. `auth.users` 삭제까지 포함되어 있어 SQL
Editor의 관리자 권한 연결에서만 실행 가능(anon/authenticated 키로는
auth.users를 못 지움) - 이 파일은 재실행 전제로 설계되지 않은 일회성
스크립트라는 점이 다른 마이그레이션과 다름.

**⚠ 교훈 — Supabase SQL Editor의 DELETE도 RLS에 막힐 수 있음**: 이
정리 스크립트 v1(단순 `delete from ... where id = any(...)`)을 SQL
Editor에서 실행하면 **"Success"가 뜨지만 실제로는 0행도 안 지워짐** -
별도 조회로 재확인해서 발견함. 이 프로젝트는 지금까지 "SQL Editor =
DDL 권한 있음"만 확인했지 "DML(DELETE)도 RLS를 우회하는가"는 검증한
적이 없었음 - 검증해보니 **우회하지 않았음**(SQL Editor 세션엔
`auth.uid()`가 없어서 `qd_is_my_partner_id()` 등 모든 RLS 정책이
통과되지 않고, DELETE는 대상이 0건이어도 에러를 내지 않으므로 "성공"
메시지만 뜨고 조용히 아무 일도 안 일어남). v2는 삭제 대상 테이블마다
같은 트랜잭션 안에서 `alter table ... disable/enable row level
security`로 RLS를 명시적으로 껐다 켜서 우회함(에러가 나도 `exception
when others`로 반드시 다시 켜지도록 함). **앞으로 SQL Editor로 기존
데이터를 DELETE/UPDATE해야 하면 이 패턴을 재사용할 것** - DDL
마이그레이션(CREATE/ALTER)은 이 문제가 없었음(RLS는 DML에만 적용).

## 완료된 기능 (최근 작업 순)

- **"AI 거래전표 빠른입력" + "새 거래처로 시작하기"** (이번 작업, 아래
  상세) — 카톡 텍스트 붙여넣기 → Claude가 초안 파싱 → 사람이 확인/수정 →
  확정(기존 거래전표 등록과 동일 로직 재사용). 여기에 이어서, 아직 계정이
  없는 거래처의 첫 발주를 등록하는 "새 거래처로 시작하기"도 함께 구현 —
  실제 카톡 문구로 파싱→외상잔액 반영까지 전체 플로우 실데이터 검증함.
- **box/line 광고 실제 노출** (이번 작업, 아래 상세) — 박스광고는 buyer
  홈 피드 상단 "프리미엄 매칭 업체" 섹션, 줄광고는 매칭 리스트 내 최우선
  배치+"광고" 뱃지. `ads.end_date` 신설(만료 자동 제외), 배너 전용이던
  공개 조회 RLS를 전체 타입으로 확장. 4종 중 3종(banner/box/line) 실제
  노출 완성, 실데이터로 검증함.
- 광고 시스템 신설 — 박스광고/줄광고/무료/롤링배너 4종. `/partner/ads/apply`
  (신청) + `/admin/ads`(승인/반려) + buyer 홈 피드 롤링 배너 캐러셀까지
  실제 업로드→승인→노출 전체 플로우 실데이터로 검증함.
- 모바일 반응형 전면 재작업 (헤더 검색폼, 하단 탭바, `.responsive-two-col` 그리드
  패턴, 각종 그리드의 `minmax(0,1fr)` 오버플로 수정)
- 관리자 콘솔: 분쟁·클레임 해결/반려 처리, 소상공인 계정 활성/정지(+정지 시
  견적요청 차단), 카테고리 수정/삭제(사용 중 카테고리는 FK로 삭제 차단)
- 마이페이지/파트너 대시보드 공용 "계정 설정"(이메일 조회, 비밀번호 변경)
- 재고관리북(ledgerbook) 1단계 — 거래전표/외상잔액/재고, 파트너 전용
- 재고관리북(ledgerbook) 2단계 — 소상공인 조회 화면(미결제 배지, 품목 드릴다운)
- 재고관리북(ledgerbook) 3단계 — 거래명세서 A4 인쇄(v1~v9, 여러 차례 수정)
- **역할별 메인 홈 구조 신설** (이번 작업, 아래 상세) — `/` 접속 시 role별로
  완전히 다른 화면(비로그인=마케팅 랜딩 / buyer=매칭 공급업체 피드 /
  partner·admin=각자 대시보드로 리다이렉트)
- 관리자 콘솔 3건 — 회원 목록 로그인 ID 표시, 관리자 비밀번호 변경, 중급
  관리자(sub_admin) 권한 체계

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

**⚠ → 이후 수정 완료.** `users_insert_own` 정책이 `role` 값을 전혀
검증하지 않아서 회원가입 시 아무나 자기 `users` 행의 `role`을
`'admin'`으로 직접 보낼 수 있는 구멍이 있었음(위 문단에서 발견 당시엔
"기록만 남김, 손대지 않음"으로 남겨뒀었음). 바로 다음 요청으로 막음 -
자세한 내용은 아래 "users 회원가입 자가등록 role 스푸핑 구멍 수정"
섹션 참고.

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

## users 회원가입 자가등록 role 스푸핑 구멍 수정

"관리자 콘솔 3건" 작업 중 발견하고 기록만 해뒀던 구멍("다음에 할 만한
것"에 있었음)을 바로 다음 요청으로 막음. 두 차례 마이그레이션이 필요했음
- 원인이 한 겹 더 있었기 때문.

**1차 시도 (`20260908140000_fix_users_insert_own_role_check.sql`)**:
`users_insert_own` 정책의 `with check`를 `id = auth.uid()`에서
`id = auth.uid() and role in ('buyer', 'partner')`로 강화. 실행 직후
REST API로 직접 재현 테스트했더니 **여전히 role:'admin' self-insert가
뚫림**(201 성공) - 정책을 고쳤는데도 왜 뚫리는지 바로 알 수 없어서,
사용자에게 `pg_policy` 시스템 카탈로그를 직접 조회해달라고 요청함
(Claude는 service role key가 없어 `information_schema`/`pg_policy`를
직접 조회할 수 없음 - 이 프로젝트에서 반복되는 제약).

**진짜 원인**: 사용자가 `pg_policy` 조회 결과를 보고 찾아냄 - `users`
테이블에 이 리포의 어떤 마이그레이션 파일에도 기록되지 않은, 한글 이름의
**중복 INSERT 정책 `"본인 회원 정보 등록"`**이 남아 있었고, 그
`with_check`가 `auth.uid() = id`뿐이라 role을 전혀 검증하지 않았음. RLS는
같은 커맨드에 여러 PERMISSIVE 정책이 있으면 그중 하나만 통과해도 되므로
(OR 결합), `users_insert_own`을 아무리 강화해도 이 정책이 계속 무제한으로
통과시켜줬던 것. 이 정책의 존재는 `20260907050000`/`20260908130000` 등
기존 마이그레이션 작성 당시 완전히 놓쳤던 것 - "이 리포의 마이그레이션
파일 = 실제 DB 스키마의 100% 정확한 기록이 아님"이라는 문서 맨 위 경고가
**컬럼뿐 아니라 정책(policy)에도 똑같이 적용된다**는 걸 보여준 사례.

**2차 수정 (`20260908150000_drop_duplicate_users_insert_policy.sql`)**:
`drop policy if exists "본인 회원 정보 등록" on users;` 한 줄로 그 중복
정책을 제거. 같은 기능(본인 id로 self-insert)은 이미 `users_insert_own`이
role 검증까지 포함해서 수행하므로 기능 손실 없음.

**검증**: REST API 직접 호출로 4가지 시나리오 확인 -
role:'admin' self-insert → **403 차단**(수정 전엔 201로 뚫렸었음),
role:'buyer'/'partner' self-insert → 정상 201, 남의 id로 insert 시도 →
403 차단. 추가로 실제 화면(`/login`의 회원가입 탭)에서 소상공인 회원가입을
끝까지 진행해서 가입 후 정상 로그인 상태(마이페이지/로그아웃 헤더)까지
되는 것도 확인 - 기존 정상 가입 플로우에 영향 없음.

**교훈**: `pg_policy`(또는 `information_schema`) 직접 조회는 Claude가
서비스 키 없이는 못 하는 영역이지만, 사용자가 Supabase 대시보드에서
대신 조회해주면 이런 "리포에 기록되지 않은 상태" 문제를 훨씬 빨리 찾을 수
있음 - RLS 정책이 기대대로 동작하지 않을 때는 추측으로 정책을 계속
고치기보다 이 방법을 먼저 써볼 것.

## /my-page, /partner/dashboard 사이드바가 앵커 이동 시 화면 밖으로 사라지던 버그 수정

**문제**: `/my-page`(소상공인)와 `/partner/dashboard`(공급업체) 둘 다 하나의
긴 페이지 안에 모든 섹션(받은 견적요청/진행 중인 거래/정산/... 등)을 다
렌더링해두고, 왼쪽 카테고리 메뉴는 실제 라우팅이 아니라 그 안의 `#anchor`
링크(`#requests`, `#deals`, `#history`, `#settlements` 등)로 구현돼
있었음. 앵커를 클릭하면 브라우저가 페이지 전체를 그 위치로 스크롤하는데,
사이드바도 똑같이 일반 문서 흐름(`position: static`) 안에 있어서 같이
밀려 올라가 화면 밖으로 사라짐 - 특히 페이지 하단부 섹션으로 이동할수록
심함.

`/admin/dashboard`(관리자 콘솔)는 이 문제가 없었는데, 이유는 CSS가 아니라
**구조 자체가 다르기 때문** — 관리자 콘솔의 메뉴는 앵커가 아니라 진짜
라우트(`/admin/members`, `/admin/deals` 등)라서 클릭할 때마다 새 페이지가
스크롤 맨 위에서 시작함. 그래서 "관리자 콘솔의 CSS를 참고"하되, 실제로는
사이드바에 `position: sticky`를 새로 추가하는 방향으로 처리함(관리자
콘솔 사이드바엔 원래 sticky가 없었음 - 처음 코드를 확인하고 나서 알게 됨).

**수정**: 세 화면(my-page/partner-dashboard/admin) 사이드바가 전부 같은
공용 클래스 `.responsive-sidebar-divider`(`app/globals.css`)를 쓰고
있어서, 컴포넌트 코드는 건드리지 않고 이 클래스 하나에만 sticky를
추가함:
```css
.responsive-sidebar-divider {
  position: static;
}
@media (min-width: 769px) {
  .responsive-sidebar-divider {
    position: sticky;
    top: 88px;
    align-self: start;
    max-height: calc(100vh - 108px);
    overflow-y: auto;
  }
}
```
- `.responsive-two-col`이 `display: grid`라서 기본적으로 grid item이 행
  전체 높이로 늘어나(`align-items: stretch` 기본값) sticky가 움직일
  공간이 없음 - `align-self: start`로 사이드바 자신의 콘텐츠 높이만큼만
  차지하게 해야 sticky가 실제로 동작함.
- `top: 88px`는 실측값 - `Header`(`components/Header.tsx`)가 이미
  `position: sticky; top: 0`인데, 실제 렌더링 높이(69.25px, Puppeteer로
  측정)에 여유 20px 정도를 더한 값. 헤더와 겹치지 않으면서 헤더 바로
  아래 붙도록 함.
- `@media (min-width: 769px)`만 적용 - `.responsive-two-col`이 768px
  이하에서 1열로 접혀 사이드바가 콘텐츠 위에 쌓이는 기존 모바일 레이아웃은
  그대로 두고(`position: static`), sticky는 2열 레이아웃이 실제로 있는
  데스크톱에서만 의미가 있음.
- `max-height`/`overflow-y: auto`는 방어적으로 추가 - 지금은 메뉴 항목이
  몇 개 안 돼서 필요 없지만, 나중에 사이드바 메뉴가 늘어나 뷰포트보다
  길어지는 경우에도 사이드바 자체가 스크롤되게 해서 화면을 벗어나지
  않도록 함.

이 클래스를 쓰는 화면이 이 셋뿐이라(`grep`으로 확인) 관리자 콘솔도
같이 sticky해짐 - 관리자는 원래 이 버그가 없었지만(각 메뉴가 별도
라우트라 페이지 자체가 짧고 스크롤이 거의 없음), sticky가 추가돼도
무해하고 오히려 페이지가 길어질 경우를 대비한 일관성 있는 개선.

**검증**(실제 로그인, Puppeteer):
- `/partner/dashboard`: "정산"(페이지 맨 아래쪽 섹션) 클릭 → 스크롤
  613px 발생, 사이드바는 `top: 88px`에 고정된 채 뷰포트 안에 그대로 보임.
- `/my-page`: "거래 이력" 클릭 → 스크롤 964px 발생, 사이드바 동일하게
  유지됨.
- 모바일 뷰포트(390px)에서 `.responsive-sidebar-divider`의 computed
  position이 여전히 `static`인 것 확인 - 데스크톱 전용 변경이 모바일
  레이아웃(사이드바가 콘텐츠 위에 쌓이는 기존 방식)에 영향 없음을 재확인.

## /partner/*, /my-page/* 전면 라우팅 재정리 (앵커 → 실제 라우트 + 공용 sticky 사이드바 레이아웃)

앞선 "sticky 사이드바" 수정으로 스크롤 시 사이드바가 화면 밖으로 사라지는
문제는 고쳤지만, 근본 구조 문제는 남아 있었음: `/partner/dashboard`와
`/my-page`가 각각 모든 하위 섹션을 `#anchor`로 한 페이지에 욱여넣고 있어서
(1) 클릭해도 사이드바 활성 표시가 안 바뀌고 (2) "프로필 관리"/"계정 설정"만
별도 라우트라 그리로 가면 사이드바 자체가 사라졌음. 이번 작업으로 두
마이페이지 전체를 `/admin/dashboard`와 동일한 패턴(공용 레이아웃 컴포넌트 +
실제 라우트 + `usePathname()` 기반 활성 표시)으로 통일함.

### 라우트 매핑

**공급업체** (`/partner/*`):
| 메뉴 | 이전 | 이후 |
|---|---|---|
| 받은 견적요청 | `/partner/dashboard#requests` | `/partner/dashboard` (index) |
| 진행 중인 거래 | `/partner/dashboard#deals` | `/partner/dashboard/deals` (신규) |
| 거래전표 등록 | `/partner/dashboard#ledger-entry` | `/partner/dashboard/ledger-entry` (신규) |
| 매출·재고 현황 | `/partner/ledger` | `/partner/ledger` (그대로, 레이아웃만 편입) |
| 정산 | `/partner/dashboard#settlements` | `/partner/dashboard/settlement` (신규) |
| 프로필·배송조건 관리 | `/partner/profile` | `/partner/profile` (그대로, 레이아웃만 편입) |
| 계정 설정 | `/partner/account` | `/partner/account` (그대로, 레이아웃만 편입) |

**소상공인** (`/my-page/*`):
| 메뉴 | 이전 | 이후 |
|---|---|---|
| 거래처 관리 | `/my-page#partners` | `/my-page` (index) |
| 거래 이력 | `/my-page#history` | `/my-page/history` (신규) |
| 견적 요청 현황 | `/my-page#quotes` | `/my-page/quotes` (신규) |
| 찜한 업체 | `/my-page#favorites` | `/my-page/favorites` (신규) |
| 사업장 정보 수정 | `/my-page/profile` | `/my-page/profile` (그대로, 레이아웃만 편입) |
| 계정 설정 | `/my-page/account` | `/my-page/account` (그대로, 레이아웃만 편입) |

### 공용 레이아웃 구조

- `app/partner/layout.tsx` / `app/my-page/layout.tsx` (신규) - 로그인
  확인(+ 공급업체/소상공인 프로필 존재 확인)을 **한 번만** 수행하고,
  사이드바(업체 카드 + 메뉴)를 렌더링한 뒤 `children`을 감쌈. 활성 메뉴는
  `usePathname() === item.href`로 판정 - 새로고침해도 URL이 그대로라 자동
  유지됨(요청하신 4번 확인 항목).
- `app/partner/PartnerLayoutContext.tsx` / `app/my-page/MyPageLayoutContext.tsx`
  (신규) - 레이아웃이 확인한 `partner`/`buyerProfile` 정보를 React
  Context로 하위 페이지에 내려줌. 각 하위 페이지는 이 값(주로 `partner.id`/
  `buyerProfile.id`)만 가져다 쓰고, 세션·프로필을 다시 조회하지 않음
  (`app/admin`의 `AdminRoleContext` 패턴과 동일).
- `app/partner/_shared.ts` / `app/my-page/_shared.ts` (신규) - 기존에 각
  페이지 파일 맨 아래 반복되던 `colors`/`styles`(사이드바, 카드, 표, 배지
  등)를 한 곳으로 모음(`app/admin/_shared.ts`와 동일 패턴) - 이번에
  7개(공급업체)+6개(소상공인) 파일로 쪼개지면서 중복이 커질 뻔한 걸 방지.
- 사이드바 자체의 sticky 처리(`.responsive-sidebar-divider`, `app/
  globals.css`)는 바로 앞 작업에서 이미 되어 있던 걸 그대로 재사용 - 이번
  작업은 그 CSS를 건드리지 않음.
- 배지(받은 견적요청/진행 중인 거래 건수, 찜한 업체 수)는 레이아웃이 별도
  경량 count 쿼리(`{count:'exact', head:true}`)로 가져와 표시 - 예전엔
  한 페이지 안의 로컬 state 길이였지만, 페이지가 쪼개지면서 사이드바와
  콘텐츠가 다른 컴포넌트 트리가 됐기 때문. 견적 제출/찜 해제처럼 배지
  숫자에 영향을 주는 액션 뒤에는 context의 `refreshCounts()`/
  `refreshFavoriteCount()`를 호출해서 사이드바 배지를 재조회함.

### `/partner/layout.tsx`가 `/partner/*` 전부를 감싸면 안 되는 두 예외

`app/partner/layout.tsx`를 두면 Next.js는 기본적으로 `/partner/*` 전체에
적용하는데, 그중 두 라우트는 사이드바가 있는 "마이페이지"가 아님:
- `/partner/[id]` — 소상공인에게 보이는 **공개** 업체 상세 페이지
- `/partner/dashboard/deals/[id]/invoice` — 인쇄 전용 명세서(자체
  풀블리드 레이아웃, 사이드바/헤더 다 없어야 함)

파일을 라우트 그룹으로 물리적으로 옮기는 대신(참조 경로가 많아 위험도가
큼), `layout.tsx` 안에서 `usePathname()`으로 판별해서 이 두 경우엔
`children`을 그대로 통과시킴(세션 체크도 안 함):
```ts
const MYPAGE_SEGMENTS = new Set(['dashboard', 'profile', 'account', 'ledger'])
const INVOICE_PATTERN = /^\/partner\/dashboard\/deals\/[^/]+\/invoice$/
function isMyPageRoute(pathname: string): boolean {
  if (INVOICE_PATTERN.test(pathname)) return false
  const seg = pathname.split('/')[2]
  return MYPAGE_SEGMENTS.has(seg)
}
```
`/my-page/*`는 이런 예외가 없어서(하위에 공개 페이지나 인쇄 전용 페이지가
없음) `app/my-page/layout.tsx`는 예외 없이 전체를 감쌈.

### "← 뒤로가기" 링크 제거

사이드바가 항상 보이므로 불필요해진 뒤로가기 링크를 제거함:
- `components/AccountSettingsForm.tsx`의 `backHref`/`backLabel` props를
  **선택 사항**으로 바꿈(안 넘기면 링크 자체를 안 그림) - `/admin/account`는
  여전히 넘겨서(그쪽은 이번 작업 범위 밖, 관리자 사이드바는 이미 실제
  라우트라 문제가 없었음) 기존 그대로 동작하고, `/partner/account`·
  `/my-page/account`만 넘기지 않도록 바꿈.
- `/partner/profile`, `/partner/ledger`, `/my-page/profile`도 각자 갖고
  있던 "← 마이페이지로"/"← 공급업체 마이페이지로" 링크와 "공급업체
  마이페이지"/"마이페이지" eyebrow 라벨을 제거(레이아웃이 이미 그 맥락을
  사이드바로 보여주므로 중복).

### 그 외 링크 정리

- `app/notifications/page.tsx`의 `targetHref()` - `/partner/dashboard#requests`
  → `/partner/dashboard`, `/partner/dashboard#deals` → `/partner/dashboard/deals`,
  `/my-page#history` → `/my-page/history`로 갱신.
- `components/MobileTabBar.tsx`의 `isMyPage` 판정 - 기존엔
  `pathname.startsWith('/partner/dashboard')`만 체크해서 `/partner/profile`·
  `/partner/account`·`/partner/ledger`에 있을 때 하단 탭바의 "마이페이지"
  아이콘이 활성 표시되지 않는 사소한 기존 버그가 있었음(라우트가 이미
  분리돼 있었으므로 이번 리팩터와 무관하게 원래 있던 문제). 이번에
  `/partner/profile`·`/partner/account`·`/partner/ledger`도 조건에 추가해서
  같이 고침 - `/admin/*`는 범위 밖이라 그대로 둠(`/admin/dashboard`만 체크,
  `/admin/members` 등에선 여전히 비활성 표시).

### 실제로 검증한 것 (puppeteer-core, 두 계정)

- test4@email.com(공급업체) 7개 라우트 전부 방문 - 사이드바 노출, 정확한
  메뉴가 활성 표시, 배지 숫자(진행 중인 거래 "1") 정상 표시.
- `/partner/dashboard/settlement`에서 새로고침 → 활성 메뉴 "정산" 그대로
  유지(라우트 기반이라 자동, 별도 상태 저장 불필요).
- `/partner/dashboard/deals/[id]/invoice`(실제 명세서 링크로 진입) - 사이드바
  **없음** 확인(레이아웃 예외 처리 정상 동작).
- test01@test.com(소상공인) 6개 라우트 전부 방문 - 사이드바 노출, 활성
  표시, 찜한 업체 배지 정상 표시.
- `/search`에서 실제 공개 업체 링크(`/partner/[id]`)로 진입 - 사이드바
  **없음** 확인.
- 모바일(390px) - 두 계정 모두 사이드바 `position: static`으로 정상
  전환(콘텐츠 위에 쌓이는 기존 모바일 레이아웃 그대로), 하단 탭바 정상
  노출.
- 데스크톱(1400px) - `.responsive-sidebar-divider`가 여전히
  `position: sticky; top: 88px`로 계산됨(이전 작업에서 만든 sticky CSS가
  라우트 분리 후에도 그대로 작동).

### 이번에 건드리지 않은 것

- `deal_line_items`/`quote_requests`/`settlements` 등 조회 쿼리 로직 자체는
  그대로 옮기기만 함(필터 조건 변경 없음) - 딱 한 곳, `/partner/dashboard/
  settlement`을 만들 때 처음에 `deals!inner(...).eq('deals.partner_id',
  partner.id)`처럼 명시적 필터를 넣으려다, 원본 코드가 애초에 필터 없이
  RLS에만 의존하고 있었다는 걸 뒤늦게 확인하고 원복함 - **원본 쿼리의
  필터 유무까지 그대로 보존**하는 걸 원칙으로 삼았음.
- 각 페이지의 데이터 로딩 로직 자체(고유 로딩/에러 상태, 세션 재확인
  코드 등)는 페이지별로 계속 독립적으로 둠 - 레이아웃의 context는
  `partner`/`buyerProfile` id 정도만 내려주고, 나머지는 각 페이지가 예전
  그대로 자기 몫만 조회함(리스크를 낮추기 위해 데이터 로딩까지
  통합하지는 않음).

## 메인페이지 CTA 버튼이 로그인 상태 무관하게 항상 /login으로 보내던 버그 수정

**문제**: `app/page.tsx`의 "소상공인으로 시작하기"/"공급업체로 등록하기"
(히어로 영역 2개) + "공급업체 무료 등록"(하단 배너 1개), 총 3개 CTA가 전부
그냥 `<a href="/login">`이었음 - 로그인 여부·역할을 전혀 확인하지 않아서,
이미 공급업체로 로그인한 사용자가 "공급업체로 등록하기"를 눌러도 그냥
로그인 폼이 있는 `/login`으로 보내버렸음(사용자가 스크린샷으로 재현 -
production에서 파트너 계정으로 로그인된 채 헤더에 "공급업체 마이페이지/
로그아웃"이 보이는 상태에서 버튼을 눌렀는데 로그인 폼이 뜸).

**원인**: 로직 자체가 아예 없었음 - 원래도 "로그인 안 한 사용자"만 상정하고
만들어졌던 정적 링크라, 로그인된 사용자가 눌렀을 때의 케이스가 처음부터
고려되지 않았음.

**수정**: `components/RoleAwareCta.tsx` 신설 - `targetRole`(`'buyer'` |
`'partner'`)을 받아 클릭 시점에 로그인 세션 + `users.role`을 확인해서 세
가지로 분기:
1. **비로그인** → `/login?view=signup&type=buyer|supplier`로 딥링크(아래
   `/login` 변경 참고 - 로그인 탭이 아니라 회원가입 탭 + 해당 계정 유형이
   바로 선택된 화면으로 감. 예전엔 비로그인 사용자도 그냥 `/login`
   로그인 탭에 떨어뜨렸어서, 엄밀히는 이것도 원래 기대 동작과 달랐음).
2. **같은 역할로 이미 로그인**(예: 공급업체 계정으로 "공급업체로
   등록하기") → 그 역할의 마이페이지로 바로 이동(`/partner/dashboard`
   또는 `/my-page`) - 이게 이번에 리포트된 핵심 버그.
3. **다른 역할로 로그인 중**(예: 소상공인 계정으로 "공급업체로
   등록하기") → `window.confirm()`으로 "현재 OO 계정으로 로그인되어
   있어요. XX로 새로 가입하려면 계속 진행해주세요(기존 로그인은
   해제돼요)."를 띄우고, 확인하면 회원가입 딥링크로 이동, 취소하면 아무
   일도 안 일어남(새 계정 가입 시 `supabase.auth.signUp()`이 브라우저
   세션을 새 계정으로 바꿔버리는 게 이 프로젝트 특성이라 - 재고관리북/
   관리자 계정 생성 작업 때도 같은 특성을 이용했음 - 미리 경고하는 게
   맞다고 판단).

`app/page.tsx`의 세 버튼 전부 `RoleAwareCta`로 교체(히어로 2개 + 하단
배너 1개 - 하단 배너는 리포트엔 없었지만 완전히 동일한 버그라 같이 고침).
페이지 자체는 서버 컴포넌트로 그대로 두고, 인터랙티브가 필요한 버튼만
클라이언트 컴포넌트로 분리(전체를 `'use client'`로 바꾸지 않음).

**`/login` 딥링크 지원**: `app/login/page.tsx`가 `useSearchParams()`로
`?view=signup&type=buyer|supplier`를 읽어 초기 탭/계정유형 state를
설정하도록 함. `useSearchParams()`를 쓰는 부분은 정적 렌더링과 충돌하지
않도록 `<Suspense>`로 감싼 내부 컴포넌트(`LoginPageInner`)로 분리 -
페이지 자체(`LoginPage`)는 그 Suspense 래퍼만 리턴.

**실제 검증** (puppeteer-core, 세 계정 상태 × 두 버튼 = 6가지 케이스 +
하단 배너):
- 비로그인: 두 버튼 모두 `/login?view=signup&type=...`로 이동, 실제로
  회원가입 탭의 "어떤 목적으로 가입하시나요?" 화면에서 해당 계정 유형이
  이미 선택된 채(공급업체 선택 시 업체명/사업자등록번호/주요 취급 품목
  필드까지 노출) 뜨는 것을 스크린샷으로 확인.
- test4@email.com(partner) 로그인 후 "공급업체로 등록하기" → `/partner/
  dashboard`로 바로 이동 (버그 재현 후 수정 확인 완료).
- 같은 계정으로 "소상공인으로 시작하기" → confirm 다이얼로그
  ("공급업체 계정으로 로그인되어 있어요. 소상공인으로 새로 가입하려면...")
  → 취소 시 홈에 그대로 머묾, `window.confirm`을 스텁해서 수락 시
  `/login?view=signup&type=buyer`로 이동하는 것도 별도 확인.
- test01@test.com(buyer) 로그인 후 "소상공인으로 시작하기" → `/my-page`로
  바로 이동. "공급업체로 등록하기" → confirm 다이얼로그("소상공인
  계정으로 로그인되어 있어요. 공급업체로 새로 가입하려면...") 정상 표시.
- 하단 배너 "공급업체 무료 등록"도 히어로 버튼과 동일하게 동작 확인.

## 로고 교체 (sosangKong / 소상공닷컴 브랜드 적용)

기존엔 헤더/푸터/로그인 화면 전부 인라인 SVG(물결 두 줄) + "소상공" 텍스트로
된 임시 로고였음. 사용자가 제공한 실제 브랜드 에셋(`소상공 로고 교체 요청/
public/`, PC Downloads 폴더)과 적용 가이드(`LOGO_APPLY.md`)를 그대로 따라
전면 교체함. 서비스명 표기도 이번을 계기로 "소상공" → "소상공닷컴"으로
정리(로고 자체가 "sosangKong | 소상공닷컴" 가로형이라 텍스트 표기와 맞춤).

### 에셋

`public/brand/`에 로고 6종(가로형/세로형 각 기본·흰색, 워드마크, K 심볼
마크, 앱 스플래시) + `public/` 바로 아래 favicon 2종·앱 아이콘 2종·
apple-touch-icon 신규 추가. 전부 배경 제거된 PNG(원본 벡터는 아직 없음 —
LOGO_APPLY.md 8번 항목 그대로, 나중에 SVG/AI 원본이 생기면 그걸로
교체하는 게 좋음, 지금은 헤더 로고가 2065×472라 레티나까지는 문제 없음).

### 적용한 곳

- `components/Header.tsx` — 로고 영역을 `logo-lockup.png`로 교체.
  `isMobileHeader` 상태를 그대로 활용해 모바일에서 24px/데스크톱 28px로
  높이만 다르게(레이아웃 로직은 안 건드림).
- `components/Footer.tsx` — `logo-full.png`(세로 조합형)로 교체, 카피라이트
  문구 "© {year} 소상공" → "© {year} 소상공닷컴".
- `app/login/page.tsx` — 배경이 짙은 남색(#0A1E3D)이라 흰색 버전
  `logo-lockup-white.png` 적용.
- `app/layout.tsx` — `metadata`에 `icons`(favicon 32/16, apple-touch-icon)·
  `manifest`·`openGraph`(로고 이미지 포함) 추가, title/description을
  "소상공닷컴"으로 갱신. 기존 `app/favicon.ico`는 삭제(안 지우면 Next
  기본 파비콘이 새 `public/favicon-*.png`보다 우선 적용됨).
- `public/manifest.webmanifest` 신규 생성 — PWA 아이콘(192/512, maskable
  포함) + 배경·테마 색상(#0A1E3D).
- `app/partner/dashboard/deals/[id]/invoice/page.tsx` — 명세서 안내
  문구 "정산 내역은 소상공 마이페이지에서..." → "...소상공닷컴 마이페이지..."

로고를 전부 `<img>` 태그로 넣음(`next/image` 아님) — 이 프로젝트가 지금까지
어디서도 `next/image`를 쓴 적이 없어서 기존 관례를 그대로 따름(LOGO_APPLY.md
가이드도 `<img>` 기준으로 작성돼 있었음). ESLint의 `no-img-element` 경고가
뜨지만 에러는 아니고, 프로젝트 전체 컨벤션과 일치하므로 그대로 둠. 헤더/
로그인 로고를 감싸는 `<a href="/">`에 대한 `no-html-link-for-pages` 경고는
이번에 새로 생긴 게 아니라 이 두 파일에 원래부터 있던 것(로고 안쪽 내용만
교체, `<a>` 자체는 안 건드림) — 참고로 남겨둠, 이번 작업 범위 밖.

### 검증

`npx tsc --noEmit` 통과 확인. `next build`는 이 리포를 device_bash로 여는
격리 리눅스 VM에 npm 레지스트리 접근이 막혀 있어 로컬에서 직접 돌리지
못했고(swc 바이너리 다운로드 시점에 `EAI_AGAIN`), 사용자가 실제 컴퓨터의
터미널에서 `npm run dev`로 화면(헤더/푸터/로그인 로고, 파비콘, 탭 제목)을
직접 확인한 뒤 커밋을 요청함.

### 이번에 하지 않은 것

- 원본 벡터(SVG/AI)로 교체 — LOGO_APPLY.md 8번, 원본이 생기면 다음에.
- iOS 웹앱 스플래시 `<link rel="apple-touch-startup-image">` 추가 —
  가이드에 "필요하면"으로 돼 있는 선택 항목이라 스킵.

## 역할별 메인 홈 구조 신설

**배경**: 로그인 여부/role과 무관하게 `/`가 항상 같은 마케팅 랜딩(www.sosangkong.com)
이었음 — 로그인해도 Header는 상태를 반영하는데 메인 화면 자체는 그대로였던
근본 원인. 알바천국처럼 role별로 완전히 다른 홈을 보여주도록 재설계.

### 사전 조사 — 랜딩페이지 매칭 카드는 전부 더미데이터였음

작업 전 확인한 것: 기존 `/`의 히어로 "96% 일치" 카드, `.supplier-grid`
4개 카드(그린테이블 식자재 등), 하단 "가격만 봤을 때 vs 고객님의 조건 기준"
비교 카드까지 전부 **하드코딩된 정적 텍스트**(실제 쿼리 없음). 진짜 매칭
로직은 `/search`(`app/search/page.tsx`)에 이미 있었음:
`base = 70 + rating_avg*5 + (verified_badge ? 4 : 0)`, 99% 캡 — 코드 내
주석에 "TODO: match_weight_configs 기반 정교한 가중치 계산으로 교체 예정"
이라고 적혀 있어, 지금 있는 게 임시 단순 버전이라는 것도 이미 알려져 있었음.
**"배송정시율"/"응답률"에 대응하는 실제 컬럼은 `partners` 테이블에 없음**
(`grep`으로 이 리포 전체의 `from('partners')` select 목록을 다 확인 —
`id/name/region/description/verified_badge/rating_avg/review_count/status/
user_id/biz_reg_no/phone/address/created_at`뿐). `app/my-page/page.tsx`가
이미 `rating_avg`를 "배송정시율(평점 대체)"로 표기해 이 간극을 우회하는
관례를 만들어뒀길래, 이번 새 홈에서도 그 표기를 그대로 재사용함(응답률은
대응할 만한 대체 지표가 없어 아예 표시하지 않음 — 없는 값을 지어내지 않음).

### 구현

- **`app/page.tsx`**: 서버 컴포넌트 → `'use client'`로 전환. 기존 마케팅
  랜딩 마크업 전체(히어로/카테고리 네비/통계/스텝/쇼케이스/후기/프로모/
  하단 배너)는 그대로 `MarketingLanding()`이라는 내부 함수로 옮기고,
  새 `export default function RootPage()`가 `supabase.auth.getSession()`
  + `users.role` 조회로 분기:
  - 비로그인 또는 role 조회 실패 → `MarketingLanding()` (기존 그대로)
  - `role === 'buyer'` → `<BuyerHomeFeed />`
  - `role === 'partner'` → `router.replace('/partner/dashboard')`
  - `role === 'admin'`(super_admin/sub_admin 둘 다 `users.role`은
    `'admin'`으로 동일 — `admin_role`은 안 봐도 됨) →
    `router.replace('/admin/dashboard')`
  - 확인 중/리다이렉트 중엔 다른 페이지들과 동일한 관례로 "불러오는
    중..." 표시.
- **`components/BuyerHomeFeed.tsx`** (신규) — buyer 홈 피드:
  - 상단 검색바: 카테고리 드롭다운 + 지역 텍스트 입력(둘 다 `/search`와
    동일한 쿼리 로직 재사용) + "배송 요일 · 최소주문금액 등 세부 배송조건
    필터는 준비 중입니다" 안내(위 스키마 조사 결과 그대로 반영 — `/search`
    필터 패널의 기존 문구와 동일한 관례) + "전체 업체 상세 검색 ›"로
    `/search` 링크.
  - 본문: 카드 그리드(반응형 `repeat(auto-fill, minmax(270px,1fr))`).
    각 카드에 평점("배송정시율(평점 대체)")/리뷰수/매칭도%, 검증 뱃지,
    설명, 즐겨찾기 하트(`lib/useFavorites.ts` 재사용), "무료 견적 요청"
    버튼(`/quote-request?partner_ids=...`), 카드명 클릭 시 `/partner/[id]`
    이동.
  - **즐겨찾기·최근 거래 우선 노출**: `useFavorites()`의 `favoritePartnerIds`
    + `deals` 테이블에서 `buyer_id = buyerProfileId`인 최근 20건의
    `partner_id`를 조회해 정렬 우선순위로 사용(즐겨찾기 > 최근 거래 >
    matchScore). 각각 "★ 즐겨찾기"/"최근 거래" 태그를 카드 위에 표시.
  - 체크박스로 여러 업체 선택 후 한 번에 견적 요청(`/search`의 기존
    UX와 동일한 패턴).
- **`/partner/[id]`(공급업체 상세)**: 이번에 검토만 하고 코드는 안 건드림 —
  이미 취급품목(카테고리 칩)/평점·리뷰/즐겨찾기/견적요청 버튼을 다 갖추고
  있어 buyer 홈 카드에서 클릭해 들어갔을 때 충분하다고 판단. "배송조건"
  표시는 못 넣음 — `partners` 테이블에 그런 컬럼 자체가 없고(위 조사
  결과), 이 리포는 마이그레이션을 사람이 Supabase 대시보드에 직접
  붙여넣어야만 반영되는 구조(문서 맨 위 참고)라 스키마 추가는 별도로
  사용자와 상의해서 진행하는 게 맞다고 판단해 보류함.

### 검증 (puppeteer-core, 4가지 role 전부 실제 로그인)

`npm install --no-save puppeteer-core`로 로컬 Chrome을 띄워(재고관리북
3단계 때와 동일한 방식) 4개 계정으로 직접 확인 후 puppeteer-core는 제거:
- 비로그인 → `/` 방문 시 기존 마케팅 랜딩("나에게 맞는 파트너" 히어로)
  그대로 노출.
- test01@test.com(buyer) 로그인 → `/`에서 "오늘 조건에 맞는 공급업체"
  피드 노출(마케팅 랜딩 아님). 실제 라이브 데이터로 확인된 것: test01이
  실제 거래한 "test공급식자재"가 목록 최상단에 "최근 거래" 태그와 함께
  노출됨(더미 아니라 실제 `deals` 조회 결과로 우선순위가 반영되는 것
  확인) — 즐겨찾기 태그는 이 계정에 즐겨찾기가 없어 노출 안 됨(로직상
  정상).
- test4@email.com(partner) 로그인 → `/` 방문 시 `/partner/dashboard`로
  자동 리다이렉트 확인.
- test3@test.com(admin/super_admin) 로그인 → `/` 방문 시 `/admin/dashboard`로
  자동 리다이렉트 확인(sub_admin 계정은 `users.role`이 admin으로 동일해서
  별도 테스트 안 함 — 로직상 분기 기준이 `admin_role`이 아니라 `role`이라
  차이 없음).
- 4가지 시나리오 전부 브라우저 콘솔 에러 0건.
- `npx tsc --noEmit` 통과, `npm run lint`는 이 작업으로 새로 생긴 에러
  없음(`BuyerHomeFeed.tsx`의 "setState in effect" 경고는 `/search`
  페이지에 원래 있던 동일 패턴을 그대로 재사용한 것이라 기존 컨벤션과
  일치 — 이번에 새로 생긴 문제 아님).

### 이번에 하지 않은 것

- `partners` 테이블에 배송정시율/응답률/배송조건 등 실제 컬럼 추가 —
  스키마 변경은 사람이 Supabase 대시보드에서 직접 실행해야 해서 범위
  밖으로 남겨둠. 다음에 이 작업을 하게 되면 `/search`·buyer 홈 피드·
  `/partner/[id]` 세 곳 모두 더미 대체 표기("평점 대체")를 실제 값으로
  바꿔야 함.
- `match_weight_configs` 기반 정교한 매칭 가중치 — `/search`의 기존 TODO를
  그대로 이어받았을 뿐, 이번 작업에서 손대지 않음.
- 카테고리 퀵네비/광고 배너 등 마케팅 랜딩 전용 장식 요소는 buyer 홈에
  가져오지 않음(로그인 사용자에게는 불필요하다고 판단).

## 광고 시스템 신설 (박스광고/줄광고/무료/롤링배너)

**배경**: "기존 광고 시스템(박스광고/줄광고/무료)에 배너 유형을 추가해달라"는
지시로 시작했지만, 실제로는 `ads` 테이블도 `/partner/ads/apply`·`/admin/ads`
화면도 이 리포에 전혀 없었음(코드/마이그레이션 전체 grep으로 확인 — 있던
건 마케팅 랜딩의 "광고 (준비 중)" 정적 문구 하나뿐). 사용자에게 확인 요청 →
"광고 시스템 전체를 이번에 새로 설계"하는 방향으로 진행하기로 확정받음
(가격/노출정책 등 세부사항은 합리적으로 가정하고 각 가정을 알려드리는
조건).

### 이번에 임의로 정한 가정 (다음에 실제 요구사항이 생기면 재조정 필요)

1. **승인 플로우는 4종 전부 동일**: 공급업체가 신청(`status='pending'`) →
   관리자가 시스템 밖에서(오프라인 계좌이체 확인 등) 확인 후 화면에서 수동
   승인(`active`)/반려(`rejected` + 사유). 이 프로젝트 어디에도 결제 연동이
   없어서, 계좌이체를 사람이 눈으로 확인하는 기존 관례를 그대로 확장한 것 —
   실제 결제 게이트웨이 연동은 없음.
2. **box/line/free 3종은 "신청 → 승인" 플로우까지만** 구현하고, 승인 이후
   실제 노출 위치(예: 검색결과 상단 고정)는 만들지 않음 — 어디에 어떻게
   노출할지 스펙이 전혀 없어 추측성 UI를 만들지 않기로 판단. **banner만
   실제 노출까지 연동**(BuyerHomeFeed 롤링 배너) — 이번 지시가 명시적으로
   요구한 부분이라 여기만 실제 구현.
3. `status`는 `pending`/`active`/`rejected` 3가지만(별도 `expired` 없음 —
   자동 만료 배치/cron이 이 프로젝트에 아직 없음). 이미 `active`인 광고를
   내리고 싶으면 관리자가 "게재 중단" 버튼으로 `rejected`로 재전환.
4. 정렬 순서는 신청 시각(`created_at`) 오름차순 — 별도 우선순위/
   `display_order` 컬럼 없음.
5. **가격(박스 10만원/줄 5만원/무료/배너 15만원, 월 단위)은 화면에 안내
   텍스트로만 표시하고 DB엔 저장하지 않음** — "실제 청구 금액은 신청 후
   담당자가 안내"라는 문구를 같이 노출. 완전히 지어낸 예시 금액이므로 실제
   가격 정책이 정해지면 화면 텍스트(`app/partner/ads/apply/page.tsx`의
   `AD_TYPE_INFO`)만 바꾸면 됨.
6. 승인 권한은 `admin_role` 구분 없이 `qd_is_admin()` 기준(sub_admin도 승인
   가능) — 회원관리·거래견적관리와 동일한 수준으로 판단.

### DB (`supabase/migrations/20260912000000_ads_system.sql`, 실행 완료됨)

- `ads` 테이블: `partner_id`, `ad_type`(box/line/free/banner),
  `status`(pending/active/rejected), `banner_image_url`(banner 타입일 때만
  NOT NULL — check 제약), `memo`, `reject_reason`, `reviewed_by`,
  `reviewed_at`, `created_at`.
- RLS: 공급업체는 본인 소유 partner의 광고만 신청(`qd_is_my_partner_id`
  재사용, 항상 `pending`으로만 insert 가능)/조회, 관리자(`qd_is_admin()`)는
  전체 조회+승인/반려(update), `status='active' and ad_type='banner'`인
  행은 누구나 조회 가능(공개 정책 — `/search`가 비로그인도 되는 것과 동일한
  관례).
- **Storage 버킷 `partner-ad-banners` 신규 생성**(이 프로젝트에서 처음
  쓰는 Storage — `insert into storage.buckets ...`로 SQL에서 직접 생성).
  public 버킷(이미지를 `getPublicUrl()`로 바로 `<img src>`에 씀). 업로드는
  `<partner_id>/파일명` 경로에만 허용(`storage.foldername(name)[1]`을
  `qd_is_my_partner_id()`로 검증).

### 화면

- **`/partner/ads/apply`**(신규, `/partner/*` 사이드바에 "광고 신청" 메뉴
  추가 — `app/partner/layout.tsx`의 `MYPAGE_SEGMENTS`에 `'ads'` 추가): 4종
  라디오 카드(설명+가격 안내) 선택 → banner 선택 시 파일 업로드(5MB 제한,
  `image/*`만 허용, 선택 즉시 Storage 업로드 후 미리보기) → 요청사항
  메모(선택) → 신청. 본인 신청 이력(상태 배지, 반려 시 사유, 배너면
  이미지)도 같은 화면에 표시.
- **`/admin/ads`**(신규, `AdminLayout` NAV_ITEMS에 "광고 관리" 추가 —
  super_admin 전용 아님): 승인대기/게재중/반려됨/전체 탭, banner 타입은
  썸네일 미리보기(140×47px), 승인/반려(반려 사유는 `window.prompt()` —
  기존 분쟁 반려처럼 이 프로젝트가 별도 모달 없이 confirm/prompt로 처리하는
  관례를 그대로 따름) 버튼. `active` 상태에는 "게재 중단"(반려 사유 재사용,
  `rejected`로 전환) 버튼 추가 — 요청엔 없었지만 관리자가 이미 게재 중인
  광고를 내릴 방법이 최소한 하나는 있어야 한다고 판단해 추가.
- **`components/AdRollingBanner.tsx`**(신규) + `BuyerHomeFeed.tsx` 연동
  (필터바와 카드 리스트 사이): `status='active' and ad_type='banner'`인
  광고를 신청 시각 오름차순으로 불러와 4.5초 간격 자동 슬라이드. 활성 배너
  0개면 렌더링 자체를 생략(`return null`), 1개면 화살표/도트 없이 고정
  노출, 2개 이상이면 좌우 화살표 + 하단 도트로 수동 전환도 가능. 클릭 시
  `/partner/[partner_id]`로 이동.

### 실제 검증 (puppeteer-core, 실 데이터로 전체 플로우)

마이그레이션을 사용자가 Supabase 대시보드에서 직접 실행한 뒤, 실제 로그인
3개 계정으로 업로드→승인→노출까지 전부 확인:
1. test4@email.com(partner)으로 `/partner/ads/apply`에서 실제 이미지 파일을
   Storage에 업로드(`partner-ad-banners/<partner_id>/...png`로 실제
   저장됨), banner 타입으로 신청 → "신청이 접수됐어요" + 이력에 "롤링
   배너"/"승인 대기" 표시 확인.
2. test3@test.com(admin)으로 `/admin/ads` 승인 대기 탭에서 방금 신청 건이
   업체명("test공급식자재")·배너 썸네일과 함께 뜨는 것 확인 → "승인" 클릭 →
   게재중 탭으로 이동 확인.
3. test01@test.com(buyer)으로 `/`에서 실제 Storage public URL
   (`https://<project>.supabase.co/storage/v1/object/public/partner-ad-banners/...`)
   이미지가 롤링 배너 영역에 렌더링되는 것 확인, 배너 클릭 →
   `/partner/<partner_id>`로 이동해 "test공급식자재" 상세 페이지가 뜨는 것
   까지 확인. 콘솔 에러 0건(스타일 shorthand/longhand 혼용 경고 1건은 이
   프로젝트 전역에서 `{...styles.btn, ...styles.btnDangerSmall}` 패턴을 쓰는
   기존 버튼들에 원래 있던 것 — 이번에 새로 생긴 문제 아님, 손대지 않음).
4. **테스트로 승인한 배너는 실제 buyer들에게도 라이브로 노출되는 상태였기
   때문에, 검증 직후 관리자 화면에서 "게재 중단"으로 다시 `rejected`
   처리해 정리함**(buyer 홈에서 배너가 다시 사라지는 것까지 재확인). `ads`
   테이블에 이 테스트 신청 행 자체는 `rejected` 상태로 남아있음(삭제
   정책을 의도적으로 안 만들어서 — 아래 "하지 않은 것" 참고) — 화면
   노출에는 영향 없지만, 완전히 지우고 싶다면 Supabase SQL Editor에서
   직접 delete 필요.

### 이번에 하지 않은 것

- **`ads`에 delete 정책을 만들지 않음** — 다른 승인/반려 테이블(disputes,
  partners.status 등)도 이 리포에서 delete를 안 쓰는 관례(반려/정지도
  상태값 전환이지 삭제가 아님)를 그대로 따름. 감사 이력이 남는 장점이 있는
  대신, 위 4번처럼 테스트/오신청 데이터를 완전히 지우려면 사람이 SQL로
  직접 지워야 함.
- box/line 승인 후 실제 노출 위치는 **다음 작업(바로 아래 섹션)에서 구현
  완료됨.** free만 아직 신청·승인 플로우까지만 있고 실제 노출 위치가 없음
  (아래 다음에 할 만한 것 참고).
- 결제 연동, 광고 자동 만료(cron), 승인/반려 시 공급업체 알림
  (notifications) — 전부 스펙에 없어 스킵.

## box/line 광고 실제 노출 구현

롤링 배너(banner)와 같은 패턴으로 box(박스광고)/line(줄광고)도
`BuyerHomeFeed`에 실제로 노출되게 함 — 이제 4종 중 banner/box/line 3종이
실제 노출까지 완성됨(free만 신청·승인 플로우까지만 있음).

### 선행 스키마 변경 — `end_date` 컬럼 신설

지시에 "end_date 지난 건 자동으로 노출 제외"가 명시적으로 있었는데,
`ads` 테이블 최초 설계(20260912000000) 당시엔 배너만 실제 노출 대상이라
만료 개념 자체를 범위 밖으로 정해서 이 컬럼이 없었음.
`supabase/migrations/20260913000000_ads_end_date.sql`(실행 완료)로
`ads.end_date`(nullable date) 추가. 종료일은 **공급업체가 신청 시점에
직접 입력**(선택, 비워두면 무기한 — 기존 배너의 기본 동작과 동일). 관리자가
승인 화면에서 종료일을 조정하는 UI는 만들지 않음. banner 화면
(`AdRollingBanner.tsx`)도 같은 필터를 쓰도록 함께 고침 — 기존 배너는 전부
`end_date`가 null이라 동작 변화 없음.

### ⚠ 실제로 겪은 버그 — 공개 조회 RLS가 banner로만 좁아져 있었음

box/line을 실제 승인해도 `BuyerHomeFeed`에서 항상 빈 배열만 왔음(JS 로직
문제가 아니라 RLS 문제 — 실제 네트워크 요청/응답을 캡처해서 확인, 요청은
200인데 body가 계속 `[]`). 원인: 20260912000000이 만든 공개 select
정책(`ads_select_public_active_banner`)이
`status='active' and ad_type='banner'`로 banner 전용이었음 — box/line은
관리자·본인 공급업체만 조회 가능하고 buyer(공개) 조회는 막혀 있었던 것.
`supabase/migrations/20260913010000_ads_public_select_all_types.sql`
(실행 완료)로 `status='active'`(타입 무관)로 넓힘. free도 같이 풀리지만
아직 조회하는 화면이 없어 실질적 영향 없음.

**교훈**: RLS로 막힌 요청은 대부분 200 + 빈 배열로 조용히 실패하고
콘솔에도 에러가 안 남는다 — "코드는 맞는데 데이터가 안 온다"일 때는 먼저
네트워크 탭(또는 puppeteer의 `page.on('response', ...)`)으로 실제 응답
바디를 확인하는 게 로직을 의심하는 것보다 빠름.

### 박스광고(box)

- 카테고리/지역 필터와 무관하게 항상 같은 자리(롤링배너 아래, 매칭
  리스트 위)에 고정 노출되는 별도 섹션("프리미엄 매칭 업체" 헤딩 + "광고"
  라벨). 활성 박스광고가 하나도 없으면 섹션 자체를 렌더링하지 않음(배너와
  동일한 관례).
- **개수 제한: `MAX_BOX_ADS = 4`.** 승인된 박스광고가 이보다 많으면 매번
  무작위로 섞어서 4개만 보여줌("순서 로테이션" — 지시에 제안된 두 방식
  중 로테이션을 택함. 먼저 신청한 업체가 계속 상단을 독점하는 것보다
  공평하다고 판단, 그리고 승인 단계에서 개수를 강제로 막는 것보다 구현이
  훨씬 간단함). 페이지를 새로고침할 때마다 다른 조합이 나올 수 있음(고정
  순서 아님).
- **같은 업체가 박스광고를 여러 건 신청/승인받을 수 있어서(신청 자체를
  막지 않음) partner id 기준으로 중복 제거함.** 처음 구현했을 때 이걸
  안 해서, 테스트 중 같은 테스트 업체로 박스광고 3건을 신청→승인했더니
  카드가 3장 뜨고 React key 중복 경고까지 나는 걸 직접 겪고 나서 고침 —
  실제 서비스에서도 한 업체가 여러 박스광고 슬롯을 사고 싶어할 수 있는데,
  화면에는 업체당 한 장만 보여주는 게 맞다고 판단.
- 카드 디자인: 일반 카드(`styles.card`)를 재사용하되 `large` variant
  추가(`styles.cardLarge` — 앰버 테두리 1.5px + 그림자, 패딩/아이콘/이름
  폰트 확대) + "광고" 뱃지. 카드 컴포넌트 자체를 `SupplierCard`로
  추출해서 일반 그리드와 박스광고 섹션이 같은 컴포넌트를 씀(중복 제거).

### 줄광고(line)

- 별도 섹션이 아니라 **일반 매칭 리스트 안에 "섞여서"** 노출 — 현재
  검색/필터 결과에 실제로 포함된 업체에 한해서만 우선순위가 올라감(박스
  광고와 달리 필터를 따름 — "리스트 안에 섞인다"는 지시 문구를 그대로
  해석). 정렬 우선순위: **줄광고 > 즐겨찾기 > 최근 거래 > 매칭점수**(기존
  즐겨찾기/최근거래 우선순위 위에 한 단계 더 추가).
  일반 카드와 동일한 크기·레이아웃, "광고" 뱃지 + (즐겨찾기/최근거래
  뱃지와 같은 자리에) 표시.
- 줄광고는 업체 상세정보(평점 등)를 다시 조인해서 가져올 필요 없이
  `partner_id` 목록만 별도로 가져와 `Set`으로 들고 있다가, 이미 로드된
  매칭 리스트(`results`)와 대조만 함 — 박스광고보다 쿼리가 훨씬 가벼움.

### 실제 검증 (puppeteer-core, 마이그레이션 2개 모두 실행된 상태에서)

test4@email.com(partner)으로 박스광고 3건(무기한 1건/다음달 종료 1건/
**어제 만료 1건**)+줄광고 1건 신청 → test3@test.com(admin)이 전부 승인 →
test01@test.com(buyer)으로 `/`에서 확인:
- "프리미엄 매칭 업체" 박스광고 섹션 노출, 카드에 "광고"+"최근 거래" 뱃지
  둘 다 표시(같은 업체가 test01의 최근 거래처이기도 해서 두 뱃지가 함께
  뜨는 것까지 확인) — **중복 제거 후 1장만 노출**(3건 신청했지만 같은
  업체라 1장, 의도한 동작).
- 브라우저 네트워크 요청을 직접 캡처해서 박스광고 쿼리 응답이 **정확히
  2건**(무기한 1건 + 다음달 종료 1건)만 오는 것 확인 — **어제 만료된
  1건은 서버 쿼리 단계에서 이미 제외됨**(`end_date` 필터가 SQL 레벨에서
  실제로 동작하는 것을 raw 응답으로 확인, JS에서 걸러낸 게 아님).
- 매칭 리스트에서 줄광고 업체("test공급식자재")가 "광고"+"최근 거래"
  뱃지와 함께 최상단(원래 매칭점수로는 하위권일 그린테이블 식자재보다
  위)에 오는 것 확인.
- admin `/admin/ads` 게재중 탭에서는 4건(박스 3+줄 1) 전부 보임(관리자는
  buyer용 노출 필터와 무관 — 전체 조회 정책이라 만료 여부와 상관없이
  다 보임, 의도한 동작).
- 콘솔 에러 0건(중복 key 버그 수정 후 재확인).
- **검증 후 4건 전부 "게재 중단"으로 정리**(buyer 홈에서 박스광고
  섹션·줄광고 뱃지 둘 다 다시 사라지는 것까지 재확인). `ads` 테이블엔
  이 테스트 신청들이 `rejected` 상태로 남아있음(위 배너 검증 때와 동일한
  이유 — delete 정책이 없음).

### 이번에 하지 않은 것

- 관리자가 승인 화면에서 박스광고 노출 순서/개수를 수동으로 조정하는 UI
  (지금은 무작위 로테이션 고정 로직) — `display_order` 컬럼이 없어서
  다음에 필요해지면 스키마부터 추가해야 함.
  free 승인 후 실제 노출 위치 — 여전히 스펙 없음.
- 관리자가 승인 화면에서 `end_date`를 직접 입력/수정하는 UI — 지금은
  공급업체가 신청 시 입력한 값 그대로 반영됨.

## "AI 거래전표 빠른입력" (1차: 텍스트 붙여넣기) + "새 거래처로 시작하기"

기존 "거래전표 등록"(`deal_line_items` insert → 트리거로 재고차감/외상잔액
자동갱신, ledgerbook 1단계)은 전혀 안 건드리고, 입력 방식 2가지를 새로
추가함: (1) 카톡 텍스트를 붙여넣으면 AI가 초안을 만들어주는 방식, (2) 아직
이 시스템에 계정이 없는 거래처의 첫 발주를 등록하는 방식. 확정 시 둘 다
기존 수동 입력과 완전히 동일한 `deal_line_items` insert 호출로 이어져서,
기존 트리거는 자신이 새 입력 경로로부터 호출된 것인지 전혀 모른 채 그대로
동작함.

### AI 파싱 — 이 프로젝트 최초의 서버 API 라우트

이 앱은 지금까지 100% 클라이언트에서 anon key로 Supabase를 직접 호출하는
구조였음(Route Handler를 쓴 적이 전혀 없음). `ANTHROPIC_API_KEY`를
브라우저에 노출할 수 없어서 `app/api/ai-parse-order/route.ts`를 처음으로
신설함 — 이 라우트는 Claude 호출**만** 담당하고 DB 쓰기는 전부
클라이언트가 기존처럼 사용자 세션+RLS로 직접 처리함(라우트 자체는 DB에
아무것도 안 씀).

- **모델**: `claude-sonnet-4-6` — 작업 지시에 명시된 모델을 그대로 씀
  (Claude API 스킬의 기본값은 `claude-opus-5`지만, 사용자가 특정 모델을
  명시하면 그걸 따르는 게 스킬 자체의 원칙).
- **구조화된 출력**: `client.messages.parse()` +
  `zodOutputFormat(ParsedOrderSchema)` (Zod 스키마, `@anthropic-ai/sdk`
  0.124 + `zod` 4.5 신규 설치) — JSON 파싱 실패 걱정 없이 타입 안전하게
  받음.
- **인증**: 라우트 자체엔 세션이 없으므로, 클라이언트가
  `Authorization: Bearer <access_token>`으로 넘긴 토큰을 라우트가
  `supabase.auth.getUser(token)`으로 검증 + `users.role === 'partner'`
  확인(유료 API라 로그인 여부만으로는 부족하다고 판단, 공급업체 계정만
  허용). DB 쓰기가 없는 라우트라 이 검증이 유일한 방어선.
- **프롬프트**: 이 공급업체의 `stock_levels` 품목 목록 + `item_aliases`
  매핑을 함께 전달해 우선 매칭 시도하도록 지시, 애매하면 억지로 추측하지
  말라고 명시(사람이 반드시 확인하는 화면을 거치므로). 요청 스펙의 출력
  필드(`item_name`/`quantity`/`unit`/`unit_price`/`is_credit_guess`/
  `matched_existing_item`)에 `raw_phrase`(이 품목을 추출한 원문 표현)를
  하나 추가함 — `item_aliases` 학습에 필요해서(아래 참고).
- **텍스트 길이 제한**: 6,000자(과도한 API 비용/남용 방지용 최소 안전장치,
  스펙엔 없었지만 추가).

### Step 3(확인·수정) — AI 결과와 사람이 다르면 `item_aliases`에 학습

확정 시 각 행의 `raw_phrase`(AI가 추출한 원문)와 최종 `item_name`(사람이
수정했을 수 있음)이 다르면 `item_aliases`에 upsert(있으면
`use_count + 1`, 없으면 신규) — 다음번 같은 표현이 나오면 AI가 바로
인식하도록. `use_count` 증가는 원자적 SQL 없이 클라이언트에서
select→insert/update 두 단계로 처리(이 프로젝트가 지금까지 복잡한 DB
함수보다 프론트 로직을 선호하는 관례를 따름 - 물량이 한 번 확정에 몇 건
안 돼서 동시성 문제 현실적으로 없음).

### 사용량 표시

`ai_parse_logs`에 매 분석마다 원문/파싱결과/수정여부를 기록(품질 개선
추적용 + 개인정보 우려로 본인만 조회 가능하게 RLS). "거래전표 등록" 화면
상단에 이번 달 건수를 세어 "이번 달 AI 입력 N건 사용"으로 표시만 함(제한
없음, 과금 없음 - 스펙대로).

### "거래처 선택"은 공용 컴포넌트 `DealPicker`로 통합

수동 입력 폼과 AI 모달 둘 다 `components/DealPicker.tsx`를 공용으로 씀 —
기존 "진행 중인 거래" 드롭다운은 그대로 두고 "+ 새 거래처로 시작하기"
옵션만 추가.

### "새 거래처로 시작하기" — 이 앱에 원래 없던 "partner가 직접 거래 생성"을
### 어떻게 만들었는가

**막힌 지점**: `deals` insert RLS(`deals_insert_buyer`)는
`qd_is_my_buyer_id(buyer_id)`만 허용 — **partner가 insert할 수 있는
정책 자체가 없음**(지금까지 deals는 항상 buyer가 견적을 수락할 때 본인
세션으로 만듦, `app/quote-compare/[quoteRequestId]/page.tsx`). 완전히
새로운 거래처는 `buyer_profiles`도 없는데, 그 insert 정책도 본인
(`user_id = auth.uid()`)만 허용.

**택하지 않은 방법**: `deals`/`buyer_profiles`에 partner-insert 정책을
새로 추가하거나 `buyer_id`를 nullable로 풀어 "계정 없는 거래처"라는
새로운 개념을 만드는 방법 — settlements 자동생성 트리거, 알림 트리거,
`/my-page`, disputes 등 `buyer_profiles.user_id`가 항상 유효한 auth
계정이라고 가정하는 코드가 이 리포 전체에 퍼져 있어(특히 재무 관련
트리거) 그 가정을 깨면 감사·검증 범위가 너무 커짐.

**택한 방법**(`lib/createWalkInDeal.ts`) — `app/admin/admins/page.tsx`의
`createAdmin()`(관리자가 다른 관리자 계정을 만들 때 쓰는, 이미 검증된
패턴)과 완전히 동일한 기법:
1. partner의 현재 세션(access/refresh token)을 저장.
2. `supabase.auth.signUp({email: 'walkin-<uuid>@sosangkong-walkin.invalid', password: 랜덤})`
   — 이 프로젝트는 이메일 확인이 꺼져 있어 성공하면 세션이 즉시 그 새
   계정으로 전환됨(기존에 검증된 동작).
3. 그 세션인 채로 `users`(role:'buyer') → `buyer_profiles` →
   `deals`(status:'in_progress', confirmed_at:now())를 전부 본인 명의로
   insert — 기존 self-insert 정책들을 그대로 만족.
4. **성공/실패와 무관하게 항상** partner의 원래 세션으로 `setSession()`
   복구.

이렇게 만든 "그림자" buyer 계정은 실제로 로그인 가능한 진짜 auth 계정이지만
(`.invalid` 도메인이라 아무도 실제로 로그인 못 함), `deals`/settlements/
`ar_balances`/notifications/RLS 어디에서 봐도 진짜 buyer_profiles가 딸린
정상 거래와 완전히 동일하게 취급됨 — **기존 트리거·RLS를 단 한 줄도
안 건드리고** 실제 데이터로 검증 완료(아래 참고).

**한계**: 이 함수는 여러 REST 호출로 이뤄져 있어 DB 트랜잭션이 아님 - 만약
`users`/`buyer_profiles`는 성공했는데 `deals` insert가 실패하면(실제로
아래 quote_id 이슈 때문에 두 번 겪음) 로그인 불가능한 그림자 buyer
계정만 남고 롤백되지 않음. 실제로 무해하지만(거래가 없어 어디에도
안 보임), service role key가 없어 완전 삭제는 불가능 — 위 "테스트 계정"
섹션 참고.

### 실제 테스트로 발견한 스키마 문제 2건 (둘 다 새 마이그레이션으로 해결)

1. **`deals.quote_id` NOT NULL** — walk-in 거래엔 애초에 견적이 없어
   채울 수 없음. 실제 insert 시도의 에러 메시지로 발견
   (`null value in column "quote_id" ... violates not-null constraint`
   — 이 리포는 `deals`의 `CREATE TABLE` 구문이 없어 실제 제약은 항상
   이렇게 알아내야 함, 문서 최상단 경고 참고).
   `20260915000000_deals_quote_id_nullable.sql`로 nullable로 변경(기존
   견적 기반 거래는 이미 값이 차 있어 영향 없음, 어떤 트리거/RLS도
   quote_id를 참조하지 않음을 grep으로 확인).
2. **`buyer_profiles` 공개 조회 정책이 견적 경로로만 좁혀져 있었음** —
   기존 `buyer_profiles_select_partner_target` 정책은 "나에게 견적요청을
   보낸 적 있는 buyer"만 파트너에게 보여줌(`quote_requests` 경로).
   walk-in 거래는 견적 자체가 없어서 이 경로에 안 걸려, 거래를 만든
   파트너 본인에게조차 그 거래처 이름이 안 보임(`/partner/dashboard/deals`
   "소상공인" 컬럼이 "-"로 뜨는 것으로 실제 확인). 이 버그도 실제
   테스트 중 발견함 — `20260915010000_buyer_profiles_visible_via_deal.sql`
   로 "deals로 실제 연결된 파트너"도 볼 수 있는 정책을 순수 추가(기존
   정책 안 건드림).

### 실제 검증 (puppeteer-core, `ANTHROPIC_API_KEY` 발급 후 실데이터로)

- **새 거래처로 시작하기(단독)**: test4@email.com으로 수동 입력 폼에서
  새 거래처 생성 → partner 세션 유지 확인 → 품목 추가 성공 → 새로고침
  후 "진행 중인 거래" 드롭다운·`/partner/dashboard/deals`·`/partner/ledger`
  전부에 정상 반영 확인(위 2번 버그 수정 전엔 거래처명이 "-"로
  떴던 것까지 재현 후 수정 확인).
- **AI 빠른입력 + 새 거래처(결합)**: AI 모달 안에서 "새 거래처로
  시작하기"로 거래 생성 → 실제 카톡 문구
  (`"새우 20박스" / "생닭 15개 마리당 8000원" / "얼린감자 10포 이번엔
  외상으로 해주세요 월말에 정산할게요"`)를 실제 Claude API로 분석 →
  3행 정확히 파싱(새우 20박스 단가 미확인, 생닭 15개 8,000원, **얼린감자
  10포 외상 체크됨** - "외상으로 해주세요" 문구를 정확히 인식) → 확인
  화면에서 노란 배경 "확인 필요(신규 품목)" 표시 확인 → 단가 미확인 행
  수동 입력 후 확정 → `deal_line_items`에 3건 정확히 반영, "이번 달 AI
  입력 1건 사용"으로 카운트 증가 확인.
- **기존 트리거 체인 끝까지 확인**: 얼린감자 외상 라인 확정 후
  `/partner/ledger`(매출·재고 현황)에서 이 walk-in 거래처의 외상잔액
  99,990원이 정확히 반영된 것까지 확인 — `ledgerbook_on_line_item_insert`
  트리거가 그림자 buyer 계정의 `buyer_profiles.user_id`를 정상적으로
  타고 들어가 `ar_balances`를 갱신한다는 것을 실증함(트리거 코드는 전혀
  안 건드렸음에도 완전히 정상 작동).
- 콘솔 에러 0건. `tsc`/`lint` 새 에러 없음.

### 이번에 하지 않은 것

- `createWalkInDeal()`을 진짜 DB 트랜잭션으로 묶는 것 — Supabase
  client-side REST 호출이라 불가능(service role/RPC 함수가 있어야 함).
  지금은 중간 실패 시 그림자 buyer 계정만 남고 자동 정리되지 않음(위
  "한계" 참고).
- 이미지/OCR 기반 2차 확장은 이번 범위 밖이지만, Step 2(AI 파싱)를 별도
  API 라우트(`app/api/ai-parse-order/route.ts`)로 분리해뒀고 입력이
  "텍스트 하나"라는 인터페이스만 지키면 되므로, 나중에 이미지를 먼저
  OCR/vision으로 텍스트화한 뒤 이 라우트에 그대로 넘기는 식으로 확장
  가능하도록 구조를 잡아둠(라우트가 `rawText: string`만 받고 입력 방식은
  전혀 모름).
- 관리자가 `item_aliases` 매핑을 직접 보거나 수정하는 화면 — 스펙에
  없어 스킵(지금은 공급업체가 확정할 때마다 자동으로만 쌓임).
- walk-in 거래의 `deals.amount`(거래 금액)를 나중에 실제 `deal_line_items`
  합계로 자동 동기화하는 기능 — 기존 견적 기반 거래도 마찬가지로 `amount`
  는 생성 시점에 고정되고 이후 품목 추가와 무관하다는 기존 설계를 그대로
  따름(건드리지 않음). 정산(`settlements`)은 거래 생성 시점의 `amount`
  기준으로 이미 자동 생성됨.

## 다음에 할 만한 것 (제안, 확정 아님)

- ledgerbook 4단계 후보: 재고 수량 직접 조정 UI, 매입 추적, 다수 거래 동시
  선택/월별 필터링 같은 `/partner/ledger` 사용성 개선
- 카카오 알림톡 발송 연동 (유료 addon, 매출 발생 이후 예정)
- `category_attribute_defs` 실제 스키마에 맞춘 관리 UI (보류 중)
- `partners` 테이블에 배송정시율/응답률/배송조건 실제 컬럼 추가 + buyer 홈
  피드/`/search`/`/partner/[id]`의 "평점 대체" 표기를 실제 값으로 교체
- free 광고 승인 후 실제 노출 위치 구현 — 지금은 신청·승인 플로우만 있고
  실제로 어디에도 노출되지 않음(box/line/banner 3종은 완료됨)
- 박스광고를 `/search`·마케팅 랜딩 등 buyer 홈 피드 밖에도 노출할지 검토
  (지금은 buyer 홈 피드 전용)
- 광고 결제 연동, 자동 만료(cron — 지금은 `end_date`가 지나도 status는
  `active`로 남고 노출만 안 됨, 관리자가 수동으로 "게재 중단" 안 누르면
  DB엔 계속 active로 남음), 박스광고 노출 순서/개수 관리자 조정 UI
  (`display_order` 컬럼 없음, 지금은 무작위 로테이션), 승인/반려 시
  공급업체 알림
- "AI 거래전표 빠른입력" 2차: 이미지(사진) 업로드 → OCR/vision으로
  텍스트화 → 기존 `/api/ai-parse-order`에 그대로 전달하는 흐름 추가
  (라우트는 이미 이 확장을 염두에 두고 `rawText: string`만 받는 구조)
- `createWalkInDeal()`이 중간에 실패하면 남는 그림자 buyer 계정을 주기적
  으로 정리하는 배치/스크립트 (지금은 무해하지만 계속 쌓이면 `users`/
  `buyer_profiles`에 로그인 불가능한 더미 행이 누적됨)
