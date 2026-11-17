import test from 'node:test';
import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {recognizePdfPages} from '../src/ocr/pdf-pages.js';

// A real, entirely synthetic text PDF, generated without image/model fixtures.
function textPdf(pages) {
  const font=3+pages.length*2,objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,index)=>`${3+index*2} 0 R`).join(' ')}] >>`];
  pages.forEach((lines,index)=>{
    const page=3+index*2,stream=`BT /F1 12 Tf 50 720 Td ${lines.map((line,row)=>`${row?'0 -20 Td ':''}(${line}) Tj`).join('\n')} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${page+1} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let source='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(source));source+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(source);source+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(source));
}

test('real PDF.js text extraction reads only the selected page with OD and OS and never requests OCR',async()=>{
  const task=getDocument({data:textPdf([
    ['OD OS','AL 22.22 22.99','ACD 3.00 3.10'],
    ['OD OS','AL 23.45 24.10','ACD 3.20 3.40','CCT 543 551'],
    ['OD OS','AL 25.55 26.66','ACD 3.50 3.60'],
  ]),isEvalSupported:false,useSystemFonts:true,useWasm:false});
  try{
    const pdf=await task.promise,visited=[];
    const output=await recognizePdfPages({numPages:pdf.numPages,getPage:async index=>{visited.push(index);return pdf.getPage(index);}},{pages:[2],recognizeBlob:async()=>{throw new Error('text PDF must not load OCR');},createCanvas:()=>{throw new Error('text PDF must not allocate raster');}});
    assert.deepEqual(visited,[2]);assert.equal(output.pages[0].method,'pdf-text');
    assert.equal(output.candidates.eyes.OD.al,'23.45');assert.equal(output.candidates.eyes.OS.al,'24.10');
    assert.equal(output.candidates.eyes.OD.cct,'543');assert.equal(output.candidates.eyes.OS.cct,'551');
  }finally{await task.destroy();}
});
