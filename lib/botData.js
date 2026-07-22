// lib/botData.js
//
// [CẬP NHẬT] donhang/vitien giờ đọc TRỰC TIẾP từ API của vytovip
// (https://vytovip.vercel.app/api/data/donhang | /vitien) — ĐÚNG CÁCH
// bot_data_loader.py (load_donhang_remote / load_vitien_remote) đang đọc —
// thay vì chỉ đọc Upstash Redis riêng của hoan-vi-web. Lý do: dù 2 web có
// thể trỏ chung 1 Redis, việc phụ thuộc vào đúng env Redis trên cả 2 dự án
// Vercel dễ lệch nhau; gọi thẳng API vytovip đảm bảo hoan-vi-web luôn
// thấy ĐÚNG dữ liệu mà bot đang thấy, không cần đoán.
//
// Nếu gọi vytovip lỗi/timeout → fallback về Redis riêng của
// hoan-vi-web (giữ nguyên hành vi cũ) để trang không sập hẳn.
//
// [SỬA] danhan_by_subid giờ ƯU TIÊN đọc qua GET /api/data/danhan của
// vytovip (giống donhang/vitien), fallback về Upstash Redis riêng
// của hoan-vi-web nếu vytovip lỗi/timeout. Trước đây danhan chỉ đọc
// thẳng Upstash riêng — dẫn tới bug: bot ghi da_nhan thẳng vào Upstash
// (qua UPSTASH_REDIS_REST_URL hard-code trong bot_data_loader.py) tưởng
// là chung database với hoan-vi-web, nhưng dữ liệu bị mất/ghi đè bởi tiến
// trình khác (vd upload CSV bên vytovip), khiến dashboard luôn hiện
// "Đã nhận: 0đ" dù bot log ghi thành công. Đọc qua API vytovip loại
// bỏ hoàn toàn phụ thuộc vào việc 2 Redis có đồng bộ đúng hay không.
//
// Bảng "users" (đăng ký/đăng nhập My ID) vẫn nằm trong Supabase như cũ,
// KHÔNG đổi — xem lib/supabase.js.

const VALID_KEYS = ["donhang_by_subid", "vitien_by_subid", "danhan_by_subid"];
const VALID_TYPES = ["donhang", "vitien", "danhan"];

// Khớp với VERCEL_BASE_URL trong bot_data_loader.py. Có thể override bằng
// biến môi trường VYTOVIP_BASE_URL trên Vercel nếu domain đổi.
const VYTOVIP_BASE_URL =
  process.env.VYTOVIP_BASE_URL || "https://vytovip.vercel.app";

// donhang_by_subid -> "donhang", vitien_by_subid -> "vitien", danhan_by_subid -> "danhan"
//
// [SỬA] Thêm danhan_by_subid vào đây để nó cũng ưu tiên đọc trực tiếp từ
// API vytovip (GET /api/data/danhan) giống hệt donhang/vitien, thay
// vì chỉ đọc key "danhan_by_subid" trong Upstash Redis riêng của project
// hoan-vi-web. Lý do: dù 2 web có thể trỏ chung 1 Upstash, key này vẫn có
// thể bị một tiến trình khác (vd upload CSV bên vytovip) ghi đè mất
// dữ liệu — gọi thẳng API vytovip đảm bảo luôn lấy đúng nguồn dữ
// liệu mà bot đang dùng, không phụ thuộc vào việc 2 database Redis có
// đồng bộ đúng hay không. Nếu gọi vytovip lỗi/timeout, code vẫn
// fallback về Upstash riêng như cũ (xem getBotData bên dưới).
const REMOTE_TYPE_BY_KEY = {
  donhang_by_subid: "donhang",
  vitien_by_subid: "vitien",
  danhan_by_subid: "danhan",
};

export function keyForType(type) {
  return `${type}_by_subid`;
}

/** GET https://vytovip.vercel.app/api/data/<type> — giống hệt
 * _fetch_json() + load_donhang_remote()/load_vitien_remote() trong
 * bot_data_loader.py. Trả về null nếu lỗi/timeout (để code gọi fallback). */
async function fetchFromVytoVip(type) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${VYTOVIP_BASE_URL}/api/data/${type}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[fetchFromVytoVip] ${type} → HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data;
  } catch (err) {
    console.warn(`[fetchFromVytoVip] ${type} lỗi:`, err?.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Thiếu UPSTASH_REDIS_REST_URL hoặc UPSTASH_REDIS_REST_TOKEN trong biến môi trường."
    );
  }
  return { url, token };
}

/** Đọc 1 khoá bất kỳ trong Upstash Redis, tự parse JSON nếu value là chuỗi JSON. */
async function kvGet(key) {
  const { url, token } = upstashConfig();
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstash GET "${key}" lỗi ${res.status}: ${text}`);
  }
  const json = await res.json();
  let result = json.result ?? null;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      return null;
    }
  }
  return result;
}

/** Ghi 1 khoá bất kỳ trong Upstash Redis (value được JSON.stringify trước khi lưu). */
async function kvSet(key, value) {
  const { url, token } = upstashConfig();
  const valueStr = typeof value === "string" ? value : JSON.stringify(value);
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(valueStr),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstash SET "${key}" lỗi ${res.status}: ${text}`);
  }
  return true;
}

/** Đọc 1 blob JSON (donhang_by_subid | vitien_by_subid | danhan_by_subid).
 *
 * donhang_by_subid / vitien_by_subid: ưu tiên gọi API vytovip (giống
 * bot_data_loader.py) → fallback Redis riêng của hoan-vi-web nếu lỗi.
 * danhan_by_subid: đọc thẳng Redis riêng của hoan-vi-web như cũ. */
export async function getBotData(key) {
  if (!VALID_KEYS.includes(key)) {
    throw new Error(`bot_data key không hợp lệ: ${key}`);
  }

  const remoteType = REMOTE_TYPE_BY_KEY[key];
  if (remoteType) {
    const remoteData = await fetchFromVytoVip(remoteType);
    if (remoteData) return remoteData;
    console.warn(
      `[getBotData] Không lấy được "${remoteType}" từ vytovip, fallback Redis riêng...`
    );
  }

  try {
    const data = await kvGet(key);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (err) {
    console.warn(`[getBotData] Fallback Redis "${key}" cũng lỗi:`, err?.message || err);
    return {};
  }
}

/** Đọc cả 3 blob cùng lúc — dùng cho trang dashboard. */
export async function getAllBotData() {
  const [donhang, vitien, danhan] = await Promise.all([
    getBotData("donhang_by_subid"),
    getBotData("vitien_by_subid"),
    getBotData("danhan_by_subid"),
  ]);
  return { donhang, vitien, danhan };
}

/** Ghi đè 1 blob JSON (được gọi từ /api/sync-data khi vytovip/bot đẩy dữ liệu lên). */
export async function setBotData(type, value) {
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`type không hợp lệ: ${type}`);
  }
  const key = keyForType(type);
  const safeValue =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const count = Object.keys(safeValue).length;
  const updated_at = new Date().toISOString();

  console.log("[setBotData] Chuẩn bị ghi vào Upstash Redis:", { key, count });

  await kvSet(key, safeValue);
  // Lưu thêm meta_<type> giống hệt vytovip-main, để dễ kiểm tra lần
  // đồng bộ gần nhất từ Upstash console nếu cần.
  await kvSet(`meta_${type}`, { updated_at, count });

  return { key, count };
}
