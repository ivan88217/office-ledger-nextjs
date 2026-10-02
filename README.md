# OfficeLedger Next.js

使用 Next.js App Router 重做的 OfficeLedger 版本。

## 指令

```bash
bun install
bun run dev
```

## 環境變數

複製 `.env.example` 為 `.env`，並設定：

- `DATABASE_URL`
- `SESSION_COOKIE_NAME`（可選）
- `GOOGLE_APPLICATION_CREDENTIALS`：專案自己的 credentials 副本，例如 `./.credentials/gcs.json`。
- `GCS_BUCKET`：活動圖片的 GCS bucket，例如 `everbot-office-ledger`。

## 活動圖片

付款人可在活動頁上傳、拖曳及刪除多張圖片，其他登入同事只能查看與放大。
結單、結算後仍可補上菜單或收據，圖片異動不影響帳務。
支援 JPEG、PNG、WebP，每張最多 10 MB、每活動最多 20 張；上傳後轉為最長邊 4096 px 的 WebP，去除檔案附帶的 metadata。
手機 HEIC 照片及 PDF 請先轉成支援的圖片格式。

### 儲存設定

將 credentials 複製到本專案的 `.credentials/gcs.json`，目錄權限設為 `0700`、檔案權限設為 `0600`。
設定 `.env` 指向副本，不直接引用其他專案的 credentials 路徑。
`.credentials/` 已由 Git 與 Docker build 排除；Compose 將副本唯讀掛載到容器內的 `/app/.credentials/gcs.json`，不打包進 image。
執行服務的帳號需要能讀取該副本。

GCS 身分須具備 bucket 內物件的建立、讀取與刪除權限。
保持 bucket 私有，建議啟用 Uniform bucket-level access 與 Public access prevention；圖片透過每次檢查登入的同源 API 提供，不需要公開 bucket 或設定瀏覽器 CORS。
新 collection 與索引可使用 `bun run db:push` 建立；既有活動不需回填圖片。
MongoDB 需要 replica set，與既有帳務交易的前提相同。

### 清理失敗檔案

刪除圖片時會先讓圖片不再可見，再刪除 GCS 物件。
若 GCS 暫時無法使用，DELETING 記錄會保留；上傳中的 PENDING 記錄也保留物件資訊。
執行 `bun run storage:cleanup` 可重試清理待刪物件，以及超過一小時未完成的上傳。
每次最多處理 100 筆，仍有待清理記錄時會回傳非零狀態，排程可定期執行相同命令。
