-- ============================================================
-- /admin/ads 광고 직접 등록 시 이미지 업로드가
-- "invalid input syntax for type uuid: 'admin'" 에러로 실패하는 문제 수정
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 —
-- create or replace function / drop policy if exists → create policy)
--
-- 원인) 20260912000000_ads_system.sql의 partner_ad_banners_insert_own
-- 정책이 `((storage.foldername(name))[1])::uuid`로 경로의 첫 세그먼트를
-- 무조건 uuid로 캐스팅함. storage.objects INSERT에 걸린 permissive 정책들은
-- OR로 합쳐지는데, Postgres는 AND/OR의 하위 표현식 평가 순서를 보장하지
-- 않으므로(문서에 명시됨) 관리자가 admin/... 경로로 업로드할 때도 이
-- _own 정책의 캐스팅이 평가되면서 'admin'::uuid 자체에서 에러가 나
-- partner_ad_banners_insert_admin 정책이 허용 여부를 판단하기도 전에
-- 전체 insert가 실패함.
-- ============================================================

-- uuid 형식이 아닌 문자열이 와도 에러 대신 null을 반환하는 안전한 캐스팅
-- 헬퍼. qd_is_my_partner_id(null)은 `id = null`이 항상 false이므로 안전.
create or replace function qd_uuid_or_null(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

drop policy if exists partner_ad_banners_insert_own on storage.objects;
create policy partner_ad_banners_insert_own
  on storage.objects for insert
  with check (
    bucket_id = 'partner-ad-banners'
    and qd_is_my_partner_id(qd_uuid_or_null((storage.foldername(name))[1]))
  );
