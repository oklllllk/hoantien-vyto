import { cookies } from "next/headers";
import { verifyAdminSessionToken, ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth";
import { getBotData } from "@/lib/botData";
import { listAdminOrders, buildDaNhanBySubId } from "@/lib/botLogic";
import { getCustomerNames } from "@/lib/adminNames";
import AdminClient from "./AdminClient";
import AdminLoginGate from "./AdminLoginGate";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifyAdminSessionToken(token) : null;

  // Chưa đăng nhập → hiện luôn ô nhập mật khẩu ngay trên trang /admin,
  // không chuyển sang trang riêng.
  if (!payload) return <AdminLoginGate />;

  const [donhang, customerNames, danhan] = await Promise.all([
    getBotData("donhang_by_subid"),
    getCustomerNames(),
    getBotData("danhan_by_subid"),
  ]);

  const orders = listAdminOrders(donhang);
  const daNhanBySubId = buildDaNhanBySubId(danhan);

  return (
    <AdminClient
      initialOrders={orders}
      initialCustomerNames={customerNames}
      initialDaNhan={daNhanBySubId}
    />
  );
}
