const fs = require('fs');
const zlib = require('zlib');

const OUT_DIR = process.platform === 'win32'
  ? 'E:\\claudeProject\\openclaw-desktop\\resources'
  : 'E:/claudeProject/openclaw-desktop/resources';

function createBuf(size) { return Buffer.alloc(size * size * 4, 0); }

function setPixel(buf, size, x, y, r, g, b, a) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const idx = (y * size + x) * 4;
  const sa = a / 255, da = buf[idx + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  buf[idx]   = Math.round((r * sa + buf[idx]   * da * (1 - sa)) / oa);
  buf[idx+1] = Math.round((g * sa + buf[idx+1] * da * (1 - sa)) / oa);
  buf[idx+2] = Math.round((b * sa + buf[idx+2] * da * (1 - sa)) / oa);
  buf[idx+3] = Math.round(oa * 255);
}

function fillCircle(buf, sz, cx, cy, rad, r, g, b, a) {
  const r2 = rad * rad;
  for (let y = Math.floor(cy-rad-1); y <= Math.ceil(cy+rad+1); y++)
    for (let x = Math.floor(cx-rad-1); x <= Math.ceil(cx+rad+1); x++) {
      const d2 = (x-cx)*(x-cx)+(y-cy)*(y-cy);
      if (d2 <= r2) setPixel(buf,sz,x,y,r,g,b,a);
      else if (d2 <= (rad+1)*(rad+1)) {
        const e = Math.max(0, 1-(Math.sqrt(d2)-rad));
        if (e > 0) setPixel(buf,sz,x,y,r,g,b,Math.round(a*e));
      }
    }
}

function fillEllipse(buf, sz, cx, cy, rx, ry, r, g, b, a) {
  for (let y = Math.floor(cy-ry-1); y <= Math.ceil(cy+ry+1); y++)
    for (let x = Math.floor(cx-rx-1); x <= Math.ceil(cx+rx+1); x++) {
      const d2 = ((x-cx)/rx)*((x-cx)/rx)+((y-cy)/ry)*((y-cy)/ry);
      if (d2 <= 1.0) setPixel(buf,sz,x,y,r,g,b,a);
      else if (d2 <= 1.15) {
        const e = Math.max(0, 1-(Math.sqrt(d2)-1)*Math.min(rx,ry));
        if (e > 0) setPixel(buf,sz,x,y,r,g,b,Math.round(a*e));
      }
    }
}

function drawClawIcon(size) {
  const buf = createBuf(size);
  const s = size / 256;

  // Background circle (purple)
  fillCircle(buf, size, size/2, size/2, size/2-2*s, 102, 51, 153, 255);
  fillEllipse(buf, size, size/2, size/2-20*s, size/2-8*s, size/2-20*s, 130, 70, 180, 80);

  // Claw base
  fillEllipse(buf, size, size/2, size*0.62, 52*s, 40*s, 220, 60, 40, 255);
  fillEllipse(buf, size, size/2, size*0.62-8*s, 36*s, 24*s, 255, 120, 80, 120);

  // Left pincer
  fillEllipse(buf, size, size/2-38*s, size*0.48-20*s, 30*s, 55*s, 220, 60, 40, 255);
  fillEllipse(buf, size, size/2-18*s, size*0.48-60*s, 20*s, 28*s, 220, 60, 40, 255);
  fillEllipse(buf, size, size/2-40*s, size*0.48-20*s, 18*s, 40*s, 255, 120, 80, 90);
  fillEllipse(buf, size, size/2-15*s, size*0.48-30*s, 10*s, 35*s, 160, 30, 20, 100);

  // Right pincer
  fillEllipse(buf, size, size/2+38*s, size*0.48-20*s, 30*s, 55*s, 220, 60, 40, 255);
  fillEllipse(buf, size, size/2+18*s, size*0.48-60*s, 20*s, 28*s, 220, 60, 40, 255);
  fillEllipse(buf, size, size/2+40*s, size*0.48-20*s, 18*s, 40*s, 255, 120, 80, 90);
  fillEllipse(buf, size, size/2+15*s, size*0.48-30*s, 10*s, 35*s, 160, 30, 20, 100);

  // Gap between pincers
  fillEllipse(buf, size, size/2, size*0.38, 8*s, 45*s, 102, 51, 153, 255);

  // Teeth on inner edges
  for (let i = 0; i < 3; i++) {
    const ty = size*0.30 + i*18*s;
    fillCircle(buf, size, size/2-8*s, ty, 4*s, 240, 60, 40, 255);
    fillCircle(buf, size, size/2+8*s, ty, 4*s, 240, 60, 40, 255);
  }

  // Arm
  fillEllipse(buf, size, size/2, size*0.78, 28*s, 22*s, 200, 50, 40, 255);
  fillEllipse(buf, size, size/2, size*0.78, 18*s, 14*s, 225, 100, 60, 80);

  // Outline ring
  const outerR = size/2-1*s, innerR = size/2-5*s;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x-size/2)*(x-size/2)+(y-size/2)*(y-size/2));
      if (d >= innerR && d <= outerR) {
        const alpha = Math.min(1, Math.max(0, 1-(d-innerR)/(outerR-innerR))) * 0.5;
        setPixel(buf, size, x, y, 60, 30, 100, Math.round(180 * alpha));
      }
    }

  return buf;
}

// PNG encoder
function crc32(buf) {
  let c = 0xFFFFFFFF;
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) { let v = i; for (let j = 0; j < 8; j++) v = (v&1)?(0xEDB88320^(v>>>1)):(v>>>1); t[i]=v; }
  for (let i = 0; i < buf.length; i++) c = t[(c^buf[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}

function pngChunk(type, data) {
  const tb = Buffer.from(type,'ascii');
  const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length,0);
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb,data])),0);
  return Buffer.concat([lb,tb,data,cb]);
}

function encodePNG(rgba, w, h) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6;
  const rows = [];
  for (let y=0;y<h;y++) { rows.push(Buffer.from([0])); rows.push(rgba.subarray(y*w*4,(y+1)*w*4)); }
  const comp = zlib.deflateSync(Buffer.concat(rows),{level:9});
  return Buffer.concat([sig,pngChunk('IHDR',ihdr),pngChunk('IDAT',comp),pngChunk('IEND',Buffer.alloc(0))]);
}

function encodeBMPForICO(rgba, w, h) {
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40,0); hdr.writeInt32LE(w,4); hdr.writeInt32LE(h*2,8);
  hdr.writeUInt16LE(1,12); hdr.writeUInt16LE(32,14);
  const andRow = (Math.ceil(w/8)+3)&~3;
  hdr.writeUInt32LE(w*h*4+andRow*h,20);
  const px = Buffer.alloc(w*h*4);
  for (let y=0;y<h;y++) { const sy=h-1-y; for(let x=0;x<w;x++) {
    const si=(sy*w+x)*4, di=(y*w+x)*4;
    px[di]=rgba[si+2]; px[di+1]=rgba[si+1]; px[di+2]=rgba[si]; px[di+3]=rgba[si+3];
  }}
  return Buffer.concat([hdr,px,Buffer.alloc(andRow*h,0)]);
}

function buildICO(images) {
  const n = images.length;
  const dir = Buffer.alloc(6); dir.writeUInt16LE(1,2); dir.writeUInt16LE(n,4);
  const entries=[], datas=[]; let off=6+n*16;
  for (const img of images) {
    const usePng = img.w >= 256;
    const data = usePng ? encodePNG(img.buf,img.w,img.h) : encodeBMPForICO(img.buf,img.w,img.h);
    const e = Buffer.alloc(16);
    e[0]=img.w>=256?0:img.w; e[1]=img.h>=256?0:img.h;
    e.writeUInt16LE(1,4); e.writeUInt16LE(32,6);
    e.writeUInt32LE(data.length,8); e.writeUInt32LE(off,12);
    entries.push(e); datas.push(data); off+=data.length;
  }
  return Buffer.concat([dir,...entries,...datas]);
}

// Main
console.log('Generating claw icon...');
const sizes = [16,32,48,256];
const images = sizes.map(sz => {
  console.log('  Drawing '+sz+'x'+sz+'...');
  return {w:sz, h:sz, buf:drawClawIcon(sz)};
});

const ico = buildICO(images);
fs.writeFileSync(OUT_DIR + '/icon.ico', ico);
console.log('ICO: ' + ico.length + ' bytes');

const png = encodePNG(images[3].buf, 256, 256);
fs.writeFileSync(OUT_DIR + '/icon.png', png);
console.log('PNG: ' + png.length + ' bytes');

console.log('Done! Files written to ' + OUT_DIR);
