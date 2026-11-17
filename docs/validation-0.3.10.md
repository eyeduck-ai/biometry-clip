# v0.3.10 資料面板調整

日期：2026-11-15（Asia/Taipei）。

- 眼別、Toric、Keratoconus 與 LVC 放在測量欄位前，使用統一的原生按鈕與 aria-pressed。選取以深色顯示；Toric 與 Keratoconus 獨立開關，眼別與 LVC 各自互斥。
- 狀態區與測量區之間以留白、分隔線及「測量值」標示。寬版維持三列狀態群組；窄版眼別及模式同列，LVC 次列，常用八欄採四欄排列，較窄及特殊必填欄位維持三欄。
- 原「全部」checkbox 改為「顯示所有欄位」按鈕與說明，只有顯示範圍改變，不修改資料或勾選數值。
- 狀態切換保留焦點；另一面板更新狀態時，選取顯示同步。舊 lvcType:keratoconus 資料在明確選 LVC 或模式後正規化時，保留獨立 keratoconus 狀態；明確 false 優先。

## 驗證

新增四項純介面測試及三項應用整合測試，驗證按鈕狀態、左右眼獨立保存、數字不變、顯示範圍不改資料及舊 KC 資料保留。npm run check：551 pass / 0 fail，Vite 與 MV3 建置完成。

獨立 Playwright 測試瀏覽器檢查 1280×720 工作台及 360×503 內容區。窄版 document/panel scrollWidth 均為360，沒有水平溢位；300px最小寬度的document/panel scrollWidth亦均為300，所有狀態按鈕scrollWidth等於clientWidth，文字無溢位。最後一個常用輸入框底部381.39px，操作列起點396px。原生點選 Toric 後按 Space 可切回關閉，焦點仍在 Toric，OD 與 LVC 保持原選取。沒有接管使用者 Chrome。

截圖：output/playwright/state-workbench-0310.png、state-compact-0310.png。此輪是介面與狀態保存驗證，未重跑安裝版15站驗收。

按鈕語意依 W3C [Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)，使用原生按鈕及穩定標籤，並以 aria-pressed 表示狀態。
