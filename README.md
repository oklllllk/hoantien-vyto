# Hoàn Ví — Web chuyển link Shopee nhận hoàn tiền theo My ID

Web app Next.js, deploy trên Vercel. Người dùng đăng nhập bằng **My ID** riêng, dán link Shopee để
tự động gắn My ID làm `sub_id`, rồi tra cứu **đơn hàng** và **ví tiền** của mình.

## Tính năng
- Đăng nhập bằng **Tên gợi nhớ** (tự do, đổi được bất cứ lúc nào) và/hoặc **My ID**
  (dãy số lấy từ bot Zalo qua lệnh `#My_ID`). Chưa có tài khoản → tự tạo ngay ở lần
  đăng nhập đầu bằng My ID. Lần sau có thể đăng nhập lại chỉ bằng Tên gợi nhớ hoặc
  chỉ bằng My ID. Mỗi My ID gắn với 1 tên gợi nhớ tại một thời điểm — nếu đăng nhập
  lại bằng My ID với tên khác, hệ thống ghi nhận tên mới nhất (xem
  `migration-simplify-login-nickname-myid.sql`)
- Mỗi My ID là duy nhất, dùng làm `sub_id` gắn vào mọi link Shopee đã chuyển
- Ô chuyển link Shopee → sinh link mới có gắn My ID (đang ở chế độ demo, xem phần "Nối API thật" bên dưới)
- Ô đơn hàng: danh sách đơn hàng gắn với My ID, trạng thái Chờ xác nhận / Đã xác nhận / Đã cộng ví / Đã huỷ
- Ô ví tiền: số dư hoàn tiền hiện có, số đơn chờ hoàn tiền
- Tài khoản (My ID / Tên gợi nhớ) lưu trong Supabase (Postgres)
- Dữ liệu đơn hàng/ví tiền/đã nhận (donhang/vitien/danhan) lưu trong **Upstash
  Redis** — cùng cách và cùng khoá mà `vytovip-main` đang dùng, xem mục 4.

## 1. Tạo database Supabase (miễn phí) — dùng cho tài khoản đăng nhập
1. Vào https://supabase.com → tạo tài khoản → **New project** (nhớ mật khẩu database, chọn region gần VN như Singapore).
2. Vào **SQL Editor** → **New query** → dán toàn bộ nội dung file `supabase-schema.sql` trong repo này → **Run**.
3. Vào **Project Settings → API**, copy 2 giá trị:
   - `Project URL` → dùng cho biến `SUPABASE_URL`
   - `service_role` key (mục Project API keys, **không phải** `anon` key) → dùng cho `SUPABASE_SERVICE_ROLE_KEY`

⚠️ `service_role` key có toàn quyền, chỉ dùng ở server (đã cấu hình sẵn trong code), tuyệt đối không đưa vào code phía client hay commit lên GitHub public.

Lưu ý: bảng `bot_data` (nếu bạn tạo từ trước) không còn được dùng nữa — donhang/
vitien/danhan giờ lưu trong Upstash Redis (xem mục 4). Có thể xoá bảng đó bằng
file `migration-drop-bot-data-table.sql`, không bắt buộc.

## 2. Chạy thử ở máy local
```bash
npm install
cp .env.example .env.local   # rồi điền SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET,
                              # UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (xem mục 4)
npm run dev
```
Mở http://localhost:3000 → sẽ tự chuyển tới `/login`. Nhập một Tên gợi nhớ bất kỳ và lấy My ID theo hướng dẫn ngay trên trang để đăng nhập lần đầu (hệ thống sẽ tự tạo tài khoản). Đơn hàng/ví tiền sẽ hiện ra ngay khi có dữ liệu tương ứng My ID trong Upstash Redis (đồng bộ từ `vytovip-main`/bot — xem mục 4).

`JWT_SECRET` là chuỗi bí mật tự đặt, có thể tạo nhanh bằng lệnh:
```bash
openssl rand -base64 32
```

## 3. Deploy lên Vercel
1. Đẩy code này lên một repo GitHub (repo riêng tư cũng được).
2. Vào https://vercel.com → **Add New → Project** → chọn repo vừa đẩy lên.
3. Ở phần **Environment Variables**, thêm các biến (copy từ `.env.local` của bạn):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `SYNC_SECRET` (xem mục 4)
4. Bấm **Deploy**. Xong là có link `xxxxx.vercel.app` dùng được ngay.

## 4. Nhận dữ liệu đơn hàng/ví tiền thật từ bot (đã nối sẵn)

Web này **không dùng bảng `orders` demo / cột `wallet_balance` trong Supabase**
để hiển thị đơn hàng & ví tiền. Thay vào đó, donhang/vitien/danhan được lưu
trong **Upstash Redis**, cùng cách `vytovip-main` đang dùng:

1. `vytovip-main` (nơi bạn upload CSV donhang/vitien) gửi kèm dữ liệu sang
   `POST /api/sync-data` của web này mỗi khi có cập nhật.
2. `bot_v23.py` (qua `bot_data_loader.push_danhan_remote`) gửi `da_nhan_by_subid`
   mới nhất sang cùng endpoint đó, **2 giây sau khi** xử lý xong lệnh `#ruttien_<số>`.
3. `/api/sync-data` gọi `setBotData()` trong `lib/botData.js`, ghi nguyên khối
   JSON `donhang_by_subid` / `vitien_by_subid` / `danhan_by_subid` vào Upstash
   Redis bằng REST API (`GET`/`SET` qua `fetch`, không cần thư viện `redis`/`ioredis`) —
   không tách bảng quan hệ, để luôn khớp 100% với dữ liệu bot đang dùng.
4. Trang `/dashboard` tính đơn hàng & ví tiền cho **My ID** hiện tại y hệt công thức
   trong `bot_v23.py` (`_calc_vitien`, `_format_donhang`) — xem `lib/botLogic.js`.

**Quan trọng:** My ID mà người dùng đăng ký trên web này phải **trùng với sub_id**
mà bot dùng (tên Zalo đã chuẩn hoá, hoặc Zalo ID dạng số dài) thì đơn hàng/ví tiền
mới hiện ra đúng.

### Tạo Upstash Redis (miễn phí)
1. Vào https://console.upstash.com → tạo tài khoản → **Create Database** (chọn
   region gần VN như Singapore, loại **Regional** là đủ).
2. Vào tab **REST API** của database vừa tạo, copy 2 giá trị:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

Nếu `vytovip-main` đã có sẵn Upstash Redis, bạn có thể **dùng chung đúng
một database đó** cho cả 2 web (trỏ cùng `UPSTASH_REDIS_REST_URL`/`TOKEN`) —
lúc đó `/api/sync-data` chỉ còn là lớp xác thực/log, vì 2 web đã đọc chung dữ
liệu qua Redis; hoặc dùng 2 database Upstash riêng, mỗi web tự giữ 1 bản sao,
đồng bộ qua `/api/sync-data` như hiện tại. Cả 2 cách đều chạy được với code này.

Cần thêm các biến môi trường sau (Vercel → Settings → Environment Variables):

```
UPSTASH_REDIS_REST_URL   = <copy từ Upstash console>
UPSTASH_REDIS_REST_TOKEN = <copy từ Upstash console>
SYNC_SECRET = <chuỗi bí mật, khớp với SYNC_SECRET trên vytovip-main
               và hằng SYNC_SECRET trong bot_data_loader.py>
```

Nếu bạn từng tạo bảng `bot_data` trong Supabase theo hướng dẫn cũ, có thể xoá
bằng file `migration-drop-bot-data-table.sql` (không bắt buộc, chỉ để dọn dẹp).

## 5. Nối API Shopee Affiliate thật (khi bạn có code/API)
Toàn bộ logic chuyển link đang nằm gọn trong 1 file: `lib/shopee.js`, hàm `convertShopeeLink()`.
Hiện tại nó chỉ gắn tham số `af_sub_id` / `sub_id` = My ID vào link Shopee gốc (demo, không gọi API ngoài).

Khi có API/code Shopee Affiliate thật, chỉ cần thay nội dung hàm này bằng lệnh gọi API thật (đã có
comment hướng dẫn mẫu ngay trong file). Không cần sửa gì ở giao diện hay các trang khác.

Tương tự, dữ liệu **đơn hàng** hiện đọc trực tiếp từ bảng `orders` trong Supabase (đang có 1 đơn demo
khi tạo tài khoản). Khi có webhook/API thật từ Shopee trả về đơn hàng theo `sub_id`, chỉ cần insert
dữ liệu vào bảng `orders` (và cộng tiền vào `users.wallet_balance` khi đơn được duyệt hoàn tiền) —
giao diện sẽ tự hiển thị, không cần sửa code frontend.

## Cấu trúc thư mục chính
```
app/
  login/page.js          → trang đăng nhập bằng Tên gợi nhớ + My ID
  dashboard/page.js       → trang chính (server component, lấy dữ liệu)
  dashboard/DashboardClient.js → giao diện chuyển link, ví tiền, bảng đơn hàng
  api/auth/login          → API đăng nhập
  api/auth/logout         → API đăng xuất
  api/me                  → API lấy thông tin tài khoản + số dư ví
  api/convert-link        → API chuyển link Shopee (demo)
  api/orders              → API lấy danh sách đơn hàng
lib/
  supabase.js             → kết nối Supabase, chỉ dùng cho bảng users (server-only)
  botData.js               → đọc/ghi donhang/vitien/danhan trong Upstash Redis
  auth.js                 → tạo/xác thực JWT phiên đăng nhập
  shopee.js                → logic chuyển link Shopee (chỗ cần thay API thật)
proxy.js                  → bảo vệ route /dashboard, redirect nếu chưa đăng nhập
supabase-schema.sql       → schema database Supabase (users/orders/wallet_transactions), chạy 1 lần trong SQL Editor
migration-drop-bot-data-table.sql → dọn bảng bot_data cũ (không bắt buộc, xem mục 1)
```
