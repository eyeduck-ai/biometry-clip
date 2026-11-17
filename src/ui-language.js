export const UI_LANGUAGE_KEY='biometryUiLanguage';
export const normalizeUiLanguage=value=>value==='zh-TW'?'zh-TW':'en';
export const isUiLanguage=value=>value==='en'||value==='zh-TW';

export function sameSupportedDocument(senderUrl,tabUrl,matchSite){
  try{
    const a=new URL(senderUrl),b=new URL(tabUrl);
    return !!matchSite(a.href)&&!!matchSite(b.href)&&a.origin===b.origin&&a.pathname===b.pathname;
  }catch{return false;}
}
