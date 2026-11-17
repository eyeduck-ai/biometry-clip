import './styles.css';
import { createPanelBootstrap } from './panel-bootstrap.js';
import { reportPanelStatus } from './panel-status.js';
import { UI_LANGUAGE_KEY } from './ui-language.js';

const bootstrap=createPanelBootstrap({document,window,report:reportPanelStatus,loadApp:()=>new URLSearchParams(location.search).get('view')==='qa'?import('./qa/app.js'):import('./app.js')});
// Keep startup independent of the full app and read only the interface preference.
async function restoreLanguage(){
  try{
    const language=globalThis.chrome?.runtime?.id?(await chrome.storage.local.get(UI_LANGUAGE_KEY))[UI_LANGUAGE_KEY]:globalThis.localStorage?.getItem(UI_LANGUAGE_KEY);
    if(bootstrap.phase!=='ready'&&bootstrap.phase!=='disposed')bootstrap.setLanguage(language);
  }catch{/* Startup remains usable in English if preference storage is unavailable. */}
}
restoreLanguage();
bootstrap.start();
