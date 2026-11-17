# v0.3.8：ESCRS 主目錄與跨站晶體選取

## 交付內容

ESCRS 的 41 家廠商已逐家在獨立研究頁展開一般與 Toric 選單，共檢查 82 個分支：一般 465 列、Toric 180 列，合計 645 列原始選項；其中 8 個 Toric 分支未提供選項。清單保留原始名稱、廠商及模式，不將重複名稱去重後當成唯一型號。

整合其他入口後，封裝目錄共有 781 個型號／系列／群組項目、166 個來源與 582 筆帶來源的站別參數。涵蓋 15 個入口；Barrett Rx 的 implanted／exchange 分開，DGS Toric 保留承接球面計算的規則。

- [可搜尋的逐項對照表](../artifacts/lens-catalog-038/lens-lookup.html)
- [完整目錄 JSON](../artifacts/lens-catalog-038/default-lens-catalog.json)
- [逐項覆蓋 JSON](../artifacts/lens-catalog-038/registry-coverage.json)
- [各入口覆蓋統計](../artifacts/lens-catalog-038/registry-coverage.md)
- [ESCRS 原始收集資料](../artifacts/lens-catalog-038/escrs-master.json)

## 使用方式

「複製網站」會保存每眼已選晶體、來源欄位、廠商及用途；數據與晶體一起保存到工作副本或歷史測量。「水晶體」折疊區可搜尋目錄，也可明確選擇本頁的來源品項。Rx 同時有已植入與換片晶體時不默選其中一個。

貼上預設包含已選晶體，可在傳輸選項取消。程式先處理必要的眼別／模式與晶體選擇，等待目的網站自己的參數更新，再貼入 biometry。ESCRS 的 Toric 開關會篩選晶體清單，因此先準備該模式；Kane 選晶體會改變 Toric 狀態，因此保留先選晶體再重查模式的順序。來源變動、目的分頁離開、持續眼別循環或後續模式重設晶體時，不繼續寫入數據。

雙眼各有獨立控制時可選不同晶體。網站共用一個晶體選單時，兩眼必須能一致對應；另一眼無法對應時也不會只選成功那一眼的共用品項。讀取與收集不以第一筆或最後一筆暗中覆蓋另一眼。

手動選擇、已複製晶體及來源 context 可透過個案／病人庫 JSON 1.3 保存，並完整讀入 1.0／1.1／1.2。晶體目錄使用獨立的 1.1 格式，兼容凍結的 1.0；新版本預置對照不會被舊本機空目錄蓋掉。

## 對應層級與不能忽略的限制

「精確型號」與「系列／群組」不同。例如 K6 的選項可能同時包含 ZCB00、ICB00、ZCU 等，DGS 也可能將 PCB00／ZCB00 合併。模型可以投影到有明確證據的群組，群組不能反向推定成其中一個型號。

EVO 作者明示的 Standard、Anterior／Posterior／Bitoric 屬幾何適配，不代表該站選到了同名精確型號。面板會持續標示這個層級並提醒核對本站 A constant。源站的一般 A constant 不會偷偷套到其他公式；各站的原生選擇可更新它自己的預置參數，手動貼常數仍有獨立選項。

目的網站的選項集合比 ESCRS 小，不能把每一款 ESCRS 晶體硬選成某個不存在的項目。沒有可核對對照、選項不唯一或用途不符時，明確顯示晶體未完整套用，保留原站選擇，其他可對應數據仍可貼上。DGS Other 會清空 A constant，沒有目的公式自己的已核對常數時不作通用替代。

ESCRS 有 14 個原始選項列存在完全相同的重複名稱，例如 Ophtec AC 205、Teleon 的部分型號及 SIFI MINI 4 的部分變體。沒有可核對的區分資料時，不用名稱相似或清單位置猜測；目的選項重複也會拒絕自動選取。負／正 IOL power、注射器後綴、地區限定及 AR40e／AR40E 等差異保留。

## 來源與實際研究

ESCRS 與 Kane 的條款均在使用者本輪明確批准後，在獨立研究頁正常接受。Kane 從正常公開表單取得雙眼 29 個有效選項及各項站內常數／模式資料，沒有繞過同意或讀取框架私有狀態。

Barrett 五個入口、六個晶體控制（Rx 兩個角色）逐一選取 37 個預置項目，取得 222 組選後的 A constant／lens factor；另保留 Personal Constant。讀取在原站回傳及重新觀察後完成，沒有把暫時殘留的前一組常數當成新值。K6／DGS 使用官方公開資料及可見選單核對；EVO 適配以作者指南為據，TECNIS 的型號到 family 關係以公開矩陣為據。

研究時曾有一個 ESCRS 鍵盤 Enter 被網站視為表單送出，因識別欄位空白而停在驗證錯誤；沒有輸入病人資料，也沒有產生計算結果。該操作已停止，後續使用正常清單點選；擴充功能的晶體 runtime 不透過 Enter 送出或按 Calculate。另有一次研究工具長時間未回應，恢復時沒有接管使用者 Chrome。

詳細來源見 [APACRS／EVO／TECNIS](research-apacrs-lenses-038.md)、[K6／Kane／DGS](research-lens-other-038.md)、[Registry 規劃](lens-registry-038.md) 與 [Runtime](lens-transfer.md)。

## 驗證範圍

正式 serialized bridge 與真實 session／library 服務的合成回歸已驗證讀取、保存、重載及跨分頁貼上，包括 EVO OS→K6、Barrett model postback、Rx exchange、ESCRS Toric 篩選、OU 共用衝突、來源改版停止與眼別恢復。

完整檢查 **521 項通過、0 失敗**，正式建置與 ZIP CRC 檢查完成。紀錄在 [check-0.3.8.log](../artifacts/check-0.3.8.log)，封裝與雜湊在 `artifacts/package-0.3.8.json`。逐項對照表是同一 resolver 對官方選項資料的審核結果，不能當成所有晶體均已在安裝版 Chrome 實際執行的證據；新版安裝後的原生 15 站驗收尚未重新取得報告。
