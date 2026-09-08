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
- **재고관리북(ledgerbook) 1단계** (이번 작업, 아래 상세)

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
- 소상공인(buyer) 쪽 UI (자기 외상잔액 조회 등) — 지금은 파트너만 볼 수 있음
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

## 다음에 할 만한 것 (제안, 확정 아님)

- ledgerbook 2단계: buyer 쪽 UI(자기 외상잔액 조회), 재고 수량 직접 조정,
  매입 추적
- `category_attribute_defs` 실제 스키마에 맞춘 관리 UI (보류 중)
