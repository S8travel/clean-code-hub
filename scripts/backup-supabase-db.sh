#!/usr/bin/env bash
# Sao lưu (dump) TOÀN BỘ database Supabase về máy — tất cả bảng + schema.
#
# Cách dùng:
#   1. Lấy connection string của database (Supabase Dashboard → Project Settings
#      → Database → Connection string → URI). Dạng:
#        postgresql://postgres:<MẬT-KHẨU>@db.<ref>.supabase.co:5432/postgres
#      (Nên dùng "Session pooler" / port 5432 cho pg_dump.)
#   2. Đặt vào biến môi trường, KHÔNG hardcode vào file:
#        export SUPABASE_DB_URL="postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres"
#   3. Chạy:
#        ./scripts/backup-supabase-db.sh
#
# Tuỳ biến qua env:
#   BACKUP_DIR     Thư mục lưu backup (mặc định: ./backups)
#   BACKUP_FORMAT  "dump" = pg_dump nén -Fc (mặc định) | "sql" = plain SQL .sql.gz
#   KEEP_DAYS      Số ngày giữ lại; backup cũ hơn sẽ bị xoá (mặc định: 14)
#
# Yêu cầu: có `pg_dump` (gói postgresql-client). Nếu không có, script sẽ thử
# dùng `supabase db dump` (Supabase CLI) làm phương án dự phòng.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backups}"
BACKUP_FORMAT="${BACKUP_FORMAT:-dump}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "✗ Thiếu biến môi trường SUPABASE_DB_URL." >&2
  echo "  Ví dụ: export SUPABASE_DB_URL=\"postgresql://postgres:<pass>@db.<ref>.supabase.co:5432/postgres\"" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"

dump_with_pg_dump() {
  if ! command -v pg_dump >/dev/null 2>&1; then
    return 1
  fi
  if [[ "$BACKUP_FORMAT" == "sql" ]]; then
    local out="$BACKUP_DIR/supabase_${STAMP}.sql.gz"
    echo "→ Dump (plain SQL) bằng pg_dump → $out"
    pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges | gzip -9 > "$out"
    echo "✓ Xong: $out"
  else
    local out="$BACKUP_DIR/supabase_${STAMP}.dump"
    echo "→ Dump (custom -Fc, đã nén) bằng pg_dump → $out"
    pg_dump "$SUPABASE_DB_URL" -Fc --no-owner --no-privileges -f "$out"
    echo "✓ Xong: $out"
    echo "  Khôi phục: pg_restore --no-owner -d \"\$SUPABASE_DB_URL\" \"$out\""
  fi
  return 0
}

dump_with_cli() {
  if ! command -v supabase >/dev/null 2>&1; then
    return 1
  fi
  local out="$BACKUP_DIR/supabase_${STAMP}.sql"
  echo "→ pg_dump không có; dùng Supabase CLI → $out"
  supabase db dump --db-url "$SUPABASE_DB_URL" -f "$out"
  gzip -9 "$out"
  echo "✓ Xong: ${out}.gz"
  return 0
}

if ! dump_with_pg_dump; then
  if ! dump_with_cli; then
    echo "✗ Không tìm thấy 'pg_dump' lẫn 'supabase' CLI. Cài một trong hai:" >&2
    echo "  - pg_dump:  Ubuntu 'sudo apt install postgresql-client' | macOS 'brew install libpq'" >&2
    echo "  - Supabase CLI: https://supabase.com/docs/guides/cli" >&2
    exit 1
  fi
fi

# Dọn backup cũ hơn KEEP_DAYS ngày.
if [[ "$KEEP_DAYS" -gt 0 ]]; then
  echo "→ Dọn backup cũ hơn ${KEEP_DAYS} ngày trong $BACKUP_DIR"
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'supabase_*' -mtime +"$KEEP_DAYS" -print -delete || true
fi

echo "✓ Hoàn tất sao lưu lúc $(date '+%Y-%m-%d %H:%M:%S')"
