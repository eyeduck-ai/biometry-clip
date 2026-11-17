# 晶體跨站選取與目錄 1.1

`src/lens-transfer.js` 將已核對的目的選項經網站 UI 選取，與 biometry 數值、來源常數分開。`lensTransferBridge` 為可序列化的獨立函式，供 `chrome.scripting.executeScript` 在主 frame 使用；Chrome 會等待注入函式回傳的 Promise，見 [官方 scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)。

## Runtime 契約

```js
const definition = {
  siteId: 'example', url: 'https://calculator.example/form',
  controls: [{
    id: 'primary', eye: 'OD', role: 'primary',
    control: 'native-select', selector: '#IOLModel',
    navigationExpected: true,
    parameters: [{key:'aConstant', selector:'#AConstant', unit:'1'}],
  }],
};
```

每個 control 必須有唯一 id，兩眼可用不同 id 或明確 eye。支援 `native-select`、`linked-select` 與 `custom-family`。自訂清單只操作唯一原生 UI activator 與其 `aria-controls`／`aria-owns` 連結的清單；[WAI-ARIA combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) 將 popup 與目前值分開。無連結時必須有已核對的 `menuSelector`、`allowUnlinkedMenu`，且目前只有一個展開的 owner。不能搜尋全頁第一個同名項目。

`valueMode: 'label'` 用於 K6、DGS 等把完整 JSON／內部物件藏在欄位值的 UI：交換識別使用明確 label，真正選取仍只能點唯一、可操作的現場 option。`options` 種子只輔助分辨 model／family／group／geometry，不能作為未顯示選項的點擊證據。

`searchInput: true` 可在已核對的 autocomplete 輸入解析後的目的 label 作為搜尋字詞，等待過濾結果，再精確點擊；單純 collect 不修改搜尋文字。`requireOptionCommit: true` 用於 autocomplete，即使顯示文字已相同，也必須展開並點擊唯一精確 option。`role: 'manufacturer'` 的步驟先於 model；prepare 按 definition 順序執行。`requireNoResultsSelector` 可阻擋已知會因切晶體觸發重算／確認視窗的分支。

```js
const transfer = createLensTransfer({run, checkedTab, onUpdated: chrome.tabs.onUpdated});
const inventory = await transfer.inspect(tabId, definition);
const collected = await transfer.collect(tabId, definition, {eye:'OD', guard});
const result = await transfer.prepare(tabId, definition, [
  {controlId:'primary', eye:'OD', value:'MODEL', label:'Exact model',
   kind:'model', catalogId:'manufacturer:exact-model'},
], {guard});
```

`run(tabId, action, definition, request)` 需執行 `lensTransferBridge`，回傳其結果加 `documentId`；`checkedTab(tabId, siteId)` 必須檢查目前分頁仍是該入口。每個等待與動作前均呼叫 guard。Promise／函式不會放入注入參數。

inspect/read 不展開選單。collect 只展開、讀、關閉，並最後核對選擇未改變；網站若自行改值，該次收集失敗而不宣稱保留成功。prepare 先展開清單、精確核對、選取，再等待新文件／載入完成與 selected、站別參數一起穩定 350ms。後續步驟重設先前型號時失敗，不宣稱完整選取成功。

缺項／不唯一／不可操作回 manual／partial，保留原站值。來源版本變更、離開入口、回傳未穩定及步驟互相重設均拋錯並停止。geometry 只有已核對 canonical ID 與明確 `relation:'geometry'` 的投影才可使用，不能由 generic Standard／Anterior 等值反推真實晶體。

## 目錄與解析

`biometry-lens-catalog` 新匯出版本為 1.1，保留 1.0 凍結欄位與原 resolver 回傳。source 可包含 controlId、eye、formula、role、manufacturer，並區分每公式／站別的常數 provenance。entry 的 aliases 是精確身分；targets 是有證據的 model→group／family／geometry 投影，允許多個精確型號使用同一目的站群組，但不能由來源群組推測其中單一型號。

```js
const resolved = resolveLensSelection(caseEye, siteId, catalog, liveSnapshot, {
  controlId:'model-OD', eye:'OD', role:'primary',
});
// ready: catalogId/canonicalId, precision, exact value+label,
// optional manufacturer/controlId/role/relation; no constants.
```

同名型號須以來源 manufacturer／control／role 消除歧義。目的 role 預設 primary，不會默認選入 Rx 的 implanted 欄。明確 aliases 優先，較粗層級 targets 次之；目的 option 仍須唯一、層級一致。來源仍須有已核對的 source option，現場清單關閉時可由 packaged published source 提供證據；真正寫入仍由 runtime 開啟清單核對。

Schema 在 `schemas/biometry-lens-catalog.schema.json`，凍結版在 `schemas/biometry-lens-catalog-1.0.schema.json`。來源快照的參數與 entry.parameters 永不由 resolver 回傳為跨站可填常數。

## 回歸範圍

`tests/lens-transfer.test.js`、`tests/lens-catalog-v11.test.js`、`tests/lens-catalog.test.js` 共 53 項通過。涵蓋真正序列化函式、native／linked／family UI、眼別、manufacturer→model、postback、來源／目的變更、參數延遲、群組投影、角色／廠商消歧、舊版詞彙與敏感欄位拒絕。這些是正式模組的合成 DOM／傳輸回歸，不宣稱使用者 Chrome 全站原生驗收完成。

## 正式平台整合

一般 quickFill 預設包含所選晶體，只有來源眼別有晶體身分才進入選取流程。一般依序為來源版本核對、選眼、晶體選取與目的常數穩定、眼別／模式重新準備；ESCRS 的清單受 Toric 開關篩選，因此有來源晶體時會先準備明確模式，再選晶體、再次核對模式，最後再次確認已接受晶體仍未被後續回傳重設，才填 biometry。眼別回傳遺失晶體時最多恢復一次；持續互相重設停止，不填錯眼。`includeLens:false` 可略過晶體，`includeConstants` 仍是另一個明確選項，預設不傳來源常數。

結果包含 `lensPreparation.status/controls/plans/warnings`，未匹配晶體的訊息與基本數值結果分開。OU 共用單一 model 欄位時，兩眼晶體不同不會默選最後一眼；其他獨立 biometry 欄位仍可傳輸。Rx 以來源角色區分 implanted 與 exchange，一般來源只處理 exchange。

`platform.readLensOptions(tabId,{collect,eye})` 提供 `controls` 與可保存的 `snapshots`，唯一 primary 控制仍有舊版 `selected/options` getter。普通網站 read 只自動複製各眼唯一 primary；Rx 的兩種角色透過 `lensInventory` 供使用者明確選擇。關閉的清單可引用已封裝公開選項作為對照證據，但實際選取仍重新開啟清單唯一核對。

`loadLensCatalog()` 固定合併已封裝目錄，舊版空 entries 不會停用新版對照。收集以 siteId、controlId、eye、manufacturer 分別保存，避免另一眼或另一製造商的清單被覆蓋；舊版單控件 source 在可唯一識別時補入 primary context。讀取不寫目錄，QA 讀取也不接觸正式目錄儲存。

`tests/lens-cross-site.test.js` 的 10 個端到端合成回歸使用真正序列化注入函式、兩個網站 DOM、正式 session／library 保存與歷史重載，驗證 EVO→Cooke 群組投影、Barrett postback、Rx 角色、OU 衝突、選眼恢復、來源變更、取消晶體選取，以及 ESCRS 先啟用 Toric 過濾再選 ZCU 且不動另一眼。這些亦不等於使用者 Chrome 原生驗收。
