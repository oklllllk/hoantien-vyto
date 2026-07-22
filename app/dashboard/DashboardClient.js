"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_THEME, getStoredTheme } from "../../lib/theme";
import HuongDanTaoLinkModal from "../components/HuongDanTaoLinkModal";

// Link nhóm Zalo nơi khách nhận My ID — dùng để khách gửi lệnh rút tiền vào nhóm.
const ZALO_GROUP_LINK = "https://zalo.me/g/aemkiy4ciyoiuwojpocf";

const PAGE_SIZE = 10;
const PAGE_WINDOW = 5;

// Bot dùng chữ trạng thái tự do (vd "Hoàn thành", "Chờ xử lý", "Đã huỷ"...)
// nên map theo từ khoá thay vì enum cố định, phòng khi bot đổi cách gọi.
function classifyStatus(trangThai) {
  const s = (trangThai || "").toLowerCase();
  if (s.includes("huỷ") || s.includes("hủy")) return "cancelled";
  if (s.includes("hoàn thành")) return "completed";
  return "pending";
}

// Bảng màu dùng chung cho bộ lọc đơn hàng + huy hiệu trạng thái từng đơn.
const STATUS_COLORS = {
  purple: { solid: "#c99a2e", soft: "rgba(201,154,46,0.14)" },
  green: { solid: "#22c55e", soft: "rgba(34,197,94,0.14)" },
  yellow: { solid: "#eab308", soft: "rgba(234,179,8,0.16)" },
  red: { solid: "#ef4444", soft: "rgba(239,68,68,0.14)" },
};

function statusMeta(trangThai) {
  const kind = classifyStatus(trangThai);
  if (kind === "cancelled") return STATUS_COLORS.red;
  if (kind === "completed") return STATUS_COLORS.green;
  return STATUS_COLORS.yellow;
}

// Bộ lọc trạng thái đơn hàng hiển thị phía trên danh sách (Tất cả / Hoàn
// thành / Chờ xử lý / Đã hủy), mỗi nút giữ đúng tông màu của trạng thái đó.
const STATUS_FILTERS = [
  { key: "all", label: "Tất cả", solid: "#c99a2e", soft: STATUS_COLORS.purple.soft },
  { key: "completed", label: "Hoàn thành", solid: "#22c55e", soft: STATUS_COLORS.green.soft },
  { key: "pending", label: "Chờ xử lý", solid: "#eab308", soft: STATUS_COLORS.yellow.soft },
  { key: "cancelled", label: "Đã hủy", solid: "#ef4444", soft: STATUS_COLORS.red.soft },
];

// Chiết khấu hiển thị theo từng đơn: hoa hồng gốc -> trừ thuế 10% -> còn 80% hoa hồng thực nhận.
function commissionBreakdown(grossCommission) {
  const gross = Number(grossCommission) || 0;
  const afterTax = Math.round(gross * 0.90);
  const final80 = Math.round(afterTax * 0.8);
  return { gross, afterTax, final80 };
}

// Màu số tiền cho 3 ô Hoa hồng / Sau thuế / Hoa hồng thực nhận — mỗi ô một màu
// riêng nhưng cùng một độ sáng/độ rực ngang nhau (không ô nào đậm/nhạt hơn ô nào):
// Hoa hồng: đỏ san hô, Sau thuế: tím, Hoa hồng thực nhận: xanh lá sáng (theo ảnh mẫu).
// Khung (border) của cả 3 ô dùng chung 1 màu tím nhạt theo tông nền của app.
const AMOUNT_COLORS = {
  gross: { solid: "#e0524f", border: "rgba(201,154,46,0.30)", soft: "rgba(201,154,46,0.05)" },
  afterTax: { solid: "#d9a72c", border: "rgba(201,154,46,0.30)", soft: "rgba(201,154,46,0.05)" },
  final80: { solid: "#0ecb81", border: "rgba(201,154,46,0.30)", soft: "rgba(201,154,46,0.05)" },
};

// Màu xanh lá cây sáng dùng chung cho số tiền "Hoa hồng ước tính" ở mọi nơi.
const ESTIMATE_GREEN = "#0ecb81";

function PasteIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

function CheckIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function CloseIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function LinkTabIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.36-1.36" />
    </svg>
  );
}

function OrdersTabIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6.2" />
      <circle cx="9.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function WalletTabIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MusicTabIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function LeaderboardTabIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4h10v6a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5A1.5 1.5 0 0 0 3 7.5v0A3.5 3.5 0 0 0 6.5 11H7" />
      <path d="M17 6h2.5A1.5 1.5 0 0 1 21 7.5v0A3.5 3.5 0 0 1 17.5 11H17" />
    </svg>
  );
}

function PlayIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

function PauseIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="5" width="4.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1" />
    </svg>
  );
}

function LockIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function formatTrackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// Thẻ 1 bài hát ở tab Music: bên trái là huy hiệu "Hoàn thành x/y đơn", giữa
// là avatar tròn có nút bật/tắt, viền SVG (gradient hồng-đỏ) vẽ theo tiến
// trình phát và tự xoay ngược chiều với avatar. Bài hát bị khoá nếu khách
// chưa đủ số đơn hoàn thành theo yêu cầu — không thể bấm phát hay tua.
function MusicTrackCard({ track, index, completedOrders, isActive, isPlaying, progress, currentTime, duration, onToggle, onSeek, blurRequirement }) {
  const RADIUS = 27;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const RING_BG_COLOR = "#ec4899"; // hồng — vòng nền, giống nhau ở mọi bài
  const RING_PROGRESS_COLOR = "#ef4444"; // đỏ — vòng tiến trình, giống nhau ở mọi bài

  const required = track.requiredOrders || 1;
  const doneForBadge = Math.min(completedOrders, required);
  const isLocked = completedOrders < required;
  const badgeColor = isLocked ? "#9ca3af" : "#16c261";

  // Chỉ hiển thị tiến trình/thời gian phát của bài đang thực sự phát (isActive);
  // các bài khác luôn hiện ở trạng thái 0 dù có phát nhạc ở nơi khác hay không.
  const shownProgress = isActive ? progress : 0;
  const shownCurrentTime = isActive ? currentTime : 0;
  const shownDuration = isActive ? duration : 0;
  const shownIsPlaying = isActive && isPlaying;

  function togglePlay() {
    if (isLocked) return;
    onToggle(track);
  }

  function handleSeek(e) {
    if (isLocked || !isActive) return;
    onSeek(Number(e.target.value));
  }

  return (
    <div
      className={`border border-border rounded-xl p-4 flex items-center gap-3 ${
        isLocked ? "bg-surface opacity-80" : ""
      }`}
      style={isLocked ? undefined : { backgroundColor: "#eaf4ff" }}
    >
      <div className="flex flex-col items-center justify-center text-center w-14 shrink-0">
        <span className="text-[10px] text-muted leading-tight">Hoàn thành</span>
        <span
          className="font-mono-num text-xs font-bold leading-tight"
          style={{
            color: badgeColor,
            filter: blurRequirement ? "blur(4px)" : undefined,
            userSelect: blurRequirement ? "none" : undefined,
          }}
        >
          {doneForBadge}/{required}
        </span>
        <span className="text-[10px] text-muted leading-tight">đơn</span>
      </div>

      <div className="relative w-16 h-16 shrink-0">
        <svg
          viewBox="0 0 64 64"
          className={`absolute inset-0 w-full h-full music-avatar-ring${
            isPlaying ? " is-playing" : ""
          }`}
        >
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke={RING_BG_COLOR}
            strokeOpacity="0.35"
            strokeWidth="3.5"
          />
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke={RING_PROGRESS_COLOR}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - shownProgress / 100)}
            transform="rotate(-90 32 32)"
          />
        </svg>

        <img
          src={track.cover}
          alt={track.title}
          className={`absolute inset-[7px] w-[50px] h-[50px] rounded-full object-cover music-avatar-art${
            shownIsPlaying ? " is-playing" : ""
          }${isLocked ? " grayscale" : ""}`}
        />

        <button
          type="button"
          onClick={togglePlay}
          disabled={isLocked}
          aria-label={isLocked ? "Bài hát đang bị khoá" : shownIsPlaying ? "Tạm dừng" : "Phát nhạc"}
          title={isLocked ? "Hoàn thành đủ đơn để mở khoá" : shownIsPlaying ? "Tạm dừng" : "Phát nhạc"}
          className={`absolute inset-0 flex items-center justify-center group ${
            isLocked ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/45 text-white backdrop-blur-sm group-hover:bg-black/60 transition-colors">
            {isLocked ? (
              <LockIcon className="w-3.5 h-3.5" />
            ) : shownIsPlaying ? (
              <PauseIcon className="w-3.5 h-3.5" />
            ) : (
              <PlayIcon className="w-3.5 h-3.5 ml-0.5" />
            )}
          </span>
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted mb-0.5">Bài {index + 1}</p>
        {isLocked ? (
          <p className="font-semibold text-sm sm:text-base leading-snug line-clamp-2">
            Nghe nhạc cùng Vy Tô
          </p>
        ) : track.sourceUrl ? (
          <a
            href={track.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sm sm:text-base leading-snug hover:underline hover:text-highlight transition-colors line-clamp-2"
          >
            {track.title}
          </a>
        ) : (
          <p className="font-semibold text-sm sm:text-base leading-snug line-clamp-2">{track.title}</p>
        )}

        <input
          type="range"
          min={0}
          max={shownDuration || 0}
          step={0.1}
          value={shownCurrentTime}
          onChange={handleSeek}
          disabled={isLocked || !shownDuration}
          className="w-full mt-2 accent-[#ef4444] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        />

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted font-mono-num">{formatTrackTime(shownCurrentTime)}</p>
          <p className="text-[11px] text-muted font-mono-num">{formatTrackTime(shownDuration)}</p>
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CopyIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function PencilIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ChevronDownIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Ô "Lưu ý quan trọng để được hoàn tiền" — dùng chung ở cả trên đầu mỗi sản
// phẩm vừa tạo lẫn ngay trước khi bấm nút tạo link. Tiêu đề + 5 gạch đầu dòng
// nằm chung 1 khối nền vàng nhạt, không tách thành 2 ô riêng.
function ImportantNotice({ expanded, onToggle }) {
  return (
    <div className={expanded ? "notice-box" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={expanded ? "notice-box-header cursor-pointer" : "notice-box-header-plain cursor-pointer"}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[12.5px] sm:text-sm font-bold not-italic text-[#d6362f]">
            ⚠️ Lưu ý quan trọng để được hoàn tiền
          </span>
          <ChevronDownIcon
            className={`w-3.5 h-3.5 text-[#d6362f] shrink-0 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>
      {expanded && (
        <div className="notice-box-body">
          <p className="text-[13px] font-bold not-italic text-[#d6362f]">1. Xóa sản phẩm này khỏi giỏ hàng (nếu có) ✅</p>
          <p className="text-[13px] font-bold not-italic text-[#d6362f]">2. Bấm link bỏ giỏ hoặc mua ngay ✅</p>
          <p className="text-[13px] font-bold not-italic text-[#d6362f]">3. Thao tác chậm lại để Shopee ghi nhận đơn ✅</p>
          <p className="text-[13px] font-bold not-italic text-[#d6362f]">4. Không xem live trước hoặc sau khi bấm link ✅</p>
          <p className="text-[13px] font-bold not-italic text-[#d6362f]">
            5. Không bấm vào link mã giảm giá của người khác sau khi bấm link ✅
          </p>
        </div>
      )}
    </div>
  );
}

// Icon nhỏ dùng riêng cho từng nút trong step-tracker "Dán Link → Mua Ngay →
// Đặt Hàng → Hoàn Tiền" (khung riêng, nền hồng, viền + chữ đỏ, đèn chạy trên
// thanh nối rồi bắn pháo hoa khi tới nút Hoàn Tiền).
function StepCartIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <path d="M2.5 3h2l2.2 11.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6" />
    </svg>
  );
}
function StepBoxIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </svg>
  );
}
function StepDollarIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.5v11M15 9.2c0-1.2-1.3-2-3-2s-3 .9-3 2.1c0 1.2 1.3 1.6 3 1.9s3 .8 3 2c0 1.2-1.3 2.1-3 2.1s-3-.8-3-2" />
    </svg>
  );
}

const STEP_TRACKER_ITEMS = [
  { key: "link", label: "Dán Link", Icon: LinkTabIcon },
  { key: "buy", label: "Mua Ngay", Icon: StepCartIcon },
  { key: "order", label: "Đặt Hàng", Icon: StepBoxIcon },
  { key: "cashback", label: "Hoàn Tiền", Icon: StepDollarIcon },
];

// Khung riêng "Dán Link → Mua Ngay → Đặt Hàng → Hoàn Tiền": nền hồng, 4 khung
// tròn + chữ màu đỏ, có đèn chạy trên thanh nối các nút và bắn pháo hoa khi
// đèn chạy tới nút Hoàn Tiền. Hiển thị trước khi tạo link, tự ẩn đi ngay khi
// tạo link thành công (đổi sang khung "Đã tạo link hoàn tiền thành công").
function CtaStepTracker() {
  return (
    <div className="step-tracker-frame">
      <div className="step-tracker-track">
        <span className="step-tracker-line" aria-hidden="true" />
        <span className="step-tracker-runner" aria-hidden="true" />
        <span className="step-tracker-fireworks" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className={`step-tracker-spark step-tracker-spark-${i}`} />
          ))}
        </span>
        <div className="step-tracker-row">
          {STEP_TRACKER_ITEMS.map((step) => (
            <div key={step.key} className="step-tracker-item">
              <span
                className={`step-tracker-circle${
                  step.key === "cashback" ? " step-tracker-circle-final" : ""
                }`}
              >
                <step.Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </span>
              <span className="step-tracker-label">{step.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function HeartIcon({ className = "", filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 21s-6.7-4.35-9.3-8.2C1.02 10.1 1.7 6.6 4.6 5.2 6.9 4.1 9.4 4.9 12 8c2.6-3.1 5.1-3.9 7.4-2.8 2.9 1.4 3.58 4.9 1.9 7.6C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}

function formatVnd(amount) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount || 0) + "đ";
}

// Khách nhập kiểu Việt Nam (dấu chấm ngăn cách hàng nghìn, vd "50.000") —
// bóc hết ký tự không phải số để ra đúng giá trị tuyệt đối (50000).
function parseVndInput(str) {
  const digits = String(str || "").replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

// Định dạng lại khi khách gõ, để ô nhập luôn hiển thị dạng có dấu chấm ngăn cách.
function formatAmountInput(str) {
  const num = parseVndInput(str);
  if (!num) return "";
  return new Intl.NumberFormat("vi-VN").format(num);
}

function truncateChars(str, limit = 60) {
  const s = String(str || "");
  if (s.length <= limit) return s;
  return s.slice(0, limit).trim() + "...";
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const TABS = [
  { id: "bxh", label: "BXH", Icon: LeaderboardTabIcon },
  { id: "orders", label: "Đơn hàng", Icon: OrdersTabIcon },
  { id: "link", label: "Tạo link", Icon: LinkTabIcon },
  { id: "wallet", label: "Ví Tiền", Icon: WalletTabIcon },
  { id: "music", label: "Music", Icon: MusicTabIcon },
];

// Tên hạng theo thứ tự giảm dần cho tab BXH — top 5 có tên riêng, từ hạng 6
// trở đi dùng chung 1 tên "Thân Thiết" (không lộ sub_id/danh tính cho ai).
const RANK_TIERS = [
  { rank: 1, name: "Kim Cương", emoji: "💎", color: "#38bdf8", glow: "rgba(56,189,248,0.35)" },
  { rank: 2, name: "Bạch Kim", emoji: "🏆", color: "#5eead4", glow: "rgba(94,234,212,0.35)" },
  { rank: 3, name: "Vàng", emoji: "🥇", color: "#eab308", glow: "rgba(234,179,8,0.35)" },
  { rank: 4, name: "Bạc", emoji: "🥈", color: "#9ca3af", glow: "rgba(156,163,175,0.35)" },
  { rank: 5, name: "Đồng", emoji: "🥉", color: "#c2703d", glow: "rgba(194,112,61,0.35)" },
];
const DEFAULT_TIER = { name: "Thân Thiết", emoji: "💗", color: "#c98a3f", glow: "rgba(201,138,63,0.25)" };

function rankTier(rank) {
  return RANK_TIERS.find((t) => t.rank === rank) || DEFAULT_TIER;
}

// Danh sách bài nhạc hiển thị ở tab Music — file đặt trong public/music/.
// requiredOrders: số đơn "Hoàn thành" cần có để mở khoá bài hát.
const MUSIC_TRACKS = [
  {
    id: "bai-1",
    title: "Nhật Ký Của Mẹ - Hiền Thục",
    src: "/music/bai-1.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl:
      "https://pianofingers.vn/sheet-nhac/hop-am-bai-hat-nhat-ky-cua-me-479.html?srsltid=AfmBOopUyrXk7ogg917yvksoUHh_s6U3bCHe8ZC4tr8K9iBwDnIAaBzA",
    requiredOrders: 1,
  },
  {
    id: "bai-2",
    title: "Anh Nên Yêu Cô Ấy - N Ly",
    src: "/music/bai-2.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 3,
  },
  {
    id: "bai-3",
    title: "Cạn Tình Như Thế - Kiều Chi Cover",
    src: "/music/bai-3.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 5,
  },
  {
    id: "bai-4",
    title: "Hạnh Phúc Không Chọn Em - Song Thư",
    src: "/music/bai-4.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 7,
  },
  {
    id: "bai-5",
    title: "Cha Và Con Gái - Thùy Chi",
    src: "/music/bai-5.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 10,
  },
  {
    id: "bai-6",
    title: "Quẻ Bói - Thôi Tử Cách",
    src: "/music/bai-6.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 15,
  },
  {
    id: "bai-7",
    title: "Vì Con - Phú Lê",
    src: "/music/bai-7.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 20,
  },
  {
    id: "bai-8",
    title: "Tay Trái Chỉ Trăng - Tát Đỉnh Đỉnh",
    src: "/music/bai-8.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 30,
  },
  {
    id: "bai-9",
    title: "Chiếc Khăn Gió Ấm - VALANCHE Cover",
    src: "/music/bai-9.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 40,
  },
  {
    id: "bai-10",
    title: "Siêu Cô Đơn - Yan Nguyễn",
    src: "/music/bai-10.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 50,
  },
  {
    id: "bai-11",
    title: "Mùa Đông Không Lạnh - Akira Phan",
    src: "/music/bai-11.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 65,
  },
  {
    id: "bai-12",
    title: "Đoạn Đường Vắng - Nhật Kim Anh",
    src: "/music/bai-12.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 80,
  },
  {
    id: "bai-13",
    title: "Quên Cách Yêu - Lương Bích Hữu",
    src: "/music/bai-13.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 100,
  },
  {
    id: "bai-14",
    title: "Thấm Thía - Tống Gia Vỹ",
    src: "/music/bai-14.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 120,
  },
  {
    id: "bai-15",
    title: "Một Đường Nở Hoa - Ôn Dịch Tâm",
    src: "/music/bai-15.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 140,
  },
  {
    id: "bai-16",
    title: "Ai Chung Tình Được Mãi - Thương Võ Cover",
    src: "/music/bai-16.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 170,
  },
  {
    id: "bai-17",
    title: "Tự Em Sai - Linh Hương Luz",
    src: "/music/bai-17.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 200,
  },
  {
    id: "bai-18",
    title: "Gặp Mẹ Trong Mơ - Thùy Chi",
    src: "/music/bai-18.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 230,
  },
  {
    id: "bai-19",
    title: "Ai Thật Lòng Thương Em - Lý Tuấn Kiệt",
    src: "/music/bai-19.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 260,
  },
  {
    id: "bai-20",
    title: "Không Còn Nợ Nhau - Wendy Thảo",
    src: "/music/bai-20.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 300,
  },
  {
    id: "bai-21",
    title: "Hẹn Hò Nhưng Không Yêu - Wendy Thảo",
    src: "/music/bai-21.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 345,
  },
  {
    id: "bai-22",
    title: "Anh Thôi Nhân Nhượng - Kiều Chi Cover",
    src: "/music/bai-22.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 400,
  },
  {
    id: "bai-23",
    title: "Cô Đơn Sẽ Tốt Hơn - Kiều Mini Cover",
    src: "/music/bai-23.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 450,
  },
  {
    id: "bai-24",
    title: "Mẹ Yêu Ơi - Gia Khiêm Cover",
    src: "/music/bai-24.mp3",
    cover: "/music/hoan-tien-avatar.png",
    sourceUrl: "",
    requiredOrders: 500,
  },
];

// Tối đa 10 link được tạo trong 1 lần dùng chế độ "Tạo nhiều link".
const MAX_MULTI_LINKS = 10;

// Lịch sử link tạo ra được lưu ở máy khách (localStorage), tách riêng theo My ID,
// vì hệ thống hiện chưa có bảng lưu link ở server — không ảnh hưởng các bảng dữ liệu khác.
function linkHistoryStorageKey(myId) {
  return `hoanvi_link_history_${myId || "guest"}`;
}

function loadLinkHistory(myId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(linkHistoryStorageKey(myId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLinkHistory(myId, list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(linkHistoryStorageKey(myId), JSON.stringify(list));
  } catch {
    // Bỏ qua nếu localStorage đầy/không khả dụng — không làm hỏng luồng tạo link.
  }
}

// Tên gợi nhớ cũng chỉ lưu ở máy khách (localStorage), tách riêng theo My ID —
// để 2 khách dùng chung 1 My ID trên 2 điện thoại khác nhau, mỗi người vẫn
// thấy đúng tên gợi nhớ mình đã đặt trên máy của mình.
function localNicknameStorageKey(myId) {
  return `hoanvi_nickname_${myId || "guest"}`;
}

function loadLocalNickname(myId) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(localNicknameStorageKey(myId)) || "";
  } catch {
    return "";
  }
}

function saveLocalNickname(myId, name) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localNicknameStorageKey(myId), name);
  } catch {
    // Bỏ qua nếu localStorage đầy/không khả dụng — không làm hỏng luồng chỉnh tên.
  }
}

export default function DashboardClient({
  user,
  initialOrders,
  initialWallet,
  initialLeaderboard,
  initialMyRank,
}) {
  const router = useRouter();
  const [orders] = useState(initialOrders || []);
  const [wallet] = useState(initialWallet);
  const [leaderboard] = useState(initialLeaderboard || []);
  const [myRank] = useState(initialMyRank || null);
  const [shopeeUrl, setShopeeUrl] = useState("");
  const [createMode, setCreateMode] = useState("single"); // "single" | "multi"
  const [multiUrlsText, setMultiUrlsText] = useState("");
  const [batchResults, setBatchResults] = useState([]); // kết quả của lần tạo link gần nhất (1 hoặc nhiều link)
  const [convertError, setConvertError] = useState("");
  const [converting, setConverting] = useState(false);

  // Thông báo nhỏ ở giữa màn hình, tự hiện rồi mờ dần sau khi tạo link thành công.
  const [toastText, setToastText] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastHideTimerRef = useRef(null);
  const toastClearTimerRef = useRef(null);
  const [copiedLinkId, setCopiedLinkId] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [activeTab, setActiveTab] = useState("link");

  // Lịch sử link đã tạo (lưu ở máy khách) + tab con Tất cả/Yêu thích + phân trang.
  const [linkHistory, setLinkHistory] = useState([]);
  const [historyTab, setHistoryTab] = useState("all"); // "all" | "favorite"
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageWindowStart, setHistoryPageWindowStart] = useState(0);

  // Tên gợi nhớ lưu riêng trên từng điện thoại (không đồng bộ qua server) —
  // để 2 người dùng chung 1 My ID trên 2 máy khác nhau không bị ghi đè tên của nhau.
  const [localNickname, setLocalNickname] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Trạng thái mở/đóng khối "5 lưu ý" ở mỗi sản phẩm vừa tạo link (theo id).
  const [expandedNotes, setExpandedNotes] = useState({});
  // Trạng thái mở/đóng khối "Lưu ý quan trọng để được hoàn tiền" hiển thị trước khi tạo link.
  const [mainNoticeOpen, setMainNoticeOpen] = useState(false);
  const [huongDanOpen, setHuongDanOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Đơn hàng: tìm kiếm theo mã đơn / tên sản phẩm + lọc theo trạng thái + phân trang.
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderPage, setOrderPage] = useState(1);
  const [pageWindowStart, setPageWindowStart] = useState(0);

  // Music: phân trang danh sách bài hát (10 bài / trang).
  const [musicPage, setMusicPage] = useState(1);
  const [musicPageWindowStart, setMusicPageWindowStart] = useState(0);

  // BXH: phân trang danh sách hạng 6 trở đi (10 người / trang), top 5 hiển thị riêng ở trên.
  const [bxhPage, setBxhPage] = useState(1);
  const [bxhPageWindowStart, setBxhPageWindowStart] = useState(0);

  // Ví tiền: yêu cầu rút.
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawCode, setWithdrawCode] = useState("");
  const [withdrawCopied, setWithdrawCopied] = useState(false);

  // Sao chép mã đơn hàng — lưu id vừa copy để hiện dấu ✓ tạm thời.
  const [copiedOrderId, setCopiedOrderId] = useState("");

  // Đồng bộ giao diện màu đã chọn ở trang đăng nhập.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đồng bộ với localStorage, chỉ chạy 1 lần lúc mount
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc lịch sử link đã lưu ở máy khách theo My ID
    setLinkHistory(loadLinkHistory(user.myId));
  }, [user.myId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc tên gợi nhớ đã lưu riêng trên máy này theo My ID
    setLocalNickname(loadLocalNickname(user.myId));
  }, [user.myId]);

  // STT lịch sử: đánh theo thứ tự tạo (link tạo trước có số nhỏ hơn), không đổi khi lọc theo tab.
  const historyStt = useMemo(() => {
    const map = new Map();
    linkHistory.forEach((h, i) => map.set(h.id, i + 1));
    return map;
  }, [linkHistory]);

  // Danh sách hiển thị: mới nhất lên trước.
  const historyNewestFirst = useMemo(() => [...linkHistory].reverse(), [linkHistory]);
  const historyFavoriteCount = useMemo(
    () => linkHistory.filter((h) => h.favorite).length,
    [linkHistory]
  );
  const historyFiltered = useMemo(
    () => (historyTab === "favorite" ? historyNewestFirst.filter((h) => h.favorite) : historyNewestFirst),
    [historyNewestFirst, historyTab]
  );
  const historyTotalPages = Math.max(1, Math.ceil(historyFiltered.length / PAGE_SIZE));
  const pagedHistory = useMemo(() => {
    const start = (historyPage - 1) * PAGE_SIZE;
    return historyFiltered.slice(start, start + PAGE_SIZE);
  }, [historyFiltered, historyPage]);

  // Map id -> item lịch sử đầy đủ, dùng để hiển thị khối "vừa tạo" (batchResults chỉ giữ id + trạng thái).
  const historyById = useMemo(() => {
    const map = new Map();
    linkHistory.forEach((h) => map.set(h.id, h));
    return map;
  }, [linkHistory]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kẹp lại trang hiện tại nếu danh sách thu hẹp (vd sau khi lọc yêu thích)
    setHistoryPage((p) => Math.min(p, historyTotalPages));
  }, [historyTotalPages]);

  function handleHistoryTabChange(tab) {
    setHistoryTab(tab);
    setHistoryPage(1);
    setHistoryPageWindowStart(0);
  }

  function goToHistoryPage(p) {
    setHistoryPage(p);
  }

  function advanceHistoryPageWindow() {
    setHistoryPageWindowStart((w) => Math.min(w + PAGE_WINDOW, Math.max(0, historyTotalPages - 1)));
  }

  function retreatHistoryPageWindow() {
    setHistoryPageWindowStart((w) => Math.max(0, w - PAGE_WINDOW));
  }

  function toggleFavoriteLink(id) {
    setLinkHistory((prev) => {
      const merged = prev.map((h) => (h.id === id ? { ...h, favorite: !h.favorite } : h));
      saveLinkHistory(user.myId, merged);
      return merged;
    });
  }

  function deleteHistoryLink(id) {
    if (typeof window !== "undefined" && !window.confirm("Xóa sản phẩm này khỏi lịch sử tạo link?")) {
      return;
    }
    setLinkHistory((prev) => {
      const merged = prev.filter((h) => h.id !== id);
      saveLinkHistory(user.myId, merged);
      return merged;
    });
  }

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && classifyStatus(o.status) !== statusFilter) return false;
      if (!q) return true;
      const id = (o.id || "").toLowerCase();
      const name = (o.productName || "").toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  }, [orders, orderSearch, statusFilter]);

  // Tổng số đơn trên toàn bộ đơn hàng (không phụ thuộc tìm kiếm).
  const ordersTotalCount = orders.length;

  // Số đơn đã "Hoàn thành" — dùng để mở khoá các bài hát ở tab Music.
  const completedOrdersCount = useMemo(
    () => orders.filter((o) => classifyStatus(o.status) === "completed").length,
    [orders]
  );

  // Bài đang phát (id) + trạng thái phát nhạc dùng CHUNG cho toàn app — audio
  // thật sự nằm ở 1 thẻ <audio> gắn cố định ngoài mọi tab (xem cuối file), nên
  // khi khách chuyển sang tab khác (BXH, Đơn hàng...) nhạc vẫn tiếp tục phát,
  // chỉ tắt khi khách bấm tắt trực tiếp hoặc bài hát phát hết.
  const musicAudioRef = useRef(null);
  const [nowPlayingId, setNowPlayingId] = useState(null);
  const [musicIsPlaying, setMusicIsPlaying] = useState(false);
  const [musicProgress, setMusicProgress] = useState(0); // 0-100
  const [musicCurrentTime, setMusicCurrentTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);

  function handleToggleTrack(track) {
    const audio = musicAudioRef.current;
    if (!audio) return;
    if (nowPlayingId === track.id) {
      // Cùng bài đang phát → chỉ bật/tắt tạm dừng.
      if (musicIsPlaying) {
        audio.pause();
      } else {
        audio.play().catch(() => {});
      }
      return;
    }
    // Chuyển sang bài khác → nạp nguồn mới rồi phát luôn.
    setNowPlayingId(track.id);
    setMusicProgress(0);
    setMusicCurrentTime(0);
    setMusicDuration(0);
    audio.src = track.src;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function handleSeekTrack(value) {
    const audio = musicAudioRef.current;
    if (!audio || !musicDuration) return;
    audio.currentTime = value;
    setMusicCurrentTime(value);
    setMusicProgress((value / musicDuration) * 100);
  }

  // Số thứ tự gốc của mỗi đơn (theo vị trí trong danh sách đầy đủ, chưa lọc) —
  // để khi tìm kiếm, đơn vẫn hiển thị đúng STT ban đầu thay vì đánh số lại theo kết quả lọc.
  const orderOriginalNumber = useMemo(() => {
    const map = new Map();
    orders.forEach((o, i) => map.set(o.id, i + 1));
    return map;
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const pagedOrders = useMemo(() => {
    const start = (orderPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, orderPage]);

  function handleSearchChange(value) {
    setOrderSearch(value);
    setOrderPage(1);
    setPageWindowStart(0);
  }

  function handleStatusFilterChange(value) {
    setStatusFilter(value);
    setOrderPage(1);
    setPageWindowStart(0);
  }

  function goToPage(p) {
    setOrderPage(p);
  }

  function advancePageWindow() {
    setPageWindowStart((w) => Math.min(w + PAGE_WINDOW, Math.max(0, totalPages - 1)));
  }

  function retreatPageWindow() {
    setPageWindowStart((w) => Math.max(0, w - PAGE_WINDOW));
  }

  // Music: 10 bài / trang, giữ nguyên thứ tự mốc đơn tăng dần (bài dễ mở khoá trước).
  const musicTotalPages = Math.max(1, Math.ceil(MUSIC_TRACKS.length / PAGE_SIZE));
  const pagedMusicTracks = useMemo(() => {
    const start = (musicPage - 1) * PAGE_SIZE;
    return MUSIC_TRACKS.slice(start, start + PAGE_SIZE).map((track, i) => ({
      track,
      absoluteIndex: start + i,
    }));
  }, [musicPage]);

  function goToMusicPage(p) {
    setMusicPage(p);
  }

  function advanceMusicPageWindow() {
    setMusicPageWindowStart((w) => Math.min(w + PAGE_WINDOW, Math.max(0, musicTotalPages - 1)));
  }

  function retreatMusicPageWindow() {
    setMusicPageWindowStart((w) => Math.max(0, w - PAGE_WINDOW));
  }

  // BXH: top 5 hiển thị riêng (podium), phần còn lại (hạng 6+) phân trang 10 người/trang.
  const bxhTop5 = leaderboard.slice(0, 5);
  const bxhRest = leaderboard.slice(5);
  const bxhTotalPages = Math.max(1, Math.ceil(bxhRest.length / PAGE_SIZE));
  const pagedBxhRest = useMemo(() => {
    const start = (bxhPage - 1) * PAGE_SIZE;
    return bxhRest.slice(start, start + PAGE_SIZE);
  }, [bxhRest, bxhPage]);

  function goToBxhPage(p) {
    setBxhPage(p);
  }

  function advanceBxhPageWindow() {
    setBxhPageWindowStart((w) => Math.min(w + PAGE_WINDOW, Math.max(0, bxhTotalPages - 1)));
  }

  function retreatBxhPageWindow() {
    setBxhPageWindowStart((w) => Math.max(0, w - PAGE_WINDOW));
  }

  async function handlePasteUrl() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setShopeeUrl(text.trim());
    } catch {
      // Trình duyệt có thể chặn đọc clipboard — khách vẫn có thể tự dán (Ctrl/Cmd+V).
    }
  }

  // Nút dán riêng cho ô "Tạo nhiều link" — đọc clipboard rồi tách mỗi link 1 dòng,
  // giống hệt logic khi khách tự dán (Ctrl/Cmd+V) vào ô này.
  async function handlePasteMultiUrl() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const tokens = text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
      if (tokens.length === 0) return;
      setMultiUrlsText((prev) => {
        const existing = prev.split("\n").map((s) => s.trim()).filter(Boolean);
        const merged = [...existing, ...tokens].slice(0, MAX_MULTI_LINKS);
        return merged.join("\n");
      });
    } catch {
      // Trình duyệt có thể chặn đọc clipboard — khách vẫn có thể tự dán (Ctrl/Cmd+V).
    }
  }

  function handleClearUrl() {
    setShopeeUrl("");
    setMultiUrlsText("");
    setBatchResults([]);
    setConvertError("");
  }

  function handleCreateModeChange(mode) {
    setCreateMode(mode);
    setConvertError("");
  }

  // Bóc nhiều link từ nội dung dán vào (mỗi link có thể cách nhau bởi xuống dòng
  // hoặc khoảng trắng) và tự tách thành từng dòng riêng, tối đa MAX_MULTI_LINKS link.
  function handleMultiPaste(e) {
    const text = e.clipboardData?.getData("text");
    if (!text) return;
    const tokens = text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length <= 1) return; // 1 link duy nhất -> để trình duyệt dán bình thường
    e.preventDefault();
    setMultiUrlsText((prev) => {
      const existing = prev.split("\n").map((s) => s.trim()).filter(Boolean);
      const merged = [...existing, ...tokens].slice(0, MAX_MULTI_LINKS);
      return merged.join("\n");
    });
  }

  const multiUrlsCount = useMemo(
    () => multiUrlsText.split("\n").map((s) => s.trim()).filter(Boolean).length,
    [multiUrlsText]
  );

  // Chỉ hiện nút "Xóa" khi khách đã điền chữ vào ô nhập link (đơn hoặc nhiều dòng).
  const hasInput =
    createMode === "single" ? shopeeUrl.trim().length > 0 : multiUrlsText.trim().length > 0;

  // Gọi API chuyển 1 link — không throw, luôn trả về trạng thái để Promise.all không bị chặn bởi 1 link lỗi.
  async function convertOneLink(url) {
    try {
      const res = await fetch("/api/convert-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopeeUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { url, status: "error", error: data.error || "Không thể chuyển link này." };
      }
      return { url, status: "success", data };
    } catch {
      return { url, status: "error", error: "Không thể kết nối máy chủ." };
    }
  }

  // Hiện thông báo nhỏ giữa màn hình ~1 giây rồi tự mờ dần và biến mất.
  function showSuccessToast(text) {
    if (toastHideTimerRef.current) clearTimeout(toastHideTimerRef.current);
    if (toastClearTimerRef.current) clearTimeout(toastClearTimerRef.current);
    setToastText(text);
    setToastVisible(true);
    toastHideTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      toastClearTimerRef.current = setTimeout(() => setToastText(""), 500);
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (toastHideTimerRef.current) clearTimeout(toastHideTimerRef.current);
      if (toastClearTimerRef.current) clearTimeout(toastClearTimerRef.current);
    };
  }, []);

  // Số link tạo thành công / tổng số link vừa gửi trong lô gần nhất — dùng cho
  // dòng thông báo xanh lá bên dưới nút "Tạo link hoàn tiền".
  const batchSuccessCount = useMemo(
    () => batchResults.filter((r) => r.status === "success").length,
    [batchResults]
  );
  const batchTotalCount = batchResults.length;

  async function handleCreateLinks(e) {
    e.preventDefault();
    setConvertError("");
    setBatchResults([]);

    let urls = [];
    if (createMode === "single") {
      const single = shopeeUrl.trim();
      if (!single) {
        setConvertError("Vui lòng nhập link Shopee.");
        return;
      }
      urls = [single];
    } else {
      urls = multiUrlsText.split("\n").map((s) => s.trim()).filter(Boolean);
      if (urls.length === 0) {
        setConvertError("Vui lòng nhập ít nhất 1 link Shopee.");
        return;
      }
      if (urls.length > MAX_MULTI_LINKS) {
        urls = urls.slice(0, MAX_MULTI_LINKS);
      }
    }

    setConverting(true);
    try {
      const results = await Promise.all(urls.map(convertOneLink));
      const nowIso = new Date().toISOString();
      const stamp = Date.now();
      const newHistoryItems = [];

      const display = results.map((r, idx) => {
        if (r.status === "error") {
          return { key: `err_${stamp}_${idx}`, status: "error", url: r.url, error: r.error };
        }
        const item = {
          id: `${stamp}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
          productName: r.data.productName || "",
          commissionStr: r.data.commissionStr || "—",
          commissionPct: r.data.commissionPct || "—",
          image: r.data.image || null,
          convertedUrl: r.data.convertedUrl,
          originalUrl: r.url,
          createdAt: nowIso,
          favorite: false,
        };
        newHistoryItems.push(item);
        return { key: item.id, status: "success", historyId: item.id };
      });

      if (newHistoryItems.length > 0) {
        setLinkHistory((prev) => {
          const merged = [...prev, ...newHistoryItems];
          saveLinkHistory(user.myId, merged);
          return merged;
        });
        const successCount = newHistoryItems.length;
        const totalCount = results.length;
        showSuccessToast(
          totalCount <= 1
            ? "Đã tạo link hoàn tiền thành công"
            : `Đã tạo ${successCount}/${totalCount} link hoàn tiền thành công`
        );
      } else {
        setConvertError("Không tạo được link nào. Vui lòng kiểm tra lại link đã nhập.");
      }

      setBatchResults(display);
    } finally {
      setConverting(false);
    }
  }

  async function handleCopyLink(url, id) {
    await navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    setTimeout(() => setCopiedLinkId(""), 1800);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function handleWithdrawAmountChange(e) {
    setWithdrawAmount(formatAmountInput(e.target.value));
  }

  function handleWithdrawRequest() {
    setWithdrawError("");
    setWithdrawCode("");
    setWithdrawCopied(false);
    const amount = parseVndInput(withdrawAmount);
    const available = wallet ? wallet.coTheRutHien : 0;
    if (!amount || amount <= 0) {
      setWithdrawError("Vui lòng nhập số tiền muốn rút.");
      return;
    }
    if (amount > available) {
      const suggested = Math.max(available - 1, 0);
      setWithdrawError(`Hãy bỏ lại 1đ nhé. Rút ${formatVnd(suggested)} đi ${displayName}.`);
      return;
    }
    setWithdrawCode(`#ruttien_${amount}`);
  }

  async function handleCopyWithdrawCode() {
    if (!withdrawCode) return;
    await navigator.clipboard.writeText(withdrawCode);
    setWithdrawCopied(true);
    setTimeout(() => setWithdrawCopied(false), 1800);
  }

  async function handleCopyOrderId(orderId) {
    if (!orderId) return;
    await navigator.clipboard.writeText(orderId);
    setCopiedOrderId(orderId);
    setTimeout(() => setCopiedOrderId(""), 1500);
  }

  const displayName = localNickname || user.displayName || "Anh / Chị";

  function startEditingName() {
    setNameInput(displayName);
    setEditingName(true);
  }

  function commitNameEdit() {
    const trimmed = nameInput.trim();
    const finalName = trimmed || displayName;
    setLocalNickname(finalName);
    saveLocalNickname(user.myId, finalName);
    setEditingName(false);
  }

  function cancelNameEdit() {
    setEditingName(false);
  }

  function toggleNotice(id) {
    setExpandedNotes((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Tiêu đề đầu trang đổi theo tab đang xem.
  let headerTitle = `Hello ${displayName}`;
  let headerIsRainbow = false;
  if (activeTab === "wallet") {
    headerTitle = "Tiền tiết kiệm của SẾP";
    headerIsRainbow = true;
  }
  if (activeTab === "music") {
    headerTitle = "Hòa mình cùng âm nhạc";
  }
  if (activeTab === "bxh") {
    headerTitle = "Bảng Xếp Hạng";
  }

  return (
    <main className={`login-pink theme-${theme} min-h-screen`}>
      {/* Top bar */}
      <header className="border-b border-border sticky top-0 z-40 sticky-blur-bg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex flex-col items-start gap-0.5">
            <span className="font-display font-semibold text-sm tracking-tight">Hoàn Tiền Cùng Vy Tô 😘</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2 bg-panel border border-border rounded-full pl-2.5 sm:pl-3 pr-1 py-1">
              <span className="hidden sm:inline text-xs text-muted">My ID</span>
              <span className="font-mono-num text-[11px] sm:text-xs bg-panel-2 rounded-full px-2 sm:px-2.5 py-1 text-gold max-w-[84px] sm:max-w-none truncate">
                {user.myId}
              </span>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-xs sm:text-sm text-muted hover:text-cream transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              {loggingOut ? "Đang thoát..." : "Đăng xuất"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 pb-28 sm:pb-10">
        <div
          className={
            activeTab === "orders"
              ? "mb-4"
              : activeTab === "music" || activeTab === "bxh"
              ? "mb-8 sticky top-[68px] z-30"
              : "mb-8"
          }
        >
          {activeTab === "orders" ? null : headerIsRainbow ? (
            <div className="rainbow-frame inline-block">
              <div className="rainbow-frame-inner px-5 py-3">
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-highlight">
                  {headerTitle}
                </h1>
              </div>
            </div>
          ) : activeTab === "link" ? (
            <div className="flex items-center gap-2.5">
              <div className="vip-name-frame inline-block">
                <div className="vip-name-frame-inner">
                  {editingName ? (
                    <input
                      autoFocus
                      type="text"
                      value={nameInput}
                      maxLength={30}
                      onChange={(e) => setNameInput(e.target.value)}
                      onBlur={commitNameEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitNameEdit();
                        if (e.key === "Escape") cancelNameEdit();
                      }}
                      className="vip-name-input text-xl sm:text-2xl px-1 py-0.5 w-36 sm:w-52"
                    />
                  ) : (
                    <h1 className="vip-name-text text-2xl sm:text-3xl tracking-tight">
                      {headerTitle} <span>🌷</span>
                    </h1>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={editingName ? commitNameEdit : startEditingName}
                aria-label={editingName ? "Lưu tên" : "Chỉnh sửa tên"}
                title={editingName ? "Lưu tên" : "Chỉnh sửa tên"}
                className="vip-edit-btn-outside cursor-pointer shrink-0"
              >
                {editingName ? <CheckIcon className="w-4 h-4" /> : <PencilIcon className="w-4 h-4" />}
              </button>
            </div>
          ) : activeTab === "music" ? (
            <div className="vip-name-frame inline-block sticky-blur-bg rounded-[18px] p-1">
              <div className="vip-name-frame-inner">
                <h1 className="vip-name-text text-2xl sm:text-3xl tracking-tight">
                  {headerTitle}
                </h1>
              </div>
            </div>
          ) : activeTab === "bxh" ? (
            <div className="vip-name-frame inline-block sticky-blur-bg rounded-[18px] p-1">
              <div className="vip-name-frame-inner">
                <h1 className="vip-name-text text-2xl sm:text-3xl tracking-tight">
                  {headerTitle} <span>🏆</span>
                </h1>
              </div>
            </div>
          ) : (
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              {headerTitle}
            </h1>
          )}
        </div>

        {/* Thanh chuyển tab (ẩn trên desktop vì đã có thanh cố định phía dưới) */}
        <div className="hidden sm:flex items-center gap-2 mb-6 bg-panel border border-border rounded-full p-1.5 w-fit">
          {TABS.map((tab) => {
            const isFeatured = tab.id === "link";
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-full font-semibold transition-all cursor-pointer ${
                  isFeatured
                    ? `px-5 py-2.5 text-base scale-110 shadow-lg ${
                        activeTab === tab.id
                          ? "bg-highlight text-white shadow-highlight/40"
                          : "bg-highlight/35 text-highlight shadow-highlight/10 hover:bg-highlight/50"
                      }`
                    : `px-4 py-2 text-sm ${
                        activeTab === tab.id
                          ? "bg-highlight text-white shadow-sm"
                          : "text-muted hover:text-cream"
                      }`
                }`}
              >
                <tab.Icon className={isFeatured ? "w-5 h-5" : "w-4 h-4"} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "link" && (
          <div className="space-y-5">
            {/* Khung độc lập: dòng nhắc "Tiền kiếm khó lắm..." — không còn
                dùng chung khung lớn với ô tạo link bên dưới nữa. */}
            <div className="rainbow-frame inline-block w-full">
              <div className="rainbow-frame-inner px-4 py-2.5">
                <p className="text-highlight text-sm font-bold text-center">
                  Tiền kiếm khó lắm. Nhớ tiết kiệm nhé!
                </p>
              </div>
            </div>

            {/* Khung độc lập của chính nó: từ nút chọn chế độ đến dòng lưu ý
                quan trọng — tách hẳn khỏi khung nhắc nhở tiết kiệm ở trên. */}
            <div className="bg-panel border border-border rounded-2xl p-5 sm:p-6">
              {/* Chọn chế độ: tạo 1 link hoặc nhiều link cùng lúc (tối đa 10 link) */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => handleCreateModeChange("single")}
                  className={`px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold border-2 transition-all cursor-pointer ${
                    createMode === "single"
                      ? "bg-[#ffe8d1] border-[#ffc98a] text-[#b56a12] shadow-sm scale-[1.03]"
                      : "bg-[#fff6ec] border-[#ffe3c2] text-[#c98a3f] hover:brightness-95"
                  }`}
                >
                  🎀 Tạo 1 link
                </button>
                <button
                  type="button"
                  onClick={() => {}}
                  className="shrink-0 text-[11px] sm:text-xs font-bold text-danger underline underline-offset-2 cursor-pointer hover:brightness-90"
                >
                  Video hướng dẫn
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateModeChange("multi")}
                  className={`px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold border-2 transition-all cursor-pointer ${
                    createMode === "multi"
                      ? "bg-[#ff8383] border-[#e94f4f] text-white shadow-sm scale-[1.03]"
                      : "bg-[#ffe4e4] border-[#ffc4c4] text-[#c34848] hover:brightness-95"
                  }`}
                >
                  🎀 Tạo nhiều link
                </button>
              </div>

              <form onSubmit={handleCreateLinks} className="space-y-3">
                {createMode === "single" ? (
                  <div className="relative">
                    <input
                      type="url"
                      required
                      value={shopeeUrl}
                      onChange={(e) => setShopeeUrl(e.target.value)}
                      placeholder="Dán link sản phẩm vào đây!"
                      className="w-full bg-surface border border-border rounded-lg pl-3.5 pr-14 py-3 text-base sm:text-sm outline-none focus:border-gold transition-colors placeholder:text-muted/60"
                    />
                    <button
                      type="button"
                      onClick={handlePasteUrl}
                      aria-label="Dán link từ clipboard"
                      title="Dán link"
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-md bg-panel-2 text-gold hover:brightness-95 active:scale-90 transition-all cursor-pointer"
                    >
                      <PasteIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <textarea
                        required
                        rows={4}
                        value={multiUrlsText}
                        onChange={(e) => setMultiUrlsText(e.target.value)}
                        onPaste={handleMultiPaste}
                        placeholder={"Dán link sản phẩm vào đây!\n(Mỗi link 1 dòng, tối đa 10 link)"}
                        className="w-full bg-surface border border-border rounded-lg pl-3.5 pr-14 py-3 text-base sm:text-sm outline-none focus:border-gold transition-colors placeholder:text-muted/60 placeholder:leading-relaxed resize-y"
                      />
                      <button
                        type="button"
                        onClick={handlePasteMultiUrl}
                        aria-label="Dán link từ clipboard"
                        title="Dán link"
                        className="absolute right-2 top-2.5 inline-flex items-center justify-center w-8 h-8 rounded-md bg-panel-2 text-gold hover:brightness-95 active:scale-90 transition-all cursor-pointer"
                      >
                        <PasteIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <p className={`text-xs mt-1.5 ${multiUrlsCount > MAX_MULTI_LINKS ? "text-danger font-semibold" : "text-muted"}`}>
                      {multiUrlsCount}/{MAX_MULTI_LINKS} link
                      {multiUrlsCount > MAX_MULTI_LINKS ? " — chỉ 10 link đầu tiên được tạo" : ""}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={converting}
                    className={`flex-1 sm:flex-none sm:w-auto bg-[#c99a2e] hover:bg-[#dcb54c] text-white font-bold rounded-lg px-5 py-2.5 text-sm shadow-md shadow-[#c99a2e]/40 transition-all disabled:opacity-60 disabled:animate-none cursor-pointer ${
                      batchResults.length === 0 ? "animate-pulse" : "opacity-30"
                    }`}
                  >
                    {converting
                      ? "Đang tạo..."
                      : createMode === "multi" && multiUrlsCount > 1
                      ? `Tạo ${Math.min(multiUrlsCount, MAX_MULTI_LINKS)} link hoàn tiền`
                      : "Tạo link hoàn tiền"}
                  </button>
                  {hasInput && (
                    <button
                      type="button"
                      onClick={handleClearUrl}
                      aria-label="Xóa link"
                      title="Xóa"
                      className="inline-flex items-center justify-center gap-1.5 bg-[#eceef1] hover:bg-[#dfe2e6] text-[#5b616b] font-semibold rounded-lg px-3.5 py-2.5 text-sm transition-colors cursor-pointer shrink-0"
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                      Xóa
                    </button>
                  )}
                </div>

              </form>

              {convertError && (
                <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mt-4">
                  {convertError}
                </p>
              )}

              {batchSuccessCount === 0 && (
                <div className="mt-4">
                  <ImportantNotice expanded={mainNoticeOpen} onToggle={() => setMainNoticeOpen((v) => !v)} />
                </div>
              )}
            </div>

            {/* Khung riêng: "Đã tạo link hoàn tiền thành công" — không dùng
                chung khung với "Tạo 1 link / Tạo nhiều link" ở trên. */}
            {batchSuccessCount > 0 && (
              <div className="mt-4 flex justify-center">
                <div className="success-glow-green inline-flex items-center gap-2 rounded-xl border border-[#22c55e]/40 px-4 py-2.5">
                  <CheckIcon className="w-4 h-4 text-[#16a34a] shrink-0" />
                  <p className="text-sm font-bold text-[#16a34a] whitespace-nowrap">
                    {batchTotalCount <= 1
                      ? "Đã tạo link hoàn tiền thành công"
                      : `Đã tạo ${batchSuccessCount}/${batchTotalCount} link hoàn tiền thành công`}
                  </p>
                </div>
              </div>
            )}

            {batchResults.length > 0 && (
              <div className={batchResults.length > 1 ? "mt-5 product-list-frame" : "mt-5"}>
                <div className="space-y-3">
                {batchResults.map((r, idx) => {
                  if (r.status === "error") {
                    return (
                      <div
                        key={r.key}
                        className="bg-danger/10 border border-danger/30 rounded-lg p-4"
                      >
                        <p className="text-xs font-bold text-danger mb-1">
                          Link #{idx + 1} — không tạo được
                        </p>
                        <p className="text-xs text-muted break-all mb-1.5">{r.url}</p>
                        <p className="text-sm text-danger">{r.error}</p>
                      </div>
                    );
                  }
                  const item = historyById.get(r.historyId);
                  if (!item) return null;
                  return (
                    <div
                      key={r.key}
                      className="product-card relative p-4"
                    >
                      {/* Dòng "Lưu ý quan trọng để được hoàn tiền" nằm riêng 1
                          hàng, tách biệt khỏi tên sản phẩm/nút yêu thích. */}
                      <div className="mb-3">
                        <ImportantNotice
                          expanded={!!expandedNotes[item.id]}
                          onToggle={() => toggleNotice(item.id)}
                        />
                      </div>

                      <div className="flex items-start gap-3 mb-4 pb-4 border-b border-border/60">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.productName || "Sản phẩm Shopee"}
                            className="w-14 h-14 rounded-lg object-cover border border-border shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-panel-2 border border-border shrink-0 flex items-center justify-center text-muted text-xs">
                            Không ảnh
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {batchResults.length > 1 && (
                            <p className="text-[11px] text-muted font-mono-num mb-0.5">
                              #{idx + 1}
                            </p>
                          )}
                          {/* Tên sản phẩm + nút yêu thích cùng 1 hàng; tên dài
                              sẽ tự xuống dòng, không đè lên icon yêu thích. */}
                          <div className="flex items-start justify-between gap-2">
                            {item.productName ? (
                              <p className="text-base font-bold break-words min-w-0">
                                {truncateChars(item.productName, 60)}
                              </p>
                            ) : (
                              <span />
                            )}
                            <button
                              type="button"
                              onClick={() => toggleFavoriteLink(item.id)}
                              aria-label={item.favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
                              title={item.favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-panel border border-border text-[#ef4444] hover:brightness-95 active:scale-90 transition-all cursor-pointer shrink-0"
                            >
                              <HeartIcon className="w-4 h-4" filled={item.favorite} />
                            </button>
                          </div>
                          <p className="text-xs mt-0.5">
                            <span className="text-danger">Hoa hồng ước tính:</span>{" "}
                            <span className="money-chip font-bold font-mono-num" style={{ color: ESTIMATE_GREEN }}>
                              {item.commissionStr}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2.5">
                        <a
                          href={item.convertedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-blink-green flex-[2.2] inline-flex items-center justify-center text-center bg-[#16c261] hover:bg-[#12a852] text-white text-base sm:text-lg font-extrabold rounded-lg px-3.5 py-3 shadow-md shadow-[#16c261]/40 transition-all active:scale-[0.98] cursor-pointer"
                        >
                          🛍️ Mua Ngay
                        </a>
                        <button
                          onClick={() => handleCopyLink(item.convertedUrl, item.id)}
                          className="flex-[0.9] inline-flex items-center justify-center whitespace-nowrap bg-white hover:bg-white/90 text-ink border border-border text-xs font-semibold rounded-lg px-2 py-3 transition-all active:scale-[0.98] cursor-pointer"
                        >
                          {copiedLinkId === item.id ? "Đã chép ✓" : "📋 Sao chép"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Khung riêng hoàn toàn: step-tracker "Dán Link → Mua Ngay → Đặt
            Hàng → Hoàn Tiền" — không dùng chung khung với ô "Tiền kiếm khó
            lắm..." / khung tạo link ở trên, tự ẩn khi đã tạo link thành công.
            Cách đều và cách xa cả khung trên lẫn khung "Lịch sử tạo link". */}
        {activeTab === "link" && batchSuccessCount === 0 && (
          <div className="mt-5 mb-5">
            <CtaStepTracker />
          </div>
        )}

        {activeTab === "link" && (
          <div className={`mt-8 mb-10 ${historyOpen ? "bg-panel border border-border rounded-2xl" : ""}`}>
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              className={
                historyOpen
                  ? "sticky top-16 z-20 bg-panel rounded-t-2xl w-full text-left p-5 sm:p-6 pb-4 border-b border-border/60 shadow-sm shadow-black/5 cursor-pointer"
                  : "w-full flex justify-center cursor-pointer"
              }
            >
              <span className={`flex items-center justify-center gap-1.5 ${historyOpen ? "mb-3" : "bg-panel border border-[#c99a2e]/40 rounded-full px-4 py-2 shadow-sm shadow-black/5"}`}>
                <span
                  className="font-display font-bold text-lg text-center"
                  style={{ color: "#c99a2e" }}
                >
                  Lịch sử tạo link
                </span>
                <span style={{ color: "#c99a2e" }}>
                  <ChevronDownIcon
                    className={`w-4 h-4 shrink-0 transition-transform ${historyOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </span>
              {historyOpen && (
              <span className="flex items-stretch gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    handleHistoryTabChange("all");
                    setHistoryOpen(true);
                  }}
                  className={`flex-1 px-4 py-2 rounded-full text-sm font-bold text-center transition-all cursor-pointer border-2 ${
                    historyTab === "all"
                      ? "bg-[#7dd3fc] border-[#38bdf8] text-white shadow-sm"
                      : "bg-surface border-border text-muted hover:text-cream"
                  }`}
                >
                  Tất cả ({linkHistory.length})
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    handleHistoryTabChange("favorite");
                    setHistoryOpen(true);
                  }}
                  className={`flex-1 px-4 py-2 rounded-full text-sm font-bold text-center transition-all cursor-pointer border-2 ${
                    historyTab === "favorite"
                      ? "bg-gradient-to-r from-[#ff5b6e] to-[#ff8a8a] border-[#ff5b6e] text-white shadow-md shadow-[#ff5b6e]/40"
                      : "bg-[#ffe4e4] border-[#ffc4c4] text-[#c34848] hover:brightness-95"
                  }`}
                >
                  ❤️ Yêu thích ({historyFavoriteCount})
                </span>
              </span>
              )}
            </button>

            {historyOpen && (
            <>
            {pagedHistory.length === 0 ? (
              <div className="px-6 pb-8 text-center">
                <p className="text-muted text-sm">
                  {historyTab === "favorite"
                    ? "Chưa có sản phẩm yêu thích nào."
                    : "Chưa có link nào được tạo."}
                </p>
              </div>
            ) : (
              <>
                {/* Dạng thẻ - dùng trên điện thoại */}
                <div className="sm:hidden flex flex-col gap-3 p-3 pt-4">
                  {pagedHistory.map((item) => {
                    const stt = historyStt.get(item.id);
                    return (
                      <div
                        key={item.id}
                        className="relative px-4 py-4 rounded-xl border-2 border-border bg-surface/50"
                      >
                        <div className="absolute top-3 right-3 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleFavoriteLink(item.id)}
                            aria-label={item.favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
                            title={item.favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-panel border border-border text-[#ef4444] hover:brightness-95 active:scale-90 transition-all cursor-pointer"
                          >
                            <HeartIcon className="w-3.5 h-3.5" filled={item.favorite} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteHistoryLink(item.id)}
                            aria-label="Xóa khỏi lịch sử"
                            title="Xóa khỏi lịch sử"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-panel border border-border text-muted hover:text-danger hover:brightness-95 active:scale-90 transition-all cursor-pointer"
                          >
                            <CloseIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 pr-[4.5rem]">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.productName || "Sản phẩm Shopee"}
                              className="w-12 h-12 rounded-lg object-cover border border-border shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-panel-2 border border-border shrink-0 flex items-center justify-center text-muted text-[10px]">
                              Không ảnh
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[11px] text-muted font-mono-num">#{stt}</p>
                            <p className="text-sm font-bold truncate">
                              {truncateChars(item.productName || "Sản phẩm Shopee", 50)}
                            </p>
                            <p className="text-xs mt-0.5">
                              <span className="text-danger">Hoa hồng ước tính:</span>{" "}
                              <span className="font-bold font-mono-num" style={{ color: ESTIMATE_GREEN }}>
                                {item.commissionStr}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <a
                            href={item.convertedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-center bg-[#16c261] hover:bg-[#12a852] text-white text-xs font-bold rounded-lg px-3 py-2.5 shadow-sm shadow-[#16c261]/40 transition-all active:scale-[0.98] cursor-pointer"
                          >
                            🛍️ Mua Ngay
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(item.convertedUrl, item.id)}
                            className="flex-1 bg-white hover:bg-white/90 text-ink border border-border text-xs font-semibold rounded-lg px-3 py-2.5 transition-all active:scale-[0.98] cursor-pointer"
                          >
                            {copiedLinkId === item.id ? "Đã chép ✓" : "📋 Sao chép"}
                          </button>
                        </div>
                        <p className="text-[11px] text-muted mt-2">
                          {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Dạng bảng - dùng từ màn hình sm trở lên */}
                <div className="hidden sm:block overflow-x-auto scrollbar-thin">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-border text-ink text-xs uppercase tracking-wider">
                        <th className="text-left font-bold px-6 py-3">STT</th>
                        <th className="text-left font-bold px-4 py-3">Sản phẩm</th>
                        <th className="text-right font-bold px-4 py-3">Hoa hồng</th>
                        <th className="text-center font-bold px-4 py-3">Hành động</th>
                        <th className="text-right font-bold px-4 py-3">Ngày tạo</th>
                        <th className="text-right font-bold px-6 py-3">Yêu thích / Xóa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHistory.map((item) => {
                        const stt = historyStt.get(item.id);
                        return (
                          <tr key={item.id} className="border-t border-border/60">
                            <td className="px-6 py-3.5 font-mono-num text-muted text-xs">
                              #{stt}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                {item.image ? (
                                  <img
                                    src={item.image}
                                    alt={item.productName || "Sản phẩm Shopee"}
                                    className="w-9 h-9 rounded-md object-cover border border-border shrink-0"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-md bg-panel-2 border border-border shrink-0" />
                                )}
                                <span className="truncate max-w-[220px] inline-block align-top font-bold">
                                  {truncateChars(item.productName || "Sản phẩm Shopee", 50)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono-num font-bold" style={{ color: ESTIMATE_GREEN }}>
                              {item.commissionStr}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-center gap-2">
                                <a
                                  href={item.convertedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-center bg-[#16c261] hover:bg-[#12a852] text-white text-xs font-bold rounded-lg px-3 py-2 shadow-sm shadow-[#16c261]/40 transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap"
                                >
                                  🛍️ Mua Ngay
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(item.convertedUrl, item.id)}
                                  className="bg-white hover:bg-white/90 text-ink border border-border text-xs font-semibold rounded-lg px-3 py-2 transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap"
                                >
                                  {copiedLinkId === item.id ? "Đã chép ✓" : "📋 Sao chép"}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right text-muted text-xs">
                              {formatDateTime(item.createdAt)}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleFavoriteLink(item.id)}
                                  aria-label={item.favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
                                  title={item.favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[#ef4444] hover:bg-panel-2 active:scale-90 transition-all cursor-pointer"
                                >
                                  <HeartIcon className="w-4 h-4" filled={item.favorite} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteHistoryLink(item.id)}
                                  aria-label="Xóa khỏi lịch sử"
                                  title="Xóa khỏi lịch sử"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-full text-muted hover:text-danger hover:bg-panel-2 active:scale-90 transition-all cursor-pointer"
                                >
                                  <CloseIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Phân trang: tối đa 10 số trang mỗi lượt, mỗi trang 10 link */}
                {historyTotalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 px-5 py-5 border-t border-border">
                    {historyPageWindowStart > 0 && (
                      <button
                        type="button"
                        onClick={retreatHistoryPageWindow}
                        className="w-8 h-8 rounded-full text-xs font-semibold text-muted hover:text-cream border border-border cursor-pointer"
                        aria-label="Trang trước đó"
                      >
                        ‹
                      </button>
                    )}
                    {Array.from({
                      length: Math.min(PAGE_WINDOW, historyTotalPages - historyPageWindowStart),
                    }).map((_, i) => {
                      const p = historyPageWindowStart + i + 1;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => goToHistoryPage(p)}
                          className={`w-8 h-8 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                            historyPage === p
                              ? "bg-highlight text-white"
                              : "text-muted hover:text-cream border border-border"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    {historyPageWindowStart + PAGE_WINDOW < historyTotalPages && (
                      <button
                        type="button"
                        onClick={advanceHistoryPageWindow}
                        className="w-8 h-8 rounded-full text-xs font-semibold text-muted hover:text-cream border border-border cursor-pointer"
                        aria-label="Xem thêm trang"
                      >
                        ›
                      </button>
                    )}
                    <span className="text-xs text-muted ml-2 font-mono-num">
                      Trang {historyPage}/{historyTotalPages}
                    </span>
                  </div>
                )}
              </>
            )}
            </>
            )}
          </div>
        )}

        {activeTab === "orders" && (
          <>
            {/* Dòng tổng quan gọn: bên trái tổng số đơn, bên phải ô tìm kiếm — tách
                riêng khỏi danh sách đơn hàng, đặt lên trên và luôn cố định (sticky)
                khi khách cuộn xuống xem đơn. Bộ lọc trạng thái nằm ngay dưới, cùng
                cố định theo. */}
            <div className="sticky top-16 z-30 mb-3 flex flex-col gap-2 pt-2 -mx-4 px-4 sm:mx-0 sm:px-0 sticky-blur-bg">
              <div className="flex items-stretch bg-[#e8f4fc] border border-[#bfe0f4] rounded-full overflow-hidden shadow-md shadow-black/5">
                <div className="flex items-center gap-1.5 px-4 py-2 shrink-0">
                  <span className="font-display font-extrabold text-base text-[#2f6f95] tabular-nums">
                    {ordersTotalCount}
                  </span>
                  <span className="text-xs font-semibold text-[#2f6f95]">đơn</span>
                </div>
                <div className="w-px bg-[#bfe0f4] my-2" />
                <div className="relative flex-1 flex items-center">
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Nhập mã đơn hoặc tên sản phẩm..."
                    className="w-full bg-transparent pl-4 pr-16 py-2 text-base sm:text-sm outline-none placeholder:text-[#2f6f95]/60 text-ink"
                  />
                  {orderSearch && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange("")}
                      aria-label="Xóa tìm kiếm"
                      title="Xóa tìm kiếm"
                      className="absolute right-9 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-full text-[#2f6f95] hover:bg-[#d3ebf9] active:scale-90 transition-all cursor-pointer"
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 text-[#2f6f95]"
                  >
                    <SearchIcon className="w-4 h-4" />
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-panel border border-border rounded-full px-2 py-2 overflow-x-auto scrollbar-thin shadow-md shadow-black/5">
                {STATUS_FILTERS.map((f) => {
                  const active = statusFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => handleStatusFilterChange(f.key)}
                      className="shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-all cursor-pointer active:scale-95"
                      style={
                        active
                          ? { background: f.solid, color: "#fff", boxShadow: `0 3px 10px ${f.soft}` }
                          : { background: f.soft, color: f.solid }
                      }
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

          <div className="bg-panel border border-border rounded-2xl overflow-hidden">
            {filteredOrders.length === 0 ? (
              <div className="px-7 pb-10 text-center">
                <p className="text-muted text-sm">
                  {`Rất tiếc không tìm thấy đơn hàng của ${displayName} 😿`}
                </p>
              </div>
            ) : (
              <>
                {/* Dạng thẻ - dùng trên điện thoại */}
                <div className="sm:hidden flex flex-col gap-3 p-3">
                  {pagedOrders.map((order, i) => {
                    const meta = statusMeta(order.status);
                    const { gross, afterTax, final80 } = commissionBreakdown(order.commission);
                    const orderNumber = String(
                      orderOriginalNumber.get(order.id) || (orderPage - 1) * PAGE_SIZE + i + 1
                    ).padStart(2, "0");
                    return (
                      <div key={order.id} className="px-5 py-4 rounded-xl border-2 border-border bg-surface/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">
                              {orderNumber}.🛍️ {truncateChars(order.productName, 60)}
                            </p>
                            {order.id && (
                              <div className="inline-flex items-center gap-1.5 mt-1 border border-border rounded-md bg-surface px-2 py-1">
                                <p className="font-mono-num text-xs text-muted">{order.id}</p>
                                <button
                                  type="button"
                                  onClick={() => handleCopyOrderId(order.id)}
                                  aria-label="Sao chép mã đơn"
                                  title="Sao chép mã đơn"
                                  className="inline-flex items-center justify-center w-4 h-4 text-muted hover:text-highlight active:scale-90 transition-all cursor-pointer shrink-0"
                                >
                                  {copiedOrderId === order.id ? (
                                    <span className="text-[10px] text-mint">✓</span>
                                  ) : (
                                    <CopyIcon className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                          <span
                            className="status-pill shrink-0"
                            style={{ background: meta.soft, color: meta.solid }}
                          >
                            {order.status || "—"}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-2 mt-3">
                          <div>
                            <p className="text-[11px] text-muted">Ngày đặt</p>
                            <p className="font-mono-num text-sm">{formatDate(order.orderedAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-muted">Ngày hoàn thành</p>
                            <p className="font-mono-num text-sm">{formatDate(order.completedAt)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 mt-3">
                          <div
                            className="text-center rounded-lg py-1.5"
                            style={{ border: `1px solid ${AMOUNT_COLORS.gross.border}`, background: AMOUNT_COLORS.gross.soft }}
                          >
                            <p className="text-[10px] tracking-tight whitespace-nowrap text-ink font-semibold">Hoa hồng</p>
                            <p className="font-mono-num text-sm font-bold whitespace-nowrap" style={{ color: AMOUNT_COLORS.gross.solid }}>{formatVnd(gross)}</p>
                          </div>
                          <div
                            className="text-center rounded-lg py-1.5"
                            style={{ border: `1px solid ${AMOUNT_COLORS.afterTax.border}`, background: AMOUNT_COLORS.afterTax.soft }}
                          >
                            <p className="text-[10px] tracking-tight whitespace-nowrap text-ink font-semibold">Sau thuế</p>
                            <p className="font-mono-num text-sm font-bold whitespace-nowrap" style={{ color: AMOUNT_COLORS.afterTax.solid }}>{formatVnd(afterTax)}</p>
                          </div>
                          <div
                            className="text-center rounded-lg py-1.5"
                            style={{ border: `1px solid ${AMOUNT_COLORS.final80.border}`, background: AMOUNT_COLORS.final80.soft }}
                          >
                            <p className="text-[10px] tracking-tight whitespace-nowrap text-ink font-semibold">Hoa hồng thực nhận</p>
                            <p className="font-mono-num text-sm font-bold whitespace-nowrap" style={{ color: AMOUNT_COLORS.final80.solid }}>{formatVnd(final80)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Dạng bảng - dùng từ màn hình sm trở lên */}
                <div className="hidden sm:block overflow-x-auto scrollbar-thin">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-border text-ink text-xs uppercase tracking-wider">
                        <th className="text-left font-bold px-7 py-3">Mã đơn</th>
                        <th className="text-left font-bold px-4 py-3">Sản phẩm</th>
                        <th className="text-right font-bold px-4 py-3">Hoa hồng</th>
                        <th className="text-right font-bold px-4 py-3">Sau thuế</th>
                        <th className="text-right font-bold px-4 py-3">Hoa hồng thực nhận</th>
                        <th className="text-left font-bold px-4 py-3">Trạng thái</th>
                        <th className="text-right font-bold px-4 py-3">Ngày đặt</th>
                        <th className="text-right font-bold px-7 py-3">Ngày hoàn thành</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedOrders.map((order, i) => {
                        const meta = statusMeta(order.status);
                        const { gross, afterTax, final80 } = commissionBreakdown(order.commission);
                        const orderNumber = String(
                          orderOriginalNumber.get(order.id) || (orderPage - 1) * PAGE_SIZE + i + 1
                        ).padStart(2, "0");
                        return (
                          <tr key={order.id} className="border-t border-border/60">
                            <td className="px-7 py-3.5">
                              <span className="inline-block font-mono-num text-xs text-muted border border-border rounded-md bg-surface px-2 py-1">
                                {order.id || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="truncate max-w-[280px] inline-block align-top font-bold">
                                {orderNumber}.🛍️ {truncateChars(order.productName, 60)}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono-num font-bold" style={{ color: AMOUNT_COLORS.gross.solid }}>
                              {formatVnd(gross)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono-num font-bold" style={{ color: AMOUNT_COLORS.afterTax.solid }}>
                              {formatVnd(afterTax)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono-num font-bold" style={{ color: AMOUNT_COLORS.final80.solid }}>
                              {formatVnd(final80)}
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className="status-pill"
                                style={{ background: meta.soft, color: meta.solid }}
                              >
                                {order.status || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right text-muted text-xs">
                              {formatDate(order.orderedAt)}
                            </td>
                            <td className="px-7 py-3.5 text-right text-muted text-xs">
                              {formatDate(order.completedAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Phân trang: tối đa 10 số trang mỗi lượt, mỗi trang 10 đơn */}
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 px-5 py-5 border-t border-border">
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
                              orderPage === p
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
                      Trang {orderPage}/{totalPages}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          </>
        )}

        {activeTab === "wallet" && (
          <div className="ticket-notch bg-panel border border-border rounded-2xl overflow-hidden max-w-md">
            <div className="p-6 sm:p-7">
              <p className="text-xs text-muted uppercase tracking-widest mb-2">Có sẵn để rút</p>
              <div className="inline-block border border-[#8fe0b0] bg-[#e9fbf1] rounded-xl px-4 py-2.5">
                <p className="font-display font-bold text-4xl text-[#16c261] tabular-nums">
                  {wallet ? formatVnd(wallet.coTheRutHien) : "—"}
                </p>
              </div>

              {wallet && (
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={withdrawAmount}
                      onChange={handleWithdrawAmountChange}
                      placeholder="Nhập số tiền muốn rút"
                      className="flex-1 bg-surface border border-border rounded-lg px-3.5 py-2.5 text-base sm:text-sm outline-none focus:border-gold transition-colors placeholder:text-muted/60"
                    />
                    <button
                      type="button"
                      onClick={handleWithdrawRequest}
                      className="bg-[#16c261] hover:bg-[#12a852] text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors cursor-pointer shrink-0"
                    >
                      Rút ngay
                    </button>
                  </div>

                  {withdrawError && (
                    <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                      {withdrawError}
                    </p>
                  )}

                  {withdrawCode && (
                    <div className="bg-surface border border-border rounded-lg p-3.5 space-y-2.5">
                      <div>
                        <p className="text-[11px] text-muted mb-1">
                          Sao chép lệnh rút và gửi vào nhóm
                        </p>
                        <div className="flex items-center gap-2 bg-panel-2 border border-border rounded-lg px-3 py-2">
                          <code className="flex-1 font-mono-num text-sm truncate">{withdrawCode}</code>
                          <button
                            type="button"
                            onClick={handleCopyWithdrawCode}
                            aria-label="Sao chép lệnh rút"
                            title="Sao chép"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-panel text-gold hover:brightness-95 active:scale-90 transition-all cursor-pointer shrink-0"
                          >
                            <CopyIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {withdrawCopied && (
                          <p className="text-[11px] text-mint mt-1">Đã sao chép ✓</p>
                        )}
                      </div>
                      <a
                        href={ZALO_GROUP_LINK}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center bg-highlight hover:brightness-95 text-white text-sm font-semibold rounded-lg px-3.5 py-2.5 transition-all active:scale-[0.98] cursor-pointer"
                      >
                        Gửi vào nhóm
                      </a>
                    </div>
                  )}
                </div>
              )}

              {!wallet && (
                <p className="text-xs text-muted mt-2">
                  Chưa có dữ liệu ví cho My ID này — hãy đợi lần đồng bộ tiếp theo
                </p>
              )}
            </div>
            {wallet && (
              <>
                <div className="ticket-dashed" />
                <div className="px-6 sm:px-7 pt-4">
                  <p
                    className="inline-flex items-center justify-center w-full bg-[#dbeeff] border border-[#9cc9f5] text-[#1f5c7c] font-bold rounded-full px-3 py-1.5 text-center whitespace-nowrap overflow-hidden"
                    style={{ fontSize: "clamp(8px, 2.6vw, 12px)" }}
                  >
                    💡Hoa hồng ở &gt;Đã hoàn thành&lt; sẽ chuyển qua &gt;Có sẵn để rút&lt; sau 3 ngày
                  </p>
                </div>
                <div className="p-6 sm:p-7 pt-4 grid grid-cols-2 gap-4">
                  <div className="border border-border rounded-xl px-3.5 py-3">
                    <p className="text-xs text-muted mb-1">🟡 Tổng hoa hồng</p>
                    <p className="font-mono-num text-lg font-bold text-[#eab308]">
                      {formatVnd(
                        commissionBreakdown(wallet.dangCho).final80 +
                          wallet.hoanThanhChuaRut +
                          wallet.coTheRutHien +
                          wallet.daNhan
                      )}
                    </p>
                  </div>
                  <div className="border border-border rounded-xl px-3.5 py-3">
                    <p className="text-xs text-muted mb-1">🟣 Đang chờ xử lý</p>
                    <p className="font-mono-num text-lg font-bold text-[#a855f7]">
                      {formatVnd(commissionBreakdown(wallet.dangCho).final80)}
                    </p>
                  </div>
                  <div className="border border-border rounded-xl px-3.5 py-3">
                    <p className="text-xs text-muted mb-1">🟢 Đã hoàn thành</p>
                    <p className="font-mono-num text-lg font-bold text-[#16c261]">
                      {formatVnd(wallet.hoanThanhChuaRut)}
                    </p>
                  </div>
                  <div className="border border-border rounded-xl px-3.5 py-3">
                    <p className="text-xs text-muted mb-1">🔴 Đã nhận</p>
                    <p className="font-mono-num text-lg font-bold text-[#ef4444]">
                      {formatVnd(wallet.daNhan)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "music" && (
          <div className="bg-panel border border-border rounded-2xl p-6 sm:p-7 max-w-md">
            <p className="text-xs text-muted uppercase tracking-widest mb-4">Danh sách bài hát</p>
            <div className="space-y-4">
              {(() => {
                const firstLockedIdx = MUSIC_TRACKS.findIndex(
                  (t) => completedOrdersCount < (t.requiredOrders || 1)
                );
                return pagedMusicTracks.map(({ track, absoluteIndex }) => (
                  <MusicTrackCard
                    key={track.id}
                    track={track}
                    index={absoluteIndex}
                    completedOrders={completedOrdersCount}
                    isActive={nowPlayingId === track.id}
                    isPlaying={musicIsPlaying}
                    progress={musicProgress}
                    currentTime={musicCurrentTime}
                    duration={musicDuration}
                    onToggle={handleToggleTrack}
                    onSeek={handleSeekTrack}
                    blurRequirement={firstLockedIdx !== -1 && absoluteIndex > firstLockedIdx}
                  />
                ));
              })()}
            </div>

            {/* Phân trang: tối đa 5 số trang mỗi lượt, mỗi trang 10 bài */}
            {musicTotalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-5 mt-2 border-t border-border">
                {musicPageWindowStart > 0 && (
                  <button
                    type="button"
                    onClick={retreatMusicPageWindow}
                    className="w-8 h-8 rounded-full text-xs font-semibold text-muted hover:text-cream border border-border cursor-pointer"
                    aria-label="Trang trước đó"
                  >
                    ‹
                  </button>
                )}
                {Array.from({
                  length: Math.min(PAGE_WINDOW, musicTotalPages - musicPageWindowStart),
                }).map((_, i) => {
                  const p = musicPageWindowStart + i + 1;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goToMusicPage(p)}
                      className={`w-8 h-8 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                        musicPage === p
                          ? "bg-highlight text-white"
                          : "text-muted hover:text-cream border border-border"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                {musicPageWindowStart + PAGE_WINDOW < musicTotalPages && (
                  <button
                    type="button"
                    onClick={advanceMusicPageWindow}
                    className="w-8 h-8 rounded-full text-xs font-semibold text-muted hover:text-cream border border-border cursor-pointer"
                    aria-label="Xem thêm trang"
                  >
                    ›...
                  </button>
                )}
                <span className="text-xs text-muted ml-2 font-mono-num">
                  Trang {musicPage}/{musicTotalPages}
                </span>
              </div>
            )}
          </div>
        )}

        {activeTab === "bxh" && (
          <div className="max-w-md space-y-4">
            {/* Vị trí của bạn */}
            <div className="bg-panel border border-border rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-widest mb-1">Vị trí của bạn</p>
                <p
                  className="font-display text-xl font-bold"
                  style={{ color: myRank ? rankTier(myRank).color : undefined }}
                >
                  {myRank ? `Hạng ${myRank} — ${rankTier(myRank).name}` : "Chưa lọt Top 100"}
                </p>
              </div>
              <span className="text-3xl leading-none">{myRank ? rankTier(myRank).emoji : "🙈"}</span>
            </div>

            {/* Top 5 — sếp trên cao, nhìn đẳng cấp */}
            {bxhTop5.length > 0 && (
              <div className="bg-panel border border-border rounded-2xl p-5 sm:p-6">
                <p className="text-xs text-muted uppercase tracking-widest mb-4">Top 5 đẳng cấp</p>
                <div className="space-y-3">
                  {bxhTop5.map((entry) => {
                    const tier = rankTier(entry.rank);
                    return (
                      <div
                        key={entry.rank}
                        className="flex items-center gap-3 rounded-2xl border p-4 shadow-sm"
                        style={{
                          borderColor: tier.color,
                          background: `linear-gradient(135deg, ${tier.glow}, transparent)`,
                          transform: entry.rank === 1 ? "scale(1.04)" : undefined,
                        }}
                      >
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
                          style={{ background: tier.glow, border: `2px solid ${tier.color}` }}
                        >
                          {tier.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-muted">Hạng {entry.rank}</p>
                          <p className="font-display font-bold text-base flex items-center gap-1.5" style={{ color: tier.color }}>
                            {tier.name}
                            {entry.isMe && (
                              <span className="text-[10px] font-semibold bg-highlight text-white rounded-full px-2 py-0.5">
                                Bạn
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="font-mono-num font-bold text-sm shrink-0" style={{ color: tier.color }}>
                          {formatVnd(entry.total)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hạng 6 trở đi — Thân Thiết, không lộ sub_id */}
            {bxhRest.length > 0 && (
              <div className="bg-panel border border-border rounded-2xl p-5 sm:p-6">
                <p className="text-xs text-muted uppercase tracking-widest mb-4">
                  Hạng 6 trở lên — Thân Thiết
                </p>
                <div className="space-y-2">
                  {pagedBxhRest.map((entry) => (
                    <div
                      key={entry.rank}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
                        entry.isMe ? "border-highlight bg-[#f3ecff]" : "border-border"
                      }`}
                    >
                      <span className="w-8 text-center font-mono-num text-xs font-bold text-muted shrink-0">
                        #{entry.rank}
                      </span>
                      <span className="text-lg shrink-0">{DEFAULT_TIER.emoji}</span>
                      <span
                        className="flex-1 text-sm font-semibold flex items-center gap-1.5"
                        style={{ color: DEFAULT_TIER.color }}
                      >
                        Thân Thiết
                        {entry.isMe && (
                          <span className="text-[10px] font-semibold bg-highlight text-white rounded-full px-2 py-0.5">
                            Bạn
                          </span>
                        )}
                      </span>
                      <span className="font-mono-num text-sm font-bold text-muted shrink-0">
                        {formatVnd(entry.total)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Phân trang: tối đa 5 số trang mỗi lượt, mỗi trang 10 người */}
                {bxhTotalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-5 mt-2 border-t border-border">
                    {bxhPageWindowStart > 0 && (
                      <button
                        type="button"
                        onClick={retreatBxhPageWindow}
                        className="w-8 h-8 rounded-full text-xs font-semibold text-muted hover:text-cream border border-border cursor-pointer"
                        aria-label="Trang trước đó"
                      >
                        ‹
                      </button>
                    )}
                    {Array.from({
                      length: Math.min(PAGE_WINDOW, bxhTotalPages - bxhPageWindowStart),
                    }).map((_, i) => {
                      const p = bxhPageWindowStart + i + 1;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => goToBxhPage(p)}
                          className={`w-8 h-8 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                            bxhPage === p
                              ? "bg-highlight text-white"
                              : "text-muted hover:text-cream border border-border"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    {bxhPageWindowStart + PAGE_WINDOW < bxhTotalPages && (
                      <button
                        type="button"
                        onClick={advanceBxhPageWindow}
                        className="w-8 h-8 rounded-full text-xs font-semibold text-muted hover:text-cream border border-border cursor-pointer"
                        aria-label="Xem thêm trang"
                      >
                        ›...
                      </button>
                    )}
                    <span className="text-xs text-muted ml-2 font-mono-num">
                      Trang {bxhPage}/{bxhTotalPages}
                    </span>
                  </div>
                )}
              </div>
            )}

            {leaderboard.length === 0 && (
              <div className="bg-panel border border-border rounded-2xl p-6 text-center text-sm text-muted">
                Chưa có dữ liệu xếp hạng.
              </div>
            )}
          </div>
        )}

        {activeTab === "link" && (
          <p className="text-center text-xs text-muted mt-8">
            Việc ghi nhận chuyển đổi đơn hàng là do Shopee quyết định, chúng tôi không thể can thiệp!
          </p>
        )}
        {activeTab === "wallet" && (
          <p className="text-center text-xs text-muted mt-8">
            Tạo yêu cầu rút tiền và Admin sẽ chuyển tiền cho {displayName} trong thời gian sớm nhất có thể.
          </p>
        )}

        {/* Liên hệ hỗ trợ — đồng bộ với trang đăng nhập, hiện ở tab Tạo link/Đơn hàng/Ví Tiền.
           Riêng tab Music đổi thành lời chúc thay vì thông tin liên hệ. */}
        <div className="text-center pt-3 pb-2">
          {activeTab === "music" ? (
            <p className="text-[11px] text-muted">Chúc bạn nghe nhạc vui vẻ!</p>
          ) : (
            <p className="text-[11px] text-muted">
              Liên hệ hỗ trợ:{" "}
            <a
              href="https://zalo.me/0345647571"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#3f95b0] font-bold hover:underline"
            >
              Zalo (0345647571)
            </a>
            </p>
          )}
        </div>
      </div>

      {/* Thanh chuyển tab cố định phía dưới màn hình (kiểu app di động) */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-panel border-t border-border flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const isFeatured = tab.id === "link";
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                isFeatured ? "" : activeTab === tab.id ? "text-highlight" : "text-muted"
              }`}
            >
              {isFeatured ? (
                <span
                  className={`relative -mt-7 flex items-center justify-center w-14 h-14 rounded-full border-4 border-panel shadow-lg transition-all ${
                    activeTab === tab.id
                      ? "bg-highlight text-white scale-105 shadow-highlight/40"
                      : "bg-highlight/35 text-highlight shadow-highlight/10"
                  }`}
                >
                  <tab.Icon className="w-6 h-6" />
                </span>
              ) : (
                <tab.Icon className="w-5 h-5" />
              )}
              <span className={isFeatured ? `mt-1 ${activeTab === tab.id ? "text-highlight" : "text-muted"}` : ""}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Thông báo tạo link thành công — hiện giữa màn hình rồi tự mờ dần */}
      {toastText && (
        <div
          className={`fixed inset-0 z-[70] flex items-center justify-center px-6 pointer-events-none transition-opacity duration-500 ${
            toastVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="bg-panel border border-[#22c55e]/30 rounded-2xl shadow-2xl shadow-black/20 px-6 py-5 flex flex-col items-center gap-2 max-w-[280px]">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#22c55e]/15 text-[#16a34a]">
              <CheckIcon className="w-6 h-6" />
            </span>
            <p className="text-sm font-bold text-ink text-center">{toastText}</p>
          </div>
        </div>
      )}

      {/* Audio phát nhạc — gắn cố định NGOÀI mọi tab (không nằm trong khối
          activeTab === "music") để khi khách chuyển sang tab khác, phần tử này
          không bị React unmount, nhạc tiếp tục phát bình thường. Chỉ dừng khi
          khách bấm tắt trực tiếp hoặc bài hát phát hết. */}
      <audio
        ref={musicAudioRef}
        preload="none"
        onPlay={() => setMusicIsPlaying(true)}
        onPause={() => setMusicIsPlaying(false)}
        onEnded={() => {
          setMusicIsPlaying(false);
          setMusicProgress(0);
          setMusicCurrentTime(0);
        }}
        onLoadedMetadata={(e) => setMusicDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget;
          setMusicCurrentTime(audio.currentTime || 0);
          if (audio.duration) {
            setMusicProgress((audio.currentTime / audio.duration) * 100);
          }
        }}
        className="hidden"
      />

      {/* Modal hướng dẫn tạo link — mở khi khách bấm chữ "Hướng dẫn" màu đỏ
          nằm giữa 2 nút chọn chế độ tạo link. */}
      <HuongDanTaoLinkModal open={huongDanOpen} onClose={() => setHuongDanOpen(false)} />
    </main>
  );
}
