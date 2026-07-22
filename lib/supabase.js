import { createClient } from "@supabase/supabase-js";

// Chỉ dùng ở phía server (API routes). Không import file này trong component client.
// SUPABASE_SERVICE_ROLE_KEY có toàn quyền đọc/ghi, tuyệt đối không lộ ra client.
let cachedClient = null;

export function getSupabaseAdmin() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong biến môi trường."
    );
  }

  cachedClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedClient;
}
