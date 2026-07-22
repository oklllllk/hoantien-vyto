import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { convertShopeeLink } from "@/lib/shopee";

export async function POST(request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const shopeeUrl = (body.shopeeUrl || "").trim();
    if (!shopeeUrl) {
      return NextResponse.json({ error: "Vui lòng nhập link Shopee." }, { status: 400 });
    }

    const result = await convertShopeeLink(shopeeUrl, currentUser.myId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Không thể chuyển link này." },
      { status: 400 }
    );
  }
}
