import { useState } from 'react'
import type { ProfileInfo, Provider } from '@shared/types'
import { api } from '../api'
import { CatalogDialog } from './CatalogDialog'
import { deleteProfileFlow } from '../profileActions'

interface Props {
  profile: ProfileInfo | null
  onClose(): void
  onSaved(id?: string): void
}

export function ProfileDialog({ profile, onClose, onSaved }: Props) {
  const [name, setName] = useState(profile?.name ?? '')
  const [provider, setProvider] = useState<Provider>(profile?.provider ?? 'claude')
  const [color, setColor] = useState(profile?.color ?? '#6c8cff')
  const [configDir, setConfigDir] = useState(profile?.configDir ?? '')
  const [cliPath, setCliPath] = useState(profile?.cliPath ?? '')
  const [error, setError] = useState('')
  const [showCatalog, setShowCatalog] = useState(false)

  const save = async () => {
    try {
      const p = await api.saveProfile({ id: profile?.id, name, provider, color, configDir, cliPath })
      onSaved(p.id)
    } catch (e) {
      setError(String(e))
    }
  }

  const remove = async () => {
    if (!profile) return
    if (await deleteProfileFlow(profile)) onSaved()
  }

  // hộp thoại tìm kiếm thay chỗ form; đóng thì quay lại form (giữ nguyên chỗ đang sửa)
  if (showCatalog && profile) return <CatalogDialog profile={profile} onClose={() => setShowCatalog(false)} />

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{profile ? 'Sửa profile' : 'Thêm profile'}</h3>
        <label>
          Tên hiển thị
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Claude công ty" autoFocus />
        </label>
        <label>
          Agent
          <select value={provider} disabled={!!profile} onChange={(e) => setProvider(e.target.value as Provider)}>
            <option value="claude">Claude Code</option>
            <option value="codex">Codex (ChatGPT)</option>
          </select>
        </label>
        <label>
          Màu
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label>
          Thư mục cấu hình (mỗi tài khoản một thư mục)
          <div className="row">
            <input
              value={configDir}
              onChange={(e) => setConfigDir(e.target.value)}
              placeholder="Để trống: app tự tạo thư mục mới cho tài khoản mới"
            />
            <button
              onClick={async () => {
                const d = await api.pickFolder()
                if (d) setConfigDir(d)
              }}
            >
              Chọn…
            </button>
          </div>
          <small>
            Mặc định: {provider === 'claude' ? '~/.claude' : '~/.codex'} (tài khoản đang dùng trong VS Code). Tài khoản thứ hai:
            để trống, rồi bấm “Đăng nhập” trong tab mới.
          </small>
        </label>
        <label>
          Đường dẫn CLI (tuỳ chọn)
          <input value={cliPath} onChange={(e) => setCliPath(e.target.value)} placeholder="Để trống: tự tìm" />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="row end">
          {profile && (
            <button className="danger" onClick={remove}>
              Xoá
            </button>
          )}
          {profile && (
            <button onClick={() => setShowCatalog(true)} title="Tìm plugin, skill, command, agent đã cài cho profile này">
              🔍 Plugin & Skill
            </button>
          )}
          <span className="grow" />
          <button onClick={onClose}>Huỷ</button>
          <button className="primary" onClick={save}>
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}
