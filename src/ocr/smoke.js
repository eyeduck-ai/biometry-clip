// A development-only page. It is deliberately not included in the Vite entries.
import { recognizeFiles } from './index.js';

const status = document.querySelector('#status');
const result = document.querySelector('#result');
for (const button of document.querySelectorAll('button')) button.addEventListener('click', async () => {
  document.querySelectorAll('button').forEach(element => { element.disabled = true; });
  result.textContent = '';
  try {
    const type = button.dataset.fixture;
    const response = await fetch(new URL(`./fixtures/synthetic-biometry.${type}`, import.meta.url));
    if (!response.ok) throw new Error(`Fixture HTTP ${response.status}`);
    const blob = await response.blob();
    const file = new File([blob], `synthetic-biometry.${type}`, { type: type === 'pdf' ? 'application/pdf' : 'image/png' });
    const output = await recognizeFiles([file], { ocrProvider: 'local', localModel: button.dataset.model }, message => { status.textContent = message; });
    result.textContent = JSON.stringify(output, null, 2);
    status.textContent = '辨識完成；請核對 OD AL=23.45、OS AL=24.10。';
  } catch (error) { status.textContent = `失敗：${error.message}`; }
  finally { document.querySelectorAll('button').forEach(element => { element.disabled = false; }); }
});
