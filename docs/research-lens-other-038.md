# Cooke、Kane 與 DGS 晶體對應

查核日期 2026-11-15。這些資料來自官方公開 HTML／JavaScript 及先前已保存的公開表單證據。Kane 條款依使用者明確批准由 root 在獨立 IAB 正常接受。沒有接管使用者 Chrome、輸入病人資料、提交計算或推導公式演算法。

## 完整公開清單

| 來源 | 選項 | 選擇及參數行為 |
| --- | --- | --- |
| [Cooke K6](https://cookeformula.com/) | 23 個，OD／OS 各一個 MUI Select | `#od-iol`／`#os-iol`；每個 MenuItem 顯示 `name`，原生值為完整晶體物件的 JSON。選取後會更新同眼 A constant，晶體物件另含 K6 family 與 available powers。 |
| [DGS Regular](https://iolsolver.com/regular) | 13 個，兩眼獨立 IOL Model | 各眼 `iol-right-v-sheet`／`iol-left-v-sheet` 下的精確 IOL Model Vuetify Select；選取後以本站資料更新同眼常數。 |
| [DGS Complex](https://iolsolver.com/complex)／[Second](https://iolsolver.com/second) | 相同的 13 個，單眼共用控制 | 唯一 IOL Model 控制，眼別由原站 switch 決定。Second 的對側眼資料不另選不同晶體。 |
| [DGS Toric](https://iolsolver.com/toric) | 3 種 Toric IOL Style | Anterior／Posterior／Bitoric 是幾何類別。晶體模型繼承先前球面計算；這頁沒有可直接切換模型的控制。 |
| [Kane](https://www.iolformula.com/) | 29 個有效選項，兩眼相同，另有 0 placeholder | 使用者明確批准後，root 在獨立 IAB 正常點 I Agree，取得兩眼真正 server form 選項與 DOM inline `document.ioltypes` JSON。`ioltype_1`／`ioltype_2` 經正式 change 更新各眼常數／模式。 |

DGS Regular 另已在獨立 IAB 公開頁展開 OD 的 IOL Model，13 個選項逐項符合公開 bundle；兩眼 scope 及 aria-owns 對應也已確認。option 本身沒有 data-value，因此 linked-select 必須使用精確 label。證據圖見 `artifacts/lens-catalog-038/dgs-model-menu.png`，未選新晶體或提交計算。

K6 是依來源名稱精確選擇 UI option，並不把長 JSON 放進病人工作副本。站上 value／name 與公式 family／power ranges 的完整原始關係保存在證據檔；可保存的穩定來源值為 option 的精確名稱。所有常數／power ranges 僅屬於提供它們的網站，不作跨公式常數。

## 型號、合併選項與方向

K6 有 `J&J Tecnis 1-Piece (ZCB00, ICB00, ZCU***, ZXR00)`、`Alcon SA60WF/SN60WF` 等合併選項。DGS 有 `PCB00/ZCB00`、`MA/MN60MA`，以及 Finevision、Panoptix、Vivinex、Asphina、RayOne 等 family。

精確來源型號可投影到已明示包含該型號的目的選項，例如 ZCB00 → K6 的上述 1-Piece group，或 ZCB00 → DGS 的 PCB00/ZCB00。反向複製只得到 group 時，不能推回「一定是 ZCB00」。僅從 family 名稱也不能辨識所屬的精確型號、材料、Toric cylinder 變體或區域型號。

`OTHER_LENS_MEMBERSHIPS` 保存來源明示的 `memberCodes`，以及來源真正印出的 wildcard 的保守單字元版本（例如 ZCU???）。其他型號不靠相似名稱加入。Other／Other IOL with Quarter-Diopter powers 都不自動宣稱對應任何精確型號。若目的網站只有 Other，亦不能把另一公式的常數當作這個目的網站的常數。

DGS 的 A1-UV 另依 [Eyebright 原廠產品頁](https://www.ebmedical.com/en/proc/surgery/pnt/2020-05-30/6.html)確認製造商；不由不相關品牌的近似名稱推測。原廠頁上的其他公式常數不覆蓋 DGS 自身參數。

## Kane 的後續相依狀態

官方變更 handler 先用 `document.ioltypes['v'+value][1]` 更新同眼 A constant，再依第 4 個欄位決定是否強制／鎖定 Toric 或 Non-toric。應先選晶體、等原站正常事件完成，再核對 eye／mode，最後填 biometry。網站的 bootstrap-select 顯示層與真正 select 保持獨立；不任意改 hidden input 或全頁第一個同名 option。

起初匿名來源導向 Terms of Use，研究停在具體 I Agree 前。使用者後續明確答覆「同意，接受 Kane 條款並繼續」，root 因而在獨立 IAB 走正常同意流程，捕捉公開 DOM，不使用 CDP、不讀 runtime app state、不輸入病人資訊或按 Calculate。完整證據是 `artifacts/lens-catalog-038/kane-options-live.json`，包含 OD／OS 30 項（29 有效＋0 placeholder）及 30 行的 inline JSON（同樣含 placeholder）。

Kane 的 6 個精確型號為 MN60MA、SA60AT、SN60WF、AR40e、ZCB00、409M。SN6ATx、ZCTx 按原站明示系列保留 wildcard membership；其餘品項保留各自 family／用途，不因同品牌就認定型號等價。[Bausch + Lomb 原廠 IFU 清單](https://ifu.bausch.com/archive/)另明列 Aspire 的 EA／EPA、Aspire Toric 的 ETA／ETPA、Envy 的 EN／EPN、Envy Toric 的 ETN／ETPN。這八個精確型號可前向投影到 Kane 同名 family，不能反向由 family 推定單一型號。

每項保存本站 A constant、opaque siteTypeId 與模式 flag；siteTypeId 不是晶體型號。`0` placeholder 不進入晶體目錄，也不當作已選晶體。

## 交付及檢查

- `src/lens-sites-other.js`：6 個入口的選項控制定義、K6 23 項、Kane 29 項、DGS 13 項及 Toric 3 幾何項，另有精確 membership 與站別參數證據。
- `artifacts/lens-catalog-038/other-sources.json`：來源網址、SHA-256、查核時間、完整公開選項、每個 option 所帶參數與正常同意後取得的完整 Kane 清單／常數。
- `tests/lens-sites-other.test.js`：從官方 literal arrays 解析後核對所有項目及常數／power ranges、group 與精確 model 的方向性、眼別 scope、Toric geometry 及 Kane 29 選項／完整站別參數和 change handler。這些是本機 source／合成回歸，並非 15 站的 Chrome 原生計算驗收。
