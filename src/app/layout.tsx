import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lotus Admin - 蓮花出行後台管理系統",
  description: "蓮花出行後台管理介面 - 同步即時派車、司機、使用者、訂單及行銷優惠管理",
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
