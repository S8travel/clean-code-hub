# Sao lưu (backup) định kỳ database Supabase về máy

Script `scripts/backup-supabase-db.sh` dump **toàn bộ DB** (tất cả bảng + schema)
về thư mục `backups/` trên máy, có nén và tự dọn file cũ.

## 1. Lấy connection string

Supabase Dashboard → **Project Settings → Database → Connection string → Session
pooler**. Dùng bản **Session pooler** (chạy được cả từ CI/IPv4), KHÔNG dùng host
trực tiếp `db.<ref>.supabase.co` (cần IPv4 add-on trả phí). Dạng:

```
postgresql://postgres.<ref>:<MẬT-KHẨU>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

> Project đang chạy của app: ref `lflsbwoqzmbknzdpaequ`, region `ap-northeast-2`
> → host `aws-0-ap-northeast-2.pooler.supabase.com`, user `postgres.lflsbwoqzmbknzdpaequ`.

> ⚠️ **`pg_dump` phải cùng major version với server** (hiện Postgres **17**). Bản
> `pg_dump` cũ hơn sẽ báo *"server version mismatch"*. macOS: `brew install postgresql@17`.

## 2. Cài công cụ (chọn 1)

- **pg_dump** (khuyên dùng): Ubuntu `sudo apt install postgresql-client` ·
  macOS `brew install libpq`
- hoặc **Supabase CLI**: https://supabase.com/docs/guides/cli

## 3. Chạy thử

```bash
export SUPABASE_DB_URL="postgresql://postgres.lflsbwoqzmbknzdpaequ:<pass>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
./scripts/backup-supabase-db.sh
```

Kết quả: `backups/supabase_YYYYMMDD_HHMMSS.dump`.
Khôi phục: `pg_restore --no-owner -d "$SUPABASE_DB_URL" <file>.dump`.

Tuỳ biến: `BACKUP_DIR`, `BACKUP_FORMAT` (`dump` | `sql`), `KEEP_DAYS` (mặc định 14).

## 4. Đặt lịch định kỳ

### ✅ GitHub Actions (khuyên dùng — tự động thật, không cần máy bạn bật)

Workflow `.github/workflows/backup-db.yml` chạy **02:00 giờ VN mỗi ngày** (và bấm
tay được qua **Actions → Backup Supabase DB → Run workflow**). File dump lưu thành
**artifact**, tải về ở trang run (giữ 14 ngày).

**Bắt buộc 1 lần:** thêm secret repo `SUPABASE_DB_URL` —
GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**,
tên `SUPABASE_DB_URL`, giá trị là **Session pooler URI** ở mục 1.
Hoặc bằng CLI: `gh secret set SUPABASE_DB_URL` rồi dán URI.

> Lưu ý: artifact tính vào quota storage của GitHub. Muốn lưu lâu hơn / ra cloud
> (S3, Drive...) thì sửa bước "Upload artifact" trong workflow.

### Linux / macOS (cron) — ví dụ 2h sáng mỗi ngày

`crontab -e` rồi thêm (thay đường dẫn tuyệt đối cho đúng máy bạn):

```cron
0 2 * * * SUPABASE_DB_URL="postgresql://postgres:<pass>@db.lflsbwoqzmbknzdpaequ.supabase.co:5432/postgres" /duong-dan/clean-code-hub/scripts/backup-supabase-db.sh >> /duong-dan/clean-code-hub/backups/cron.log 2>&1
```

> Gợi ý bảo mật: thay vì để mật khẩu trong crontab, đặt `SUPABASE_DB_URL` vào
> `~/.pgpass` hoặc một file env riêng (chmod 600) rồi `source` trong một wrapper.

### Windows (Task Scheduler)

Tạo Task chạy `bash` (Git Bash/WSL) gọi script theo lịch, với biến môi trường
`SUPABASE_DB_URL` đặt sẵn trong Task.

## Lưu ý bảo mật

- Thư mục `backups/` đã được thêm vào `.gitignore` — **không bao giờ commit**.
- File dump chứa **dữ liệu thật**; lưu nơi an toàn, cân nhắc mã hoá khi sao lưu xa.
