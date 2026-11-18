const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function concatBytes(a, b) {
  if (!a || a.length === 0) return b;
  if (!b || b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function makeWebSocketKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function buildUpgradeRequest({ host, port, path = '/nadsocket', key }) {
  const req =
    `GET ${path} HTTP/1.1\r\n` +
    `Host: ${host}:${port}\r\n` +
    `Connection: Upgrade\r\n` +
    `Upgrade: websocket\r\n` +
    `Sec-WebSocket-Key: ${key}\r\n` +
    `Sec-WebSocket-Version: 13\r\n` +
    `\r\n`;
  return encoder.encode(req);
}

export function parseUpgradeResponse(buf) {
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) {
      const headerText = decoder.decode(buf.subarray(0, i));
      const statusLine = headerText.split('\r\n')[0] || '';
      return {
        statusLine,
        is101: /^HTTP\/1\.[01]\s+101\b/i.test(statusLine),
        headRest: buf.subarray(i + 4),
      };
    }
  }
  return null;
}

export function encodeTextFrame(obj) {
  const payload = encoder.encode(JSON.stringify(obj));
  const len = payload.length;

  let headerLen = 2;
  if (len >= 126 && len <= 0xffff) headerLen = 4;
  else if (len > 0xffff) headerLen = 10;

  const frame = new Uint8Array(headerLen + 4 + len);
  frame[0] = 0x81;

  if (len < 126) {
    frame[1] = 0x80 | len;
  } else if (len <= 0xffff) {
    frame[1] = 0x80 | 126;
    frame[2] = (len >>> 8) & 0xff;
    frame[3] = len & 0xff;
  } else {
    frame[1] = 0x80 | 127;
    const big = BigInt(len);
    for (let i = 0; i < 8; i++) {
      frame[2 + i] = Number((big >> BigInt((7 - i) * 8)) & 0xffn);
    }
  }

  const maskOffset = headerLen;
  const mask = frame.subarray(maskOffset, maskOffset + 4);
  crypto.getRandomValues(mask);

  const payloadOffset = maskOffset + 4;
  for (let i = 0; i < len; i++) {
    frame[payloadOffset + i] = payload[i] ^ mask[i & 3];
  }
  return frame;
}

export function decodeFrames(buf) {
  const messages = [];
  let offset = 0;

  while (buf.length - offset >= 2) {
    const opcode = buf[offset] & 0x0f;
    const masked = (buf[offset + 1] & 0x80) !== 0;
    let len = buf[offset + 1] & 0x7f;
    let hdr = 2;

    if (len === 126) {
      if (buf.length - offset < 4) break;
      len = (buf[offset + 2] << 8) | buf[offset + 3];
      hdr = 4;
    } else if (len === 127) {
      if (buf.length - offset < 10) break;
      let bigLen = 0n;
      for (let i = 0; i < 8; i++) bigLen = (bigLen << 8n) | BigInt(buf[offset + 2 + i]);
      len = Number(bigLen);
      hdr = 10;
    }

    const maskLen = masked ? 4 : 0;
    const total = hdr + maskLen + len;
    if (buf.length - offset < total) break;

    const payloadStart = offset + hdr + maskLen;
    let payload = buf.subarray(payloadStart, payloadStart + len);

    if (masked) {
      const mask = buf.subarray(offset + hdr, offset + hdr + 4);
      const unmasked = new Uint8Array(len);
      for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ mask[i & 3];
      payload = unmasked;
    }

    offset += total;

    if (opcode === 0x8) {
      messages.push({ __wsClose: true });
      continue;
    }
    if (opcode === 0x9 || opcode === 0xa) continue;

    try {
      const text = decoder.decode(payload);
      messages.push(JSON.parse(text));
    } catch {
    }
  }

  return {
    messages,
    rest: offset === 0 ? buf : buf.subarray(offset),
  };
}
