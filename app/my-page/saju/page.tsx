import { redirect } from 'next/navigation'

// 사주 프로필 등록 폼은 app/fortune/register로 이전됨(buyer_profiles 유무와
// 무관하게 partner 계정도 접근 가능해야 해서). 옛 경로를 북마크했거나
// 링크를 걸어둔 곳이 있을 수 있어 경로 자체는 남겨두고 리다이렉트만 한다.
export default function SajuProfileRedirectPage() {
  redirect('/fortune/register')
}
