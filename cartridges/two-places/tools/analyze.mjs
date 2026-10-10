import fs from 'node:fs'; import { decodePNG } from './png.mjs';
const img = decodePNG(fs.readFileSync('assets/sheet-source.png'));
const { width: W, data: D } = img;
const px = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i+1], D[i+2]]; };
const hex = c => '#' + c.map(v => v.toString(16).padStart(2,'0')).join('');
for (const [x,y] of [[10,10],[700,480],[400,120],[100,950],[700,1040],[300,1060],[200,440],[600,440],[560,980]]) console.log(x,y,hex(px(x,y)));
// pixel size: look along row through droober front face for run lengths
let runs=[], last=null, n=0;
for (let x=80;x<350;x++){ const c=hex(px(x,300)); if(c===last) n++; else { if(last) runs.push(n); last=c; n=1; } }
console.log('runs y=300', runs.join(','));
