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

AH 既有畫面與讀寫流程已於 11/11 初步盤點；登入門禁、正式狀態與交易接線仍待分批對齊。既有 H `/ops/` 保留，入口切換方式另定。詳見 `<Lotus root>/02_現行定義/webAdmin規劃.md`。

## 本端程式入口

- `src/app/page.tsx`：頁面入口；`src/app/layout.tsx`、`globals.css`：版面與樣式。
- `src/components/`：登入、管理與地圖等元件；依任務查閱相關實作。
- `src/firebase/config.ts`：本端 Firebase 設定入口。
- `src/types/index.ts`：本端型別；跨端契約仍須對照 FBase Lotus 與共同定義。
- `apphosting.yaml`：既有建置環境與執行資源設定；`firebase.json`：本機 source 部署到既有管理 backend。`.gitlab-ci.yml` 的 CI 執行狀態另行查核。
- `package.json`、`package-lock.json`：依賴版本與執行命令來源。

## 優惠券管理（11/11）

- `MarketingManager.tsx`：新增優惠券草稿、草稿編輯／刪除、Type1設定與啟停、Type3指定乘客發券、目前／歷史列表；Type2全體發券確認、背景進度輪詢與中斷重試。
- `src/lib/adminApi.ts`：Google Firebase token呼叫asia-east1的webAdmin；固定AH Origin由後端允許。券模板不再由Client寫Firestore，規則／交易請對照FBase Lotus functions/src/admin／coupons README。
- Type2每模板只全發一次；僅有效正式乘客，開始後新戶不補發。發券由後端分批執行，關頁仍繼續；畫面每5秒更新發送／略過數，FAILED可重試同一工作。LINE通知已定案待下一批實作，見root business/COUPONS.md。
- 每次mutation保留operationId與完整請求於sessionStorage；連線結果待確認時鎖定其他異動，可重試原操作，重整／換頁仍可恢復。不要手動清除待確認操作後重發券。
- 依賴與正式建置完成後，以Node22執行`node tests/coupon-manager.browser.cjs`；真實headless Chrome使用隔離Auth／HTTP fixture、實際元件／API模組及建置CSS，測草稿、連發、回應遺失重送、歷史分類、長名稱、窄螢幕與登出晚回覆。輸出及截圖存於/private/tmp，不操作正式資料。

## 本機開發與驗證

本端採 Next.js／React／TypeScript。依賴就緒後，於本 repo 執行：

| 命令 | 用途 |
|---|---|
| `npm run dev` | 啟動本機開發服務，通常為 `http://localhost:3000`；實際網址看終端輸出 |
| `npm run lint` | ESLint 檢查 |
| `npm run build` | Next.js 建置 |
| `npm run start` | 啟動已建置的應用程式 |

11/11 使用 lockfile 執行 `npm ci`，並以 `apphosting.yaml` 的 BUILD 公開設定注入程序環境後，`npm run build`（Next.js 16.2.12／TypeScript）通過。一般 shell 預設 Node 14 過舊，本次使用已安裝 Node 22.11.0；npm 對 eslint-visitor-keys 的 Node 版本有警告，未執行或宣稱 lint 通過。環境設定勿存入版控；部署與雲端資料操作依 Ready 當次授權，Git 寫入一律由 Ready 處理。

## 本機 source 部署入口

- Firebase project：`axeflowlotus-6dc3b`；region：`asia-east1`；backend：`axeflow-lotus-admin`。
- 管理端網址：https://axeflow-lotus-admin--axeflowlotus-6dc3b.asia-east1.hosted.app
- `firebase.json` 僅列管理 backend，排除 node_modules、.next、.git、環境檔與部署 log；`alwaysDeployFromSource` 表示以本機內容發布。
- 經 Ready 授權後，於本 repo 執行：`firebase deploy --only apphosting:axeflow-lotus-admin --project axeflowlotus-6dc3b --non-interactive`。
- 既有 GitHub main 連結與 rollout policy 保留；後續遠端更新可能發布該來源版本，本機修改仍由 Ready 自行提交與同步。
- 此命令只指定 AH 管理端。發布後核對 build／rollout、100% 流量與線上資產；最新結果見共同 root 的交接及當日日誌。

共同文件回 root 維護，過去工作日誌與封存附件唯讀。
