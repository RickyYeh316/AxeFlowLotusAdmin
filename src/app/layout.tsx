import type { Metadata } from "next";
import "./globals.css";
import "../../public/passenger-order/shared/order-map.css";
import "./queue.css";
import {CommonToastProvider} from "../components/CommonToast";

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
        <CommonToastProvider>{children}</CommonToastProvider>
      </body>
    </html>
  );
}
