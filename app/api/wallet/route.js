import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { getBotData } from "@/lib/botData";
import { calcVitien } from "@/lib/botLogic";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  try {
    const [vitienData, danhanData] = await Promise.all([
      getBotData("vitien_by_subid"),
      getBotData("danhan_by_subid"),
    ]);
    const wallet = calcVitien(vitienData, danhanData, currentUser.myId);
    return NextResponse.json({ wallet });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Có lỗi xảy ra." }, { status: 500 });
  }
}
