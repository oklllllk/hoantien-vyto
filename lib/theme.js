// Danh sách giao diện màu người dùng có thể chọn ở trang đăng nhập.
// Lựa chọn được lưu vào localStorage và áp dụng cho cả trang đăng nhập
// lẫn dashboard để đồng bộ trải nghiệm sau khi đăng nhập.

export const THEME_STORAGE_KEY = "hv_theme";

// 7 màu cầu vồng (Đỏ - Cam - Vàng - Lục - Lam - Chàm - Tím) để khách tự chọn giao diện.
export const THEMES = [
  { id: "red", label: "Đỏ", swatch: "#e0524f" },
  { id: "orange", label: "Cam", swatch: "#f0a35f" },
  { id: "yellow", label: "Vàng", swatch: "#e7c34d" },
  { id: "green", label: "Lục", swatch: "#5cb85c" },
  { id: "blue", label: "Lam", swatch: "#5fa8e0" },
  { id: "indigo", label: "Chàm", swatch: "#5c6bc0" },
  { id: "purple", label: "Tím", swatch: "#a97fd1" },
];

export const DEFAULT_THEME = "purple";

export function getStoredTheme() {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    // localStorage có thể bị chặn (chế độ ẩn danh...) — dùng mặc định.
  }
  return DEFAULT_THEME;
}

export function setStoredTheme(themeId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // bỏ qua nếu không ghi được
  }
}
