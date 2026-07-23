/**
 * Chuyển link Shopee → link hoàn tiền (affiliate link) BẰNG API THẬT,
 * đồng thời lấy tên sản phẩm, % hoa hồng và ảnh sản phẩm (nếu API trả về).
 *
 * API dùng để lấy thông tin sản phẩm/hoa hồng:
 *   https://data.addlivetag.com/product-data/product-data.php?url=<link_shopee>
 *
 * ⚠️ Ghi chú: API trên là API bên thứ 3 (không chính thức của Shopee).
 * Nếu sau này Shopee đổi format response, chỉ cần sửa hàm `fetchProductInfo`
 * ở dưới (đặc biệt là danh sách field ảnh) mà không cần đổi chỗ khác.
 */

const AFFILIATE_ID = "17378930088"; // ID affiliate Shopee của bạn
const COMMISSION_API = "https://data.addlivetag.com/product-data/product-data.php";

const SHOPEE_HOST_RE =
  /(^|\.)shopee\.(vn|com|co\.id|com\.my|ph|sg|tw|th|com\.br)$|(^|\.)shp\.ee$/i;
const SHORT_LINK_RE = /(shp\.ee|shope\.ee|s\.shopee\.vn)/i;

// My ID là dãy số do bot Zalo cấp (vd trả về sau lệnh #My_ID), chỉ gồm chữ số.
export function isValidMyId(value) {
  return typeof value === "string" && /^[0-9]{4,20}$/.test(value);
}

/** Trích (shopId, productId) từ URL Shopee — hỗ trợ cả 2 dạng URL:
 *  - .../product/SHOPID/PRODUCTID
 *  - .../...-i.SHOPID.PRODUCTID  (dạng URL mới của Shopee)
 */
function extractShopProduct(url) {
  let m = url.match(/shopee\.[a-z.]+\/(?:product|opaanlp)\/(\d+)\/(\d+)/i);
  if (m) return { shopId: m[1], productId: m[2] };

  m = url.match(/-i\.(\d+)\.(\d+)/);
  if (m) return { shopId: m[1], productId: m[2] };

  return null;
}

/** Follow redirect của link rút gọn (s.shopee.vn/... , shp.ee/...) để lấy link đích. */
async function resolveShortLink(url) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(4000),
  });
  return res.url;
}

function formatVnd(amount) {
  if (!amount) return "—";
  return Math.round(amount).toLocaleString("vi-VN") + "đ";
}

// Giữ lại để không phải sửa chỗ gọi hàm, nhưng KHÔNG hiển thị % này ra web
// (chỉ hiển thị số tiền hoa hồng — xem commissionStr).
function formatPct(commission, price) {
  if (!commission || !price) return "—";
  return `${((commission / price) * 100).toFixed(1)}%`;
}

// Y hệt _fetch_commission() trong bot_v23.py: nếu tỉ lệ hoa hồng Shopee mà
// API trả về (shopeeComFinal / price) <= 3.5% (mức cũ, hoặc bị cap thấp hơn
// do giá cao) thì tính lại theo mức mới 8%, cap tối đa 50.000đ. Cộng thêm
// hoa hồng Xtra (sellerComFinal, không cap) để ra tổng hoa hồng thực nhận.
// ⚠️ Nếu sau này sửa công thức này trong bot_v23.py, nhớ sửa lại y hệt ở đây.
const OLD_RATE = 0.035; // mức cũ: từ 3.5% trở xuống
const NEW_RATE = 0.08; // mức mới: 8%
const NEW_CAP = 50000; // cap tối đa hoa hồng Shopee mức mới

function calcCommission(p) {
  const price = Number(p.price || 0);
  const sellerCom = Number(p.sellerComFinal || 0); // hoa hồng Xtra — giữ nguyên, không cap
  const shopeeComRaw = Number(p.shopeeComFinal || 0); // hoa hồng Shopee do API trả về

  let shopeeCom = shopeeComRaw;
  const isOldScheme = shopeeComRaw && price && shopeeComRaw / price <= OLD_RATE + 0.0005;
  if (isOldScheme) {
    shopeeCom = Math.min(price * NEW_RATE, NEW_CAP);
  }

  return sellerCom + shopeeCom;
}

/**
 * Gọi API lấy tên sản phẩm, hoa hồng, ảnh sản phẩm.
 * Trả về null nếu API lỗi / không có dữ liệu — KHÔNG throw, để không làm
 * hỏng việc trả link affiliate (link luôn tạo được dù API này lỗi/timeout).
 */
async function fetchProductInfo(shopeeUrl) {
  try {
    const apiUrl = `${COMMISSION_API}?url=${encodeURIComponent(shopeeUrl)}`;
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== "success" || !data.productInfo) return null;

    const p = data.productInfo;

    // Dò các tên field ảnh phổ biến. Nếu API trả field khác, thêm vào đây.
    const image =
      p.image ||
      p.imageUrl ||
      p.image_url ||
      p.thumbnail ||
      p.thumb ||
      p.cover ||
      p.mainImage ||
      p.main_image ||
      p.productImage ||
      (Array.isArray(p.images) && p.images[0]) ||
      null;

    const commission = calcCommission(p);

    return {
      productName: (p.productName || "").trim(),
      commission,
      price: p.price || 0,
      commissionStr: formatVnd(commission),
      // Không hiển thị % hoa hồng ra web (giữ lại field cho tương lai nếu cần).
      commissionPct: formatPct(commission, p.price),
      image,
    };
  } catch {
    return null; // timeout / lỗi mạng / JSON hỏng → coi như không có thông tin
  }
}

/**
 * Chuyển 1 link Shopee → affiliate link + thông tin sản phẩm.
 *
 * Trả về:
 * {
 *   convertedUrl:  "https://s.shopee.vn/an_redir?..."   (luôn có, trừ khi throw lỗi)
 *   productName:   "..." | ""
 *   commissionStr: "12.345đ" | "—"
 *   commissionPct: "3.2%" | "—"
 *   image:         "https://..." | null
 * }
 */
export async function convertShopeeLink(shopeeUrl, myId) {
  let parsed;
  try {
    parsed = new URL(shopeeUrl);
  } catch {
    throw new Error("Link Shopee không hợp lệ.");
  }

  if (!SHOPEE_HOST_RE.test(parsed.hostname)) {
    throw new Error("Vui lòng nhập link thuộc trang Shopee.");
  }

  const isShortLink = SHORT_LINK_RE.test(parsed.hostname);

  // [TỐI ƯU TỐC ĐỘ] Trước đây resolveShortLink() và fetchProductInfo() chạy
  // TUẦN TỰ (đợi resolve xong mới gọi API lấy thông tin sản phẩm) → tổng thời
  // gian là tổng 2 lệnh gọi mạng, dễ cảm giác chậm với link rút gọn (shp.ee).
  // Thực ra 2 việc này độc lập với nhau: API lấy thông tin sản phẩm tự theo
  // redirect được nên không cần đợi resolve xong. Gọi SONG SONG bằng
  // Promise.all giúp tổng thời gian chỉ còn bằng lệnh gọi chậm nhất thay vì
  // cộng dồn cả hai — nhanh gần gấp đôi với link rút gọn.
  const [finalUrl, info] = await Promise.all([
    isShortLink ? resolveShortLink(shopeeUrl).catch(() => shopeeUrl) : Promise.resolve(shopeeUrl),
    fetchProductInfo(shopeeUrl),
  ]);

  const ids = extractShopProduct(finalUrl);
  const originLink = ids
    ? `https://shopee.vn/product/${ids.shopId}/${ids.productId}`
    : finalUrl.split("?")[0];

  const encodedOrigin = encodeURIComponent(originLink);
  const convertedUrl =
    `https://s.shopee.vn/an_redir?origin_link=${encodedOrigin}` +
    `&affiliate_id=${AFFILIATE_ID}&sub_id=${encodeURIComponent(myId)}`;

  return {
    convertedUrl,
    productName: info?.productName || "",
    commissionStr: info?.commissionStr || "—",
    commissionPct: info?.commissionPct || "—",
    image: info?.image || null,
  };
}
