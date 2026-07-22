import { NextResponse } from "next/server";
import { setBotData } from "@/lib/botData";

// Được gọi bởi:
//   1. vytovip-main (pages/api/upload.js, pages/api/data/[type].js) — NẾU
//      bot/web vytovip được cấu hình đẩy dữ liệu sang đây (cần đặt đúng
//      SYNC_SECRET khớp nhau). Mặc định web này đã tự GET dữ liệu trực
//      tiếp từ API vytovip (xem lib/botData.js), nên endpoint POST này
//      chỉ là đường dự phòng/đẩy chủ động, không bắt buộc phải dùng.
//   2. bot_v23.py (qua bot_data_loader.push_danhan_remote), 2 giây sau khi
//      xử lý xong lệnh #ruttien_<số>, để cập nhật da_nhan mới nhất.
//
// Xác thực bằng header X-Sync-Secret, phải khớp biến môi trường SYNC_SECRET.
// Nếu SYNC_SECRET không được cấu hình, endpoint chấp nhận mọi request (chỉ
// nên để vậy khi test cục bộ — luôn đặt SYNC_SECRET khi deploy thật).
export async function POST(request) {
  try {
    const secretExpected = process.env.SYNC_SECRET || "";
    if (secretExpected) {
      const secretGiven = request.headers.get("x-sync-secret") || "";
      if (secretGiven !== secretExpected) {
        return NextResponse.json({ error: "Sai hoặc thiếu X-Sync-Secret." }, { status: 401 });
      }
    }

    const body = await request.json();
    const { type, data } = body || {};

    console.log("[sync-data] Nhận request:", {
      type,
      dataType: typeof data,
      isArray: Array.isArray(data),
      keyCount: data && typeof data === "object" ? Object.keys(data).length : 0,
    });

    if (!["donhang", "vitien", "danhan"].includes(type)) {
      return NextResponse.json(
        { error: "type phải là donhang, vitien hoặc danhan." },
        { status: 400 }
      );
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return NextResponse.json({ error: "data không hợp lệ." }, { status: 400 });
    }

    const { key, count } = await setBotData(type, data);

    return NextResponse.json({
      success: true,
      message: `Đã đồng bộ ${count} sub_id vào ${key}`,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[sync-data]", err);
    return NextResponse.json({ error: "Có lỗi xảy ra khi đồng bộ dữ liệu." }, { status: 500 });
  }
}
