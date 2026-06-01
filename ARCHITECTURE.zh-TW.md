# 🏛️ 系統架構圖 — S8 Travel CRM（繁體中文）

> 本檔聚焦**架構圖**（繁中）。完整架構說明與隱性知識請以越南文 `ARCHITECTURE.md`
> 為準；資料表 schema 細節見 `CLAUDE.md`。狀態圖中的狀態節點刻意保留資料庫 enum
> 原值（如 `cho_duyet`/`da_duyet`），標籤與註解則以繁中說明。更新日：2026-06-01。

---

## 1. 系統概述

S8 Travel 內部旅遊團營運 CRM，主流程：
**潛在客戶 → 報價 → 旅遊團 → 行程調度 → 預訂（飯店／餐廳／服務／簽證／車）
→ 費用 → 付款申請 → 發票／付款憑證 → 欠款／沖抵**，另含派工、儀表板、依範本鎖房。

- 使用者為**業務人員（非工程師）** → 每項功能都需可手動驗證。
- **金額是核心**：算錯費用／欠款 = 真實損失。
- 技術棧：React 18 + TypeScript + Vite · Tailwind + shadcn/ui · TanStack Query v5
  · React Router v6 · Supabase（PostgreSQL，專案 `lflsbwoqzmbknzdpaequ`）。

## 2. 整體架構圖

```mermaid
flowchart TB
  subgraph USERS["使用者"]
    staff["員工<br/>管理員 · 營運 · 會計 · 檢視者"]
    guest["訪客（公開）"]
  end

  subgraph FE["前端 — React 18 + TS + Vite（靜態 SPA）"]
    feUI["UI Tailwind + shadcn/ui · Router v6 · sonner<br/>TanStack Query v5 · 匯出 docx/xlsx"]
    feMod["業務模組：旅遊團/行程調度 · 預訂 飯店/餐廳/服務/簽證/車<br/>費用 → 付款申請 → 付款 → 欠款 · 定期 · 發票/付款憑證<br/>潛在客戶 · 報價 · 票券 · 導遊 · 儀表板 · 主檔"]
    feUI --- feMod
  end

  subgraph SB["Supabase (lflsbwoqzmbknzdpaequ)"]
    auth["Auth JWT<br/>anon · authenticated · service_role<br/>user_roles · 外洩密碼防護 已啟用"]
    api["Data API PostgREST + RLS<br/>RPC · VIEW security_invoker"]
    edge["Edge Functions (Deno)<br/>send-booking-email · ai-chat<br/>sync-dntt / chi-phi / du-chi → Sheet<br/>xuat-word-dntt-ks · change-password"]
    db[("PostgreSQL — 啟用 RLS")]
    storage[("Storage<br/>dntt-documents · doan-files<br/>已禁止 anon 列檔")]
    cron["pg_cron + pg_net<br/>每30分/每週 同步 · 線索追蹤<br/>升級提醒 · 派工提醒"]
    trig["Triggers / 內部 RPC<br/>通知審批 · 重算付款狀態<br/>自動建群組 · 沖抵"]
  end

  subgraph DBD["Postgres — 業務資料表群"]
    d1["旅遊團<br/>doan · doan_ngay(_item) · doan_nhom · seri_tour*"]
    d2["預訂<br/>doan_booking_ks/nh/dv · doan_ks_dem"]
    d3["金流<br/>doan_chi_phi · de_nghi_thanh_toan · payments<br/>cong_no · dntt_allocations + VIEW *_with_status"]
    d4["主檔<br/>飯店 · 餐廳 · 景點服務 · 車行*<br/>供應商 · 簽證*"]
    d5["潛在客戶<br/>lead · activity / task / campaign"]
    d6["票券與系統<br/>voucher* · user_roles · doan_permissions<br/>通知 · 工作 · 稽核"]
  end

  subgraph EXT["外部服務"]
    resend["Resend<br/>交易郵件"]
    sheets["Google Sheets API<br/>付款 / 費用報表"]
    ai["AI 服務<br/>(ai-chat)"]
    hibp["HaveIBeenPwned<br/>外洩密碼檢查"]
  end

  staff -->|HTTPS| FE
  FE -->|"supabase-js (anon key)"| auth
  FE -->|REST / Realtime| api
  FE -->|Storage SDK| storage
  FE -->|invoke| edge
  guest -->|"/lead-form (anon RPC)"| api
  storage -. "公開 URL（郵件連結）" .-> guest

  api --> db
  db --- DBD
  edge -->|"service_role (繞過 RLS)"| db
  cron --> edge
  cron --> trig
  trig --> db

  edge --> resend
  edge --> sheets
  edge --> ai
  auth -. "密碼檢查" .-> hibp
```

## 3. 金流核心（三個獨立實體）

付款流程刻意拆成三個實體（2026-05 重構）：

- **`de_nghi_thanh_toan`（付款申請）** — 只是「請求」。**審批軸**
  (`trang_thai_duyet`) 與**付款軸** (`payment_status`，由 VIEW 衍生) 互相獨立。
- **`payments`** — 每筆付款事件，`method = cash`（現金）或 `can_tru`（沖抵）。
  沖抵會扣抵另一張 `cong_no`（同供應商、另一旅遊團）。
- **`cong_no`（欠款／餘額）** — 來自溢付、調降費用、或「已付款後取消」。
  `payment_status` / `paid_amount` 一律透過 VIEW `dntt_with_payment_status`
  讀取（= `SUM(payments)`），**不可手動設定**。

### 3.1 付款申請狀態圖

```mermaid
stateDiagram-v2
  direction LR
  [*] --> cho_duyet : 建立付款申請
  cho_duyet --> da_duyet : 三級審批通過
  cho_duyet --> tu_choi : 拒絕
  cho_duyet --> da_huy : 取消
  da_duyet --> da_huy : 取消
  tu_choi --> [*]
  da_huy --> [*]
  note right of cho_duyet
    來源：費用頁 · 依供應商合併 · 定期付款
    三級審批：營運主管（第1級自動通過）→ … → 出納會計
  end note
  note right of da_duyet
    payment_status 由 VIEW dntt_with_payment_status 衍生（= SUM payments），不可手動設：
      未付 unpaid → 部分 partial → 已付 paid
    payment.method = 現金 cash | 沖抵 can_tru
    沖抵：扣抵另一旅遊團、同供應商的欠款
    已付後取消／調整 → 產生欠款（見下圖）
  end note
  note left of tu_choi
    終態 — 不可復活。重試 = 建立新的付款申請。
  end note
```

### 3.2 欠款狀態圖

```mermaid
stateDiagram-v2
  direction LR
  [*] --> con_du : 產生欠款
  con_du --> da_can_tru : 全額沖抵
  con_du --> da_hoan_tien : 供應商退款
  da_can_tru --> con_du : 回滾（刪除沖抵 payment）
  da_can_tru --> [*]
  da_hoan_tien --> [*]
  note right of con_du
    來源：溢付 / 調降費用 / 取消已付款的付款申請。
    so_tien_con_lai = so_tien_goc − SUM(沖抵 payments)  [VIEW cong_no_with_status]
    loai = phat_sinh（一般）| tra_truoc（供應商預付金）
  end note
```

## 4. 關鍵不變量（簡述）

- **快照（snapshot）**：所有影響費用的單價／係數，建立旅遊團當下即「凍結」寫入團的
  資料（`doan_ngay_item.don_gia`、`doan_booking_nh.gia_snapshot`、
  `doan_chi_phi.foc_*_snapshot` 等）。**主檔日後變動不可影響已建立的舊團**。
- **行程調度 ↔ 費用 HYBRID 連動**：`doan_chi_phi` 預設隨行程調度級聯；OP 手動改後設
  `is_overridden=true` 即不再被覆寫。
- **飯店 FOC（Option A）**：`foc_count` 由 OP 手動填於各列，
  `tien_cong_ty = (so_luong − foc_count) × gia_phong`，不再自動分攤。
- **權限**：目前主要在 UI 層（`user_roles.role/bo_phan`）；金流 VIEW 已改
  `security_invoker`，為日後逐列 RLS 收緊（#5）做準備。

---

> 詳細規則、UI 陷阱、模組對照表請見越南文 `ARCHITECTURE.md`（唯一真實來源）。
