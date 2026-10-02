---
title: 活動說明欄位 - Plan
type: feat
date: 2026-10-02
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---
# 活動說明欄位 - Plan

## Goal Capsule

- Objective: 使用者能以簡短名稱辨識活動，並在活動內及分享文案中取得完整補充資訊。
- Means: 新增活動說明並接入現有活動儲存與分享流程（KTD1、KTD2）。
- Authority: 本次對話確認的需求與使用者指示優先。
- Execution: 本機完成實作、驗證與本機 commit；不推送分支、不建立 PR、不部署。
- Stop conditions: 遇到與既定行為衝突或需修改實際資料的不可逆操作時保留現況並回報。

## Product Contract

### Summary

建立與編輯活動時可填寫選填的多行活動說明，並隨活動文案一起分享。

### Problem Frame

使用者目前把補充說明放在活動標題，使標題過長、難以辨識。

### Requirements

- R1. 建立與編輯活動皆有「活動說明（選填）」欄位，支援純文字多行輸入。
- R2. 活動內顯示完整說明並保留換行，包含結單及結算後的唯讀顯示。
- R3. 複製文案依序包含名稱、說明、連結與結單時間，省略空白說明。
- R4. 說明的編輯權限、鎖定狀態及自動儲存沿用活動名稱目前規則。
- R5. 舊活動未填說明時仍可查看、編輯及分享，原標題由使用者手動整理。

### Key Decisions

- 分享包含說明，Governs R3。（session-settled: user-directed — chosen over 僅活動頁顯示: 分享群組時可直接取得完整資訊）

### Scope Boundaries

不增加富文字編輯器、活動列表的長說明預覽或歷史標題自動拆分。

## Planning Contract

### Key Technical Decisions

- KTD1. 在 Prisma MongoDB DiningEvent 新增 nullable description，詳情讀取以 null 兼容舊資料；建立與更新 action/service 傳遞此欄位，trim 邊界空白並保留內部換行。更新未提供欄位時保留既有說明，以相容目前呼叫端。Governs R1、R5。
- KTD2. 說明納入現有 eventSettingsSignature、buildPayload 與 server/local 同步，沿用 700ms debounce 及 expectedUpdatedAt 衝突檢查。Governs R4。
- KTD3. 使用原生 textarea 配合現有 Input 樣式，唯讀時仍保留 textarea 供閱讀與選取並保留換行。分享使用當前輸入的說明，清空時直接略過。Governs R1、R2、R3。

### Assumptions

此新增欄位為可選 MongoDB 文件欄位，無需批次改寫既有資料；執行時重新產生 Prisma client，不執行對外資料庫同步。

## Implementation Units

### U1. 儲存與讀取活動說明

- Goal: 活動說明可寫入並讀回，舊資料保持相容。
- Requirements: R1、R4、R5；KTD1。
- Dependencies: 無。
- Files: `prisma/schema.prisma`、`src/features/auth/actions.ts`、`src/features/auth/auth.service.ts`、`src/features/auth/event-ordering.test.ts`。
- Approach: 擴充現有建立與整批更新流程，保留既有授權、版本與結單限制。
- Patterns: `createDiningEvent`、`updateDiningEvent`、`getDiningEventDetail`。
- Test scenarios:
  - 建立含多行說明的活動可保留內部換行。
  - 更新可替換或清空說明，未提供時不覆寫既有說明。
  - 舊資料缺少說明時詳情回傳空值。
  - 結單參加者與舊資料版本仍被拒絕。
- Verification: Prisma client 產生、service 測試及型別檢查通過。

### U2. 輸入、顯示與分享說明

- Goal: 活動建立、編輯、唯讀與分享流程都支援說明。
- Requirements: R1、R2、R3、R4、R5；KTD2、KTD3。
- Dependencies: U1。
- Files: `src/app/events/new/page-client.tsx`、`src/app/events/new/page-client.test.tsx`、`src/app/events/[eventId]/page-client.tsx`、`src/app/events/[eventId]/page-client.test.tsx`、`src/components/ui/textarea.tsx`。
- Approach: 新欄位使用現有活動表單樣式，接入 settings signature 與共用 payload，唯讀時保留說明與換行。
- Test scenarios:
  - 建立活動送出含說明的資料。
  - 只編輯說明也觸發自動儲存，重新取得資料不覆蓋未儲存的輸入。
  - 分享含多行說明、無說明與清空說明的活動文案。
  - 結單參加者不可修改說明，付款人沿用既有例外；結算後仍可看見及複製說明。
- Verification: 元件測試、完整測試、型別檢查通過；可用本機登入環境時驗證瀏覽器流程與窄螢幕顯示。

## Verification Contract

- `bun run db:generate` 產生符合欄位的 Prisma client。
- `bun run test` 驗證新增案例與既有行為。
- `bunx tsc --noEmit` 驗證實際呼叫端與 fixture 型別。
- `git diff --check` 檢查修改格式。
- 瀏覽器驗證建立、換行、清空、自動儲存、複製與唯讀顯示；無法取得本機登入環境時記錄實際限制。

## Definition of Done

- R1–R5 實作完成，各單元測試情境獲驗證。
- 檢查及 review 的有效問題已修正，剩餘限制明確回報。
- 無實驗或放棄的程式留在修改中。
- 僅完成本機 commit，未推送、建立 PR 或部署。

## Execution Results

- U1、U2 已實作；功能相關測試 38 個通過，Prisma client 產生、型別與修改格式檢查通過。
- 完整測試 105 個通過、1 個失敗。失敗為 `event-images.http.test.ts` 的既有日誌參數斷言；已在修改前的 HEAD 重現，未修改活動圖片程式或測試。
- 本機活動路由要求登入，實際登入後的資料庫流程未驗證。隔離預覽使用真實表單元件與樣式、模擬 action，確認桌面與手機版排版、多行輸入、自動儲存、表單送出與結算後唯讀顯示；分享處理以瀏覽器內呼叫事件及模擬剪貼簿檢查，清空分享另由元件測試驗證。
- 簡化與程式檢視依專案指示在主執行緒依序完成，未進行獨立代理審查；未發現需修正的問題。
