/**
 * 从 resources/source-icon.png(黑形白底/透明底位图)生成全部图标:
 *   - resources/icon-dark.png  32×32 工具栏图标(深色主题,#C5C5C5,透明底)
 *   - resources/icon-light.png 32×32 工具栏图标(浅色主题,#424242,透明底)
 *   - resources/icon.png       128×128 扩展图标(紫蓝渐变形状,透明底,图案尽量大)
 * 纯 Node 实现(手写 PNG 解码/编码),无任何依赖。
 * 用法: node scripts/make-icon.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ------------------------- PNG 解码(8-bit,非隔行) ------------------------- */

function decodePng(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('不是 PNG 文件');
  }
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = null;
  const idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.slice(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`暂不支持的 PNG 格式(bitDepth=${bitDepth}, interlace=${interlace})`);
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) {
    throw new Error(`不支持的 colorType=${colorType}`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);

  const recon = Buffer.alloc(stride);
  let prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const v = raw[pos++];
      const a = x >= channels ? recon[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`未知 filter=${filter}`);
      }
      recon[x] = r & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      if (colorType === 6) {
        out[d] = recon[s]; out[d + 1] = recon[s + 1]; out[d + 2] = recon[s + 2]; out[d + 3] = recon[s + 3];
      } else if (colorType === 2) {
        out[d] = recon[s]; out[d + 1] = recon[s + 1]; out[d + 2] = recon[s + 2]; out[d + 3] = 255;
      } else if (colorType === 0) {
        out[d] = out[d + 1] = out[d + 2] = recon[s]; out[d + 3] = 255;
      } else if (colorType === 4) {
        out[d] = out[d + 1] = out[d + 2] = recon[s]; out[d + 3] = recon[s + 1];
      } else if (colorType === 3) {
        const i = recon[s] * 3;
        out[d] = palette[i]; out[d + 1] = palette[i + 1]; out[d + 2] = palette[i + 2]; out[d + 3] = 255;
      }
    }
    prev = Buffer.from(recon);
  }
  return { width, height, data: out };
}

/* ------------------------- PNG 编码 ------------------------- */

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------- 形状掩码提取 ------------------------- */

/** 黑形白底/透明底 → 0..1 形状掩码 + 内容包围盒 */
function buildMask(img) {
  const { width, height, data } = img;
  const mask = new Float32Array(width * height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      const a = data[i + 3] / 255;
      // 形状 = 暗度 × 源透明度(白底上黑形 → 1;白色/透明背景 → 0)
      const m = (1 - lum) * a;
      mask[y * width + x] = m;
      if (m > 0.05) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    throw new Error('未在源图中找到形状内容');
  }
  return { width, height, mask, box: { minX, minY, maxX, maxY } };
}

/**
 * 把形状掩码按包围盒(加 padding)缩放采样到目标尺寸。
 * sample(x, y) 为目标像素坐标,返回 0..1 覆盖率(4× 超采样)。
 */
function makeSampler(shape, targetSize, padding) {
  const { width, height, mask, box } = shape;
  const contentW = box.maxX - box.minX + 1;
  const contentH = box.maxY - box.minY + 1;
  const scale = (targetSize - padding * 2) / Math.max(contentW, contentH);
  const drawW = contentW * scale;
  const drawH = contentH * scale;
  const offX = (targetSize - drawW) / 2;
  const offY = (targetSize - drawH) / 2;
  const SS = 4;
  return (x, y) => {
    let covered = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const tx = x + (dx + 0.5) / SS;
        const ty = y + (dy + 0.5) / SS;
        const sx = Math.floor(box.minX + (tx - offX) / scale);
        const sy = Math.floor(box.minY + (ty - offY) / scale);
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          covered += mask[sy * width + sx];
        }
      }
    }
    return covered / (SS * SS);
  };
}

/* ------------------------- 渲染 ------------------------- */

const SHAPE_TOP = [139, 92, 246]; // #8b5cf6 紫
const SHAPE_BOTTOM = [37, 99, 235]; // #2563eb 蓝

/** 工具栏图标:透明底 + 纯色形状 */
function renderToolbar(shape, size, color) {
  // padding 尽量小,让 32×32 上的图案更饱满
  const sample = makeSampler(shape, size, 0);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const m = sample(x, y);
      if (m <= 0.001) {
        continue;
      }
      const o = (y * size + x) * 4;
      rgba[o] = color[0];
      rgba[o + 1] = color[1];
      rgba[o + 2] = color[2];
      rgba[o + 3] = Math.round(Math.min(1, m) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

/**
 * 扩展图标:仅中间图案,背景全透明。
 * 图案使用紫→蓝对角渐变填色,padding 小以放大主体。
 */
function renderAppIcon(shape, size) {
  // padding 尽量小,图案铺满画布
  const sample = makeSampler(shape, size, 2);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const m = sample(x, y);
      if (m <= 0.001) {
        continue; // 透明背景
      }
      const o = (y * size + x) * 4;
      const t = Math.min(1, Math.max(0, (x + y + 1) / (size * 2)));
      const r = SHAPE_TOP[0] + (SHAPE_BOTTOM[0] - SHAPE_TOP[0]) * t;
      const g = SHAPE_TOP[1] + (SHAPE_BOTTOM[1] - SHAPE_TOP[1]) * t;
      const b = SHAPE_TOP[2] + (SHAPE_BOTTOM[2] - SHAPE_TOP[2]) * t;
      rgba[o] = Math.round(r);
      rgba[o + 1] = Math.round(g);
      rgba[o + 2] = Math.round(b);
      rgba[o + 3] = Math.round(Math.min(1, m) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

/* ------------------------- 主流程 ------------------------- */

function main() {
  const srcPath = path.join(__dirname, '..', 'resources', 'source-icon.png');
  const img = decodePng(fs.readFileSync(srcPath));
  console.log(`source: ${img.width}x${img.height}`);
  const shape = buildMask(img);
  console.log('content box:', shape.box);

  const resDir = path.join(__dirname, '..', 'resources');
  fs.writeFileSync(path.join(resDir, 'icon-dark.png'), renderToolbar(shape, 32, [0xc5, 0xc5, 0xc5]));
  fs.writeFileSync(path.join(resDir, 'icon-light.png'), renderToolbar(shape, 32, [0x42, 0x42, 0x42]));
  fs.writeFileSync(path.join(resDir, 'icon.png'), renderAppIcon(shape, 128));
  console.log('written: icon-dark.png, icon-light.png, icon.png');
}

main();
