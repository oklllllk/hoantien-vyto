import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { getBotData } from "@/lib/botData";
import { listDonHang } from "@/lib/botLogic";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  try {
    const donhangData = await getBotData("donhang_by_subid");
    const orders = listDonHang(donhangData, currentUser.myId);
    return NextResponse.json({ orders });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Có lỗi xảy ra." }, { status: 500 });
  }
}
