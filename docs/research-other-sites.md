# 非 APACRS 計算網站欄位調查

調查日期：2026-11-14。以公開網站的瀏覽器實際表單、可見 label、input/select 屬性及官方說明為依據。沒有使用真實病人資料；為驗證 Solver Toric 的前置流程，另以明確標記的合成軟體測試資料完成一般球面計算並選 IOL Power，僅開啟 Toric 表單，沒有送出 Toric 計算。「已驗證」指**欄位對應**，不代表已驗證公式結果或每一種伺服器端驗證規則。

## 共用資料設計

- 可實用的常用集合為 AL、K1、K2、ACD、Target；另存 LT、CCT、WTW。各站的真正必填條件不同，不能把所有欄位一律宣稱必填。
- AL / ACD / LT / WTW 使用 mm；K / TK / 屈光度使用 D；軸向使用度。共用 CCT 使用 µm。ACD 定義應由原始設備與目的網站確認，不能把 aqueous depth 當作包含角膜厚度的 ACD。
- A-constant、IOL model、Lens factor、pACD 不同；ESCRS 更有不同公式各自的常數欄位，不能使用單一數值全部覆蓋。
- K、TK、後角膜 K、後角膜半徑、TCRP 及歷史術前 K 是不同量測，分開保存。單純單位相同不表示能互換。
- ID、姓名、surgeon 通常為列印資訊；網站有欄位不代表必填。Kane 需要 Sex；Cooke 網頁 Name 有必填星號，LVC 模式 Age 有必填星號。未明示必填的識別資訊保持 optional。

## 網站與欄位

| 網站 | 已觀察表單 | 對應方法 | 重要差異與限制 |
| --- | --- | --- | --- |
| [ESCRS](https://iolcalculator.escrs.org/) | OD/OS、Toric、Post LASIK/PRK/RK、Keratoconus、Argos | Blazor/MudBlazor 隨機 ID；基本欄位採 exact label + 預期 2 筆 + OD/OS 順序；Toric 使用已觀察的獨立眼別 scope | Gender/Manufacturer 為自訂選單；不同公式各有 A-constant / pACD。Toric 軸向僅在勾選該眼 Toric 時出現。 |
| [Cooke K6](https://cookeformula.com/) | Default、Post-Myopic LVC、Post-Hyperopic LVC、Post-RK | `#od-al`、`#os-al` 等固定 ID | 先在首頁選模式。LVC 另有 Age、IOLMaster TK1/TK2。Biometer 為 Lenstar/Argos/Other radio。 |
| [Kane](https://www.iolformula.com/) | 雙眼 Non-toric/Toric、Keratoconus | `name="al_right"` / `name="al_right_t"`，OS 對應 left；visible selector 決定現行模式 | Sex 必填，AL/K1/K2/ACD 必填；LT/CCT optional。沒有一般 LVC 模式欄位。 |
| [EVO regular](https://www.evoiolcalculator.com/Calculator.aspx) | 單眼、Argos、LASIK/PRK/RK、Measured Posterior Cornea | 固定 ASP.NET ID `#txtAL` 等 | ACD/LT 輸入 title 註記 optional。`txtCCT` 目前可見標籤未寫單位，因此不自動寫入 CCT。 |
| [EVO Toric](https://www.evoiolcalculator.com/Toric.aspx) | 單眼 Toric、LASIK/PRK/RK、posterior cornea | `#TxtK1Axis`、`#TxtSIA` 等 | Toric model/geometry、K index 由使用者確認；兩個 K axis、SIA、incision 分開保存。 |
| [Solver Regular](https://iolsolver.com/regular) | OD、OS 同時顯示 | Vuetify 自動 ID；exact label + 預期 2 筆 + OD/OS 順序 | IOL Model、Biometer、Keratometric Index 為自訂下拉，不直接寫 hidden input。LT/CCT optional。 |
| [Solver Complex](https://iolsolver.com/complex) | 單眼，可切眼；LVC history、RK、Non-physiological cornea、ICL | exact label | 術前角膜**半徑** mm、corrected ametropia D；posterior radius / TK / TCRP 為不同量測。眼別控制沒有穩定可讀的 radio ID，需手動確認。 |
| [Solver Second](https://iolsolver.com/second) | 目前眼與「Controlateral Operated Eye Information」 | exact label；重複 LT/CCT 使用預期 2 筆及對應順序 | 對側眼術前 AL/K、已植入 IOL power、術後 SE 不得由目前眼冒代；網站將 Preop. ACD 標為 D，單位有疑義，該欄保留手動。 |
| [Solver Toric](https://iolsolver.com/toric) | 初始入口先顯示流程限制；另以明確合成資料經正常流程驗證後續 Toric 表單 | exact label：K1 axis、SIA、Incision axis、PK1/PK2、PR2/PK2 axis | 必須先完成 spherical IOL calculation 並選 IOL Power。Toric style/notation 自訂選單需手動；PR1/PR2、PK1/PK2、Post. Cylinder 為替代量測。 |

## 已確認 selector 摘要

### Cooke

兩眼分別使用 `od` / `os` 前綴：`al`、`acd`、`lt`、`cct`、`wtw`、`k1`、`k2`、`tgt-rx`、`a-constant`。例如 `#od-al` 為右眼 AL，`#os-tgt-rx` 為左眼 Target。Post-myopic 與 post-hyperopic 另有 `#od-tk1` / `#od-tk2`、OS 對應；Age 使用 `#age`。

現行 [官方版本說明](https://cookeformula.com/Documentation)區分已 deprecated 的 v2021.03 與現行 v2024.01。現行版本 AL、ACD、Ks 必要，CCT/LT 建議；Lenstar 建議 WTW，Argos 必須有 LT。舊版六項全部必填的規則不可當成現行通則。Name 有必填星號，ID / Date of Birth / Surgeon 沒有。

### Kane

基本測量名稱為 `al_right` / `k1_right` / `k2_right` / `acd_right` / `lt_right` / `cct_right`，左眼替換成 `left`。Toric 版在各名稱後加 `_t`，同一筆資料僅寫入目前可見模式。Toric axis 使用 `#k1-right-t-axis` / `#k2-right-t-axis`；SIA 與 incision 使用 `#sia-right` / `#inc-right`，左眼對應 left。A constant 為 `#A-Constant1`、`#A-Constant2`。

網站介面與其公開表單驗證規則均要求 Sex；LT/CCT 標為 optional。Sex 使用 `name="gender_1"`（M）/ `name="gender_2"`（F）的互斥 checkbox。已建立僅針對此已知控制組的對應，從面板 male/female 設定 checked 狀態並讀回，預覽失效或多選異常時停止。Toric、Keratoconus 模式仍由使用者在網站確認；沒有把任意 checkbox 當成通用 autofill。

### EVO

`#txtAL`、`#txtK1`、`#txtK2`、`#txtACD`、`#txtLT`、`#txtRefraction`、`#txtAConstant`。眼別為 `#RadioButtonRLEye_0`（Right，value=1）與 `_1`（Left，value=0）。

`#DropDownLASIK` 選項值：0 No、1 Myopic、2 Hyperopic、3 Radial Keratotomy。歷史屈光度為 `#txtPreLASIK` / `#txtPostLASIK`，初始 disabled；需先選正確模式後再預覽。

Posterior cornea：`#txtPK1` / `#txtPK2`；頁面在框外印負號，輸入預期正的 magnitude，因此 adapter 僅在明確對應 PK 欄位時取絕對值，並保留轉換資訊。Toric 後角膜軸向為 `#TxtPK1axis` / `#TxtPK2axis`。這些欄位不能用 PCA cylinder 或 total keratometry 取代。

`#txtCCT` 存在，2026-11-15 重新檢查公開表單時，其 label/title 仍未標出 mm 或 µm。使用者已於本輪明確確認 EVO 應輸入 **µm，例如 543**；v0.3.4 以此已確認偏好啟用 CCT，設定亦可明確改為 mm，讀寫會在目標 mm 與共用模型 µm 間轉換。未指定有效單位時不讀寫此欄。單位依據是使用者確認，並非聲稱網站現已標示單位。

Kane 的 K index 可能以代碼儲存 option value；v0.3.4 對此已對應的 Index 下拉，讀取其數值 option 文字作為共用模型值。這修正與原生報告中的 `kIndex` 讀回不一致有關；原報告已遮蔽不匹配原值，未能僅由報告證實其實際代碼。尚需新版原生讀回驗證。

### Solver

Regular 的雙眼欄位以完整 label 對應：`AL (mm)`、`K1 (D)`、`K2 (D)`、`ACD (mm)`、`LT (mm)`、`CCT (µm)`、`A constant`、`Target refraction (D)`。不儲存 `input-55` 等一次載入時生成的 ID。若同名 label 數量不為 2，停止填入該欄。

Complex 另有 `Pre-LVC anterior corneal radius (mm)`、`Corrected ametropia (D)`、`Measured Posterior Corneal Radius (mm)`、`Total Keratometry - IOLMaster700 (D)`、`TCRP (D)`。保留各自資料鍵，不把 radius 當成屈光度。

Second 的對側眼專用資料鍵為 `fellowAl`、`fellowK1`、`fellowK2`、`fellowLt`、`fellowCct`、`fellowIolPower`、`fellowRefraction`。網站說明兩眼需同 IOL model；AL 差異 >0.65 mm 或 ARC 差異 >0.22 mm 時會停用 Second 功能。這是網站既有檢核，extension 不複製計算或自行修改限制。

Toric 實際 UI 欄位：K1 axis、SIA、Incision axis、Toric IOL Style、Residual cylinder notation、PR1/PR2 (mm)、PK1/PK2 (D)、Post. Cylinder (D)、PR2/PK2 axis。以標示為 `SYNTHETIC SOFTWARE TEST - NOT A PATIENT` 的軟體測試資料，經一般計算結果選取 IOL Power 後進入 Toric，確認這些 input 的 label、type、readonly 屬性。adapter 對應 K1 axis、SIA、incision、PK1、PK2、PK2 axis；沒有把 generic PCA axis 直接代入 steep PK2 axis。PR1/PR2 半徑與 Post. Cylinder 的符號慣例保留人工確認。上方 patient/index/biometer 為 readonly，不會覆寫。

## 使用與驗證邊界

初次進入部分網站會有標準使用條款畫面。實際 extension 不自動同意條款、不替使用者選病況、不提交計算。請由使用者在目的網站先選眼別、模式、IOL 與儀器，extension 再顯示逐欄預覽。來源空白、disabled、readonly、重複無法判斷、模式未出現的欄位保留空白或回報未對應。

本次驗證沒有取得或處理真實病人資料。仍需要以去識別的測試報告逐站確認讀回、填入、重新 render 後的值保留，以及網站改版時的 selector 回歸。

另以 extension 的 `siteBridge('preview', ...)` 在八個實際網站執行僅尋找欄位的 smoke check，沒有寫入數值。ESCRS、Cooke Default、Kane Non-toric、EVO、EVO Toric、Solver Regular / Complex / Second 的預期可見基本欄位均回報 `ready`；EVO Toric 的 K axes、SIA、incision、posterior K axes 亦正確匹配。尚未啟用的特殊模式欄位回報 `missing`，例如 Cooke Default 下的 Age/TK、Kane Non-toric 下的 axis，以及 disabled 的 LVC history，符合預期。這項檢查不測試寫入後框架是否接受值。
