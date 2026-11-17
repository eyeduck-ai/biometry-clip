import {readFile} from 'node:fs/promises';
import {validateEscrsConstants,queryEscrsConstants} from '../src/escrs-constants.js';
const data=validateEscrsConstants(JSON.parse(await readFile(new URL('../data/escrs-formula-constants.json',import.meta.url),'utf8')));
const rows=queryEscrsConstants(data,{query:process.argv.slice(2).join(' ')});
console.log(JSON.stringify({sourceUrl:data.sourceUrl,capturedAt:data.capturedAt,matches:rows.length,rows},null,2));
