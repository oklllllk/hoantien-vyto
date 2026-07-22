-- ────────────────────────────────────────────────────────────────
-- CHẠY FILE NÀY TRONG: Supabase Dashboard > SQL Editor > New query > Run
-- (chỉ cần chạy 1 lần, sau khi đã đổi sang lưu donhang/vitien/danhan trong
--  Upstash Redis — xem lib/botData.js và README.md)
-- ────────────────────────────────────────────────────────────────

-- Dữ liệu donhang_by_subid / vitien_by_subid / danhan_by_subid giờ được
-- lib/botData.js đọc/ghi trực tiếp trong Upstash Redis, không còn dùng bảng
-- `bot_data` trong Supabase nữa. Bảng users/orders/wallet_transactions vẫn
-- giữ nguyên trong Supabase như cũ.
drop table if exists bot_data;
