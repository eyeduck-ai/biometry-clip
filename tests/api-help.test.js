import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {apiHelpMarkup} from '../src/api-help.js';
import {preferenceSettingsMarkup} from '../src/workbench-ui.js';
import {messages} from '../src/locales/en-help.js';

test('provider guides are collapsed native disclosures with official protected links',()=>{
  const dom=new JSDOM(preferenceSettingsMarkup({ocrProvider:'gemini'})),doc=dom.window.document;
  const officialHosts=new Set(['aistudio.google.com','aistudio.baidu.com','www.paddleocr.ai']);
  const guides=doc.querySelectorAll('[data-api-help]');
  assert.equal(guides.length,2);
  for(const guide of guides){
    assert.equal(guide.tagName,'DETAILS');assert.equal(guide.open,false);
    assert.equal(guide.firstElementChild.tagName,'SUMMARY');
    assert.equal(guide.querySelectorAll('ol > li').length,4);
    assert.equal(guide.querySelectorAll('input,select,textarea,button,script,iframe').length,0);
    for(const link of guide.querySelectorAll('a')){
      const url=new URL(link.href);assert.equal(url.protocol,'https:');assert.ok(officialHosts.has(url.hostname));
      assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(url.search,'');
      assert.equal(link.target,'_blank');assert.ok(link.relList.contains('noopener'));assert.ok(link.relList.contains('noreferrer'));
    }
  }
  assert.equal(doc.querySelector('[data-api-help="gemini"] a').href,'https://aistudio.google.com/api-keys');
  assert.ok(doc.querySelector('[data-api-help="paddle-api"] a[href="https://aistudio.baidu.com/account/accessToken"]'));
  assert.equal(apiHelpMarkup('unknown'),'');dom.window.close();
});

test('opening help keeps unsaved credentials, field identities and form submission intact',()=>{
  const source={ocrProvider:'paddle-api',geminiApiKey:'SYNTHETIC "><script>blocked</script>',paddleApiToken:'SYNTHETIC & TOKEN'};
  const dom=new JSDOM(preferenceSettingsMarkup(source)),doc=dom.window.document,form=doc.querySelector('form');
  const key=doc.querySelector('[name="geminiApiKey"]'),token=doc.querySelector('[name="paddleApiToken"]');
  assert.equal(key.type,'password');assert.equal(token.type,'password');
  assert.equal(key.value,source.geminiApiKey);assert.equal(token.value,source.paddleApiToken);assert.equal(doc.querySelectorAll('script').length,0);
  token.value='UNSAVED SYNTHETIC TOKEN';const before=[...new dom.window.FormData(form)];let submitted=0;
  form.addEventListener('submit',event=>{submitted++;event.preventDefault();});
  for(const guide of doc.querySelectorAll('[data-api-help]')){
    const summary=guide.firstElementChild;
    // Keep native summary semantics so browsers provide Enter/Space activation.
    assert.equal(summary.getAttribute('tabindex'),null);assert.equal(summary.getAttribute('role'),null);
    summary.focus();assert.equal(doc.activeElement,summary);
    summary.click();assert.equal(guide.open,true);summary.click();assert.equal(guide.open,false);
  }
  assert.equal(doc.querySelector('[name="geminiApiKey"]'),key);assert.equal(doc.querySelector('[name="paddleApiToken"]'),token);
  assert.deepEqual([...new dom.window.FormData(form)],before);assert.equal(submitted,0);
  assert.equal(token.value,'UNSAVED SYNTHETIC TOKEN');dom.window.close();
});

test('English guide dictionary covers every Chinese UI fragment without altering provider identifiers',()=>{
  const dom=new JSDOM(apiHelpMarkup('gemini')+apiHelpMarkup('paddle-api')),doc=dom.window.document;
  const walker=doc.createTreeWalker(doc.body,dom.window.NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const source=walker.currentNode.nodeValue.trim();if(!/[\u3400-\u9fff]/.test(source))continue;
    assert.ok(Object.hasOwn(messages,source),`Missing English guide copy: ${source}`);
    assert.doesNotMatch(messages[source],/[\u3400-\u9fff]/);
  }
  assert.ok(Object.values(messages).some(value=>value.includes('PP-OCRv6')));
  assert.ok(Object.values(messages).some(value=>value.includes('not guaranteed')));dom.window.close();
});
