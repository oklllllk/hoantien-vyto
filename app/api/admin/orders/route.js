import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminSessionToken, ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth";
import { getBotData } from "@/lib/botData";
import { listAdminOrders, buildDaNhanBySubId } from "@/lib/botLogic";
import { getCustomerNames } from "@/lib/adminNames";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifyAdminSessionToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: "Chưa đăng nhập admin." }, { status: 401 });
  }

  const [donhang, customerNames, danhan] = await Promise.all([
    getBotData("donhang_by_subid"),
    getCustomerNames(),
    getBotData("danhan_by_subid"),
  ]);

  const orders = listAdminOrders(donhang);
  const daNhan = buildDaNhanBySubId(danhan);
  return NextResponse.json({ orders, customerNames, daNhan });
}
