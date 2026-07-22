-- Chạy toàn bộ file này trong Supabase Dashboard > SQL Editor > New query > Run

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  my_id text unique not null, -- dãy số do bot Zalo cấp (lấy qua lệnh #My_ID)
  display_name text, -- "Tên gợi nhớ": tự do, có thể đổi bất cứ lúc nào ở lần đăng nhập sau
  wallet_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now() -- lần đăng nhập gần nhất, dùng để xác định tên gợi nhớ mới nhất
);

create index if not exists idx_users_display_name on users(display_name);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  my_id text not null references users(my_id) on delete cascade,
  shopee_order_id text,
  product_name text not null,
  order_amount numeric(14,2) not null default 0,
  cashback_amount numeric(14,2) not null default 0,
  status text not null default 'pending', -- pending | confirmed | paid | cancelled
  ordered_at timestamptz not null default now()
);

create index if not exists idx_orders_my_id on orders(my_id);
create index if not exists idx_orders_ordered_at on orders(ordered_at desc);

-- Bảng lịch sử ví tiền (tuỳ chọn, dùng khi cộng/trừ tiền thật)
create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  my_id text not null references users(my_id) on delete cascade,
  amount numeric(14,2) not null,
  type text not null, -- credit | debit
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_tx_my_id on wallet_transactions(my_id);

-- Lưu ý: dự án dùng SUPABASE_SERVICE_ROLE_KEY ở phía server (API routes) để
-- đọc/ghi trực tiếp, nên KHÔNG bắt buộc bật Row Level Security. Nếu sau này
-- bạn gọi Supabase trực tiếp từ trình duyệt (client), hãy bật RLS và viết
-- policy giới hạn theo my_id trước khi làm điều đó.

-- Bảng orders cũ (demo) và wallet_balance trong users không còn được dashboard
-- dùng nữa — đơn hàng & ví tiền giờ tính trực tiếp từ dữ liệu bot (donhang/
-- vitien/danhan) theo My ID, giống hệt cách bot_v23.py tính cho lệnh
-- #donhang / #vitien. Có thể giữ lại bảng orders/cột wallet_balance để tương
-- thích ngược, không bắt buộc xoá.

-- ── [ĐÃ CHUYỂN SANG UPSTASH REDIS] ───────────────────────────────────────────
-- Dữ liệu donhang_by_subid / vitien_by_subid / danhan_by_subid (đồng bộ từ
-- phuongthaovip-main / bot_v23.py) KHÔNG còn lưu trong bảng `bot_data` ở
-- Supabase nữa — đã chuyển sang Upstash Redis, cùng cách phuongthaovip-main
-- đang dùng (xem lib/botData.js và README.md, mục "Nhận dữ liệu đơn hàng/ví
-- tiền thật từ bot"). Nếu bảng `bot_data` đã tồn tại từ trước, có thể xoá:
--   drop table if exists bot_data;
