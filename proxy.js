import { NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Lưu ý: /admin KHÔNG được chặn ở đây — trang app/admin/page.js (server
// component) tự kiểm tra cookie admin_session và tự hiện ô nhập mật khẩu
// ngay tại chỗ nếu chưa đăng nhập, để chỉ có đúng 1 trang /admin duy nhất
// (không có route /admin/login riêng).

export async function proxy(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard") && !payload) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && payload) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
