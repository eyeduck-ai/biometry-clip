// Official hosted services. The ordinary UI needs only a key and model choice.
export const GEMINI_ORIGIN='https://generativelanguage.googleapis.com';
export const DEFAULT_GEMINI_MODEL='gemini-3.5-flash-lite';
export const GEMINI_MODELS=Object.freeze([
  ['gemini-3.5-flash-lite','Gemini 3.5 Flash-Lite'],
  ['gemini-3.1-flash-lite','Gemini 3.1 Flash-Lite'],
  ['gemini-3.6-flash','Gemini 3.6 Flash'],
]);
export const PADDLE_API_ORIGIN='https://paddleocr.aistudio-app.com';
export const DEFAULT_PADDLE_MODEL='PP-OCRv6';
export const PADDLE_API_MODELS=Object.freeze([
  ['PP-OCRv6','PP-OCRv6'],['PP-OCRv5-latin','PP-OCRv5 Latin'],['PP-OCRv5','PP-OCRv5'],
]);
export const PADDLE_RESULT_DOMAINS=Object.freeze(['bcebos.com','baidubce.com','aistudio-app.com']);

export function isCustomPaddleApi(settings={}){
  return settings.paddleApiMode==='custom'||(!settings.paddleApiMode&&!!String(settings.paddleApiUrl||'').trim());
}
export function paddleApiEndpoint(settings={}){
  if(!isCustomPaddleApi(settings))return PADDLE_API_ORIGIN;
  let url;try{url=new URL(settings.paddleApiUrl);}catch{throw new Error('請設定完整的 PaddleOCR /ocr API 網址。');}
  if(url.username||url.password)throw new Error('API 網址不可包含帳號密碼，請使用 token 欄位。');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('PaddleOCR API 必須使用 HTTPS；本機 localhost 可使用 HTTP。');
  if(url.search||url.hash)throw new Error('API 網址不可包含查詢參數或片段。');
  return url.href;
}
export function cloudPermissionOrigins(settings={}){
  if(settings.ocrProvider==='local')return [];
  if(settings.ocrProvider==='gemini')return [`${GEMINI_ORIGIN}/*`];
  const url=new URL(paddleApiEndpoint(settings));
  if(isCustomPaddleApi(settings))return [`${url.origin}/*`];
  return [`${PADDLE_API_ORIGIN}/*`,...PADDLE_RESULT_DOMAINS.map(domain=>`https://*.${domain}/*`)];
}
export function migrateCloudSettings(settings={}){
  settings=settings&&typeof settings==='object'?settings:{};
  return {...settings,...(!settings.paddleApiMode&&String(settings.paddleApiUrl||'').trim()?{paddleApiMode:'custom'}:{})};
}
