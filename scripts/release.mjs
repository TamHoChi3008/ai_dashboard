// Ra bản mới của AI Board lên GitHub Releases (app đã cài sẽ tự thấy và cập nhật).
//
//   npm run release            → tăng patch (0.1.0 → 0.1.1)
//   npm run release -- minor   → tăng minor (0.1.0 → 0.2.0)
//   npm run release -- major   → tăng major
//   npm run release -- 0.3.0   → đặt đúng số phiên bản
//
// Cần biến môi trường GH_TOKEN: GitHub token (fine-grained) có quyền Contents: Read and write cho repo ai_dashboard.
// Các bước: kiểm tra → test → tăng version + commit + tag → push → build → upload bộ cài + latest.yml lên Release.
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const fail = (msg) => {
  console.error('\n✖ ' + msg)
  process.exit(1)
}

const bump = process.argv[2] || 'patch'
if (!/^(patch|minor|major|\d+\.\d+\.\d+)$/.test(bump)) fail(`Không hiểu "${bump}". Dùng patch | minor | major | x.y.z`)

if (!process.env.GH_TOKEN) {
  fail(
    'Chưa có GH_TOKEN.\n' +
      '  Tạo token: https://github.com/settings/personal-access-tokens/new\n' +
      '  (Repository access: chỉ ai_dashboard · Permissions: Contents = Read and write)\n' +
      '  Rồi chạy (PowerShell):  $env:GH_TOKEN="github_pat_..."; npm run release'
  )
}
if (out('git status --porcelain')) fail('Còn thay đổi chưa commit. Hãy commit (hoặc stash) trước khi ra bản mới.')
if (out('git rev-parse --abbrev-ref HEAD') !== 'main') fail('Chỉ ra bản từ nhánh main.')

// biến này của VS Code làm Electron chạy như Node, phải bỏ khi build
delete process.env.ELECTRON_RUN_AS_NODE

console.log('\n▶ Kiểm tra kiểu và chạy test')
run('npm run typecheck')
run('npm test')

console.log(`\n▶ Tăng version (${bump})`)
run(`npm version ${bump} -m "Phát hành v%s"`)
const version = JSON.parse(readFileSync('package.json', 'utf8')).version

console.log('\n▶ Đẩy commit và tag lên GitHub')
run('git push --follow-tags')

console.log(`\n▶ Build và tải v${version} lên GitHub Releases`)
run('npx electron-vite build')
run('npx electron-builder --win nsis --publish always')

console.log(`\n✔ Đã phát hành v${version}: https://github.com/TamHoChi3008/ai_dashboard/releases/tag/v${version}`)
console.log('  App đã cài sẽ thấy bản mới khi bấm "Kiểm tra cập nhật" (hoặc tự kiểm tra lúc mở app).')
