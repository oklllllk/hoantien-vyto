import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "session";
const SESSION_DURATION = "30d";

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Thiếu JWT_SECRET trong biến môi trường.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken({ myId, displayName }) {
  return await new SignJWT({ myId, displayName })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey());
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload; // { myId, displayName, iat, exp }
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

// ── Phiên đăng nhập riêng cho trang /admin (không liên quan tới My ID của
// khách) — chỉ cần đúng 1 mật khẩu admin (biến môi trường ADMIN_PASSWORD)
// là vào được, không gắn với tài khoản nào trong Supabase.
const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_SESSION_DURATION = "12h";

export async function createAdminSessionToken() {
  return await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ADMIN_SESSION_DURATION)
    .sign(getSecretKey());
}

export async function verifyAdminSessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload?.admin === true ? payload : null;
  } catch {
    return null;
  }
}

export const ADMIN_SESSION_COOKIE_NAME = ADMIN_COOKIE_NAME;
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 giờ
