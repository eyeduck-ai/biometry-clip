# v0.3.7 模式、儀器與非同步欄位修正

研究日期：2026-11-15。來源是公開官方 HTML/JavaScript，以及專案 2026-11-14 已保存的 ESCRS 公開表單截圖與控制項紀錄。沒有接管使用者 Chrome、接受條款、使用真實病人資料或送出新的計算。

## ESCRS

[官方入口](https://iolcalculator.escrs.org/) 目前是 Blazor Server。本輪另開獨立研究分頁後遇到 Terms of Use，停在同意前，因此沒有聲稱完成本輪原生寫入驗收。`artifacts/live-0.3/escrs.png` 顯示 OD/OS 兩個獨立區塊；各區的 Toric、Keratoconus、Argos (SoS) AL、Post LASIK/PRK/RK 是四個獨立 switch，並非單一互斥選項。`escrs-required-controls.json` 另記錄了 Post-LVC 的 checkbox 與必填的 Patient Initials、Surgeon。

對應採用之前已核對的眼別 grid scope 與精確 label；只有唯一可見原生 checkbox 且非 indeterminate 才可切換。OU 分別設定兩眼，不把 Keratoconus 當成 LVC。若原站更新後互相取消選項，準備流程最後會重新核對，發現模式漂移即停止貼上，而不反覆強制點選。

目前證據只確認 Post-LVC 總開關，不能證明已選 Myopic、Hyperopic 或 RK 子類型。讀取勾選狀態保存 `lvcType: unknown`，關閉保存 `none`；明確來源病史可啟用開關，但仍提示在原站確認子類型。不能將 unknown 宣稱為 myopic。

Patient Initials 使用自己的 `patient.initials` 鍵。缺少 initials 時依使用者偏好取 ID，再取姓名；讀取時不把此欄冒充原始 ID 或完整姓名。必填 Surgeon 只在 surgeonName/surgeonId 間取代，不借用病人身分。

原生報告的 OU 多筆 `changed` 與框架替換後續 input 的情況相符。ESCRS 寫入改為逐欄重新定位、保留原預覽值/locator 檢查、在事件後等候更新，再檢查最後仍連線且保留的值。站方改動後續欄位數值時仍回報 changed，不覆蓋它；最後被重設的欄位不會誤報 filled。350ms 是更新間隔，仍需新版原生報告確認實際伺服器延遲下的結果。

## Cooke K6

[官方入口](https://cookeformula.com/) 實際載入的 `index.ef23a068493e7ba535ce.js` 已保存於 `artifacts/modes-037/cooke.js`。官方 bundle 的 Biometer enum 是 Argos=0、Lenstar=1、Other=2；每眼 RadioGroup 使用 `aria-labelledby="od-biometer-label"` 或 `os-biometer-label`，並有三個原生 radio。IOLMaster 700 依使用者指定映射至 Other；Argos 與 Lenstar 對應原生選項。複製 Other 只代表站方類別，不能由此還原精確裝置名稱。

Special Situation 是自訂 MUI Select，與普通 measurement input 不同；本輪未猜測寫入此控制。Default/Myopic/Hyperopic/RK 仍由原站選擇。各眼 Biometer 可分開準備、讀回。

## EVO

[官方一般表單](https://www.evoiolcalculator.com/Calculator.aspx) 公開 HTML 保存於 `artifacts/modes-037/evo.html`：

- `DropDownLASIK`：0 No、1 Myopic、2 Hyperopic、3 Radial Keratotomy，change 會 ASP.NET postback。
- `DropDownArgos`：0 No、1 Yes，不與後角膜裝置混用。
- `DropDownListPK` 是**後角膜**量測裝置，change 會 postback。原本共用 `biometer` 的對應拆成 `posteriorBiometer`，避免一般儀器預設值改動這個不同用途的選單。
- `DropDownKIndex`：1.3375、1.3315、1.332，change 也會 postback。
- CCT `txtCCT` 標籤仍未明列單位；單位依使用者確認固定為 µm，例如 543。舊 evoCctUnit=mm 不再縮放輸入。

以上會重建文件的選單移到 `prepareModes`：先選模式/選項，等載入完成或 documentId 變更且讀回穩定，再重新建立量測預覽。讀取不觸發切換。沒有明確 LVC 時 transfer-only 預設為 none/No；明確 myopic/hyperopic/RK 不被預設覆蓋。unknown 不擅自映射成 myopic。

若模式 postback 把 OS 重設為 OD，`prepareModes` 立即回報 `eyeReset`，不繼續操作其他眼的模式，也不沿用舊文件的人工確認。正式貼上最多重新選眼一次，再完整重查並準備模式一次；第二輪仍重設眼別時以 `MODE_EYE_CYCLE` 停止。自動測試另涵蓋恢復後只填 OS、模式/眼別循環不寫入、恢復時來源變動停止，以及無法重新識別的眼別不能沿用舊人工確認。

## DGS

來源與 selector 詳見 [research-dgs-controls.md](research-dgs-controls.md)。Complex/Second 的 switch true=OD、false=OS；Toric 讀取先前計算結果的唯一眼別標頭，不能在該頁直接改眼別。Toric 前置提示導向 spherical/regular 流程，extension 不代按 Calculate 或選 IOL Power。

Regular/Complex/Second 的 Biometer 透過唯一精確 label 的 Vuetify root、`aria-owns` 關聯 listbox 與唯一精確 option 文字操作，不寫 readonly display 或 hidden input。IOLMaster 700/一般光學映射 Other；Argos→Argos (SOS-AL)；US immersion/applanation 保持不同選項。兩眼共用欄位若對應結果衝突，或 ARGOS 與裝置來源矛盾，保留原站設定並提示。

## 驗證與限制

有針對 OD/OS 獨立 switch、K6 儀器映射、EVO LVC/後角膜分離、postback 中 caller 失效、來源/目標變動停止寫入、DGS linked-menu 選擇、非同步替換節點的自動測試。這些是程式回歸測試；不等於重新載入後在所有網站上完成實際 Chrome 原生驗收。原生合成報告需再確認 ESCRS OU 更新、EVO history 啟用與 DGS switch。
