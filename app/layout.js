import { Be_Vietnam_Pro, Inter, IBM_Plex_Mono, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import AddToHomeScreenModal from "./components/AddToHomeScreenModal";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-display",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-elegant",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  style: ["italic", "normal"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Hoàn Tiền Vy Tô 🌷",
  description:
    "Đăng nhập bằng My ID, chuyển link Shopee gắn sub_id, tra cứu đơn hàng và ví tiền hoàn về.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${inter.variable} ${plexMono.variable} ${cormorant.variable} h-full`}
    >
      <body className="min-h-full font-body antialiased">
        <AddToHomeScreenModal />
        {children}
      </body>
    </html>
  );
}
