# APACRS 欄位研究

查核日期：2026-11-14。以下五個網址均透過實際 Chrome 頁面的 Patient Data DOM、input ID、select options 查核。沒有送出 Calculate，沒有使用真實病人資料。`verified: true` 僅指初始資料表單與 selectors 已實測存在，不代表已驗證公式計算結果、後續結果分頁或所有動態模式。

原始 HTML 的自動 HTTP 擷取得到 403；瀏覽器頁面可正常開啟。文字爬取頁會把隱藏驗證器誤列成常時顯示文字，因此以實際 DOM 為 selectors 的依據。

## 最小資料模型

主要眼部資料為 **AL、optical ACD、K1、K2、target refraction**。LT、WTW 在 Universal II / True K 明確置於 Optional。這五頁的初始表單沒有 CCT、gender、surgeon ID；不要為了 APACRS 強制輸入。Doctor Name 與 surgeon ID 的語意不同；本 adapter 只映射 `patient.surgeonName`。Patient Name 有 required validator，可輸入使用者自行選擇的病人代稱；擴充功能不自動捏造姓名。Patient ID、Doctor Name 沒有 required validator。

除 biometry 外仍需使用者確認 IOL 型號與對應常數。Lens Factor 與 A Constant 是替代輸入，不能把通用預設常數當作指定晶體常數。擴充功能保留網站選擇的 K index（1.3375 或 1.332），不自動換算。K 輸入單位是 D，不是 radius mm。網站 Optical ACD 不應靜默混用 endothelium-referenced aqueous depth。

## 各頁

| 網站 | 眼別與模式 | 實測輸入 / 特殊需求 |
| --- | --- | --- |
| [Barrett Universal II](https://calc.apacrs.org/barrett_universal2105/) | OD/OS 同頁 | AL、K1、K2、optical ACD、target；optional LT/WTW。共同病人、醫師、晶體常數。 |
| [Barrett True K](https://calc.apacrs.org/Barrett_True_K_Universal_2105/) | OD/OS 同頁；各眼獨立病史 | Universal II 資料 + History、Pre-Lasik Ref、Post-Lasik Ref。History 的實際選項是 Myopic Lasik、Hyperopic Lasik、Radial Keratotomy、Keratoconus。 |
| [Barrett Toric](https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx) | 單眼；先點 OD/OS | Flat K/Axis、Steep K/Axis、AL、ACD、target、SIA、incision location；LT、WTW；額外 optional biometer K1/K2 與 IOL Power。 |
| [Barrett True-K Toric](https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx) | 單眼；先點 OD/OS；LVC/RK/KC | Toric 資料 + History、Pre-/Post-Lasik refraction。兩個 optional K 欄位在此表單 disabled。初始 Patient Data 沒有 TK/PCA 的獨立欄位；URL 中的 TK 不能當作 TK→K 對應依據。 |
| [Barrett Rx](https://calc.apacrs.org/barrett_rx105/) | 單眼；術後分析、Exchange / Piggy Back | 植入 IOL power、植入 toric cylinder/axis、術後 sphere/cyl/axis、術後 K 與軸度、optional 術前 K 與軸度、AL/ACD/target、SIA/切口、LT/WTW；植入與換片常數分開。ELP / IOL 模式由使用者在網站選擇。 |

### 已核對的 ID 規則

Universal II 與 True K：`#MainContent_Axlength` / `#MainContent_Axlength0` 分別為 OD / OS。K1 使用 `MeasuredK1` / `MeasuredK10`；K2 使用 `MeasuredK2` / `MeasuredK20`，不可把尾端的 0 當作小數或欄位序號。ACD、Refraction、LensThickness、WTW 亦以尾端 0 表示 OS。

三個單眼頁面的 AL ID 大小寫為 `#MainContent_AxLength`；K 使用 `#MainContent_MeasuredK`、`#MainContent_MeasuredK0`；軸度使用 `#MainContent_MeasuredAxis`、`#MainContent_MeasuredAxis0`。`#MainContent_Rad1` 為 OD，`#MainContent_Rad2` 為 OS。兩個 radio 的 onclick 明確呼叫 ASP.NET `__doPostBack`，因此**不在逐欄填入過程中切換眼別**；先讓使用者選眼，檢查網站與面板眼別相符後才寫入。

### Toric 所需資料

SIA 是 D，incision location 可為 0–360 度；K 軸度是 0–180 度。不能把 incision location 全部縮到 180 度。不能自行假設 SIA、目標屈光度、切口位置或其他缺失數值；0 是有效值，不等於空白。flat/steep K 與 axes 成對保留，不推算缺少的軸度。

網頁保留 `+ve Cylinder` / `-ve Cylinder` 顯示選項；adapter 不擅自改變符號慣例。optional K1/K2 tooltip 在 Rx 指明：若 topography 用於 toric calc，該欄可另填 optical biometer Ks 用於 IOL power；所以不把一般 K 重複貼入 optional Ks。

### Rx 的術前／術後語意

`MainContent_MeasuredK*` 在 Rx 專指 **術後 K**，不映射一般 biometry `k1/k2`，而使用 `postOpK1/postOpK2`。術前 Ks 有獨立 `MainContent_PreOpFlatK/PreOpSteepK/PreOpFlatAxis/PreOpSteepAxis`；tooltip 指出它們 optional，但做 SIA analysis 時需要。術後屈光與 target 是不同值。

`MainContent_ImplantedToricCylinder` 的 options 顯示 0、T2、T3、T4、T5、T6、T7、T8、T9，實際 value 為 0、1.0、1.5、2.25、3.0、3.75、4.5、5.25、6.0，為植入 IOL cylinder；不推論使用者眼中的角膜 cylinder 或用 T-model 名稱反推實際晶體。

`MainContent_LensFactorEx/AconstantEx` 是換片常數，與植入晶體 `MainContent_LensFactor/Aconstant` 不同。頁面提示 sulcus 使用時的常數調整屬臨床／公式設定，本程式不自行套用。

## 查核限制

沒有提交計算，因此 Universal Formula、K Calculator、Toric IOL、Rx Exchange、Rx Piggy Back 結果頁與依計算條件才出現的欄位未納入已驗證範圍。網站未來可能更換 ID；執行時仍需預覽實際找到、跳過、衝突、無法辨識的欄位。未找到的欄位應明確列出，不用猜測 selector 或隱藏地寫入相似欄位。
