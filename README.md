# LotusAH — Web 管理介面

本 repo 在 VSC Workspace 的名稱為 **FBase LotusAH**，簡稱 **AH**，實際位置依目前 Workspace 的同名 folder path 解析。

新對話先讀 [AGENTS](AGENTS.md)，再接共同 root 的規則與交接。

## 多端協作入口

下列各端與共同文件均由 Ready＋AI Agent 協作推進至商轉，客戶商務邏輯由 Ready 提供與確認。

| 名稱 | 定位方式 | 責任 |
|---|---|---|
| Lotus root | 目前 Workspace 的 `Lotus root` folder | 共同規則、現行定義、規劃與工作日誌 |
| FBase Lotus | 目前 Workspace 的 `FBase Lotus` folder | 現行 Functions／Firestore／Hosting，包含 LIFF 與 NPC 工具 |
| AOS Lotus | 目前 Workspace 的 `AOS Lotus` folder | Android 司機端 |
| FBase LotusAH | 目前 Workspace 的 `FBase LotusAH` folder | Web 管理介面；Ready＋AI Agent 延續原 Ricky 的 AH 開發到商轉 |

完整責任與接入狀態見 `<Lotus root>/02_現行定義/工程地圖.md`；下一步見 `<Lotus root>/01_目前重點/NEXT_SESSION_HANDOFF.md`。`<Lotus root>` 依 [AGENTS](AGENTS.md) 的 Workspace 定位規則解析，不是可直接點擊的 Markdown 變數連結。

原 Ricky 負責 AH Web 管理介面；現由 Ready＋AI Agent 延續開發到商轉。客戶商務邏輯由 Ready 提供與確認，Agent 將規則落成共同文件、程式與驗證；既有 AH 實作須對照共同定義與現行後端契約。LIFF 乘客端維持 H＋LINE Login。

AH 功能完成度、線上部署與實際接線仍須盤點；既有 H `/ops/` 保留，正式入口切換方式另定。詳見 `<Lotus root>/02_現行定義/webAdmin規劃.md`。

## 本端程式入口

- `src/app/page.tsx`：頁面入口；`src/app/layout.tsx`、`globals.css`：版面與樣式。
- `src/components/`：登入、管理與地圖等元件；依任務查閱相關實作。
- `src/firebase/config.ts`：本端 Firebase 設定入口。
- `src/types/index.ts`：本端型別；跨端契約仍須對照 FBase Lotus 與共同定義。
- `apphosting.yaml`、`.gitlab-ci.yml`：部署／CI 設定檔；檔案存在不作線上運作證據。
- `package.json`、`package-lock.json`：依賴版本與執行命令來源。

## 本機開發與驗證

本端採 Next.js／React／TypeScript。依賴就緒後，於本 repo 執行：

| 命令 | 用途 |
|---|---|
| `npm run dev` | 啟動本機開發服務，通常為 `http://localhost:3000`；實際網址看終端輸出 |
| `npm run lint` | ESLint 檢查 |
| `npm run build` | Next.js 建置 |
| `npm run start` | 啟動已建置的應用程式 |

以上是 package scripts，尚未在本輪文件整理中執行。依變更選擇驗證；不因閱讀文件而啟動服務或部署。部署與雲端資料操作依 Ready 當次授權，Git 寫入一律由 Ready 處理。

共同文件回 root 維護，過去工作日誌與封存附件唯讀。
