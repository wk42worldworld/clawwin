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

function strokeArc(buf, sz, cx, cy, rx, ry, startAngle, endAngle, thickness, r, g, b, a) {
  const steps = Math.max(80, Math.floor(Math.max(rx, ry) * 3));
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * i / steps;
    const px = cx + Math.cos(angle) * rx;
    const py = cy + Math.sin(angle) * ry;
    fillCircle(buf, sz, px, py, thickness, r, g, b, a);
  }
}

function drawCuteLobster(size) {
  const buf = createBuf(size);
  const s = size / 256;

  // === BACKGROUND (warm sky blue like pokemon style) ===
  fillCircle(buf, size, size/2, size/2, size/2-1*s, 50, 120, 200, 255);
  fillCircle(buf, size, size/2, size/2-15*s, size*0.38, 70, 140, 215, 50);

  // === BODY (super round, pikachu-level chubby) ===
  fillEllipse(buf, size, size/2, size*0.58, 44*s, 44*s, 50, 160, 245, 255);
  // Belly (lighter oval, anime style)
  fillEllipse(buf, size, size/2, size*0.60, 30*s, 30*s, 120, 210, 255, 160);
  fillEllipse(buf, size, size/2, size*0.58, 18*s, 18*s, 170, 230, 255, 80);

  // === HEAD (big head, bigger than body = super cute anime proportion) ===
  fillEllipse(buf, size, size/2, size*0.30, 42*s, 32*s, 50, 160, 245, 255);
  // Forehead highlight
  fillEllipse(buf, size, size/2-5*s, size*0.24, 22*s, 16*s, 100, 200, 255, 80);

  // === HUGE ANIME EYES (pikachu style - big, round, expressive) ===
  // Eye whites
  fillEllipse(buf, size, size/2-16*s, size*0.28, 13*s, 14*s, 255, 255, 255, 255);
  fillEllipse(buf, size, size/2+16*s, size*0.28, 13*s, 14*s, 255, 255, 255, 255);
  // Irises (rich deep blue, large)
  fillEllipse(buf, size, size/2-14*s, size*0.29, 10*s, 11*s, 15, 50, 120, 255);
  fillEllipse(buf, size, size/2+14*s, size*0.29, 10*s, 11*s, 15, 50, 120, 255);
  // Pupils (black, centered)
  fillCircle(buf, size, size/2-13*s, size*0.29, 5*s, 2, 2, 15, 255);
  fillCircle(buf, size, size/2+13*s, size*0.29, 5*s, 2, 2, 15, 255);
  // BIG sparkle (top-left of each eye, classic anime)
  fillCircle(buf, size, size/2-17*s, size*0.25, 4*s, 255, 255, 255, 255);
  fillCircle(buf, size, size/2+17*s, size*0.25, 4*s, 255, 255, 255, 255);
  // Small secondary sparkle (bottom-right)
  fillCircle(buf, size, size/2-10*s, size*0.32, 2*s, 255, 255, 255, 220);
  fillCircle(buf, size, size/2+10*s, size*0.32, 2*s, 255, 255, 255, 220);

  // === MOUTH (happy open smile, anime "w" shape) ===
  // Simple wide grin
  strokeArc(buf, size, size/2, size*0.38, 12*s, 7*s, 0.15, Math.PI-0.15, 2*s, 15, 40, 100, 220);
  // Tiny tongue (orange-ish, peeking out)
  fillEllipse(buf, size, size/2, size*0.41, 5*s, 3*s, 255, 160, 80, 180);

  // === NOSE (tiny dot) ===
  fillCircle(buf, size, size/2, size*0.35, 2*s, 30, 70, 140, 180);

  // === ANTENNAE (bouncy, with round tips like pikachu ears) ===
  // Left antenna stalk
  fillEllipse(buf, size, size/2-22*s, size*0.10, 3*s, 16*s, 40, 145, 235, 240);
  // Left antenna ball
  fillCircle(buf, size, size/2-26*s, size*0.00+4*s, 8*s, 60, 175, 255, 255);
  fillCircle(buf, size, size/2-28*s, size*0.00+2*s, 3.5*s, 140, 220, 255, 130);
  // Right antenna stalk
  fillEllipse(buf, size, size/2+22*s, size*0.10, 3*s, 16*s, 40, 145, 235, 240);
  // Right antenna ball
  fillCircle(buf, size, size/2+26*s, size*0.00+4*s, 8*s, 60, 175, 255, 255);
  fillCircle(buf, size, size/2+28*s, size*0.00+2*s, 3.5*s, 140, 220, 255, 130);

  // === CLAWS (round puffy boxing-glove style, very cartoon) ===
  // Left arm
  fillEllipse(buf, size, size/2-44*s, size*0.44, 12*s, 18*s, 45, 150, 235, 255);
  // Left claw (big round puff)
  fillCircle(buf, size, size/2-60*s, size*0.32, 18*s, 55, 165, 248, 255);
  // Left claw V-notch (dark line to show pincer)
  fillEllipse(buf, size, size/2-72*s, size*0.32, 4*s, 8*s, 30, 80, 160, 200);
  // Left claw shine
  fillCircle(buf, size, size/2-56*s, size*0.27, 6*s, 130, 215, 255, 110);

  // Right arm
  fillEllipse(buf, size, size/2+44*s, size*0.44, 12*s, 18*s, 45, 150, 235, 255);
  // Right claw
  fillCircle(buf, size, size/2+60*s, size*0.32, 18*s, 55, 165, 248, 255);
  // Right claw V-notch
  fillEllipse(buf, size, size/2+72*s, size*0.32, 4*s, 8*s, 30, 80, 160, 200);
  // Right claw shine
  fillCircle(buf, size, size/2+56*s, size*0.27, 6*s, 130, 215, 255, 110);

  // === STUBBY LEGS (tiny, cute) ===
  for (let i = 0; i < 3; i++) {
    const ly = size*0.58 + i*10*s;
    const spread = 34*s + i*5*s;
    fillEllipse(buf, size, size/2-spread, ly, 8*s, 3*s, 40, 140, 225, 180);
    fillEllipse(buf, size, size/2+spread, ly, 8*s, 3*s, 40, 140, 225, 180);
  }

  // === TAIL (cute rounded fan) ===
  fillEllipse(buf, size, size/2, size*0.78, 20*s, 8*s, 45, 150, 235, 255);
  // Tail fan petals
  fillEllipse(buf, size, size/2-14*s, size*0.86, 12*s, 10*s, 55, 165, 248, 255);
  fillEllipse(buf, size, size/2, size*0.88, 10*s, 11*s, 60, 170, 250, 255);
  fillEllipse(buf, size, size/2+14*s, size*0.86, 12*s, 10*s, 55, 165, 248, 255);
  // Tail shine
  fillCircle(buf, size, size/2-14*s, size*0.84, 4*s, 130, 215, 255, 70);
  fillCircle(buf, size, size/2, size*0.86, 4*s, 130, 215, 255, 70);
  fillCircle(buf, size, size/2+14*s, size*0.84, 4*s, 130, 215, 255, 70);

  // === SOFT EDGE ===
  const outerR = size/2-1*s, innerR = size/2-3*s;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x-size/2)*(x-size/2)+(y-size/2)*(y-size/2));
      if (d >= innerR && d <= outerR) {
        const alpha = Math.min(1, Math.max(0, (d-innerR)/(outerR-innerR))) * 0.35;
        setPixel(buf, size, x, y, 25, 55, 130, Math.round(150 * alpha));
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

console.log('Generating cute anime lobster icon...');
const sizes = [16,32,48,256];
const images = sizes.map(sz => {
  console.log('  Drawing '+sz+'x'+sz+'...');
  return {w:sz, h:sz, buf:drawCuteLobster(sz)};
});
const ico = buildICO(images);
fs.writeFileSync(OUT_DIR + '/icon.ico', ico);
console.log('ICO: ' + ico.length + ' bytes');
const png = encodePNG(images[3].buf, 256, 256);
fs.writeFileSync(OUT_DIR + '/icon.png', png);
console.log('PNG: ' + png.length + ' bytes');
const trayPng = encodePNG(images[0].buf, 16, 16);
fs.writeFileSync(OUT_DIR + '/tray-icon.png', trayPng);
console.log('Tray PNG: ' + trayPng.length + ' bytes');
console.log('Done!');
