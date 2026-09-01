# 郵件測試資料整理器

線上版：[GitHub Pages](https://bruce912.github.io/eml-test-data-tool/)

`main` 分支更新時，GitHub Actions 會自動測試、建置並重新部署線上版。

本機工具，用來混合批次匯入 `.eml` 與 Microsoft Outlook `.msg`、解析信件、套用去識別化規則、人工標註預期分類，並匯出 Dify 評估用 CSV。

也可將人工修訂後的去識別化內容匯出成新的 `.eml`。單封信直接下載 EML，多封信會打包為 ZIP；輸出不包含原始附件、傳輸路徑或郵件簽章標頭，也不會覆寫來源檔。

## 使用

```bash
npm install
npm run dev
```

開啟終端顯示的本機網址後，拖曳或選擇 `.eml`、`.msg` 檔案，可以混合多選。所有檔案只在本機記憶體中處理，不會自動上傳。

`.msg` 解析支援 Outlook MAPI 主旨、寄件者、To／CC／BCC、本文、時間、Message-ID 與附件存在狀態。若只有 HTML 本文會自動轉成純文字；Exchange 內部地址會優先採用可取得的 SMTP 地址。

## Windows 執行檔

### 給一般使用者

將以下其中一個檔案交給使用人員：

- `EML-Test-Data-Tool-Portable-0.1.0-x64.exe`：免安裝，直接執行。
- `EML-Test-Data-Tool-Setup-0.1.0-x64.exe`：安裝版，建立桌面及開始功能表捷徑。

目前建置未設定 Windows 程式碼簽章，因此第一次執行時 Windows SmartScreen 可能顯示「未知發行者」。正式對外散布前應使用組織的 Authenticode 憑證簽章。

### 在 Windows 建置

先安裝 Node.js 22 或更新版本，然後雙擊：

```text
scripts\build-windows.cmd
```

完成後 `.exe` 會放在 `release` 資料夾。

也可以在命令列個別建置：

```bash
npm ci
npm run dist:win             # 免安裝 Portable
npm run dist:win:installer   # NSIS 安裝版
```

儲存庫根目錄的 GitHub Actions 工作流程 `.github/workflows/build-eml-tool-windows.yml` 也會在 Windows runner 上產生兩個 `.exe` artifact。

## CSV 欄位

- `case_id`
- `source_format`（`eml` 或 `msg`）
- `source_filename`
- `subject`
- `body`
- `from` / `to` / `cc` / `bcc`
- `received_date` / `message_id`
- `expected_primary_category`
- `expected_secondary_category`
- `language`
- `has_attachment`
- `review_status`
- `detected_pii_count`

## 去識別化範圍

內建規則涵蓋 Email、網址、台灣身分證字號、電話、卡號、統一編號、地址區域與常見訂單／代碼。寄件者顯示名稱會視為人名；其他姓名或機密詞可由左側自訂清單補充。

自動偵測不可能保證涵蓋所有個資。匯出前仍應逐封人工檢查，尤其是自由格式地址、人名、附件內容與公司內部代碼。目前附件只記錄「是否存在」，不擷取附件文字。
