# EML 測試資料

本資料夾內所有姓名、信箱、電話、地址、公司、訂單、卡號與案件代碼均為虛構資料，只供功能測試。

- `01-refund-plain.eml`：純文字、退款、CC
- `02-invoice-bcc.eml`：發票、統編、CC/BCC
- `03-shipping-html.eml`：HTML 正文、地址與電話
- `04-account-access.eml`：帳號與權限問題
- `05-complaint-multipart.eml`：multipart/alternative、客訴、測試卡號
- `06-with-attachment.eml`：multipart/mixed、測試附件
- `07-name-account.eml`：姓名／大名語境與會員帳號／User ID

建議一次選取六封信，驗證批次匯入、去識別化、人工分類、CSV，以及 ZIP 形式的去識別化 EML 匯出。
