# AI Board

App desktop (Electron) để quản lý nhiều agent, tài khoản và chat session trong một cửa sổ:

- **Mỗi tab là một profile**: một agent (Claude Code hoặc Codex) với một tài khoản. Có thể có hai tab Claude với hai tài khoản khác nhau.
- **Xem nhiều session cùng lúc**: lưới tối đa 6 khung. Session đang mở trong các cửa sổ VS Code cũng hiện ra và tự cập nhật.
- **Chat trực tiếp (Claude)**: giao diện chat ngay trong app, gồm câu trả lời hiện dần, thẻ tool, thẻ xin quyền (Cho phép / Luôn cho phép / Từ chối),
  nút Dừng, chọn chế độ quyền và xem chi phí. Chạy qua Claude Agent SDK, tức Claude Code headless, nên vẫn đọc CLAUDE.md, settings và skills như bình thường.
- **Terminal**: mở session bằng CLI đầy đủ (`claude --resume` / `codex resume`). Dùng cho Codex, hoặc khi cần lệnh tương tác như `/login`, `/config`.
- **Trạng thái**: 🟢 đang chạy · 🟡 tới lượt bạn · ⚪ nghỉ.
- **Tab ⌂ Tổng quan**: session đang chạy / chờ bạn của mọi profile (bấm để mở), và thống kê token 7/30 ngày theo profile, theo ngày và theo model.
- **Trong khung chat**: chọn model (◆), đính kèm ảnh/file (📎, dán ảnh bằng Ctrl+V, hoặc kéo thả vào ô nhập),
  câu hỏi của agent (AskUserQuestion) hiện thành nút chọn.
- **Xoá session** (icon thùng rác trong danh sách): chọn chuyển vào Thùng rác hoặc xoá vĩnh viễn. Session đang chạy không xoá được.
  Session trong Thùng rác hiện ở mục **"Đã xoá gần đây"** cuối danh sách, có nút khôi phục ↺ và xoá vĩnh viễn;
  quá 30 ngày không khôi phục thì app tự xoá hẳn. Nếu Thùng rác Windows bị dọn trước đó thì mục đó tự biến mất.
- **Link trong chat** mở ở cửa sổ riêng (đóng bằng ✕ hoặc Ctrl+W; Ctrl+Shift+O mở trang đó bằng trình duyệt mặc định).
- **Xoá profile**: nút "Xoá" trên thẻ profile ở tab Tổng quan, hoặc trong "Sửa profile". Thư mục đăng nhập do app tạo có thể giữ lại
  hoặc chuyển vào Thùng rác cùng profile; thư mục bạn tự chỉ (VD `~/.claude`) luôn được giữ.
- **Đổi tên session**: nhấp đúp vào tên ở sidebar hoặc trên thanh tiêu đề khung (hoặc nút ✎). Để trống = về tên gốc.
  Tên chỉ lưu trong app (cùng file ghim/ẩn), không sửa file session nên VS Code vẫn hiện tên gốc.
- **Đóng tab profile**: nút ✕ trên tab, chuột giữa, hoặc Ctrl+W. Profile không bị xoá; mở lại từ tab ⌂ Tổng quan (bố cục khung được giữ).
- **Phím tắt**: Ctrl+Tab / Ctrl+Shift+Tab (hoặc Ctrl+PageDown / PageUp) đổi tab · Ctrl+1…9 tới tab thứ N (1 = Tổng quan) · Ctrl+W đóng tab profile.
- **Nhớ bố cục**: các khung đang mở được mở lại ở lần chạy sau. Khung chat mở lại ở chế độ Chat (chưa chạy CLI cho tới khi gửi tin);
  khung terminal mở lại ở chế độ Xem để không tự chạy CLI.

## Yêu cầu

- Node.js 22 trở lên.
- Đã cài Claude Code (`npm i -g @anthropic-ai/claude-code` hoặc native installer) và đã đăng nhập ít nhất một lần.
- Codex CLI (không bắt buộc): cài riêng, hoặc dùng bản đi kèm extension Codex của VS Code.

## Các lệnh

Chạy trong thư mục `AI_board`:

| Lệnh | Dùng khi | Kết quả |
|---|---|---|
| `npm install` | Lần đầu, hoặc sau khi đổi dependency | Cài thư viện vào `node_modules/` |
| `npm run dev` | Đang sửa code | Mở app, tự nạp lại khi code đổi (cả main/preload) |
| `npm run typecheck` | Trước khi build | Kiểm tra lỗi TypeScript |
| `npm test` | Trước khi build | Chạy test (vitest) |
| `npm run build` | Chỉ cần biên dịch | Code đã build trong `out/` |
| `npm start` | Chạy thử bản đã build, không hot reload | Mở app từ `out/` |
| `npm run dist` | **Ra bản cài mới** | `release/AI-Board-Setup-<version>.exe` |
| `npm run dist:dir` | Chạy thử bản đóng gói mà không cần cài | `release/win-unpacked/AI Board.exe` |
| `npm version patch` | Tăng số phiên bản trước khi ra bản mới | `0.1.0` → `0.1.1` trong `package.json` |

### Quy trình thường dùng

**Sửa code hằng ngày**

```bash
npm run dev
```

**Ra một bản cài mới sau khi sửa code**

```bash
npm run typecheck
npm test
npm version patch --no-git-tag-version   # không bắt buộc, để tên file cài có số mới
npm run dist
```

**Cập nhật bản đã cài trên máy**

1. Tắt AI Board bản đã cài (bản cài chỉ cho chạy một cửa sổ). Bản `npm run dev` không cần tắt.
2. Chạy file `release/AI-Board-Setup-<version>.exe` mới. Bộ cài sẽ ghi đè lên bản cũ.
3. Profile, ghim/ẩn và cài đặt vẫn giữ nguyên.

**Dọn bản build cũ** (khi build lỗi lạ)

```powershell
Remove-Item -Recurse -Force out, release
npm run dist
```

> Nếu chạy từ terminal trong VS Code mà gặp lỗi `Cannot read properties of undefined (reading 'whenReady')`,
> nghĩa là môi trường có biến `ELECTRON_RUN_AS_NODE=1`. Xoá biến đó trước khi chạy:
> - PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE; npm run dev`
> - Git Bash: `env -u ELECTRON_RUN_AS_NODE npm run dev`

## Phát hành bản mới và tự cập nhật

Repo: https://github.com/TamHoChi3008/ai_dashboard. App đã cài tự kiểm tra bản mới trên **GitHub Releases**
(15 giây sau khi mở, rồi mỗi 6 giờ). Có bản mới thì nút phiên bản ở góc phải thanh tab hiện **"● Cập nhật"**:
bấm → **Tải bản vX** → **Khởi động lại để cài** (hoặc để đó, bản mới tự cài khi tắt app). Bản `npm run dev` không tự cập nhật.

**Ra bản mới** (một lệnh: test → tăng version → commit + tag → push → build → tải lên Release):

```powershell
$env:GH_TOKEN="github_pat_..."   # một lần cho mỗi cửa sổ terminal
npm run release                  # 0.2.0 → 0.2.1 (patch)
npm run release -- minor         # 0.2.1 → 0.3.0
```

- `GH_TOKEN`: tạo ở https://github.com/settings/personal-access-tokens/new, **Repository access** chỉ chọn `ai_dashboard`,
  **Permissions → Contents: Read and write**. Không lưu token vào code hay commit.
- Phải commit hết thay đổi và đang ở nhánh `main` trước khi chạy (script sẽ báo nếu chưa).
- Nội dung thay đổi: sửa phần mô tả của Release trên GitHub, app sẽ hiện nó trong popup cập nhật.

## Đóng gói thành bộ cài (.exe)

`npm run dist` chạy hai bước:

1. `electron-vite build` biên dịch `src/` ra `out/`.
2. `electron-builder` đóng gói `out/` cùng Electron thành bộ cài trong `release/`.

Lần đầu mất vài phút vì phải tải Electron và NSIS. Các lần sau khoảng nửa phút.

- Bộ cài **không cần quyền admin**, mặc định cài vào `%LOCALAPPDATA%\Programs\AI Board`, cho phép đổi thư mục, tạo shortcut ở Desktop và Start Menu.
- **Không đóng gói `claude.exe`.** Máy phải có sẵn Claude Code (`npm i -g @anthropic-ai/claude-code` hoặc native installer).
  App tự tìm theo thứ tự: đường dẫn CLI trong profile → `~/.local/bin/claude.exe` → bản npm global → `where claude`.
- Dữ liệu (profile, ghim/ẩn, cài đặt) luôn nằm ở `%APPDATA%\ai-board`, dùng chung cho bản dev và bản cài. Gỡ app không xoá dữ liệu này.
- Bản cài chỉ chạy một cửa sổ: mở lần nữa sẽ đưa cửa sổ đang chạy lên trước.
- Bản dev (`npm run dev`, tiêu đề "AI Board (dev)") chạy được song song với bản cài. Hai bản dùng chung profile, ghim/ẩn và cài đặt,
  nhưng bố cục khung lưu riêng (`layout-dev.json` / `layout.json`).
- Chưa ký code nên lần đầu chạy Windows SmartScreen sẽ cảnh báo → **More info → Run anyway**.

## Thêm tài khoản thứ hai

1. Bấm **+** trên thanh tab, chọn agent, đặt tên và **để trống "Thư mục cấu hình"**.
   App sẽ tạo thư mục riêng cho tài khoản này.
2. Trong tab mới, bấm **Đăng nhập**, rồi làm theo hướng dẫn của CLI.
3. Email tài khoản sẽ hiện trên tab (nhấp đúp vào tab để sửa profile).

Mỗi profile dùng thư mục cấu hình riêng thông qua biến môi trường của CLI:

| Agent | Biến môi trường | Thư mục mặc định |
|---|---|---|
| Claude Code | `CLAUDE_CONFIG_DIR` | `~/.claude` |
| Codex | `CODEX_HOME` | `~/.codex` |

Muốn một cửa sổ VS Code dùng tài khoản thứ hai: mở VS Code từ một terminal đã đặt biến này,
ví dụ `$env:CLAUDE_CONFIG_DIR="<thư mục của profile>"; code .`

## Lưu ý

- **Không mở cùng một session ở hai nơi một lúc** (VS Code và AI Board). Cả hai cùng ghi một file thì lịch sử sẽ bị lẫn.
  App sẽ hỏi lại khi bạn bấm Chat trên một session đang hoạt động.
- App chỉ chạy CLI chính chủ và đọc file session trên máy. Nó không lấy token để gọi API.
  Email tài khoản được đọc từ `.claude.json` / `auth.json`; token không bị đọc hay gửi đi đâu cả.
- Định dạng file session (`.jsonl`) là định dạng nội bộ của các CLI và có thể đổi theo phiên bản.
  Phần đọc file nằm riêng ở `src/main/providers/*Parse.ts` để dễ sửa.
- Codex: app tìm `codex` trên PATH, nếu không có thì dùng bản `codex.exe` đi kèm extension VS Code.

## Cấu trúc

```
src/
  shared/types.ts            kiểu dữ liệu dùng chung main ↔ renderer
  main/
    index.ts                 cửa sổ + IPC
    profiles.ts              lưu profile (userData/profiles.json), đọc email tài khoản
    pty.ts                   chạy claude/codex trong terminal với env của profile
    chat/claudeChat.ts       phiên chat headless qua Claude Agent SDK (hỏi quyền, dừng, đổi chế độ)
    chat/normalize.ts        chuyển message của SDK → event chat gọn
    watcher.ts               theo dõi file session thay đổi → báo renderer
    providers/
      claudeParse.ts         parse session Claude Code
      codexParse.ts          parse session Codex (.jsonl và .jsonl.zst)
      sessions.ts            liệt kê session, cache theo mtime
  preload/index.ts           cầu nối API an toàn (contextIsolation)
  renderer/src/
    App.tsx                  thanh tab profile
    components/Workspace.tsx danh sách session + lưới khung
    components/Pane.tsx      một khung: Xem (transcript) / Chat (terminal)
tests/parsers.test.ts
```

## Lộ trình tiếp theo

- [ ] Hooks (`Stop`, `Notification`) để biết trạng thái chính xác hơn, kèm thông báo Windows khi agent chờ bạn.
- [x] Tab tổng quan: gom session đang chạy của mọi profile vào một màn hình.
- [ ] Chat trực tiếp cho Codex qua `codex app-server`.
- [x] Đính kèm ảnh/file vào tin nhắn chat; chọn model.
- [x] Hiển thị câu hỏi của tool AskUserQuestion dưới dạng nút chọn.
- [x] Lưu bố cục khung giữa các lần mở app.
- [x] Thống kê token theo profile (chưa có chi phí: file session không ghi giá).
- [x] Bản dev chạy song song với bản đã cài.
- [x] Đóng gói bằng electron-builder (file .exe cài đặt).
