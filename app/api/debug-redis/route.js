import { NextResponse } from "next/server";
import { getAllBotData } from "@/lib/botData";

// ────────────────────────────────────────────────────────────────
// API TẠM THỜI CHỈ ĐỂ DEBUG — kiểm tra hoan-vi-web đang đọc đúng Redis
// nào, có bao nhiêu sub_id, và 1 sub_id cụ thể có tồn tại hay không.
//
// Cách dùng: mở trên trình duyệt
//   https://hoan-vi-web.vercel.app/api/debug-redis?subId=1499391945845636278
//
// ⚠️ XOÁ FILE NÀY sau khi debug xong — không để lại trên production vì
// lộ tổng số lượng dữ liệu (dù không lộ token/thông tin nhạy cảm khác).
// ────────────────────────────────────────────────────────────────

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const subId = searchParams.get("subId") || "";

    const botData = await getAllBotData();

    const donhangKeys = Object.keys(botData.donhang || {});
    const vitienKeys = Object.keys(botData.vitien || {});
    const danhanKeys = Object.keys(botData.danhan || {});

    const result = {
      redisUrlDangDung: (process.env.UPSTASH_REDIS_REST_URL || "").replace(
        /^https:\/\//,
        ""
      ), // chỉ hiện host, không lộ token
      tongSoSubId: {
        donhang: donhangKeys.length,
        vitien: vitienKeys.length,
        danhan: danhanKeys.length,
      },
    };

    if (subId) {
      result.kiemTraSubId = subId;
      result.coTrongDonhang = donhangKeys.includes(subId);
      result.coTrongVitien = vitienKeys.includes(subId);
      result.coTrongDanhan = danhanKeys.includes(subId);
      result.duLieuDonhangCuaSubIdNay = botData.donhang?.[subId] || null;

      // Gợi ý nếu không khớp chính xác: liệt kê vài key gần giống (chứa 1 phần subId)
      if (!result.coTrongDonhang && subId.length >= 6) {
        const partial = subId.slice(0, 6);
        result.goiYKeyGanGiong = donhangKeys
          .filter((k) => k.includes(partial))
          .slice(0, 5);
      }
    } else {
      result.vaiKeyMauDonhang = donhangKeys.slice(0, 5);
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
