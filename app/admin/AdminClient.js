"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Tên khách LƯU CHÍNH trên server (Upstash Redis, qua /api/admin/customer-names
// -> lib/adminNames.js) — dùng được trên mọi thiết bị, không mất khi xóa dữ
// liệu trình duyệt. localStorage ở đây chỉ là bản nháp tạm trên máy này,
// để nếu gõ xong mà tải lại trang ngay lúc mạng chập chờn (trước khi kịp
// lưu server) thì vẫn không mất chữ vừa gõ; xem thêm cờ saveErrorKeys.
const LOCAL_NAMES_KEY = "hoanvi_admin_customer_names_v1";

// Phân trang danh sách Sub ID — mỗi trang 10 sub ID, mỗi sub ID 1 dòng
// (rộng hết khung), tối đa 5 số trang hiện cùng lúc trước khi bấm "›...".
const PAGE_SIZE = 10;
const PAGE_WINDOW = 5;

// 5 ô lọc/tổng hợp hiển thị phía trên danh sách sub ID — 3 ô đầu (Đang chờ
// xử lý / Tổng HH / Đã hoàn thành) 1 hàng, Tổng HH nằm giữa và tô đậm hơn;
// 2 ô sau (Cần thanh toán / Đã nhận) rải xuống hàng riêng bên dưới, giống
// cách bố trí ở từng thẻ Sub ID.
const FILTER_OPTIONS = [
  { key: "pending", label: "Đang chờ xử lý" },
  { key: "tongHH", label: "Tổng HH", emphasis: true },
  { key: "completed", label: "Đã hoàn thành" },
  { key: "canThanhToan", label: "Cần thanh toán" },
  { key: "daNhan", label: "Đã nhận" },
];

// 4 ô sắp xếp danh sách sub ID.
const SORT_OPTIONS = [
  { key: "newest", label: "Mới nhất" },
  { key: "oldest", label: "Cũ nhất" },
  { key: "most", label: "Nhiều nhất" },
  { key: "least", label: "Ít nhất" },
];

function readLocalNames() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_NAMES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalNames(map) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_NAMES_KEY, JSON.stringify(map));
  } catch {
    // Bỏ qua — nếu localStorage đầy/bị chặn thì vẫn còn bản lưu trên server.
  }
}

function formatVnd(amount) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount || 0) + "đ";
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function truncateChars(text, limit = 60) {
  const s = String(text || "");
  return s.length > limit ? s.slice(0, limit) + "..." : s;
}

// Khoá lưu tên khách theo từng đơn — ưu tiên mã đơn (duy nhất), nếu đơn nào
// thiếu mã thì ghép sub_id + ngày đặt + sản phẩm để vẫn có khoá ổn định.
function rowKeyOf(order) {
  return order.orderId || `${order.subId}__${order.orderedAt}__${order.productName}`;
}

// Bot dùng chữ trạng thái tự do (vd "Hoàn thành", "Chờ xử lý", "Đã huỷ"...)
// nên map theo từ khoá thay vì enum cố định, phòng khi bot đổi cách gọi.
function classifyStatus(trangThai) {
  const s = (trangThai || "").toLowerCase();
  if (s.includes("huỷ") || s.includes("hủy")) return "cancelled";
  if (s.includes("hoàn thành")) return "completed";
  return "pending";
}

const STATUS_COLORS = {
  green: { solid: "#1f9d5c", soft: "rgba(31,157,92,0.14)" },
  yellow: { solid: "#c8930a", soft: "rgba(200,147,10,0.16)" },
  red: { solid: "#d9534f", soft: "rgba(217,83,79,0.14)" },
};

function statusMeta(trangThai) {
  const kind = classifyStatus(trangThai);
  if (kind === "cancelled") return { ...STATUS_COLORS.red, label: trangThai || "Đã hủy" };
  if (kind === "completed") return { ...STATUS_COLORS.green, label: trangThai || "Hoàn thành" };
  return { ...STATUS_COLORS.yellow, label: trangThai || "Chờ xử lý" };
}

const AMOUNT_COLORS = {
  gross: { solid: "#d9534f", border: "rgba(47,158,99,0.25)", soft: "rgba(47,158,99,0.05)" },
  afterTax: { solid: "#2f9e63", border: "rgba(47,158,99,0.25)", soft: "rgba(47,158,99,0.05)" },
  final80: { solid: "#0ecb81", border: "rgba(47,158,99,0.25)", soft: "rgba(47,158,99,0.05)" },
};

// 4 ô hoa hồng theo trạng thái, hiển thị cho từng Sub ID.
const GROUP_STAT_COLORS = {
  tongHH: { solid: "#0ecb81", border: "rgba(14,203,129,0.35)", soft: "rgba(14,203,129,0.08)" },
  pending: { solid: "#c8930a", border: "rgba(200,147,10,0.30)", soft: "rgba(200,147,10,0.07)" },
  completed: { solid: "#1f9d5c", border: "rgba(31,157,92,0.30)", soft: "rgba(31,157,92,0.07)" },
  canThanhToan: { solid: "#d9534f", border: "rgba(217,83,79,0.30)", soft: "rgba(217,83,79,0.07)" },
  daNhan: { solid: "#2f6fed", border: "rgba(47,111,237,0.30)", soft: "rgba(47,111,237,0.07)" },
};

// Bảng tổng hợp GỐC hiển thị phía trên (Hoa hồng chưa trừ thuế phí) — Cần
// thanh toán/Đã nhận dùng tông nhạt hơn để không lấn át các ô lọc bên dưới.
// Màu của ô "Chiến lợi phẩm của tôi" nằm riêng trong globals.css (loot-box-*).
const GROSS_STAT_COLORS = {
  grossTongHH: { solid: "#0ecb81", border: "rgba(14,203,129,0.30)", soft: "rgba(14,203,129,0.06)" },
  grossPending: { solid: "#c8930a", border: "rgba(200,147,10,0.30)", soft: "rgba(200,147,10,0.06)" },
  grossCompleted: { solid: "#1f9d5c", border: "rgba(31,157,92,0.30)", soft: "rgba(31,157,92,0.06)" },
};

function SearchIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CloseIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CopyIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Nút sao chép dùng chung cho Sub ID và Mã đơn — bấm để copy vào clipboard,
// tự đổi sang dấu tick trong 1.5s để admin biết đã copy thành công.
function CopyButton({ text, copiedKey, activeKey, onCopy, className = "" }) {
  if (!text) return null;
  const isCopied = copiedKey === activeKey;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCopy(text, activeKey);
      }}
      aria-label="Sao chép"
      title="Sao chép"
      className={`shrink-0 inline-flex items-center justify-center rounded-md text-muted hover:text-gold hover:bg-panel-2 transition-colors cursor-pointer active:scale-90 ${className}`}
    >
      {isCopied ? <CheckIcon className="w-3.5 h-3.5 text-gold" /> : <CopyIcon className="w-3.5 h-3.5" />}
    </button>
  );
}

function OrderRow({ order, searchQuery, copiedKey, onCopy }) {
  const meta = statusMeta(order.status);
  // Khi admin tìm bằng mã đơn, tô hồng đúng đơn khớp để dễ nhận ra giữa
  // danh sách nhiều đơn của cùng 1 sub ID.
  const q = (searchQuery || "").trim().toLowerCase();
  const isSearchHit = q.length > 0 && (order.orderId || "").toLowerCase().includes(q);
  return (
    <div
      className={`px-4 py-3.5 rounded-xl border transition-colors ${
        isSearchHit ? "border-pink-400 bg-pink-50" : "border-border bg-surface/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold min-w-0 truncate">
          🛍️ {truncateChars(order.productName, 60)}
        </p>
        <span
          className="status-pill shrink-0"
          style={{ background: meta.soft, color: meta.solid }}
        >
          {meta.label}
        </span>
      </div>
      <p className="font-mono-num text-xs text-muted mt-1 flex items-center gap-1">
        Mã đơn: {order.orderId || "—"}
        <CopyButton text={order.orderId} copiedKey={copiedKey} activeKey={`order-${order.orderId}`} onCopy={onCopy} className="w-4 h-4" />
      </p>

      <div className="flex items-center gap-4 mt-1.5">
        <p className="text-[11px] text-muted">
          Ngày đặt: <span className="font-mono-num">{formatDate(order.orderedAt)}</span>
        </p>
        <p className="text-[11px] text-muted">
          Ngày hoàn thành: <span className="font-mono-num">{formatDate(order.completedAt)}</span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mt-3">
        <div
          className="text-center rounded-lg py-1.5"
          style={{ border: `1px solid ${AMOUNT_COLORS.gross.border}`, background: AMOUNT_COLORS.gross.soft }}
        >
          <p className="text-[10px] text-ink font-semibold">Hoa hồng</p>
          <p className="font-mono-num text-sm font-bold" style={{ color: AMOUNT_COLORS.gross.solid }}>
            {formatVnd(order.gross)}
          </p>
        </div>
        <div
          className="text-center rounded-lg py-1.5"
          style={{ border: `1px solid ${AMOUNT_COLORS.afterTax.border}`, background: AMOUNT_COLORS.afterTax.soft }}
        >
          <p className="text-[10px] text-ink font-semibold">Sau thuế -10%</p>
          <p className="font-mono-num text-sm font-bold" style={{ color: AMOUNT_COLORS.afterTax.solid }}>
            {formatVnd(order.afterTax)}
          </p>
        </div>
        <div
          className="text-center rounded-lg py-1.5"
          style={{ border: `1px solid ${AMOUNT_COLORS.final80.border}`, background: AMOUNT_COLORS.final80.soft }}
        >
          <p className="text-[10px] text-ink font-semibold">Hoa hồng 80%</p>
          <p className="font-mono-num text-sm font-bold" style={{ color: AMOUNT_COLORS.final80.solid }}>
            {formatVnd(order.final80)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminClient({ initialOrders, initialCustomerNames, initialDaNhan }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders || []);
  const [customerNames, setCustomerNames] = useState(initialCustomerNames || {});
  const [daNhanMap, setDaNhanMap] = useState(initialDaNhan || {});
  const [refreshing, setRefreshing] = useState(false);
  const [savingKeys, setSavingKeys] = useState({});
  const [saveErrorKeys, setSaveErrorKeys] = useState({});
  const [expanded, setExpanded] = useState({});
  const [groupPage, setGroupPage] = useState(1);
  const [pageWindowStart, setPageWindowStart] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [sortMode, setSortMode] = useState("newest");
  const [copiedKey, setCopiedKey] = useState(null);
  const saveTimers = useRef({});
  const copyResetTimer = useRef(null);

  // Sao chép Sub ID/mã đơn vào clipboard, hiện dấu tick 1.5s rồi tự tắt.
  const handleCopy = useCallback((text, key) => {
    if (!text) return;
    const done = () => {
      setCopiedKey(key);
      clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopiedKey(null), 1500);
    };
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      done();
    }
  }, []);

  // Sau khi hydrate xong, nạp thêm bản lưu trên trình duyệt — nếu tên nào
  // đã gõ trước đó nhưng chưa kịp đồng bộ lên server thì vẫn hiện lại đúng.
  useEffect(() => {
    const local = readLocalNames();
    if (Object.keys(local).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đồng bộ 1 lần từ localStorage (nguồn ngoài React) sau khi mount, đúng theo khuyến nghị của React docs.
      setCustomerNames((prev) => ({ ...prev, ...local }));
    }
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const order of orders) {
      if (!map.has(order.subId)) map.set(order.subId, []);
      map.get(order.subId).push(order);
    }
    return Array.from(map.entries()).map(([subId, list]) => {
      // "Đã nhận" không tính từ danh sách đơn (donhang) — nó đến từ 1 nguồn
      // dữ liệu riêng (danhan_by_subid) mà bot ghi mỗi khi Admin chuyển tiền
      // thực tế cho khách, nên lấy thẳng từ daNhanMap theo sub ID.
      const stat = { pending: 0, completed: 0, tongHH: 0, daNhan: daNhanMap[subId] || 0, grossPending: 0, grossCompleted: 0 };
      for (const o of list) {
        const amount = o.final80 || 0;
        const gross = o.gross || 0;
        const kind = classifyStatus(o.status);
        if (kind === "pending") {
          stat.pending += amount;
          stat.grossPending += gross;
        } else if (kind === "completed") {
          stat.completed += amount;
          stat.grossCompleted += gross;
        }
      }
      // Tổng HH = tổng của 2 ô: Đang chờ xử lý + Đã hoàn thành (không cộng
      // Đã nhận nữa — Đã nhận là tiền đã chuyển thực tế, tách riêng).
      stat.tongHH = stat.pending + stat.completed;
      // Cần thanh toán (riêng theo sub ID) = Đã hoàn thành thực nhận - Đã nhận.
      stat.canThanhToan = stat.completed - stat.daNhan;
      // `orders` gốc đã được sắp xếp mới nhất trước, nên đơn đầu tiên gặp
      // trong mỗi nhóm là đơn mới nhất và đơn cuối cùng là đơn cũ nhất.
      const latestOrderedAt = list[0]?.orderedAt || "";
      const oldestOrderedAt = list[list.length - 1]?.orderedAt || "";
      return { subId, orders: list, stat, latestOrderedAt, oldestOrderedAt };
    });
  }, [orders, daNhanMap]);

  // Lọc theo ô tìm kiếm — khớp theo Sub ID, tên khách, mã đơn hoặc tên sản phẩm.
  const searchedGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      if (g.subId.toLowerCase().includes(q)) return true;
      const name = (customerNames[g.subId] || "").toLowerCase();
      if (name.includes(q)) return true;
      return g.orders.some(
        (o) =>
          (o.orderId || "").toLowerCase().includes(q) ||
          (o.productName || "").toLowerCase().includes(q)
      );
    });
  }, [groups, searchQuery, customerNames]);

  // Tổng hợp số liệu cho 5 ô lọc — tính trên tập đã qua tìm kiếm, không phụ
  // thuộc vào ô lọc trạng thái đang chọn.
  const filterTotals = useMemo(() => {
    return searchedGroups.reduce(
      (acc, g) => ({
        pending: acc.pending + g.stat.pending,
        completed: acc.completed + g.stat.completed,
        tongHH: acc.tongHH + g.stat.tongHH,
        daNhan: acc.daNhan + g.stat.daNhan,
        canThanhToan: acc.canThanhToan + g.stat.canThanhToan,
      }),
      { pending: 0, completed: 0, tongHH: 0, daNhan: 0, canThanhToan: 0 }
    );
  }, [searchedGroups]);

  // Bảng tổng hợp "Hoa hồng chưa trừ thuế phí" cố định phía trên — số liệu
  // GỐC (chưa trừ 10% thuế, chưa chia 8-2), tính trên toàn bộ danh sách đã
  // qua tìm kiếm, không phụ thuộc ô lọc đang chọn. "Vàng Rơi"/"Chiến lợi
  // phẩm của tôi" = lấy Tổng HH gốc trừ 10% thuế phí TRƯỚC (khoản thuế này
  // không tính vào phần bị mất, vì vốn không được nhận), sau đó mới trừ tiếp
  // Tổng HH thực nhận bên dưới (sau thuế + chia 8-2) — tính trên CẢ Đang chờ
  // xử lý lẫn Đã hoàn thành, không chỉ riêng đơn đã hoàn thành.
  const grossTotals = useMemo(() => {
    const acc = searchedGroups.reduce(
      (a, g) => ({
        grossPending: a.grossPending + g.stat.grossPending,
        grossCompleted: a.grossCompleted + g.stat.grossCompleted,
      }),
      { grossPending: 0, grossCompleted: 0 }
    );
    const grossTongHH = acc.grossPending + acc.grossCompleted;
    // Trừ 10% thuế phí trước (khoản này không được nhận nên không tính là
    // "Chiến lợi phẩm"), sau đó mới trừ tiếp Tổng HH thực nhận bên dưới.
    const grossAfterTax = Math.round(grossTongHH * 0.90);
    return {
      grossPending: acc.grossPending,
      grossCompleted: acc.grossCompleted,
      grossTongHH,
      vangRoi: grossAfterTax - filterTotals.tongHH,
    };
  }, [searchedGroups, filterTotals]);

  // Ô lọc: mỗi ô chỉ hiện các sub ID có phát sinh số tiền tương ứng > 0;
  // khi không chọn ô nào (statusFilter = null) thì hiện tất cả.
  const filteredGroups = useMemo(() => {
    if (statusFilter === "pending") return searchedGroups.filter((g) => g.stat.pending > 0);
    if (statusFilter === "completed") return searchedGroups.filter((g) => g.stat.completed > 0);
    if (statusFilter === "tongHH") return searchedGroups.filter((g) => g.stat.tongHH > 0);
    if (statusFilter === "canThanhToan") return searchedGroups.filter((g) => g.stat.canThanhToan > 0);
    if (statusFilter === "daNhan") return searchedGroups.filter((g) => g.stat.daNhan > 0);
    return searchedGroups;
  }, [searchedGroups, statusFilter]);

  // Sắp xếp: mới nhất/cũ nhất theo ngày đặt đơn gần nhất của sub ID,
  // nhiều nhất/ít nhất theo tổng hoa hồng của sub ID.
  const sortedGroups = useMemo(() => {
    const arr = [...filteredGroups];
    arr.sort((a, b) => {
      if (sortMode === "most") return b.stat.tongHH - a.stat.tongHH;
      if (sortMode === "least") return a.stat.tongHH - b.stat.tongHH;
      if (sortMode === "oldest") return a.latestOrderedAt.localeCompare(b.latestOrderedAt);
      return b.latestOrderedAt.localeCompare(a.latestOrderedAt);
    });
    return arr;
  }, [filteredGroups, sortMode]);

  // Quay về trang 1 mỗi khi đổi tìm kiếm/lọc/sắp xếp, tránh hiện trang trống.
  useEffect(() => {
    setGroupPage(1);
    setPageWindowStart(0);
  }, [searchQuery, statusFilter, sortMode]);

  const totalPages = Math.max(1, Math.ceil(sortedGroups.length / PAGE_SIZE));
  const effectiveGroupPage = Math.min(groupPage, totalPages);
  const pagedGroups = useMemo(() => {
    const start = (effectiveGroupPage - 1) * PAGE_SIZE;
    return sortedGroups.slice(start, start + PAGE_SIZE);
  }, [sortedGroups, effectiveGroupPage]);

  function goToPage(p) {
    setGroupPage(p);
  }

  function advancePageWindow() {
    setPageWindowStart((w) => Math.min(w + PAGE_WINDOW, Math.max(0, totalPages - 1)));
  }

  function retreatPageWindow() {
    setPageWindowStart((w) => Math.max(0, w - PAGE_WINDOW));
  }

  const persistName = useCallback(async (subId, name) => {
    setSavingKeys((s) => ({ ...s, [subId]: true }));
    setSaveErrorKeys((s) => {
      if (!s[subId]) return s;
      const next = { ...s };
      delete next[subId];
      return next;
    });
    try {
      const res = await fetch("/api/admin/customer-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subId, name }),
      });
      if (!res.ok) throw new Error("Lưu tên thất bại");
    } catch {
      // Lưu lên server thất bại (mạng lỗi/server lỗi) — tên vẫn còn tạm
      // trong localStorage của trình duyệt này nên chưa mất ngay, nhưng
      // CHƯA chắc đã lưu vĩnh viễn trên server. Đánh dấu lỗi để báo cho
      // Admin biết, gõ lại (hoặc bấm Làm mới sau khi mạng ổn) sẽ tự thử lưu lại.
      setSaveErrorKeys((s) => ({ ...s, [subId]: true }));
    } finally {
      setSavingKeys((s) => {
        const next = { ...s };
        delete next[subId];
        return next;
      });
    }
  }, []);

  function handleNameChange(subId, value) {
    setCustomerNames((prev) => {
      const next = { ...prev, [subId]: value };
      writeLocalNames(next);
      return next;
    });
    clearTimeout(saveTimers.current[subId]);
    saveTimers.current[subId] = setTimeout(() => persistName(subId, value), 600);
  }

  function toggleGroup(subId) {
    setExpanded((prev) => ({ ...prev, [subId]: !prev[subId] }));
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/orders", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setOrders(data.orders || []);
        setGroupPage(1);
        setPageWindowStart(0);
        // Ưu tiên tên đã lưu trên trình duyệt (mới nhất) đè lên tên từ server,
        // phòng khi có tên vừa gõ mà server chưa kịp lưu xong.
        setCustomerNames({ ...(data.customerNames || {}), ...readLocalNames() });
        setDaNhanMap(data.daNhan || {});
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    // Nạp lại trang /admin — vì cookie đã bị xoá, server sẽ tự hiện lại
    // ô nhập mật khẩu (vẫn cùng 1 trang, không có route /admin/login riêng).
    router.refresh();
  }

  return (
    <main className="admin-green min-h-screen px-4 py-8 sm:py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-cream">
              Admin — Danh sách đơn hàng
            </h1>
            <p className="text-muted text-sm mt-1">
              Chỉ hiện các sub ID dạng số trên 10 chữ số · {orders.length} đơn · {groups.length} khách
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-panel border border-border text-cream hover:border-gold transition-colors disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {refreshing ? "Đang tải..." : "Làm mới"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-panel border border-border text-danger hover:border-danger transition-colors cursor-pointer active:scale-95"
            >
              Đăng xuất
            </button>
          </div>
        </div>

        {/* Ô "Chiến lợi phẩm của tôi" — nổi bật riêng 1 ô, long lanh lấp
            lánh/đẳng cấp hơn Vàng Rơi cũ. KHÔNG dính khi cuộn trang, để
            trôi lên như nội dung bình thường. */}
        <div className="loot-box-frame loot-box-shine mb-3">
          <div className="loot-box-frame-inner text-center">
            <p className="loot-box-label text-[11px] font-bold tracking-wide">✨ Chiến lợi phẩm của tôi</p>
            <p className="loot-box-amount font-mono-num text-xl font-extrabold">
              {formatVnd(grossTotals.vangRoi)}
            </p>
          </div>
        </div>

        {/* Hoa hồng chưa trừ thuế phí (GỐC, chưa trừ 10% thuế, chưa chia
            8-2) — chỉ để xem, không bấm lọc được. KHÔNG dính khi cuộn
            trang, để trôi lên cùng ô Chiến lợi phẩm bên trên. */}
        <div className="bg-panel border border-border rounded-2xl p-2 flex flex-col gap-1.5 mb-4">
          <p className="text-[11px] font-bold text-muted text-center">Hoa hồng chưa trừ thuế phí</p>
          <div className="grid grid-cols-3 gap-1">
            <div
              className="text-center rounded-lg py-1 px-0.5"
              style={{ border: `1px solid ${GROSS_STAT_COLORS.grossPending.border}`, background: GROSS_STAT_COLORS.grossPending.soft }}
            >
              <p className="text-[8.5px] leading-tight text-ink font-semibold">Đang chờ xử lý</p>
              <p className="font-mono-num text-[10.5px] leading-tight font-bold" style={{ color: GROSS_STAT_COLORS.grossPending.solid }}>
                {formatVnd(grossTotals.grossPending)}
              </p>
            </div>
            <div
              className="text-center rounded-lg py-1.5 px-0.5"
              style={{ border: `1.5px solid ${GROSS_STAT_COLORS.grossTongHH.solid}`, background: GROSS_STAT_COLORS.grossTongHH.soft, boxShadow: `0 2px 8px ${GROSS_STAT_COLORS.grossTongHH.soft}` }}
            >
              <p className="text-[9px] leading-tight text-ink font-extrabold">Tổng HH</p>
              <p className="font-mono-num text-xs leading-tight font-extrabold" style={{ color: GROSS_STAT_COLORS.grossTongHH.solid }}>
                {formatVnd(grossTotals.grossTongHH)}
              </p>
            </div>
            <div
              className="text-center rounded-lg py-1 px-0.5"
              style={{ border: `1px solid ${GROSS_STAT_COLORS.grossCompleted.border}`, background: GROSS_STAT_COLORS.grossCompleted.soft }}
            >
              <p className="text-[8.5px] leading-tight text-ink font-semibold">Đã hoàn thành</p>
              <p className="font-mono-num text-[10.5px] leading-tight font-bold" style={{ color: GROSS_STAT_COLORS.grossCompleted.solid }}>
                {formatVnd(grossTotals.grossCompleted)}
              </p>
            </div>
          </div>
        </div>

        {/* Ô tìm kiếm + 5 ô lọc (Đang chờ xử lý/Tổng HH/Đã hoàn thành 1 hàng,
            Cần thanh toán/Đã nhận rải xuống hàng riêng bên dưới) + 4 ô sắp
            xếp — dính lại phía trên khi cuộn trang xuống, không bị trôi mất. */}
        <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-2 sm:mx-0 sm:px-0 sticky-blur-bg-green flex flex-col gap-2 mb-4">
          <div className="relative flex items-center bg-surface border border-border rounded-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nhập mã đơn, tên sản phẩm hoặc sub ID..."
              className="w-full bg-transparent pl-4 pr-16 py-2.5 text-base sm:text-sm outline-none placeholder:text-muted/60 text-cream"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Xóa tìm kiếm"
                title="Xóa tìm kiếm"
                className="absolute right-9 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-full text-muted hover:bg-panel active:scale-90 transition-all cursor-pointer"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            )}
            <span
              aria-hidden="true"
              className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 text-muted"
            >
              <SearchIcon className="w-4 h-4" />
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {FILTER_OPTIONS.slice(0, 3).map((f) => {
              const active = statusFilter === f.key;
              const colors = GROUP_STAT_COLORS[f.key];
              const amount = filterTotals[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter((prev) => (prev === f.key ? null : f.key))}
                  className={`rounded-lg text-center transition-all cursor-pointer active:scale-95 ${f.emphasis ? "py-1.5 px-0.5" : "py-1 px-0.5"}`}
                  style={
                    active
                      ? { background: colors.solid, boxShadow: `0 3px 10px ${colors.soft}` }
                      : f.emphasis
                        ? { background: colors.soft, border: `1.5px solid ${colors.solid}`, boxShadow: `0 2px 8px ${colors.soft}` }
                        : { background: colors.soft, border: `1px solid ${colors.border}` }
                  }
                >
                  <p className={`leading-tight font-semibold ${f.emphasis ? "text-[9px] font-extrabold" : "text-[8.5px]"} ${active ? "text-white/90" : "text-ink"}`}>{f.label}</p>
                  <p
                    className={`font-mono-num leading-tight font-bold ${f.emphasis ? "text-xs font-extrabold" : "text-[10.5px]"}`}
                    style={{ color: active ? "#fff" : colors.solid }}
                  >
                    {formatVnd(amount)}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-1">
            {FILTER_OPTIONS.slice(3, 5).map((f) => {
              const active = statusFilter === f.key;
              const colors = GROUP_STAT_COLORS[f.key];
              const amount = filterTotals[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter((prev) => (prev === f.key ? null : f.key))}
                  className="rounded-lg py-1 px-0.5 text-center transition-all cursor-pointer active:scale-95"
                  style={
                    active
                      ? { background: colors.solid, boxShadow: `0 3px 10px ${colors.soft}` }
                      : { background: colors.soft, border: `1px solid ${colors.border}` }
                  }
                >
                  <p className={`text-[8.5px] leading-tight font-semibold ${active ? "text-white/90" : "text-ink"}`}>{f.label}</p>
                  <p
                    className="font-mono-num text-[10.5px] leading-tight font-bold"
                    style={{ color: active ? "#fff" : colors.solid }}
                  >
                    {formatVnd(amount)}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-4 gap-1.5 bg-panel border border-border rounded-full px-1.5 py-1.5">
            {SORT_OPTIONS.map((s) => {
              const active = sortMode === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSortMode(s.key)}
                  className={`px-1 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                    active ? "bg-highlight text-white" : "text-muted hover:text-cream"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="bg-panel border border-border rounded-2xl px-7 py-10 text-center">
            <p className="text-muted text-sm">Chưa có đơn hàng nào khớp điều kiện sub ID.</p>
          </div>
        ) : sortedGroups.length === 0 ? (
          <div className="bg-panel border border-border rounded-2xl px-7 py-10 text-center">
            <p className="text-muted text-sm">Không tìm thấy sub ID nào khớp điều kiện lọc/tìm kiếm.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pagedGroups.map((group) => {
              const isOpen = !!expanded[group.subId];
              return (
                <div
                  key={group.subId}
                  className="bg-panel border border-border rounded-xl overflow-hidden shadow-sm shadow-black/5"
                >
                  {/* Thanh ngang đỏ để dễ phân biệt ranh giới từng ô sub ID */}
                  <div className="h-[3px] w-full bg-danger" />
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleGroup(group.subId)}
                    onKeyDown={(e) => {
                      // Bỏ qua khi phím bấm phát sinh từ ô nhập tên khách (input) —
                      // nếu không, phím Cách/Enter khi đang gõ tên sẽ bị div cha này
                      // "nuốt" mất để đóng/mở sub ID thay vì gõ được vào ô.
                      const tag = e.target.tagName;
                      if (tag === "INPUT" || tag === "TEXTAREA") return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleGroup(group.subId);
                      }
                    }}
                    className="w-full px-4 sm:px-5 py-4 cursor-pointer hover:bg-panel-2/60 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronIcon open={isOpen} />
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted">Sub ID</p>
                        <p className="font-mono-num text-sm font-bold truncate flex items-center gap-1">
                          {group.subId}
                          <CopyButton text={group.subId} copiedKey={copiedKey} activeKey={`sub-${group.subId}`} onCopy={handleCopy} className="w-4 h-4" />
                        </p>
                      </div>
                      <p className="text-[11px] text-muted ml-auto shrink-0">{group.orders.length} đơn</p>
                    </div>

                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <p className="text-[11px] text-muted mb-1">Tên khách hàng</p>
                      <input
                        type="text"
                        value={customerNames[group.subId] || ""}
                        onChange={(e) => handleNameChange(group.subId, e.target.value)}
                        placeholder="Tự nhập tên khách..."
                        className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-base sm:text-sm text-cream placeholder:text-muted/60 outline-none focus:border-gold transition-colors"
                      />
                      {saveErrorKeys[group.subId] && (
                        <p className="text-[11px] text-danger mt-1">
                          ⚠ Chưa lưu được lên server, sẽ tự thử lại khi bạn gõ tiếp hoặc bấm &quot;Làm mới&quot;.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-1 mt-3">
                      <div
                        className="text-center rounded-lg py-1 px-0.5"
                        style={{ border: `1px solid ${GROUP_STAT_COLORS.pending.border}`, background: GROUP_STAT_COLORS.pending.soft }}
                      >
                        <p className="text-[8.5px] leading-tight text-ink font-semibold">Đang chờ xử lý</p>
                        <p className="font-mono-num text-[10.5px] leading-tight font-bold" style={{ color: GROUP_STAT_COLORS.pending.solid }}>
                          {formatVnd(group.stat.pending)}
                        </p>
                      </div>
                      <div
                        className="text-center rounded-lg py-1.5 px-0.5"
                        style={{ border: `1.5px solid ${GROUP_STAT_COLORS.tongHH.solid}`, background: GROUP_STAT_COLORS.tongHH.soft, boxShadow: `0 2px 8px ${GROUP_STAT_COLORS.tongHH.soft}` }}
                      >
                        <p className="text-[9px] leading-tight text-ink font-extrabold">Tổng HH</p>
                        <p className="font-mono-num text-xs leading-tight font-extrabold" style={{ color: GROUP_STAT_COLORS.tongHH.solid }}>
                          {formatVnd(group.stat.tongHH)}
                        </p>
                      </div>
                      <div
                        className="text-center rounded-lg py-1 px-0.5"
                        style={{ border: `1px solid ${GROUP_STAT_COLORS.completed.border}`, background: GROUP_STAT_COLORS.completed.soft }}
                      >
                        <p className="text-[8.5px] leading-tight text-ink font-semibold">Đã hoàn thành</p>
                        <p className="font-mono-num text-[10.5px] leading-tight font-bold" style={{ color: GROUP_STAT_COLORS.completed.solid }}>
                          {formatVnd(group.stat.completed)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <div
                        className="text-center rounded-lg py-1 px-0.5"
                        style={{ border: `1px solid ${GROUP_STAT_COLORS.canThanhToan.border}`, background: GROUP_STAT_COLORS.canThanhToan.soft }}
                      >
                        <p className="text-[8.5px] leading-tight text-ink font-semibold">Cần thanh toán</p>
                        <p className="font-mono-num text-[10.5px] leading-tight font-bold" style={{ color: GROUP_STAT_COLORS.canThanhToan.solid }}>
                          {formatVnd(group.stat.canThanhToan)}
                        </p>
                      </div>
                      <div
                        className="text-center rounded-lg py-1 px-0.5"
                        style={{ border: `1px solid ${GROUP_STAT_COLORS.daNhan.border}`, background: GROUP_STAT_COLORS.daNhan.soft }}
                      >
                        <p className="text-[8.5px] leading-tight text-ink font-semibold">Đã nhận</p>
                        <p className="font-mono-num text-[10.5px] leading-tight font-bold" style={{ color: GROUP_STAT_COLORS.daNhan.solid }}>
                          {formatVnd(group.stat.daNhan)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="flex flex-col gap-2 px-3 sm:px-4 pb-4">
                      {group.orders.map((order) => (
                        <OrderRow
                          key={rowKeyOf(order)}
                          order={order}
                          searchQuery={searchQuery}
                          copiedKey={copiedKey}
                          onCopy={handleCopy}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 bg-panel border border-border rounded-2xl px-5 py-5">
                {pageWindowStart > 0 && (
                  <button
                    type="button"
                    onClick={retreatPageWindow}
                    className="w-8 h-8 rounded-full text-xs font-semibold text-muted hover:text-cream border border-border cursor-pointer"
                    aria-label="Trang trước đó"
                  >
                    ‹
                  </button>
                )}
                {Array.from({ length: Math.min(PAGE_WINDOW, totalPages - pageWindowStart) }).map(
                  (_, i) => {
                    const p = pageWindowStart + i + 1;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => goToPage(p)}
                        className={`w-8 h-8 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                          effectiveGroupPage === p
                            ? "bg-highlight text-white"
                            : "text-muted hover:text-cream border border-border"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  }
                )}
                {pageWindowStart + PAGE_WINDOW < totalPages && (
                  <button
                    type="button"
                    onClick={advancePageWindow}
                    className="w-8 h-8 rounded-full text-xs font-semibold text-muted hover:text-cream border border-border cursor-pointer"
                    aria-label="Xem thêm trang"
                  >
                    ›...
                  </button>
                )}
                <span className="text-xs text-muted ml-2 font-mono-num">
                  Trang {effectiveGroupPage}/{totalPages}
                </span>
              </div>
            )}
          </div>
        )}

        <p className="text-muted text-xs mt-3">
          {Object.keys(savingKeys).length > 0
            ? "Đang lưu tên khách..."
            : Object.keys(saveErrorKeys).length > 0
            ? "Có tên chưa lưu được lên server — xem cảnh báo ⚠ bên dưới từng ô."
            : "Tên khách tự lưu theo Sub ID lên server khi bạn ngừng gõ (không chỉ trên máy này) — dùng được trên mọi thiết bị, không mất khi xóa trình duyệt."}
        </p>
      </div>
    </main>
  );
}
