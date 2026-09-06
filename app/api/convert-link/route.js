import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { convertShopeeLink } from "@/lib/shopee";

// Đặt thành true để bật lại tính năng tạo link hoàn tiền.
const FEATURE_CREATE_LINK_ENABLED = false;

export async function POST(request) {
  if (!FEATURE_CREATE_LINK_ENABLED) {
    return NextResponse.json(
      { error: "Tính năng tạo link hoàn tiền đang tạm ngưng." },
      { status: 503 }
    );
  }

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
