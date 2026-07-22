import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAllBotData } from "@/lib/botData";
import { calcVitien, listDonHang, buildLeaderboard } from "@/lib/botLogic";
import DashboardClient from "./DashboardClient";

async function loadDashboardData(myId) {
  const supabase = getSupabaseAdmin();

  const [{ data: user }, botData] = await Promise.all([
    supabase
      .from("users")
      .select("my_id, display_name, created_at")
      .eq("my_id", myId)
      .maybeSingle(),
    getAllBotData(),
  ]);

  // My ID trên hoan-vi-web CHÍNH LÀ sub_id trong dữ liệu bot (donhang/vitien/da_nhan),
  // vì My ID được gắn thẳng làm af_sub_id/sub_id khi chuyển link Shopee.
  const wallet = calcVitien(botData.vitien, botData.danhan, myId);
  const orders = listDonHang(botData.donhang, myId);

  // BXH: top 100 sub_id theo tổng tiền (đã trừ 10% + nhân 80%), giảm dần.
  // Tính hẳn ở server để sub_id của người khác KHÔNG BAO GIỜ gửi ra client.
  const { leaderboard, myRank } = buildLeaderboard(botData.vitien, botData.danhan, myId, 100);

  return {
    user: user
      ? {
          myId: user.my_id,
          displayName: user.display_name,
          createdAt: user.created_at,
        }
      : null,
    wallet, // null nếu chưa có dữ liệu ví cho My ID này
    orders,
    leaderboard,
    myRank,
  };
}

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { user, wallet, orders, leaderboard, myRank } = await loadDashboardData(currentUser.myId);
  if (!user) redirect("/login");

  return (
    <DashboardClient
      user={user}
      initialOrders={orders}
      initialWallet={wallet}
      initialLeaderboard={leaderboard}
      initialMyRank={myRank}
    />
  );
}
