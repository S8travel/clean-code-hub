# Sao lưu (backup) định kỳ database Supabase về máy

Script `scripts/backup-supabase-db.sh` dump **toàn bộ DB** (tất cả bảng + schema)
về thư mục `backups/` trên máy, có nén và tự dọn file cũ.

## 1. Lấy connection string

Supabase Dashboard → **Project Settings → Database → Connection string → URI**.
Dùng bản **Session pooler** (port `5432`) cho `pg_dump`:

```
postgresql://postgres:<MẬT-KHẨU>@db.<ref>.supabase.co:5432/postgres
```

> Project đang chạy của app: ref `lflsbwoqzmbknzdpaequ`.

## 2. Cài công cụ (chọn 1)

- **pg_dump** (khuyên dùng): Ubuntu `sudo apt install postgresql-client` ·
  macOS `brew install libpq`
- hoặc **Supabase CLI**: https://supabase.com/docs/guides/cli

## 3. Chạy thử

```bash
export SUPABASE_DB_URL="postgresql://postgres:<pass>@db.lflsbwoqzmbknzdpaequ.supabase.co:5432/postgres"
./scripts/backup-supabase-db.sh
```

Kết quả: `backups/supabase_YYYYMMDD_HHMMSS.dump`.
Khôi phục: `pg_restore --no-owner -d "$SUPABASE_DB_URL" <file>.dump`.

Tuỳ biến: `BACKUP_DIR`, `BACKUP_FORMAT` (`dump` | `sql`), `KEEP_DAYS` (mặc định 14).

## 4. Đặt lịch định kỳ

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
