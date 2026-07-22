/**
 * lib/botLogic.js
 * ────────────────────────────────────────────────────────────────
 * Port 1:1 từ logic tính ví tiền / đơn hàng trong bot_v23.py
 * (hàm _calc_vitien, _get_da_nhan, _load_da_nhan, _format_donhang).
 *
 * ⚠️ Nếu sau này sửa công thức trong bot_v23.py, nhớ sửa lại y hệt ở đây,
 * để web và bot luôn hiển thị cùng 1 con số cho cùng 1 My ID / sub_id.
 * ────────────────────────────────────────────────────────────────
 */

// Chuẩn hoá key da_nhan: mỗi sub_id map sang {t0: n, t6: n, t7: n, ...}
// (t0 = ghi cũ trước khi tách theo tháng, t<N> = tháng N trong năm)
function normalizeDaNhanEntry(raw) {
  if (raw == null) return {};
  if (typeof raw === "number") return { t0: raw };
  if (typeof raw === "object") {
    const out = {};
    for (const [k, v] of Object.entries(raw)) out[k] = Number(v) || 0;
    return out;
  }
  return {};
}

/** Tổng đã nhận của 1 sub_id. thang=0 → cộng tất cả các tháng đã ghi. */
export function getDaNhan(daNhanData, subId, thang = 0) {
  const entry = normalizeDaNhanEntry(daNhanData?.[subId]);
  if (!entry || Object.keys(entry).length === 0) return 0;
  if (thang === 0) {
    const total = Object.values(entry).reduce((s, v) => s + v, 0);
    return Math.round(total * 100) / 100;
  }
  return Math.round((entry[`t${thang}`] || 0) * 100) / 100;
}

function parseNgayHoanThanh(ngayStr) {
  if (!ngayStr) return null;
  // Hỗ trợ "YYYY-MM-DD HH:MM:SS" hoặc "YYYY-MM-DD"
  const m = String(ngayStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function daysSince(date) {
  if (!date) return 0;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((a - b) / 86400000);
}

/**
 * Tính ví tiền cho 1 sub_id — giống hệt _calc_vitien() trong bot_v23.py:
 *   co_the_rut = tổng (hoa_hong * 90% * 80%) của đơn hoàn thành >= 1 ngày
 *   hoan_thanh_chua_rut = tổng (hoa_hong * 90% * 80%) của đơn hoàn thành < 1 ngày
 *     (dùng chung công thức chiết khấu với co_the_rut, chỉ khác điều kiện
 *     số ngày — để 2 mục "Đã hoàn thành" / "Có sẵn để rút" luôn cộng dồn ra
 *     đúng "Tổng hoa hồng" và không lệch công thức với các mục khác).
 *   co_the_rut_hien = co_the_rut - da_nhan (không âm)
 * Trả về null nếu sub_id không có trong vitien_data (giống bot).
 */
export function calcVitien(vitienData, daNhanData, subId) {
  const v = vitienData?.[subId];
  if (!v) return null;

  const dangCho = Number(v.dang_cho || 0);

  let hoanThanhChuaRut = 0;
  let coTheRut = 0;
  for (const don of v.don_hoan_thanh || []) {
    const hh = Number(don.hoa_hong_rong ?? don.hoa_hong ?? 0);
    const netAmount = Math.round(hh * 0.90 * 0.8 * 100) / 100;
    const ngayHT = parseNgayHoanThanh(don.ngay_hoan_thanh);
    const soNgay = ngayHT ? daysSince(ngayHT) : 0;
    if (soNgay >= 1) {
      // Đã đủ 1 ngày trở lên: chuyển hẳn sang "Có sẵn để rút", không còn
      // tính vào "Đã hoàn thành" nữa.
      coTheRut = Math.round((coTheRut + netAmount) * 100) / 100;
    } else {
      // Chưa đủ 1 ngày: vẫn nằm ở "Đã hoàn thành", nhưng đã áp dụng đúng
      // công thức (hoa hồng - thuế) * 80% như các mục tiền khác trong app.
      hoanThanhChuaRut = Math.round((hoanThanhChuaRut + netAmount) * 100) / 100;
    }
  }

  const daNhan = getDaNhan(daNhanData, subId, 0);
  const coTheRutHien = Math.max(0, Math.round((coTheRut - daNhan) * 100) / 100);

  return {
    dangCho,
    hoanThanhChuaRut,
    coTheRut,
    coTheRutHien,
    daNhan,
  };
}

// Chiết khấu 1 khoản tiền gốc -> trừ thuế 10% -> còn 80% thực nhận.
// Y hệt commissionBreakdown().final80 ở DashboardClient.js (giữ 2 nơi
// cùng công thức để "Tổng hoa hồng" ở tab Ví Tiền và BXH luôn khớp nhau).
function netAfterTaxAndFee(grossAmount) {
  const gross = Number(grossAmount) || 0;
  const afterTax = Math.round(gross * 0.90);
  return Math.round(afterTax * 0.8);
}

/**
 * Tổng số tiền đã quy đổi (đã trừ 10% thuế + nhân 80%) của 1 sub_id — dùng
 * để xếp hạng ở tab BXH. Cộng dồn cả 4 mục giống hệt "Tổng hoa hồng" hiển
 * thị ở tab Ví Tiền: đang chờ (đã quy đổi) + đã hoàn thành chưa rút + có
 * thể rút hiện tại + đã nhận. Trả về 0 nếu sub_id không có dữ liệu.
 */
export function calcTotalEarned(vitienData, daNhanData, subId) {
  const wallet = calcVitien(vitienData, daNhanData, subId);
  if (!wallet) return 0;
  const dangChoNet = netAfterTaxAndFee(wallet.dangCho);
  return (
    Math.round((dangChoNet + wallet.hoanThanhChuaRut + wallet.coTheRutHien + wallet.daNhan) * 100) /
    100
  );
}

/**
 * Xếp hạng bảng xếp hạng (BXH) top N sub_id theo tổng tiền đã quy đổi,
 * giảm dần. KHÔNG trả về sub_id ra ngoài — chỉ trả hạng, tổng tiền, và cờ
 * isMe (có phải sub_id của myId truyền vào không) để giao diện không bao
 * giờ lộ sub_id của người khác.
 */
export function buildLeaderboard(vitienData, daNhanData, myId, limit = 100) {
  const subIds = Object.keys(vitienData || {});
  const ranked = subIds
    .map((subId) => ({ subId, total: calcTotalEarned(vitienData, daNhanData, subId) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      total: r.total,
      isMe: myId ? r.subId === myId : false,
    }));

  const myEntry = ranked.find((r) => r.isMe) || null;
  return { leaderboard: ranked, myRank: myEntry ? myEntry.rank : null };
}

// Chiết khấu 1 đơn: hoa hồng gốc -> trừ thuế 10% -> còn 80% hoa hồng thực nhận.
// Y hệt commissionBreakdown() trong DashboardClient.js (giữ 2 nơi cùng công
// thức để trang Admin và Dashboard luôn hiển thị cùng 1 con số cho 1 đơn).
export function commissionBreakdown(grossCommission) {
  const gross = Number(grossCommission) || 0;
  const afterTax = Math.round(gross * 0.90);
  const final80 = Math.round(afterTax * 0.8);
  return { gross, afterTax, final80 };
}

// sub_id "dạng số trên 10 chữ số" (vd Zalo ID dài như 155624444817411152) —
// dùng để lọc ở trang Admin, bỏ qua các sub_id là tên gợi nhớ (chữ) hoặc
// số ngắn (≤10 chữ số, thường là mã tự đặt chứ không phải sub_id thật).
export function isNumericSubId18(subId) {
  return /^\d{11,}$/.test(String(subId ?? "").trim());
}

/**
 * Danh sách TOÀN BỘ đơn hàng của mọi sub_id dạng số trên 10 chữ số — dùng cho
 * trang Admin (không lọc theo 1 My ID như listDonHang). Mỗi phần tử gồm
 * sub_id + đúng những gì Admin cần: tên sản phẩm, mã đơn, hoa hồng gốc/sau
 * thuế -10%/80%, trạng thái, ngày đặt/hoàn thành. Sắp mới nhất trước.
 */
export function listAdminOrders(donhangData) {
  const subIds = Object.keys(donhangData || {}).filter(isNumericSubId18);
  const rows = [];

  for (const subId of subIds) {
    for (const order of listDonHang(donhangData, subId)) {
      const { gross, afterTax, final80 } = commissionBreakdown(order.commission);
      rows.push({
        subId,
        orderId: order.id,
        productName: order.productName,
        status: order.status,
        orderedAt: order.orderedAt,
        completedAt: order.completedAt,
        gross,
        afterTax,
        final80,
      });
    }
  }

  rows.sort((a, b) => String(b.orderedAt || "").localeCompare(String(a.orderedAt || "")));
  return rows;
}

/**
 * Bản đồ subId (dạng số dài) -> tổng "Đã nhận" (cộng dồn mọi tháng đã ghi)
 * — dùng cho trang Admin để hiển thị mục "Đã nhận" theo từng sub ID, và ở
 * trên là tổng "Đã nhận" của tất cả sub ID (cộng lại các giá trị này).
 */
export function buildDaNhanBySubId(daNhanData) {
  const out = {};
  for (const subId of Object.keys(daNhanData || {})) {
    if (!isNumericSubId18(subId)) continue;
    out[subId] = getDaNhan(daNhanData, subId, 0);
  }
  return out;
}

function shortenName(name, limit = 60) {
  const cleaned = String(name || "")
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .trim()
    .replace(/\s+/g, " ");
  let cost = 0;
  let out = "";
  for (const ch of cleaned) {
    const w = ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 1.3 : 1.0;
    if (cost + w > limit) return out + "...";
    out += ch;
    cost += w;
  }
  return out;
}

/**
 * Lấy danh sách đơn hàng của 1 sub_id, sắp mới nhất trước — giống dữ liệu
 * hiển thị bởi lệnh #donhang trong bot (không kèm text formatting của Zalo).
 */
export function listDonHang(donhangData, subId) {
  const entry = donhangData?.[subId];
  if (!entry || !Array.isArray(entry.don_hang)) return [];

  return [...entry.don_hang]
    .sort((a, b) => String(b.ngay_dat_hang || "").localeCompare(String(a.ngay_dat_hang || "")))
    .map((don) => ({
      id: don.id_don_hang || "",
      productName: don.ten_san_pham_rut_gon || shortenName(don.ten_san_pham || ""),
      commission: Number(don.hoa_hong_rong || 0),
      status: don.trang_thai || "",
      orderedAt: don.ngay_dat_hang || null,
      completedAt: don.ngay_hoan_thanh || null,
    }));
}
