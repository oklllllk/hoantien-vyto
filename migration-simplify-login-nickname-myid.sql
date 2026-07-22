-- Migration: chuyển sang cơ chế đăng nhập đơn giản bằng "Tên gợi nhớ" + "My ID"
-- (bỏ Tên đăng nhập theo định dạng cố định, bỏ mật khẩu, bỏ 50 mã đăng nhập một lần).
-- Chạy trong Supabase Dashboard > SQL Editor > New query > Run
--
-- Lưu ý: nếu bạn CHƯA từng chạy migration-add-username-and-login-codes.sql
-- trước đó (chưa có cột username / bảng login_codes) thì chỉ cần chạy phần
-- (3) và (4) bên dưới — các câu lệnh đều có "if exists" nên chạy toàn bộ file
-- vẫn an toàn dù bảng/cột chưa tồn tại.

-- 1) Gộp dữ liệu username cũ (nếu có) vào display_name trước khi xoá cột username
update users set display_name = coalesce(display_name, username)
where display_name is null;

-- 2) Xoá ràng buộc/chỉ mục và cột không còn dùng
drop index if exists users_username_key;
alter table users drop column if exists username;
alter table users drop column if exists password_hash;

-- 3) Thêm cột updated_at để xác định "tên gợi nhớ mới nhất" ở lần đăng nhập gần nhất
alter table users add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_users_display_name on users(display_name);

-- 4) Không cần bảng mã đăng nhập một lần nữa
drop table if exists login_codes;
