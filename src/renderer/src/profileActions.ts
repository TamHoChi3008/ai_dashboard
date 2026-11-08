import type { ProfileInfo } from '@shared/types'
import { api } from './api'
import { alertDialog, choiceDialog } from './dialogs'

/**
 * Hỏi rồi xoá profile. Thư mục đăng nhập do app tạo thì cho chọn chuyển luôn vào Thùng rác;
 * thư mục người dùng tự chỉ (VD ~/.claude) thì luôn giữ lại.
 * Trả về true nếu đã xoá.
 */
export async function deleteProfileFlow(p: ProfileInfo): Promise<boolean> {
  const msg =
    `Xoá profile "${p.name}" (${p.provider} · ${p.account ?? 'chưa đăng nhập'})?\n` +
    'Các khung đang mở của profile sẽ đóng. Session không bị xoá.\n\n' +
    `Thư mục đăng nhập: ${p.configDir}\n` +
    (p.appManagedDir
      ? 'Thư mục này do app tạo: có thể giữ lại (thêm lại profile sau vẫn dùng được) hoặc chuyển vào Thùng rác cùng profile.'
      : 'Thư mục này không do app tạo nên luôn được giữ lại.')
  const buttons = p.appManagedDir
    ? [
        { value: 'keep', label: 'Xoá profile, giữ thư mục', kind: 'primary' as const },
        { value: 'all', label: 'Xoá cả thư mục đăng nhập', kind: 'danger' as const },
        { value: 'cancel', label: 'Huỷ' }
      ]
    : [
        { value: 'keep', label: 'Xoá profile', kind: 'danger' as const },
        { value: 'cancel', label: 'Huỷ' }
      ]
  const choice = await choiceDialog(msg, buttons, 'cancel')
  if (choice !== 'keep' && choice !== 'all') return false
  try {
    await api.deleteProfile(p.id, choice === 'all')
    return true
  } catch (e) {
    void alertDialog(`Không xoá được profile: ${String((e as Error).message ?? e)}`)
    return false
  }
}
