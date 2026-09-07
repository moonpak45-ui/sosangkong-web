-- ============================================================
-- 견적 응답 / 거래 확정 기능을 위한 RLS 정책
-- 대상 테이블: partners, quotes, quote_request_targets, deals, quote_requests
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 함수는 create or replace, 정책은 drop → create 로 작성되어 있습니다.)
--
-- 주의 1) 위 5개 테이블은 지금까지 RLS가 꺼져 있어 anon/authenticated 키로
-- 자유롭게 조회/입력이 가능했습니다. 이 마이그레이션을 실행하면 각 테이블에
-- RLS가 "켜지고" 아래 정책만 허용되므로, 요청하신 정책 외에도 이미 배포된
-- 기능(업체 검색, 견적요청서 작성, 마이페이지, 공급업체 대시보드, 견적 비교)이
-- 계속 동작하는 데 필요한 최소한의 정책을 함께 추가했습니다. 아래 각 섹션에
-- "[요청하신 정책]"과 "[추가]"를 구분해서 표시해 두었으니 실행 전 검토해주세요.
--
-- 주의 2) quote_requests와 quote_request_targets는 "이 견적요청을 보낸
-- buyer인가" / "이 요청의 대상 partner인가"를 서로의 테이블을 참조해서
-- 판단해야 합니다. 두 테이블 정책이 서로를 직접 subquery로 참조하면 RLS가
-- 순환 평가되어 정책이 무한히 확장되므로(Postgres/Supabase의 잘 알려진 RLS
-- 함정입니다), 아래에 정의하는 SECURITY DEFINER 함수로 그 상호 참조 부분을
-- 감싸 순환을 끊었습니다. 이 함수들은 테이블 소유자 권한으로 실행되어 RLS를
-- 우회하지만, 결과는 boolean 하나(내 소유인가/내가 관련자인가)만 반환하므로
-- 별도의 정보 노출은 없습니다.
--
-- users, buyer_profiles, categories, partner_categories 등 다른 테이블은
-- 이번 요청 범위가 아니므로 건드리지 않았습니다 (계속 RLS 없이 열려 있습니다).
-- ============================================================

-- ------------------------------------------------------------
-- 0. 헬퍼 함수 (RLS 순환 평가 방지 + 반복 서브쿼리 비용 절감용)
-- ------------------------------------------------------------

create or replace function qd_is_my_partner_id(p_partner_id uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from partners where id = p_partner_id and user_id = auth.uid()
  );
$$;

create or replace function qd_is_my_buyer_id(p_buyer_id uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from buyer_profiles where id = p_buyer_id and user_id = auth.uid()
  );
$$;

-- 로그인한 유저가 partner로서 해당 quote_request의 발송 대상인지
create or replace function qd_is_request_target_partner(p_request_id uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from quote_request_targets qrt
    join partners p on p.id = qrt.partner_id
    where qrt.quote_request_id = p_request_id and p.user_id = auth.uid()
  );
$$;

-- 로그인한 유저가 buyer로서 해당 quote_request의 소유자인지
create or replace function qd_is_request_owner(p_request_id uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from quote_requests qr
    join buyer_profiles bp on bp.id = qr.buyer_id
    where qr.id = p_request_id and bp.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- 1. partners
-- ------------------------------------------------------------
alter table partners enable row level security;

-- [요청하신 정책] 본인 소유 partner row는 select 가능
drop policy if exists partners_select_own on partners;
create policy partners_select_own
  on partners for select
  using (user_id = auth.uid());

-- [추가] 검색결과/견적요청/마이페이지/견적비교 등에서 다른 사용자의 partners
-- 정보(업체명, 지역, 평점 등)를 조회해야 하므로, 정지(suspended)되지 않은
-- 업체는 누구나(비로그인 포함) 조회 가능하도록 공개 select 정책을 추가.
-- 이 정책이 없으면 /search, /quote-request, /my-page, /quote-compare가
-- 모두 깨집니다.
drop policy if exists partners_select_public on partners;
create policy partners_select_public
  on partners for select
  using (status <> 'suspended');

-- [추가] 회원가입 시 공급업체 계정이 자신의 partners row를 최초 생성해야
-- 하므로(app/login/page.tsx 의 공급업체 가입 플로우), 본인 명의 insert를 허용.
drop policy if exists partners_insert_own on partners;
create policy partners_insert_own
  on partners for insert
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. quote_requests
-- ------------------------------------------------------------
alter table quote_requests enable row level security;

-- [추가] 소상공인이 /quote-request 에서 자신의 견적요청을 새로 생성해야
-- 하므로, 본인 buyer_profiles 소유의 insert를 허용.
drop policy if exists quote_requests_insert_buyer on quote_requests;
create policy quote_requests_insert_buyer
  on quote_requests for insert
  with check (qd_is_my_buyer_id(buyer_id));

-- [추가] (a) 본인이 보낸 요청은 buyer 본인이, (b) 자신에게 전달된 요청은
-- partner 본인이 조회할 수 있어야 마이페이지/견적비교/공급업체 대시보드가
-- 동작합니다.
drop policy if exists quote_requests_select_buyer_or_partner on quote_requests;
create policy quote_requests_select_buyer_or_partner
  on quote_requests for select
  using (
    qd_is_my_buyer_id(buyer_id)
    or qd_is_request_target_partner(id)
  );

-- [요청하신 정책] update(status='closed')는 buyer 본인일 때만 허용.
-- RLS는 컬럼 단위 제약을 직접 표현할 수 없어, with check에 "결과 행의
-- status가 closed여야 한다"는 조건을 넣어 사실상 '닫기' 동작만 허용했습니다.
drop policy if exists quote_requests_update_buyer_close on quote_requests;
create policy quote_requests_update_buyer_close
  on quote_requests for update
  using (qd_is_my_buyer_id(buyer_id))
  with check (qd_is_my_buyer_id(buyer_id) and status = 'closed');

-- ------------------------------------------------------------
-- 3. quote_request_targets
-- ------------------------------------------------------------
alter table quote_request_targets enable row level security;

-- [추가] /quote-request 에서 소상공인이 요청서를 보낼 때, 선택한 업체 수만큼
-- 이 테이블에 insert 합니다. 본인 소유 quote_requests에 대해서만 허용.
drop policy if exists qrt_insert_buyer on quote_request_targets;
create policy qrt_insert_buyer
  on quote_request_targets for insert
  with check (qd_is_request_owner(quote_request_id));

-- [추가] (a) buyer 본인이 보낸 요청의 발송 대상 목록(회신 현황 표시용),
-- (b) partner 본인에게 온 요청(공급업체 대시보드의 "받은 견적요청" 목록)을
-- 조회할 수 있어야 합니다.
drop policy if exists qrt_select_buyer_or_partner on quote_request_targets;
create policy qrt_select_buyer_or_partner
  on quote_request_targets for select
  using (
    qd_is_my_partner_id(partner_id)
    or qd_is_request_owner(quote_request_id)
  );

-- [요청하신 정책] update(status 변경)는 partner_id가 로그인한 유저의
-- partners.id와 일치할 때만 허용.
drop policy if exists qrt_update_partner on quote_request_targets;
create policy qrt_update_partner
  on quote_request_targets for update
  using (qd_is_my_partner_id(partner_id))
  with check (qd_is_my_partner_id(partner_id));

-- ------------------------------------------------------------
-- 4. quotes
-- ------------------------------------------------------------
alter table quotes enable row level security;

-- [요청하신 정책] insert는 partner_id가 로그인한 유저의 partners.id와
-- 일치할 때만 허용.
drop policy if exists quotes_insert_own_partner on quotes;
create policy quotes_insert_own_partner
  on quotes for insert
  with check (qd_is_my_partner_id(partner_id));

-- [요청하신 정책] select는 (a) 그 quote_request의 buyer이거나 (b) 그 quote의
-- partner 본인일 때 허용.
drop policy if exists quotes_select_buyer_or_partner on quotes;
create policy quotes_select_buyer_or_partner
  on quotes for select
  using (
    qd_is_my_partner_id(partner_id)
    or qd_is_request_owner(quote_request_id)
  );

-- ------------------------------------------------------------
-- 5. deals
-- ------------------------------------------------------------
alter table deals enable row level security;

-- [요청하신 정책] insert는 buyer_id가 로그인한 유저의 buyer_profiles.id와
-- 일치할 때만 허용.
drop policy if exists deals_insert_buyer on deals;
create policy deals_insert_buyer
  on deals for insert
  with check (qd_is_my_buyer_id(buyer_id));

-- [요청하신 정책] select는 buyer 본인이거나 partner 본인일 때 허용.
drop policy if exists deals_select_buyer_or_partner on deals;
create policy deals_select_buyer_or_partner
  on deals for select
  using (
    qd_is_my_buyer_id(buyer_id)
    or qd_is_my_partner_id(partner_id)
  );
