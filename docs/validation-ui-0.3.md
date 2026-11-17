# v0.3 面板與跨分頁合成流程

驗證日期：2026-11-15。使用 Chrome 開啟 `src/dev/floating-preview.html`，以原生滑鼠／鍵盤操作正式 floating shell、app、editor、session/library service 與 field bridge。

**此頁模擬 Chrome API 與兩個網站分頁，不是已安裝擴充功能的 14 站端到端驗收。** 真實網站的觀察、通過項目與阻礙另見 [validation-0.3.md](validation-0.3.md)。所有輸入都是明確標示的合成資料。

| 操作 | 觀察結果 |
| --- | --- |
| Barrett 來源選 OD+OS，讀取並核對 | 18 項：兩個識別欄位、每眼 7 個獨立量測及各眼一份共用 A constant |
| OD／OS 區分 | OD AL 23.45、ACD 3.20、LT 4.20、K1/K2 43.20/44.10、WTW 11.80、target 0.00；OS 24.10、3.45、4.50、42.75/43.65、12.10、−0.50；兩眼 A constant 118.7 |
| 保存第一筆測量 | `DEMO-ONLY`／`SYNTHETIC-01 IOLMaster`，OD/OS 及量測來源一同保存 |
| 修改工作副本並新增重測 | 第二筆 `SYNTHETIC-02 Repeat` OD AL 23.68；第一筆仍為 23.45，兩筆 OS 均保持 24.10 |
| 新增另一位病人 | `DEMO-SECOND` 的工作副本為空白；第一位病人與兩筆歷史測量仍存在 |
| 從歷史清單帶回第一筆 | 回復 OD 23.45、OS 24.10，選取紀錄 ID 與工作副本同步更新 |
| 切換至 EVO 目的分頁 | 面板保留病人、兩筆測量與目前選取紀錄；停用 OD+OS，欄位改為該站集合 |
| 選 OS，預覽並貼上 | 7 項全部讀回：24.10、3.45、4.50、42.75、43.65、−0.50、118.7 |
| 目的網站為 OS、面板為 OD | 預覽拒絕，不進行任何寫入；錯誤顯示在開啟中的對話框內 |
| 網站改 OD，再預覽貼上 | 7 項全部讀回：23.45、3.20、4.20、43.20、44.10、0.00、118.7 |

測試發現錯誤 toast 可能被原生 modal backdrop 遮住；已將錯誤同步顯示為對話框內的 `role="alert"`。另以自動整合測試驗證跨面板更新造成的覆寫衝突：舊快照保持不變，錯誤可見，按鈕可重試。

證據：

- [病人與兩筆獨立測量](../artifacts/library-0.3.jpg)
- [OS 跨分頁貼上及讀回](../artifacts/cross-tab-os-0.3.jpg)
- [OD 跨分頁貼上及讀回](../artifacts/cross-tab-od-0.3.jpg)
- [眼別不符，對話框內顯示錯誤](../artifacts/eye-mismatch-0.3.jpg)

開發頁儲存於測試主頁記憶體，切換虛擬分頁或重新建立面板仍保留；重新載入整個開發頁會重設。正式擴充功能的已保存資料使用 `chrome.storage.local`；此輪未以已安裝擴充功能重啟 Chrome 驗證，儲存模型與事件同步由自動測試覆蓋。
