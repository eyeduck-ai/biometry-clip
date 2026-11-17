import {icon} from './ui.js';

// Static official links only: opening these instructions never uploads a report
// or reads the credential fields. Native details also preserve unsaved edits.
const links={
  geminiKeys:'https://aistudio.google.com/api-keys',
  geminiGuide:'https://aistudio.google.com/docs/api-key',
  paddleService:'https://aistudio.baidu.com/paddleocr',
  paddleToken:'https://aistudio.baidu.com/account/accessToken',
  paddleGuide:'https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/serving/paddleocr_official_api/overview.html',
};
const link=(url,label)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;

export function apiHelpMarkup(provider){
  if(provider==='gemini')return `<details class="extra api-help" data-api-help="gemini"><summary>如何申請 Gemini API key${icon('chevron',13)}</summary><ol class="small-note api-help-steps">
    <li>${link(links.geminiKeys,'開啟 Google AI Studio API Keys')}<span>，並登入 Google 帳號。</span></li>
    <li>建立 API key，選擇新專案；已有 Google Cloud 專案可先在 Projects 匯入。</li>
    <li>確認模型、配額與計費後，複製 API key。</li>
    <li>貼到上方 API key 欄位，選擇 Flash 模型並儲存。</li>
  </ol><p class="small-note">可用模型與額度依帳號／專案而定；不保證免費。</p><p class="small-note">${link(links.geminiGuide,'官方金鑰說明')}</p></details>`;
  if(provider==='paddle-api')return `<details class="extra api-help" data-api-help="paddle-api"><summary>如何取得 PaddleOCR Access Token${icon('chevron',13)}</summary><ol class="small-note api-help-steps">
    <li>${link(links.paddleService,'開啟 PaddleOCR 官方服務')}<span>，並登入百度 AI Studio。</span></li>
    <li>${link(links.paddleToken,'開啟 AI Studio Access Token')}<span>，取得並複製個人 Token。</span></li>
    <li>若服務要求啟用，完成啟用並確認帳號配額與計費。</li>
    <li>貼到上方欄位，選擇 PP-OCRv6 並儲存；不用填網址。</li>
  </ol><p class="small-note">使用 AI Studio Access Token，不是百度智能雲的 API Key／Secret Key。</p><p class="small-note">${link(links.paddleGuide,'官方 API 說明')}</p></details>`;
  return '';
}
