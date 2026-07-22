"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_THEME } from "../../lib/theme";

const ZALO_GROUP_LINK = "https://zalo.me/g/aemkiy4ciyoiuwojpocf";
const MYID_COMMAND = "#My_ID";

// Tên gợi nhớ chỉ lưu riêng trên từng điện thoại (localStorage), tách theo
// My ID — để 2 khách dùng chung 1 My ID trên 2 máy khác nhau không bị ghi
// đè tên gợi nhớ của nhau (xem thêm ghi chú ở app/api/auth/login/route.js).
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

function saveLocalNickname(myId, nickname) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localNicknameStorageKey(myId), nickname);
  } catch {
    // Bỏ qua nếu localStorage đầy/không khả dụng.
  }
}

/* Icon mèo dễ thương (thiết kế gốc, không phải nhân vật có bản quyền)
   dùng làm điểm nhấn "cute" xuyên suốt trang đăng nhập. */
function CuteCatIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 10 L16 20 L24 15 Z" fill="currentColor" opacity="0.9" />
      <path d="M36 10 L32 20 L24 15 Z" fill="currentColor" opacity="0.9" />
      <ellipse cx="24" cy="27" rx="15" ry="13" fill="currentColor" />
      <circle cx="18.5" cy="26" r="2" fill="#fff" />
      <circle cx="29.5" cy="26" r="2" fill="#fff" />
      <path d="M22 31 Q24 33 26 31" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M6 25 Q11 24 15 27" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      <path d="M6 29 Q11 29 15 30" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      <path d="M42 25 Q37 24 33 27" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      <path d="M42 29 Q37 29 33 30" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      <ellipse cx="17" cy="16" rx="4" ry="3" fill="#fff" transform="rotate(-18 17 16)" />
      <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

/* Quốc kỳ Việt Nam — dùng làm logo góc trên bên trái thẻ đăng nhập. */
function VietnamFlagIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 30 20" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="30" height="20" rx="3" fill="#da251d" />
      <path
        d="M15 4.5 L16.76 9.14 L21.75 9.27 L17.82 12.32 L19.27 17.1 L15 14.32 L10.73 17.1 L12.18 12.32 L8.25 9.27 L13.24 9.14 Z"
        fill="#ffcd00"
      />
    </svg>
  );
}

function PawIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="15" rx="6" ry="5" />
      <circle cx="5" cy="8.5" r="2.2" />
      <circle cx="10.2" cy="5.5" r="2.2" />
      <circle cx="13.8" cy="5.5" r="2.2" />
      <circle cx="19" cy="8.5" r="2.2" />
    </svg>
  );
}

function CopyIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </svg>
  );
}

function CheckBadge() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 mx-auto" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" fill="none" stroke="#ffd6e8" strokeWidth="6" />
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke="#e0417c"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="289"
        strokeDashoffset="289"
        style={{ animation: "ring-draw 0.6s ease-out forwards" }}
      />
      <path
        d="M30 52 L44 66 L72 36"
        fill="none"
        stroke="#e0417c"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="60"
        strokeDashoffset="60"
        style={{ animation: "tick-draw 0.4s ease-out 0.5s forwards" }}
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [nickname, setNickname] = useState("");
  const [myId, setMyId] = useState("");
  const [groupLinkOpened, setGroupLinkOpened] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);
  const theme = DEFAULT_THEME;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!myId.trim()) {
      setError("Vui lòng nhập My ID (dãy số bot cấp) để đăng nhập.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, myId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Có lỗi xảy ra, vui lòng thử lại.");
        setLoading(false);
        return;
      }

      // Lưu tên gợi nhớ riêng trên máy này (không đồng bộ qua server) —
      // để nếu người khác đăng nhập cùng My ID trên máy khác, tên gợi nhớ
      // của mỗi người vẫn tách biệt.
      const trimmedNickname = nickname.trim();
      if (trimmedNickname) {
        saveLocalNickname(myId.trim(), trimmedNickname);
      }

      // Hiện thông báo "Đăng nhập thành công" đáng yêu trước khi chuyển trang.
      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1100);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
      setLoading(false);
    }
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(MYID_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard không khả dụng — người dùng vẫn có thể tự bôi đen & copy
    }
  }

  return (
    <main className={`login-pink theme-${theme} min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden`}>
      {/* Vài chấm/paw trang trí nền cho vui mắt */}
      <PawIcon className="hidden sm:block absolute top-10 left-8 w-8 h-8 text-[var(--highlight)]/15 rotate-[-18deg]" />
      <PawIcon className="hidden sm:block absolute bottom-14 right-10 w-10 h-10 text-[var(--highlight)]/15 rotate-[12deg]" />
      <CuteCatIcon className="hidden sm:block absolute top-24 right-14 w-10 h-10 text-[var(--highlight)]/10" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-full bg-gold flex items-center justify-center shrink-0 shadow-md shadow-[var(--highlight)]/20">
              <CuteCatIcon className="w-6 h-6 text-white" />
            </div>
            <span className="font-display font-semibold text-lg tracking-tight">
              Mua sắm hoàn tiền cùng Vy Tô
            </span>
          </div>
          <p className="text-muted text-sm mb-3">Shop càng nhiều hoàn càng đã 🐾</p>

          {/* Badge trang trí pastel cho sinh động */}
          <div className="flex items-center justify-center flex-wrap gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-[#8a6412] bg-[#ffe9a8]/60 border border-[#ffe9a8]/80">
              💛 Hoàn tiền cao
            </span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-[#1f5c7c] bg-[#9fd0f0]/35 border border-[#9fd0f0]/50">
              💙 Thanh toán nhanh
            </span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-[#755613] bg-[#f5e08c]/45 border border-[#f5e08c]/60">
              💛 Uy tín
            </span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-[#8f333a] bg-[#f3a6ab]/35 border border-[#f3a6ab]/50">
              ❤️ Chăm sóc tận tâm
            </span>
          </div>
        </div>

        {/* Thẻ thành viên */}
        <div className="ticket-notch bg-panel rounded-2xl border border-border shadow-2xl shadow-black/10 overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-7 rounded-md overflow-hidden shadow-sm shadow-black/10 shrink-0">
                <VietnamFlagIcon className="w-full h-full" />
              </div>
              <div className="brand-badge" title="Hoàn tiền cùng Vy Tô">
                <img src="/brand/avatar-vytohoantien.png" alt="Hoàn tiền mua hàng" />
              </div>
            </div>

            {/* Lời chào — đổi ngay theo Tên gợi nhớ khách nhập */}
            <div className="rainbow-frame mb-5 inline-block w-full">
              <div className="rainbow-frame-inner">
                <p className="text-center font-display font-bold text-lg py-2 text-highlight">
                  <span>🌷</span> HOÀN TIỀN SHOPEE - VY TÔ
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Tên gợi nhớ */}
              <div>
                <label className="block text-xs font-bold text-highlight mb-1.5" htmlFor="nickname">
                  Tên gợi nhớ <span className="font-semibold text-muted">(không bắt buộc)</span>
                </label>
                <input
                  id="nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Đặt tên gì cũng được, vd: Thảo Shopee"
                  className="field-important w-full bg-surface border-2 border-highlight/30 rounded-xl px-3.5 py-2.5 text-base sm:text-sm outline-none focus:border-highlight transition-colors placeholder:text-muted/60"
                />
              </div>

              {/* Cách lấy My ID — chuyển lên trên, trước ô nhập My ID */}
              <div className="text-[11px] text-muted leading-snug space-y-2.5 bg-surface/60 border border-border rounded-xl px-3.5 py-3">
                <p className="font-semibold text-[#d9a72c] flex items-center gap-1.5 text-xs">
                  <CuteCatIcon className="w-4 h-4 text-[#d9a72c]" />
                  Cách lấy My ID:
                </p>
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#c99a2e] text-white text-[9px] font-bold shrink-0">1</span>
                  <span className="font-bold text-ink">Sao chép câu lệnh</span>
                  <span className="inline-flex items-center gap-1 font-mono-num font-bold bg-danger/15 text-danger px-1.5 py-0.5 rounded-md">
                    {MYID_COMMAND}
                    <button
                      type="button"
                      onClick={copyCommand}
                      aria-label="Sao chép câu lệnh My ID"
                      className="ml-0.5 inline-flex items-center justify-center w-5 h-5 rounded-md bg-danger text-white hover:brightness-95 active:scale-90 transition-all cursor-pointer"
                    >
                      {copied ? "✓" : <CopyIcon className="w-3 h-3" />}
                    </button>
                  </span>
                  {copied && <span className="text-highlight font-bold">Đã sao chép!</span>}
                </p>
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#dcb54c] text-white text-[9px] font-bold shrink-0">2</span>
                  <span className="font-bold text-ink">Gửi vào nhóm để lấy My ID</span>
                  <a
                    href={ZALO_GROUP_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setGroupLinkOpened(true)}
                    className="inline-flex items-center gap-1 bg-danger hover:brightness-95 text-white font-bold px-2.5 py-1 rounded-full shadow-sm shadow-danger/30 active:scale-95 transition-all"
                  >
                    👉 Gửi Ngay
                  </a>
                </p>
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#a67818] text-white text-[9px] font-bold shrink-0">3</span>
                  <span className="font-bold text-ink">Sao chép ID bot gửi cho bạn và điền vào ô My ID.</span>
                </p>
              </div>

              {/* My ID */}
              <div>
                <label className="block text-xs font-bold text-highlight mb-1.5" htmlFor="myId">
                  My ID <span className="font-semibold text-danger">(bắt buộc)</span>
                </label>
                <input
                  id="myId"
                  type="text"
                  inputMode="numeric"
                  value={myId}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9]/g, "");
                    setMyId(next);
                    // Nếu ô tên gợi nhớ đang trống, tự điền tên đã lưu trên máy này
                    // cho đúng My ID vừa nhập (nếu có) để khách khỏi phải gõ lại.
                    if (!nickname.trim()) {
                      const saved = loadLocalNickname(next);
                      if (saved) setNickname(saved);
                    }
                  }}
                  placeholder="VD: 3630821671476852507"
                  className={`field-important w-full font-mono-num border-2 rounded-xl px-3.5 py-2.5 text-base sm:text-sm outline-none transition-all placeholder:text-[11px] placeholder:text-muted/60 ${
                    groupLinkOpened
                      ? "bg-surface border-highlight/30 focus:border-highlight opacity-100"
                      : "bg-surface/70 border-border opacity-60 focus:border-highlight focus:opacity-100"
                  }`}
                />
                <p className="text-[11px] text-[#c1626b] font-semibold mt-1.5 leading-snug flex items-start gap-1">
                  <span>⚠️</span>
                  <span>
                    Lưu ý: Nhập đúng My ID bot gửi cho bạn trong nhóm Zalo để ghi nhận đơn hàng
                    và ví tiền!
                  </span>
                </p>
              </div>

              {error && (
                <p className="text-sm font-bold text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-blink-green w-full bg-[#1fae66] hover:bg-[#22c55e] text-white font-extrabold rounded-xl py-3 text-base tracking-wide shadow-lg shadow-[#1fae66]/50 transition-all disabled:opacity-60 cursor-pointer mt-2 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  "Đăng nhập"
                )}
              </button>

              {/* Liên hệ hỗ trợ */}
              <div className="text-center pt-1 space-y-1">
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
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Thông báo đăng nhập thành công */}
      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 animate-[fade-in_0.2s_ease-out]">
          <div className="bg-panel border border-border rounded-3xl shadow-2xl px-8 py-8 w-full max-w-xs text-center animate-[pop-in_0.3s_ease-out]">
            <CheckBadge />
            <p className="font-display font-bold text-lg mt-4 text-highlight">
              Đăng nhập thành công!
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ring-draw { to { stroke-dashoffset: 0; } }
        @keyframes tick-draw { to { stroke-dashoffset: 0; } }
        @keyframes pop-in {
          0% { opacity: 0; transform: scale(0.85); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
    </main>
  );
}
