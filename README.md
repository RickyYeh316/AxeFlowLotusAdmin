# LotusAH — Web 管理介面

## 訂單列表司機／搜尋 hotfix

列表完成單沿既有 ORDER_DETAIL 管理員 API，讀與詳情相同的 USER 終態卡姓名／車牌，無卡時沿 API 的原單 fallback；其他狀態仍讀原單。快照最多四筆並行，依訂單／乘客／updatedAt 版本快取；換帳號／離頁／較新快照忽略舊結果，重新整理重讀。讀取失敗顯示明確警示與重試，不當作未提供。搜尋共用顯示姓名／車牌，乘客編號改部分比對並保留前導零，提示列明訂單編號、乘客姓名／編號、車牌、司機姓名、上車地／目的地。移除乘車類型下拉與篩選條件，四分類與子類維持。

## 訂單管理 v4 四分類

- 預設「服務中」：前往／抵達／載客，以及已承接／已確認預約，綠框 `#66B292`。
- 「待處理」：待承接預約、等待派車、媒合中、媒合失敗／司機中止／乘客未出現等待乘客決定，黃框 `#D6B35C`。
- 「已結束」：只含完成／乘客取消，紅框 `#C47B8B`；「全部」中性灰，未知狀態保留於全部並標示待確認。依整張訂單分類，與司機本人參與是否結束分開。
- 分類按鈕顯示各類總筆數（搜尋篩選前），標題顯示目前符合條件筆數；選取以分類實色底／深色文字，其餘細框。資料列保留具體狀態文字，同步黃綠紅框；預約讀既有 reservationState，不增加後端狀態。
- 重新整理重建原 orders／users 監聽，保留分類、子類、搜尋與排序；筆數縮減時頁碼回到有效範圍。沿 loggedFirestore／data-syslog 記錄監聽結果與控制項，關閉後舊回應忽略。第二列已依 hotfix 移除乘車類型，保留搜尋。
- Next 正式 build、隔離 Chrome 狀態矩陣／框色／搜尋／分頁／刷新／sysLog 及 v3 詳情、地圖、對話、權限回歸通過；發布狀態見最新交接；v4.5 外觀及列表司機／搜尋 hotfix 已由 Ready 確認。

## 11/14 訂單管理 v3

- 時間下方特性標籤：即時淡藍／預約淡紫／優惠券淡金／敬老服務淡綠。操作欄只留「看詳細」，移除原完成／取消／刪除直寫處理。
- `OrderDetail.tsx` 使用原生置中 dialog 與同源 iframe；桌面直式卡片、窄視窗滿版。保留原列表篩選／頁碼／位置，關閉恢復焦點；登入身分變更即關閉，晚到回應丟棄。
- `public/passenger-order/` 沿乘客原始 `order-card / order-map / order-chat / presentation` 與 CSS。卡片框線、排列、小地圖→行程軌跡、分司機對話與較早訊息一致。歷史卡顯示「重新叫車」並 disabled，進行中不出現；對話只查閱、不送出、不改乘客已讀。
- 乘客共用資產來源為 FBase Lotus；使用 `node scripts/sync-passenger-order.cjs <FBase Lotus path>` 逐字同步，`shared/manifest.json` 保存 SHA256。副本勿單改。iframe 只傳白名單唯讀請求，parent 強制綁原 orderId，Firebase token 不送進 iframe；Map key 沿 AH 公開設定。
- 詳情使用 `webAdmin.ORDER_DETAIL` 的乘客卡白名單，完單司機來自終態快照；列表仍直接讀 orders，列表歷史姓名缺值另待接線。詳情於開啟／重試時取得，地圖及對話依原流程更新；關閉重開可重新取得訂單卡。
- 重要開關／地圖／對話與 API 結果沿三端 sysLog，僅白名單識別，不記訊息內容。`tests/passenger-number.browser.cjs` 使用實際元件／iframe／共用資產，Auth、HTTP、Maps 為隔離替身；驗卡片／停用重叫車／軌跡分段／對話分頁與 XSS／返回位置／列表頁碼／失敗重試／身分切換及 390px。
- v3 正式建置與 Chrome fixture 通過，實際發布與真人結果見 root 交接。

## 11/13 NPC 退場（已部署回讀，待真人驗收）

移除 MarketingManager 發券名單的 isNPC 分流及資料型別欄位；沿既有 ACTIVE／LINE 資格、乘客外碼、內碼交易、券管理與 sysLog。production build 與發券 Chrome fixture 通過。本輪 build-2026-11-13-007 已 READY／SUCCEEDED／100% 流量；22 來源檔逐字核對，8 線上資產正常；完整跨端退場範圍及正式入口保留見 Lotus root「NPC退場與正式入口保留.md」。

## 11/13 三端sysLog（v2已部署回讀）

現行build-2026-11-13-007（syslog-v3p1-20261113），READY／rollout SUCCEEDED且100%流量；線上8資產及22來源檔已核對。v2實單閉環／v3真實上報沿root既有證據，v3p1兩項競態已通過本機Chrome回歸，真人案例待驗；customer backend與GitHub codebase設定保持。

`src/lib/systemLogs/client.ts`綁Firebase UID及作用中頁籤；`browser-core.js`與FBase `public/shared/system-log.js`保持逐字相同，使用IndexedDB、身分隔離、批次／重要事件上傳。`adminApi`與`loggedFirestore`接現有請求／結果／錯誤及監聽，僅白名單識別／狀態，不收集姓名、聊天、輸入內容或憑證。Firestore狀態按變更去重，既有交易及操作參數保持。

新功能須檢查共用層覆蓋並補語意事件。修改Web核心後同步FBase原檔及本副本，跑`tests/browser/system-log.cjs`（FBase）；本端`tests/passenger-number.browser.cjs`同時驗證實際登入與Firestore事件進入上傳管線。完整需求、保存／權限、Agent查詢、部署與人工驗收狀態見Lotus root功能說明／交接，不另建操作Log UI。

## 11/13 乘客外顯編號

- 乘客列表／排序／搜尋、訂單乘客資訊／搜尋、手動叫車乘客選單、發券選單／確認，以及優惠券結帳的乘客欄／搜尋，使用`passengerNumber`外顯字串；不在畫面顯示乘客內碼。
- `src/lib/passengerNumber.ts`接受6～8碼、保留前導零，缺值或錯型別顯示「—」；編號搜尋採完整字串相等，姓名／電話等既有搜尋維持。
- React key、option value、API payload、訂單及券關聯繼續使用內碼。訂單沿既有users監聽查表；發券USERS與COUPON_LEDGER由webAdmin追加唯讀passengerNumber，沿原會員讀取，不新增查詢或修改帳務。
- Next.js16.2.12正式build與三套Chrome fixture通過：`tests/passenger-number.browser.cjs`、`coupon-manager.browser.cjs`、`coupon-settlement.browser.cjs`；後端22項Emulator通過。前導零／六七八碼精確搜尋／缺號／內碼操作保持均有驗證。測試資料隔離，未代操作正式發券／派車／結帳。
- 發布與人工確認狀態見Lotus root交接及11/13日誌。


## 11/12 優惠券結帳

- `src/components/CouponSettlementManager.tsx`：新側邊選單／tab「優惠券結帳」，整體沿優惠券管理；分類及搜尋重用訂單管理既有CSS。預設未結帳，七欄包含結帳時間；可依司機／乘客／券名／訂單編號搜尋，使用時間預設新到舊。
- 讀完後端全部帳本分段才顯示完整合計，畫面每頁10筆。司機姓名／車牌搜尋後必須點候選人，唯有單一司機＋未結帳＋有待結款才啟用右上結帳。乘客查詢及已結帳／全部唯讀。右上結帳按鈕停用時採灰底灰字、無光暈與hover位移，啟用維持紫色；CSS限定.checkout-action，不改其他主按鈕或資格判斷；此小修19:12:05已發布build-2026-11-12-002，正式build／既有Chrome回歸與線上回讀通過。
- `COUPON_CHECKOUT_PREVIEW`核對整批總額與張數，確認框付現後送`COUPON_CHECKOUT`。批次版本變動由後端拒絕；原operationId與review保存在本人sessionStorage，回應不明時保留並只允許重試，重整不自動送出。登入切換隔離晚回覆。
- 時間沿既有batch.settledAt，顯示台灣年月日時分秒；未結帳標示未結帳。AOS進頁一次讀取保持，退出再進才更新。
- 以Node22執行`node tests/coupon-settlement.browser.cjs`，使用實際元件／adminApi／建置CSS與隔離Auth／HTTP fixture、headless Chrome；驗證搜尋、完整合計、同名司機、資格、預覽變動、重載回放、拒絕、時間、390px確認框及登入隔離。另執行原`tests/coupon-manager.browser.cjs`回歸。
- 11/12正式build及上述兩套Chrome fixture通過，桌面與390px截圖已目視。11/12 webadmin-00009-rol及AH build-2026-11-12-001已部署，ACTIVE／100%流量、8個線上資產與HTTP門禁回讀通過；Ready真人驗收待進行，未操作正式結帳資料。


本 repo 在 VSC Workspace 的名稱為 **FBase LotusAH**，簡稱 **AH**，實際位置依目前 Workspace 的同名 folder path 解析。

新對話先讀 [AGENTS](AGENTS.md)，再接共同 root 的規則與交接。

## 工作區版面

所有頁面共用頂部分頁列，重複頁名及固定連線狀態列已移除。tabs保持完整高度，超出寬度可水平捲動；長列表只在下方內容區捲動，關閉分頁的44px點擊區保持。實作位於`src/app/page.tsx`及`src/app/globals.css`。

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
- Type2每模板只全發一次；僅有效正式乘客，開始後新戶不補發。發券由後端分批執行，關頁仍繼續；畫面每5秒更新發送／略過數，FAILED可重試同一工作。Type2／3發券可勾選「通知乘客」（預設勾），下方顯示後端產生的實際訊息；取消勾選收起預覽。配券成功後通知，失敗不補送；連結導到本人「我的優惠券」。發布／真人驗收見root交接。
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

11/13 sysLog已發布：`build-2026-11-13-001` READY／rollout SUCCEEDED／100%流量，22個src發布來源與本機一致。本人瀏覽器既有登入、開頁／切頁已產生READY日誌與Storage JSONL，Agent依訂單查詢及digest通過。完整證據與其他端待驗見root當日日誌及三端系統日誌功能說明。

11/13 sysLog v2：共用browser core改60秒／100筆、2秒合併／15秒最小間隔、80%配額節流及健康輪詢摘要；adminApi記錄HTTP分類、後端code與耗時，主要訂單／發券／結帳操作補固定識別。正式build及最終tsc通過，v2已部署回讀；發布須先更新FBase接收端白名單。

11/13 #365469後續調查：三端v2上報與新單交易閉環已由Agent核對；LIFF回前景／完單畫面延遲證據已補齊；操作識別與多listener來源補強已由v3完成。完整數量、證據與界線集中於Lotus root三端系統日誌功能說明及11/13日誌；本輪未修改產品或部署。


11/13 v3本機驗證、部署及線上回讀完成：Web `syslog-v3-20261113`、AOS `.syslog3`，批次schemaVersion仍1。追加layer／listenerId／initial／changeType／eventId、子頁識別、待傳與上傳失敗恢復狀態；API optional reason與派車sys_logs.dispatchDecision。先發uploadSystemLogs／driverAction／passengerAction／dispatchTask／npcDispatchConsole，再發Hosting／AH／AOS。共用browser core須逐字相同。查詢CLIENT_TIME_OUTSIDE_WINDOW現列warnings；gaps只表完整性問題。規格、範圍及部署回讀以Lotus root系統日誌功能說明／當日日誌為準。

最終發布：uploadSystemLogs `uploadsystemlogs-00004-tez`、Hosting `e89c024b9bf6519c`、AH `build-2026-11-13-004`；AOS `.syslog3` 已保留資料安裝。每筆新事件保存details.clientVersion，query另回eventVersion；舊事件缺欄位為null，批次version只表示封批版本。接收端與AH來源封包、Hosting11個資源回讀相同；v3正式新單與離線／背景長時運轉待驗。


11/13 review P2修正（已測試及部署回讀）：LIFF／AH共用browser core保留優先待送至對應事件ACK，busy／退避／配額期間續排；舊帳號ACK只更新原批次與配額，診斷新增前核對owner。兩Web版本`syslog-v3p1-20261113`，核心逐字一致。13項針對性Node及Chrome／IndexedDB競態回歸通過；AH production build／TypeScript通過，證據見root當日日誌。18:47 Hosting `165f4da74f6925ea`發布，18:50 AH `build-2026-11-13-005` READY／SUCCEEDED／100%流量；Hosting11資源、AH22來源檔逐字一致，8個AH線上資源HTTP200且含新版標識。AOS／FF／Rules／訂單交易保持，真人競態案例待驗。

### 訂單 v4.5 子類篩選

v4.5：選中的大類右側顯示唯一子選單，不顯示「子類」文字標籤；選單框色隨綠／黃／紅／灰分類，與按鈕成組換行。切換大類回全部狀態、重新整理保留子類；子類顯示分類內筆數（搜尋前），與搜尋條件取交集並回第一頁。依現有 status／reservationState 本機篩選，不增加 Firestore 查詢；未知狀態及預約缺值可選待確認細項。選擇透過既有 sysLog 記錄 order.subcategory 與非個資 key。
驗證沿 `tests/passenger-number.browser.cjs`，正式發布與人工驗收見 root 最新交接。

### 訂單 v5.2

v5.2：管理詳情底部改「訂單歷程」，由既有 orders.eventHistory 投影文案與事件時間，依時間由舊到新排列，同時間保留原陣列順序；拒絕／派送／重派逐次顯示，不合併。涵蓋即時與預約事件；缺下單、缺時間或未知事件明示資料不完整，不回填推測。管理端移除底部乘客口吻摘要，乘客共用原卡與交易維持。列表新增訂單編號／目的地升降冪，排序後回第一頁，沿既有 sysLog 記錄。
詳情捲動 hotfix：管理端 iframe 的 body 為整張卡片的捲動容器，顯示垂直捲軸；標題／關閉固定，背景列表保持原位。對話開啟時鎖住卡片捲動，返回保留位置；乘客共用資產維持逐字一致。
歷程資料由管理員 ORDER_DETAIL 回傳 history；共用乘客資產保持逐字一致，管理外層 viewer 呈現擴充。驗證及發布見 root 最新交接。

訂單歷程車牌：管理 viewer 在事件文字後顯示 `history.events[].carPlate`；缺值／空白維持原文，採 textContent 呈現；車牌沿用卡片既有 taxi-plate 白底紅字樣式。管理 iframe 入口及 viewer JS／CSS 使用同版 query token，更新三者時一併換版，避免等長 public 資產在固定檔案時間下重用舊快取。來源為事件當時快照，不使用卡片最後司機補值；乘客共用資產保持。發布及驗證狀態見 root 交接。
