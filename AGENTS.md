# FBase LotusAH — Agent 入口

本端與 Lotus 其他端均由 Ready＋AI Agent 協作推進，依共同規格及當次授權執行。

共同文件唯一來源：目前 VSC Workspace 中名稱為 `Lotus root` 的 folder。

定位方式：使用本次會話提供的 Workspace folder 對照；若需讀取目前使用的 `.code-workspace`，以 `folders[]` 中 `name == "Lotus root"` 的 `path` 為準，相對 path 以該 workspace 檔所在目錄解析。下文 `<Lotus root>/...` 是解析後的路徑記法，不是 Markdown 自動變數或固定磁碟位置。若尚無 folder 對照或無法定位，明示限制並請使用者提供目前 workspace 檔位置／folder path；不猜測帳號、checkout 目錄或另一份 workspace。

## 閱讀順序

1. 先讀 `<Lotus root>/AGENTS.md` 與 `<Lotus root>/01_目前重點/NEXT_SESSION_HANDOFF.md`。
2. 按任務查 root `02_現行定義`；工程責任看 `工程地圖.md`，待辦看 `短中長期規劃.md`，專案位置看 `WORKSPACE_MAP.md`。
3. 需要近期完成與決策原因才讀當日日誌；共同文件無法讀取時明示限制，請 Ready 提供相關內容，不自行猜測。
4. 核對本 repo 的 Git 狀態與相關實作；只讀取當次任務需要的模組，不預載所有端。

## 本端定位與協作

- 本 repo 是 Web 管理介面的 App Hosting（AH），Workspace 名稱 `FBase LotusAH`；原由 Ricky 開發，2026-10-30 已改由 Ready＋AI Agent 接續開發到商轉。LIFF 乘客端維持 Firebase Hosting（H）＋LINE Login，對應 `FBase Lotus`。
- 客戶商務邏輯由 Ready 提供與確認，Agent 協助落成共同規格、程式與驗證。AH 既有程式是接續開發的基礎；與共同規格不一致或尚未定義之處，先向 Ready 收斂，不把舊實作直接當作客戶規則。跨端變更先對照實際讀寫端與後端契約，再依當次授權實作。
- 本機原始碼、部署設定、雲端實際運作與 Ready TEST PASS 分開確認；加入 Workspace 不等於已接入現行流程或取得部署授權。
- 共同規則、待辦、交接與工作日誌統一更新到 VSC Lotus root；本端 README 僅維護本端入口與開發說明，不另養共同 TODO 或複製整套規格。

## 本端開發

- 保留既有 Next.js／React／TypeScript 架構與命名，只修改當次授權範圍；實際版本與命令以 `package.json`、`package-lock.json` 為準。
- 修改 Next.js 相關程式時，查閱對應版本與本次功能的文件。若 `node_modules/next/dist/docs/` 存在可優先使用；不存在時查官方文件，不為唯讀分析或 MD 編修安裝依賴。
- 本端入口與檢查命令見 [README](README.md)。依變更選擇必要驗證；文件調整檢查連結、內容與 diff 即可。
- Git 全程僅唯讀，所有 Git 寫入由 Ready 處理。產品程式、部署與雲端資料操作依當次授權；保留既有異動，不做無關重構。
- 繁體中文回覆與 commit 文案；commit 文案不含引用標籤。實作、本機測試、部署回讀與使用者驗收分開報告。
