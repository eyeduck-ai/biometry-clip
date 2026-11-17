# v0.3.12 PDF、OCR 與模型設定

日期：2026-11-15（Asia/Taipei）。

## 修正

- PDF 選頁改為每頁可見縮圖、每組12頁，逐頁低解析渲染，可點選／放大；每次辨識仍上限3頁。取消會中止佇列、清除圖片來源與釋放worker/canvas，預覽不啟動OCR或API。
- 文字PDF保留PDF.js文字座標解析；掃描與無足夠可用文字的頁面自動OCR。IOLMaster雙眼區域與重複標籤不再攤成一行，辨認摘要主值、SD、K度數／軸向及明細界線。缺眼別、歧義、跨頁衝突和未量測TK不猜值。
- 本機仍使用官方SDK0.4.2及PP-OCRv6 Small det／rec，以sandbox WASM單執行緒執行。保留原1800px／2.5MP上限，不以提高全頁解析度代替解析修正。
- Gemini預設3.5 Flash-Lite，可選3.1 Flash-Lite、3.6 Flash；Paddle官方API預設PP-OCRv6，正常UI僅需key／token及模型。官方hosted jobs流程取代誤用自架basic /ocr協定；自架功能保留於進階區。
- 雲端確認只在實際傳送影像前執行，同批多頁只確認一次。直接解析的PDF不提示雲端傳送也不呼叫API。批准不寫入保存設定，取消阻止外部請求。
- 實裝測試發現OpenCV內嵌WASM的data: fetch被sandbox CSP擋下後走備援路徑；sandbox connect-src現在允許data:。主頁script／worker限制不變，sandbox仍無same-origin及Chrome API，也無外部服務連線權限。

## 驗證與範圍

npm run check：612項通過、0失敗；Vite與Chrome MV3正式建置完成。新增範圍包括幾何分欄、±／SD及半徑單位防混入、中文長英文標籤相容性、縮圖選頁／取消／資源釋放、native-first與真正上傳前的雲端批准、官方API協定及隔離sandbox CSP。

來源為使用者提供 realpdf.pdf（8頁文字PDF）與photo.pdf（7頁掃描PDF），並對照已讀取的另一個Codex專案研究與既有人工答案。答案僅用於評分，不作擷取規則或輸出預填。公開彙總不保存病人ID、日期、完整辨識原文、量測值或金鑰。

原始本機Small輸出經新解析器重放，及正式MV3UI流程驗證：

| 路徑 | 結構PDF原第6頁 | 掃描PDF原第2頁 |
| --- | --- | --- |
| PDF.js原生文字 | 18/18 | 無文字層，使用OCR |
| 封裝Small的OCR文字＋修正版解析 | 18/18 | 18/18 |
| 正式安裝版實際匯入UI | 18/18、未啟動OCR | 18/18、自動SmallOCR |
| Gemini3.5Flash-Lite JS API | 18/18 | 18/18 |
| PaddleOCRv6 JS API | 18/18 | 18/18 |

18項為每眼AL、ACD、LT、CCT、WTW、K1、K1axis、K2、K2axis。掃描頁另有明示Target0，正確產生但不計入18項。TK的未量測短橫線保留空白，未以0代替。原逐行解析對native代表頁產生0項、scan代表頁4項，正是原先模型有讀到字卻無法帶入欄位的主因。

原生文字PDF全8頁另逐頁測試，OCR／raster呼叫均為0。多頁合併仍保留真正矛盾，不以覆蓋或投票移除差異。全8頁的路由檢查不等於所有版型、全部欄位均有準確率保證。

## 實際安裝版及UI

使用獨立Playwright Chromium persistent profile載入dist，manifest版本0.3.12，extension ID jkclgainmjgkhnbleeofahjagaiempmd。沒有接管使用者Chrome，也沒有加入使用者其他資料庫或API key。

在正式index.html上傳realpdf.pdf，8／8縮圖解碼，取消原第1頁並選第6頁辨識，review出現18個量測值及兩個識別欄，OCR sandbox數量0。在同一套件上傳photo.pdf，7／7縮圖解碼，改選第2頁後自動執行本機Small，review出現18個量測值及2個明示Target。兩次眼科候選均與人工答案18/18相符。最後重開新版sandbox CSP後再做掃描頁推論，console為0錯誤／0警告、完成後sandbox數量0。沒有將候選值發布到外部計算網站。

另以HTTP本機UI獨立瀏覽器測實際8頁／7頁選取、放大6／1、取消釋放、無選頁停用辨識；360×503對話框寬340／scrollWidth340，無水平溢位。相關報告見artifacts/ui-preview-0.3.12.json引用檔。

## 雲端與模型查核

兩個正式JS接頭各使用兩張既有去識別代表頁，逐張視覺檢查身份／日期／操作者／眼照片遮蔽並核對檔案及原PDF雜湊。共4個推論工作，沒有重試，僅保存對錯布林、數量、耗時、tokens與模型。Gemini約19秒／頁；Paddle約19–25秒／頁。詳見ocr-cloud-0312.md；本次不宣稱免費或全檔準確率。

本機模型inference.yml確認為PP-OCRv6_small_det／rec。與Python專案下載的ONNX位元與SHA不同，不能視為同一匯出檔；本次沒有替換原extension權重。瀏覽器WASM與Python CPU引擎、解析器和頁選取不同，既有Python數字不能直接當成extension結果。

本輪未重新執行15個公式網站驗收，未變更公式映射、晶體目錄、ESCRS參數或臨床計算。現有OpenCV browser externalization與OCR大檔建置提示仍存在，但正式推論已實測。

## 更新

在chrome://extensions重新載入E:\code\biometry-clipboard\dist，重新整理已開啟的計算網站分頁。辨識真實報告時，先從縮圖選含雙眼摘要的頁面；本次realpdf建議原第6頁，photo建議原第2頁。結果仍透過現有候選核對視窗再帶入面板。
