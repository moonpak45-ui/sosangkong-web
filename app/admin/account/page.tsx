'use client'

import AccountSettingsForm from '../../../components/AccountSettingsForm'

export default function AdminAccountSettingsPage() {
  return <AccountSettingsForm backHref="/admin/dashboard" backLabel="관리자 대시보드로" />
}
