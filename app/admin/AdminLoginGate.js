"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Sai mật khẩu admin.");
        setLoading(false);
        return;
      }
      // Đăng nhập xong → nạp lại trang /admin (server component) để nó
      // đọc cookie mới và render luôn bảng đơn hàng, vẫn ở cùng 1 trang.
      router.refresh();
    } catch {
      setError("Không kết nối được tới server, thử lại nhé.");
      setLoading(false);
    }
  }

  return (
    <main className="admin-green min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-panel border border-border rounded-2xl p-7 shadow-xl shadow-black/10"
      >
        <h1 className="font-display text-xl font-bold text-cream mb-1">Trang Admin</h1>
        <p className="text-muted text-sm mb-6">Nhập mật khẩu admin để xem danh sách đơn hàng.</p>

        <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
          Mật khẩu
        </label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-cream placeholder:text-muted/60 outline-none focus:border-gold transition-colors"
        />

        {error && <p className="text-danger text-sm mt-3">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full mt-5 rounded-xl py-3 font-bold text-ink bg-gold hover:bg-gold-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
        >
          {loading ? "Đang kiểm tra..." : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
