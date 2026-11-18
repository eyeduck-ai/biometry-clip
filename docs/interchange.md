# Biometry-Clip 個案與病人資料庫 JSON

JSON 匯出分為目前工作副本（`kind: "case"`）與全部病人／歷史測量（`kind: "library"`）。兩者使用 `format: "biometry-clipboard"`、含時區的 `exportedAt` 與完整 `units`。一般備份使用 `schemaVersion: "1.3"`，有報告摘要的備份使用 **1.4**。另見 [biometry-parser 交換流程](parser-exchange.md)。

- [JSON Schema（1.4／1.3／1.2／1.1／1.0）](../schemas/biometry-clipboard.schema.json)
- [凍結的 1.1 Schema](../schemas/biometry-clipboard-1.1.schema.json)
- [凍結的 1.0 Schema](../schemas/biometry-clipboard-1.0.schema.json)
- [合成單一個案](../examples/biometry-case.synthetic.json)
- [合成病人及兩次測量](../examples/biometry-library.synthetic.json)

Schema 採 [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core)；不同專案可以用相應 validator 驗證文件結構。專案解析器另外驗證重複紀錄 ID、十進位數值、基本量測正值與軸向範圍，這些檢查不代表臨床合理性判斷。

## 結構

單一工作副本的資料放在 `case`：

```json
{
  "format": "biometry-clipboard",
  "schemaVersion": "1.3",
  "kind": "case",
  "exportedAt": "2026-11-15T02:00:00.000Z",
  "units": { "...": "完整欄位單位表，見合成範例" },
  "case": {
    "version": 1,
    "patient": { "patientId": "SYNTHETIC-001" },
    "activeEye": "OD",
    "eyes": {
      "OD": { "al": "23.45", "cct": "543", "target": "0", "toric": false },
      "OS": { "al": "24.10", "cct": "551", "target": "-0.50", "toric": true }
    }
  }
}
```

上面縮寫了單位表，供說明結構；實際可解析文件請用完整合成範例或 `exportCaseDocument()` 產生。`activeEye` 只是開啟編輯器時顯示哪一眼，不代表只匯出該眼，也不會把數值搬到另一眼。

病人資料庫文件將 `case` 換為 `patients` 陣列，每個項目包含：

| 欄位 | 意義 |
| --- | --- |
| `id` | 來源專案的病人紀錄 ID；不是臨床 `patientId` |
| `patient` | 病人目前的識別資訊 |
| `createdAt`、`updatedAt` | 來源紀錄建立／更新時間，可為空字串 |
| `measurements[]` | 多次測量快照，順序保持不變 |

每筆測量都有自己的 `id`、`label`、`measuredAt`、`source`、`patient`、`eyes`、`createdAt`、`updatedAt`。**測量中的 `patient` 是當時的快照**；年齡、醫師、姓名或 ID 可以與病人目前的 `patient` 不同。匯出與匯入不能用目前病人資料覆蓋歷史快照，也不能只取第一筆測量。

## 值與單位

數值欄位可由交換來源提供 JSON number 或十進位字串，解析後及本專案匯出時統一保留為字串。使用字串可保留來源的位數（例如 `"3.20"`）。科學記號字串、含單位的字串、`NaN`／無限值、物件或 `null` 均拒絕。JSON number 的精度受來源 JSON 執行環境影響，因此 ID 與需要保留精確位數的值應使用字串。

| 單位 token | 適用欄位 |
| --- | --- |
| `mm` | AL、ACD、LT、WTW、角膜 radius，以及相應對側眼欄位 |
| `um` | CCT、fellowCct；`um` 代表 µm |
| `D` | K1/K2、TK、後角膜 K、屈光度、target、SIA、PCA、planned／implanted／fellow IOL power、IOL cylinder 等 |
| `deg` | 軸向；一般 0–180，incisionAxis 0–360 |
| `1` | 無因次數值：K index、A constant、lens factor 及換片常數 |
| `year` | `patient.age` |

完整單位表以匯出文件與 Schema 的 `units` 為準。解析器要求逐欄符合此版本，不會將 CCT 的 `mm` 推測成 `um`，也不會從 K 推導 TK、由目標屈光度推導病史或從一眼推導另一眼。所有欄位名稱均為 Schema 中的英文 key。

缺值可省略欄位或使用空字串 `""`；兩個眼別容器 `OD`、`OS` 必須都存在，但可以是空物件。`0`／`"0"` 是有效數值，與缺值不同。負值在屈光度、target 等欄位保留。`toric` 與 `keratoconus` 只接受 boolean；`false` 不會被當成缺值。`lvcType` 接受空字串、`none`、`myopic`、`hyperopic`、`rk`、`keratoconus`（舊版兼容）及 `unknown`（只有啟用 LVC、子類型未確認）；各眼獨立。`biometer` 與 `posteriorBiometer` 為不同的文字欄位（一般量測儀器／後角膜儀器），`argos` 為空字串、`yes` 或 `no`。

## 1.1 新增的計畫植入值

`eyes.OD.plannedIolPower` 與 `eyes.OS.plannedIolPower` 是**計畫使用的球面等效 IOL 度數（D）**，來自另一個計算流程或使用者明確輸入。TECNIS 將該輸入稱為 SE IOL Power，與 biometry 量測不同，見 [官方 Calculator Help](https://tecnistoriccalc.com/calculator/)。欄位為 optional；不自行計算或由其他欄位補值。

| key | 意義 |
| --- | --- |
| `plannedIolPower` | 本次計畫植入的 spherical-equivalent IOL power |
| `implantedIolPower` | 既有術後／換片分析中，已經植入的 IOL power |
| `fellowIolPower` | 對側已手術眼的 IOL power |
| `target` | 目標屈光度，不是 IOL power |

以上四值獨立保存，不能因為都用 D 就互相替代。新增值不會改寫已保存測量；舊紀錄缺少 `plannedIolPower` 時仍保持缺值。數值 `"0"` 或負值按數值保留；是否符合目的網站範圍由該站 adapter 檢查。

## 交換版本與相容

- 1.3 與 1.4 的 `units` 相同，包含 `plannedIolPower: "D"`，即使目前沒有填入該值也須宣告。
- 1.4 新增選用的 `case.report` 或每筆 `measurement.report`，是自 biometry-parser 1.2 擷取的精簡快照。保留來源欄位狀態與相關單位，省略逐頁辨識證據、圖檔、計算表和任意 metadata。個案草稿的編輯值仍存於 `patient`／`eyes`。
- 已有 `schemaVersion: "1.0"` 的 case／library 仍可完整匯入，使用原來的**精確欄位集合與單位表**，不要求補上新單位、不改變舊值。可用 [舊版個案範例](../examples/biometry-case.v1.0.synthetic.json) 與 [舊版整庫範例](../examples/biometry-library.v1.0.synthetic.json) 回歸。
- 宣告 1.0 的文件不可帶入新 `plannedIolPower` 值或單位，即使值是空字串也不接受。1.1 缺少或錯誤宣告該單位同樣拒絕；不會偷偷按另一版本解析。
- 1.0／1.1／1.2 文件匯入後重新匯出會成為 1.3，但不會替舊眼別憑空產生計畫植入值。未知版本一律拒絕。
- 內部個案的 `version: 1`、持久病人資料庫及 Chrome 工作副本版本不受影響；此次更新只擴充可選欄位與外部交換封套，不需要重設資料庫。

後續擴充資料模型時，先確認語意與單位，再新增獨立的 optional key。新的交換語意須另增 schemaVersion，保留每個已發布版本的 units／eye vocabulary，並同步更新 adapter、Schema、範例和舊文件回歸；不要以同一版本重新解釋原有欄位，也不要因為數值單位相同而把不同用途的值當成別名。

## 程式 API

```js
import {
  exportCaseDocument,
  exportLibraryDocument,
  parseInterchange,
} from './src/interchange.js';

const caseDocument = exportCaseDocument(currentCase);
const libraryDocument = exportLibraryDocument(savedLibrary);
const result = parseInterchange(JSON.parse(fileText));
// result = { kind: 'case' | 'library', data, warnings: [] }
```

`result.data` 是已驗證的內部個案或 library 結構，不會自行寫入任何儲存區。交換版 library 不攜帶本機 `revision`；解析後的中繼結構使用 `revision: 0`，只供資料表示，不能拿它覆蓋目前資料庫版本。

資料庫匯入必須透過新加的 `library.importPatients(patients, expectedRevision)` 或同名 service／platform 操作：先取得**目前本機** library revision，再一次追加整批病人。

```js
const incoming = parseInterchange(fileText);
if (incoming.kind === 'library') {
  const current = await platform.loadLibrary();
  const result = await platform.importPatients(
    incoming.data.patients,
    current.revision,
  );
  // result.library：新的整份資料庫
  // result.imported：來源 ID -> 新本機 ID 的對照，僅存在回應中
}
```

此動作在 library 的既有序列鎖內完成，先驗證整批資料，再為每位病人及每筆測量建立新 ID，最後只寫入一次。任何格式、版本衝突、儲存失敗或容量問題都不會留下半批紀錄。匯入保留全部測量值、歷史身份、`label`、`measuredAt` 與 `source`；本機紀錄的 `createdAt`／`updatedAt` 改為這次匯入時間。原本的病人、測量、一般工作副本與 API 設定均不被更動。來源 ID 對照不寫入病人資料庫。

## 舊版與錯誤

解析器仍接受舊版直接匯出的 `{version:1, patient, eyes, activeEye}` 個案，以及 `{version:1, revision, patients}` library；回傳 `warnings` 提醒舊文件沒有明示單位，僅按原專案定義讀取。這不適用來自任意其他專案、單位不明的裸 JSON。

未支援的 `format`／`schemaVersion`／`kind`、錯誤單位、未知欄位、缺漏眼別結構、重複來源 ID 或無效值會丟出帶 `code` 的 `InterchangeError`，不會靜默截斷或猜測。**`biometry-native-qa-v1` 是驗收報告，不能當作病人／量測資料匯入。** 後續新增欄位或改變語意應明確更新交換版本，不以同一版本重新解釋既有 key。


## 1.2 的識別、模式與晶體來源

`patient.initials` 可獨立保存原始 Initials；貼上時的 ID／代稱備援不會改寫此欄。`keratoconus` 是獨立 boolean，並不代表 LVC。ESCRS Post-LVC 總開關開啟只能讀為 `lvcType: "unknown"`，不能推測成 myopic。`posteriorBiometer` 不使用一般儀器預設值。

每眼另可保存 `iolSourceSite`、`iolSourceValue`、`iolSourceLabel`、`iolCatalogId` 四個文字欄位（上限 100 字）。來源網站選項、family 與精確 model 的層級必須保留；沒有經核對的對照時 `iolCatalogId` 留空。更新來源品項時，未明確一起匯入的新 ID 會清除，避免沿用舊晶體身份。

晶體選項和站別參數用獨立的 `biometry-lens-catalog` 1.0 格式保存，見 [目錄研究與限制](research-lens-catalog.md) 與 [Schema](../schemas/biometry-lens-catalog.schema.json)。常數不跨站自動套用。一般個案檔與目錄檔可透過「匯入 → JSON」分別載入。

1.0／1.1 的眼別欄位及 patient 欄位仍採各版凍結詞彙；不能僅換舊版標籤夾帶新欄。升級匯出採 1.2，舊版讀入不會補入新的測量值。設定中的 Toric／儀器預設只在貼上時套用至副本，不會改寫已保存測量或 JSON 原值。


## 1.3 的晶體來源 context

每眼新增 optional 字串 `iolSourceControl`、`iolSourceManufacturer`、`iolSourceRole`，連同既有來源 site/value/label/ID 保持一筆完整身份。它們用來區分同站各眼控制、ESCRS 廠商上下文，以及 Barrett Rx 的 primary／implanted／exchange 用途。只更動 context 時也會清除未明確一同更新的舊目錄 ID；不以相同名稱掩蓋不同廠商或用途。

[晶體目錄 Schema](../schemas/biometry-lens-catalog.schema.json) 1.1 可保存帶來源的精確 aliases、明示 member/family/geometry targets 及站別參數；1.0 保持原詞彙。來源只有系列／群組或幾何設定時，不會反向補出不存在的精確型號。另有 [凍結的 1.2 個案 Schema](../schemas/biometry-clipboard-1.2.schema.json) 與 1.2 合成範例供跨版本測試。
