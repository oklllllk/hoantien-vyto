import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from("users")
      .select("my_id, display_name, created_at")
      .eq("my_id", currentUser.myId)
      .maybeSingle();

    if (error) throw error;
    if (!user) {
      return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });
    }

    return NextResponse.json({
      myId: user.my_id,
      displayName: user.display_name,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Có lỗi xảy ra." }, { status: 500 });
  }
}
