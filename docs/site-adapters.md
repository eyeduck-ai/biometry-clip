# 網站欄位相容與擴充方式

共用個案保存 OD／OS 的量測與特殊欄位；每個網站有獨立的對應設定。新增網站不必複製整份編輯器，既有病人與測量也不會因切換網站而丟失資料。

## 資料、網站與顯示偏好分開

| 層次 | 內容 | 擴充位置 |
| --- | --- | --- |
| 共同量測 | AL、ACD、LT、CCT、WTW、K1／K2、target 及各眼資料 | `src/model.js` |
| 特殊欄位 | Toric、LVC、術後／對側眼、Planned SE IOL Power | 模型中的 optional 欄位與單位 |
| 網站對應 | URL、眼別模式、selectors／labels、必填／選填、單位及值映射 | `src/adapters/` |
| 網站控制 | 已核對的眼別 radio、是否 postback、柱鏡顯示控制 | profile metadata 與背景接續 |
| 顯示偏好 | −ve／+ve／保留原站 | extension settings，與量測數值分開 |
| 跨專案交換 | 明確版本、單位、病人與多次測量 | `src/interchange.js`、`schemas/` |

某站沒有 ACD／CCT／target 等欄位時，數值仍留在工作副本和測量紀錄，貼入該站時略過。網站尚未提供、停用或無法唯一定位的控制不強制寫入；欄位可用性由已核對設定及當下表單狀態共同決定。

## 新增欄位的原則

已有相同語意及單位時重用現有 key；新的語意才新增欄位。例如 TECNIS 的 `plannedIolPower` 是規劃的 spherical-equivalent IOL power，與 `implantedIolPower`、`fellowIolPower`、`target` 分開。個人化 ACD 常數也不能代替量測 ACD。K、TK、後角膜 K、角膜半徑等同樣保留獨立語意。

新增數值欄位同步擴充允許清單、編輯器 metadata、交換格式的單位宣告及 Schema；交換格式 1.1 加入 Planned SE IOL Power，並保留原 1.0 匯入相容。未支援版本或沒有對應單位的資料會拒絕匯入，詳見 [交換格式](interchange.md)。

## 新增網站的檢查

對應設定只採已核對的公開欄位與控制，不以任意模糊名稱猜測輸入框。重複欄位需明確眼別範圍；唯一性、網址、來源個案版本及表單變動仍在讀寫時檢查。讀取只取得資料，不變更眼別或顯示設定；貼上則在背景先處理眼別與可支援的顯示偏好，再填入數值。

網站清單、用途分類、host permissions 與原生 QA metadata 一起更新。入口數及驗收完成判定依 registry 動態產生，增加網站不再需要修改固定的 14 站計數。

沒有公開可操作表單或仍在地區／條款前置頁時，研究與合成測試不能當成正式網站執行通過。擴充功能不代替使用者接受條款、選擇 IOL 型號或提交計算。


v0.3.7 的 `modeControls` 支援眼別 scope 的 checkbox、已核對 radio／native select，以及以唯一 aria-owns 連結的 DGS Vuetify 選單。先 prepare-modes 並等待 postback，再預覽數值；copy 只讀目前眼別與模式，不切換。ESCRS Blazor 使用 asyncWrites 逐欄重新定位；未確認子類型不猜。儀器與模式證據及限制見 [研究紀錄](research-modes-037.md)。新增欄位採 JSON 1.2，同時保留 1.0／1.1 的詞彙與單位契約。
