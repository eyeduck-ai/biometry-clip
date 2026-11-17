# APACRS、EVO 與 TECNIS 晶體對照資料

查核日期：2026-11-15。只操作獨立研究用瀏覽器中的公開計算表單，沒有接管使用者 Chrome、填寫病人資料或按 Calculate。APACRS 的直接 HTTP GET 被站方拒絕，沒有繞過；之後以正常可開啟的公開 IAB 表單讀取。

## APACRS 五個入口

| 入口 | 已核對控制 | 角色 |
| --- | --- | --- |
| [Universal II](https://calc.apacrs.org/barrett_universal2105/) | `MainContent_IOLModel` | primary |
| [True-K](https://calc.apacrs.org/Barrett_True_K_Universal_2105/) | `MainContent_IOLModel` | primary |
| [Toric](https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx) | `MainContent_IOLModel` | primary |
| [True-K Toric](https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx) | `MainContent_IOLModel` | primary |
| [Rx](https://calc.apacrs.org/barrett_rx105/) | `MainContent_IOLModel`、`MainContent_IOLModelEx` | implanted、exchange |

六個原生選單的內容逐一讀取，均有 38 項：Personal Constant 加 37 個命名品項，原始 value 與 label 相同。`change` 會 ASP.NET postback。Rx 的已植入與交換品項有獨立常數控制，不能把準備植入的晶體覆寫到 implanted 角色。

每個命名品項都經過真正的原生選取、postback、重新觀察 UI 及讀回 A constant／Lens Factor，共 **222 組**。最終六組表的值相同，但保存時仍以 `siteId + controlId + selected value` 區分，不建立跨站通用常數。Personal Constant 是自訂常數模式，不能由其選擇反推晶體。

僅等待 navigation 的 DOMContentLoaded 訊號時，可能已看到新 selected value，卻短暫讀到上一品項的參數。這不是可靠的常數差異證據。最終資料重新以 fresh UI observation 校驗過，排除了過早讀取。執行期也須等選擇與參數狀態共同穩定，才能繼續貼入量測。

部分命名項目是系列，例如 SN6ATx、ZCU、DIU；不能宣稱它等於某個特定 toric cylinder model。APACRS 的 `MN60MA` 原字串與 EVO 的 `MA60MA` 不同，沒有自行修字或合併。ZCT(USA)、MX60ET(USA) 保留其原始地區區別。

`APACRS_MODEL_PROJECTIONS` 使用 APACRS 公開系列代碼，及 TECNIS 官方 matrix 的實際完整代碼，將 ZCT／ZCU／DIU／ZKU／ZLU／ZXT／ZHW 的具體成員連到該系列選項。這是多對一的 member 投影，不是反向的精確型號 alias；不把 USA 項目當成無地區限制的通用目標。

資料在 [apacrs-sources.json](../artifacts/lens-catalog-038/apacrs-sources.json)，執行期定義、來源、別名與站別參數位於 `src/lens-sites-apacrs.js`。

## EVO 官方投影規則

[官方操作說明](https://www.evoiolcalculator.com/start.aspx) 明確提供「品項未列在下拉選單」時的對應規則，因此可以在保留精確來源型號的同時，選擇其計算器所需的 group 或 geometry。

例如 regular 的 MA60MA 選項涵蓋 MA60MA、MA60AC、MN60AC，AR40e/E/M 涵蓋三種 AR40 變體；因此不能由選中這些群組倒推其中一個確切型號。未列出的 TECNIS 及其他品項依官方說明分別使用 Tecnis 或 Standard。Toric 的各種前／後表面及雙表面分類另行保存，不等同晶體身份。

EVO Regular 33 項、Toric 29 項的公開 option 值及名稱均保存。Regular 只有 10 項可作為單一原始型號來源，其餘屬系列或 geometry；特定品項選項優先於官方 generic 規則。完整機器規則為 `EVO_GUIDE_RULES`，不將未核對的名稱相似性當作等價證據。

## TECNIS

[官方計算器](https://tecnistoriccalc.com/calculator/) 的公開 matrix v4.11.2.0 包含 14 個地區、16 個 family、118 個不同完整 model code，共 119 個 model→family 關係。ZCB00 出現在 Monofocal 和 Monofocal-II 兩個 family，因此只知道 ZCB00 時不能任選其中一個；其他精確成員也需確認當下地區可用的目的選項。

選擇 family 會更新 `#lens`、SE IOL Power 選項與常數顯示，不會直接按計算。若已存在結果，原站會顯示 lens-change confirmation；執行期必須保留此邊界，不自行接受確認。公開的常數 119.3／118.8 是相應量測方法的預設，不是任意 source model 的跨站通用常數。

EVO／TECNIS 原始資料見 [evo-tecnis-data.json](../artifacts/lens-catalog-038/evo-tecnis-data.json) 與 [原始檔雜湊](../artifacts/lens-catalog-038/source-file-hashes.json)。

## 回歸測試

`tests/lens-sites-apacrs.test.js` 的 7 項測試通過，涵蓋公開 HTML 的逐項 option 比較、EVO group／geometry 不冒充 model、TECNIS 完整 matrix 及重複成員、APACRS 六角色選單、222 個站別參數快照與 member 投影隔離。這是資料及控制相容性測試；沒有驗證計算結果，也沒有把研究分頁操作當成安裝版擴充功能的 15 站原生驗收。
