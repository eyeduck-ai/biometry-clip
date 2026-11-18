export const messages = {
  '此版本支援 biometry-parser JSON schema 1.2。': 'This version supports biometry-parser JSON schema 1.2.',
  'biometry-parser JSON 的來源或眼別結構不正確。': 'The biometry-parser JSON has invalid source or eye data.',
  'biometry-parser 回報擷取失敗，請先檢查來源結果。': 'biometry-parser reported a failed extraction. Check the source result first.',
  'biometry-parser JSON 沒有可匯入的眼部測量值。': 'The biometry-parser JSON contains no importable eye measurements.',
  '請核對並選取要匯入的未驗證候選值。': 'Review and select the unverified candidates to import them.',
  'biometry-parser 報告摘要格式不正確。': 'The biometry-parser report summary is invalid.',
  'IOL 計算表保留在原始 JSON。': 'IOL calculation tables remain in the source JSON.',
  '請先填入共用眼部量測欄位，再匯出 biometry-parser JSON。': 'Enter at least one shared eye measurement to export biometry-parser JSON.',
  '來源報告病人 ID 與工作副本不一致，請先核對再匯出。': 'The source report and working copy have different patient IDs. Check them before exporting.',
  '無法辨識 JSON 資料格式；請使用個案、病人資料庫或 biometry-parser 輸出。': 'Unknown JSON format. Use a case, patient library, or biometry-parser export.',
};
export const rules = [
  [/^已略過衝突、單位不符或無效欄位：(.+)$/, (_, fields) =>
    `Skipped conflicting fields or invalid values or units: ${fields.replaceAll('、', ', ')}`],
];
