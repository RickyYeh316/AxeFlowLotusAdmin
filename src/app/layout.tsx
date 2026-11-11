import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lotus Admin - 建豐車行後台管理系統",
  description: "建豐車行後台管理介面 - 同步即時派車、司機、乘客、訂單及行銷優惠管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body>
        {children}
      </body>
    </html>
  );
}
