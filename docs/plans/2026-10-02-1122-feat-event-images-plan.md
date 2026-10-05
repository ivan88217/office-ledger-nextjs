---
title: 活動圖片 - Plan
type: feat
date: 2026-10-02
topic: event-images
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# 活動圖片 - Plan

## Goal Capsule

- Objective: 同事能在活動內查看菜單與收據，不必另外翻找 LINE 訊息。
- Product authority: 本文件的 Product Contract 與使用者於 2026-10-02 確認的多圖、付款人管理及結算後可補圖需求。
- Open blockers: 無；儲存存取與上傳限制等技術問題列於 Deferred to Planning。

---

## Product Contract

### Summary

在活動內加入可保存多張圖片的功能，涵蓋菜單、收據及其他活動相關圖片。
圖片管理與帳務結算分開，付款人可在結算後補上憑證。

### Problem Frame

目前使用者需要將菜單另外貼到 LINE，點餐資訊與活動記錄分散在兩個地方。
除了菜單，使用者也希望保存收據，因此圖片用途不能綁定成單一菜單欄位。

### Key Decisions

- **以活動圖片承載多種用途。** Governs R1, R2. (session-settled: user-directed — chosen over one replaceable menu image: an event may contain multiple images and receipts)
- **付款人統一管理。** Governs R5, R6. (session-settled: user-directed — chosen over uploads by all signed-in colleagues: the user selected payer-only image management)
- **圖片管理不隨結算鎖定。** Governs R7, R8. (session-settled: user-directed — chosen over locking images after finalization: the user selected continued uploads and deletion for later receipts)
- **沿用使用者提供的 GCS。** Governs R11, R12；bucket 存取能力尚待確認。

### Requirements

**保存與閱讀**

- R1. 同一活動可保存多張圖片，新增圖片不覆蓋既有圖片。
- R2. 圖片可用於菜單、收據或其他活動相關內容，不要求上傳時分類。
- R3. 所有可查看活動的登入同事都能查看該活動的圖片。
- R4. 圖片可放大閱讀，手機與桌面均能清楚查看內容。

**管理與活動狀態**

- R5. 僅該活動的目前付款人可上傳或刪除圖片。
- R6. 權限必須在實際操作時檢查，非付款人不能透過直接呼叫繞過限制。
- R7. 收單中、已結單及已結算的活動皆適用 R5 的圖片管理權限。
- R8. 圖片異動不改變品項、結單狀態、結算金額或正式交易內容。
- R9. 刪除圖片前要求確認，成功後該圖片不再出現在活動中。

**上傳結果與儲存**

- R10. 上傳須提供處理中、成功或失敗狀態，失敗時保留既有圖片並讓使用者重試。
- R11. 圖片保存於 GCS bucket `everbot-office-ledger`，重新整理或重新登入後仍可查看。
- R12. 專案使用由提供來源複製的 credentials 副本，不將來源專案的絕對路徑作為應用程式執行時設定。
- R13. credentials 不得被 Git 追蹤、放入可公開下載的檔案或傳送給瀏覽器。
- R14. 未登入者不能取得活動圖片內容。
- R15. 上傳入口清楚標示支援格式與限制，拒絕不支援的檔案時不破壞既有圖片。
- R16. 刪除活動後不再提供其圖片內容，並清理相應的儲存檔案。
- R17. 付款人可在活動頁以 ⌘V／Ctrl+V 貼上剪貼簿圖片，不需先存成檔案；沿用上傳限制、權限與結果提示，文字編輯區仍保留原本的貼上行為。

### Key Flows

- F1. **付款人新增圖片。** 付款人開啟已建立的活動、選擇圖片並上傳；依 R10 顯示結果，成功後依 R1、R11 保留圖片。
- F2. **同事查看圖片。** 登入同事進入活動，依 R3、R4 閱讀菜單或收據，再繼續既有點餐或查帳流程。
- F3. **結算後補收據。** 付款人進入已結算活動並新增收據圖片；依 R7、R8 保存圖片而不變更帳務。
- F4. **付款人刪除圖片。** 付款人選擇要刪除的圖片，依 R9 確認後移除。

圖片閱讀入口位於活動詳情內；一般同事有查看與放大入口，付款人另外有上傳與刪除入口。
手機與桌面沿用既有活動頁面的使用方式，具體位置留給實作規劃。

### Acceptance Examples

- AE1. **Covers R1, R2, R11.** 活動已有一張菜單時再新增第二張圖片；重新整理後可查看兩張，原圖未被覆蓋。
- AE2. **Covers R3, R5, R6.** 非付款人登入後可閱讀圖片，但透過介面或直接呼叫嘗試上傳、刪除都不能成功。
- AE3. **Covers R7, R8.** 付款人在已結單或已結算活動補上收據；圖片可查看，品項、金額與正式交易保持原狀。
- AE4. **Covers R9.** 付款人取消刪除確認時圖片仍保留；確認且刪除成功後，重新整理也不再顯示。
- AE5. **Covers R10, R15.** 檔案不受支援或上傳途中失敗時顯示失敗結果，活動既有圖片仍可閱讀，且可重試。
- AE6. **Covers R12, R13.** 應用程式不需來源專案的 credentials 路徑即可使用專案副本；Git 與瀏覽器取得的內容不包含 credentials。
- AE7. **Covers R14.** 未登入者即使知道圖片識別資訊，也不能取得圖片內容。
- AE8. **Covers R16.** 依既有規則刪除活動後，原活動與圖片入口不再可用，相應儲存檔案納入清理。
- AE9. **Covers R17.** 付款人複製截圖後直接貼上，圖片新增到活動；非付款人無法藉貼上上傳，編輯活動名稱時貼上文字仍輸入該欄位。

### Scope Boundaries

- 本次只處理已建立活動中的圖片，不新增其他帳務頁面的附件功能。
- PDF、文字辨識、自動擷取菜單品項或收據金額暫不納入。
- 圖片分類、標註、裁切、排序及歷史版本暫不納入。
- 不改變既有活動、收單或結算的權限規則。

### Dependencies / Assumptions

- 已建立本機 credentials 副本 `.credentials/gcs.json`；檔案權限為 `0600`，目錄權限為 `0700`，`.gitignore` 排除 `.credentials/`。
- 副本與來源內容一致；已以該副本驗證真實 GCS 物件建立、讀取、刪除，且匿名讀取測試物件回應 403。
- GCS 與正式部署環境須符合 R11 至 R14；不得把本機路徑直接當成容器內可用路徑。
- 第一版沿用目前登入同事可查看活動的模式，不新增活動成員或公開分享權限。

### Outstanding Questions

**Resolve Before Planning**

無。

**Deferred to Planning**

技術選擇已記錄於 Planning Contract；實際 bucket 權限與環境可用性於驗證時確認。

### Sources / Research（規劃時的既有狀態）

- `prisma/schema.prisma:93`：目前 DiningEvent 保存付款人、狀態與品項，尚無活動圖片資料。
- `src/features/auth/auth.service.ts:178`：活動詳情要求登入，未限定為已加入品項的參與者。
- `src/features/auth/auth.service.ts:581`：活動刪除由付款人執行，已結算活動不能刪除。
- `src/app/events/[eventId]/page-client.tsx`：既有活動頁有自動儲存與結算狀態，新增圖片必須遵守 R8。
- `docker-compose.yaml`：目前容器讀取 `.env`，尚無 credentials 掛載設定。

---

## Planning Contract

### Key Technical Decisions

- KTD1. 圖片 metadata 使用獨立的 `DiningEventImage` collection，狀態為 PENDING、READY、DELETING，GCS object key 僅由後端產生。支援 R1、R10、R16；刪除失敗保留 DELETING 記錄供清理重試，`cleanupAfter` 避免活動刪除時先移除仍在上傳的檔案記錄。
- KTD2. `DiningEvent.imageMutationToken` 為圖片交易的鎖定欄位；交易內更新 token 並保留原 `updatedAt`，避免改變餐點的 optimistic concurrency 版本。上傳完成與刪除都重新檢查目前付款人，並與活動刪除共用交易鎖。支援 R5 至 R8。
- KTD3. 使用 Next.js Route Handlers 接收 multipart 圖片，每次請求一張，介面可多選並逐張上傳，失敗檔案可重試。請求 body 以串流讀取並限制大小，寫入前驗證登入、付款人與 Origin。支援 R6、R10、R15。
- KTD4. 支援 JPEG、PNG、WebP；每張輸入與處理後檔案最多 10 MiB，每活動最多 20 張。以 sharp 解碼並轉成無損 WebP，保留原始解析度、方向與比例，不縮圖或使用有損壓縮，拒絕超過 4000 萬像素的圖片。2026-10-05 依菜單文字清晰度需求取消第一版的 4096 px 縮圖及有損 WebP 設定；既有圖片需重新上傳原檔。支援 R4、R15。
- KTD5. 圖片由同源、每次驗證登入的 API 讀取，回應 `Cache-Control: private, no-store` 與 `X-Content-Type-Options: nosniff`；不把 GCS 公開 URL 或 credentials 傳給前端。支援 R3、R13、R14。
- KTD6. 本機 `.env` 使用專案 credentials 副本；Compose 以唯讀方式掛載到容器固定位置。`.dockerignore` 排除 credentials、環境檔與 Git。支援 R12、R13。

### Local Delivery

使用者要求完成本機實作及驗證；不推送分支、不建立 PR、不部署。
沿用本次工作已建立的 credentials 副本，保留既有 `.gitignore` 修改與 Product Contract。

## Implementation Units

### U1. 圖片保存與權限

- Files: `prisma/schema.prisma`、`src/features/ledger/domain/event-images.ts`、`src/features/ledger/server/event-images.service.ts`、`src/lib/storage/gcs.ts`、圖片 API routes、`src/features/auth/auth.service.ts`。
- Dependencies: 無。
- Approach: 實作 KTD1 至 KTD5；PENDING 先保留容量與清理資訊，再上傳 GCS，成功後交易內切換 READY；失敗或活動已刪除時移除物件。刪除先隱藏 metadata，再清理 GCS，失敗留下可重試記錄。
- Covers: R1、R3、R5 至 R16；AE1 至 AE8。
- Verification: 檔案格式與大小、未登入與非付款人拒絕、結算後管理、並行付款人更換、交易不改 `updatedAt`、上傳失敗與清理失敗的 focused tests；有環境時驗證真實 GCS。

### U2. 活動圖片介面

- Files: `src/app/events/event-images.tsx`、對應 component tests、`src/app/events/[eventId]/page-client.tsx`。
- Dependencies: U1 的 API contract。
- Approach: 活動設定與品項之間顯示圖片卡片；手機兩欄、桌面三欄縮圖，點擊以 Dialog 放大。付款人可多選圖片、逐張查看結果及重試失敗檔案；刪除需確認。圖片資料自行讀取，避免刷新父層覆寫尚未儲存的品項。
- Covers: R2 至 R5、R7、R9、R10、R15；F1 至 F4。
- Verification: 非付款人沒有管理入口、已結算付款人可上傳、放大與刪除確認、多檔失敗後重試、手機及桌面畫面。

### U3. 環境與清理

- Files: `package.json`、`bun.lock`、`.env.example`、`.dockerignore`、`docker-compose.yaml`、`README.md`、`scripts/cleanup-event-images.ts`。
- Dependencies: U1。
- Approach: 加入 GCS、sharp 依賴及唯讀 credentials 掛載；清理命令重試 DELETING 與超過一小時的 PENDING。寫清本機與容器設定、MongoDB replica set 前提、支援格式與限制。
- Covers: R11 至 R16。
- Verification: Prisma generate、TypeScript、正式 build、Git 與 Docker 排除 credentials、GCS 讀寫刪除 round trip、清理重試。

## Verification Contract

- `bun run test`：既有餐點、結單、金額分攤與新圖片行為全部通過。
- `bunx tsc --noEmit`、`bun run db:generate`、`bun run build`、`git diff --check`：型別、生成、正式建置與格式檢查。
- 測試專用活動與圖片驗證 GCS 上傳、登入圖片讀取、刪除；測試資料完成後清除，不異動既有帳務。
- 以桌面及手機視窗檢查空白、多圖、上傳失敗、放大及管理權限；不可用的驗證需明確記錄限制。

## Definition of Done

- U1 至 U3 完成且其驗證有可核對結果。
- R1 至 R16 的行為由測試或實際操作驗證；無法執行的環境驗證明確揭露。
- credentials 只存在專案副本與容器唯讀掛載，不進入 Git、Docker image 或瀏覽器。
- 清除測試資料及棄用程式，完成簡化與程式 review，最後變更僅保留本機。

## Execution Receipt（2026-10-02）

- U1、U2、U3 已完成。依使用者 AGENTS.md，實作、簡化與 review 均由主執行緒依序進行，沒有獨立 reviewer。
- `bun run test`：13 個測試檔、83 項測試通過；新增 domain、service、HTTP 與 component 測試，既有餐點與結單測試保持通過。
- `bun run db:generate`、`bunx tsc --noEmit`、`bun run build`、Docker 正式建置、`git diff --check` 全部通過。
- 使用獨立 MongoDB 測試資料庫及真實 GCS，驗證匿名與非付款人拒絕寫入、登入同事讀圖、同時上傳、刪除圖片、結算後補收據，以及正式容器內的 sharp 與 credentials 掛載。圖片異動未改變品項、`updatedAt` 或正式交易金額。
- 活動刪除服務已在真實 MongoDB 與 GCS 驗證：活動、圖片 metadata 與 GCS 物件均被刪除。清理命令已實際移除逾期 PENDING 及其 GCS 物件。
- 桌面、390 px 手機視窗已檢查縮圖、放大、刪除確認與取消、非付款人入口、結算後上傳；手機無水平溢出，實際圖片已載入。
- R1、R2、R11 由多圖保存及重新載入驗證；R3、R5、R6、R14 由實際權限請求與介面驗證；R4、R9、R10、R15 由畫面及 component/HTTP/domain 測試驗證；R7、R8 由三種活動狀態測試及真實結算後上傳驗證；R12、R13 由 credentials 副本、權限、Git 排除、容器掛載及 image 不含 credentials 驗證；R16 由活動刪除與逾期清理驗證。
- Review 修正：上傳尚未完成時刪除活動，原清理流程可能提前遺失物件資訊；新增可重現失敗測試後，以 `cleanupAfter` lease 保留清理資訊。另涵蓋付款人途中更換、遲到列表覆蓋新圖片、未知錯誤不得洩露內部資料等情境。
- 直接確認 GCS 測試物件匿名讀取為 403；未查詢或修改 bucket IAM 設定。
- 測試資料庫、新增索引及 GCS 測試物件均已清除。既有帳務資料未異動；正式資料庫索引未套用，部署前按 README 執行 `bun run db:push`。
- 未部署、未推送分支、未建立 PR。沒有尚未處理的已確認程式缺陷。

### 後續補充：剪貼簿貼上（2026-10-02）

- 依使用者新增需求完成 R17；沿用 U2 上傳流程，透過 paste 事件取得圖片檔案，沒有新增後端入口或依賴。
- 新增 5 項 component 測試，涵蓋多圖貼上、付款人權限變更、文字編輯、不支援格式及離開頁面後移除事件；實作前兩項功能測試失敗，實作後整套 88 項測試通過。
- `bunx tsc --noEmit`、`git diff --check`、Docker 正式建置通過。本機 `bun run build` 與正在執行的同專案開發伺服器共用 `.next`，收集頁面時失敗；改由獨立 Docker build 完成正式建置驗證，保留既有開發伺服器。
- 在獨立 Chromium 瀏覽器使用真實剪貼簿 PNG 與原生貼上命令，確認 FormData 上傳並新增圖片；同時驗證輸入欄位文字貼上正常。該介面測試使用模擬圖片 API，未寫入帳務或 GCS。
- 完成主執行緒 review：沿用容量、格式與 busy guard；付款人變更或 unmount 會移除 listener；略過文字編輯區與對話框，不解析剪貼簿 HTML 或遠端圖片網址。
