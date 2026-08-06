/**
 * Pure-JS crypto-js shim -- Nuvio's sandbox has no npm module resolution, so
 * require("crypto-js") crashes here (confirmed via the sandbox harness at
 * tools/run-in-sandbox.js: it throws at module-load time, before getStreams
 * is even defined, so the provider never registers). This block
 * re-implements the exact subset of the crypto-js API this file calls --
 * AES-CBC decrypt with PKCS7 padding, plus the Base64/Utf8/Hex WordArray
 * helpers -- verified against the real crypto-js package for randomized
 * round-trips (including this file's own key-derivation shape) before being
 * wired in, and shadows require() so the rest of this file's existing
 * require("crypto-js") call transparently receives this instead. Same AES
 * construction as latino/src/providers/sololatino.js's embed69 decryptor,
 * generalized to also support AES-128 (the key size these providers use).
 */
(function () {
  "use strict";

  const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function base64ToBytes(b64) {
    const clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
    const bytes = [];
    let buffer = 0, bits = 0;
    for (let i = 0; i < clean.length; i += 1) {
      const c = clean[i];
      if (c === '=') break;
      const val = BASE64_CHARS.indexOf(c);
      if (val === -1) continue;
      buffer = (buffer << 6) | val;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    return bytes;
  }

  function hexToBytes(hex) {
    const clean = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
    const bytes = [];
    for (let i = 0; i + 1 < clean.length; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16));
    return bytes;
  }

  function bytesToHex(bytes) {
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function stringToUtf8Bytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i += 1) {
      let code = str.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
          i += 1;
        }
      }
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return bytes;
  }

  function bytesToUtf8String(bytes) {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i++];
      if (b0 < 0x80) {
        out += String.fromCharCode(b0);
      } else if (b0 >= 0xc0 && b0 < 0xe0 && i < bytes.length) {
        const b1 = bytes[i++];
        out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      } else if (b0 >= 0xe0 && b0 < 0xf0 && i + 1 < bytes.length) {
        const b1 = bytes[i++], b2 = bytes[i++];
        out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
      } else if (b0 >= 0xf0 && i + 2 < bytes.length) {
        const b1 = bytes[i++], b2 = bytes[i++], b3 = bytes[i++];
        let codepoint = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
        codepoint -= 0x10000;
        out += String.fromCharCode(0xd800 + (codepoint >> 10), 0xdc00 + (codepoint & 0x3ff));
      } else {
        out += String.fromCharCode(b0);
      }
    }
    return out;
  }

  function gmul(a, b) {
    let p = 0, x = a, y = b;
    for (let i = 0; i < 8; i += 1) {
      if (y & 1) p ^= x;
      const hiBitSet = x & 0x80;
      x = (x << 1) & 0xff;
      if (hiBitSet) x ^= 0x1b;
      y >>= 1;
    }
    return p;
  }

  function buildAesTables() {
    const inv = new Array(256).fill(0);
    for (let a = 1; a < 256; a += 1) {
      for (let b = 1; b < 256; b += 1) {
        if (gmul(a, b) === 1) { inv[a] = b; break; }
      }
    }
    const rotl8 = (v, n) => ((v << n) | (v >>> (8 - n))) & 0xff;
    const sbox = new Array(256);
    for (let i = 0; i < 256; i += 1) {
      const x = inv[i];
      sbox[i] = x ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 0x63;
    }
    const invSbox = new Array(256);
    for (let i = 0; i < 256; i += 1) invSbox[sbox[i]] = i;
    return { sbox, invSbox };
  }

  const AES_TABLES = buildAesTables();
  const AES_SBOX = AES_TABLES.sbox;
  const AES_INV_SBOX = AES_TABLES.invSbox;
  const AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d];

  /** Generalized AES key expansion: works for Nk=4/6/8 (AES-128/192/256). */
  function aesKeyExpansion(key) {
    const Nk = key.length / 4;
    const Nr = Nk + 6;
    const Nb = 4;
    const w = [];
    for (let i = 0; i < Nk; i += 1) w.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
    for (let i = Nk; i < Nb * (Nr + 1); i += 1) {
      let temp = w[i - 1].slice();
      if (i % Nk === 0) {
        temp = [temp[1], temp[2], temp[3], temp[0]].map((b) => AES_SBOX[b]);
        temp[0] ^= AES_RCON[i / Nk - 1];
      } else if (Nk > 6 && i % Nk === 4) {
        temp = temp.map((b) => AES_SBOX[b]);
      }
      w.push(w[i - Nk].map((b, idx) => b ^ temp[idx]));
    }
    return { w, Nr };
  }

  function addRoundKey(state, w, round) {
    for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) state[r][c] ^= w[round * 4 + c][r];
  }
  function invSubBytes(state) {
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) state[r][c] = AES_INV_SBOX[state[r][c]];
  }
  function invShiftRows(state) {
    for (let r = 1; r < 4; r += 1) {
      const row = state[r];
      state[r] = row.slice(4 - r).concat(row.slice(0, 4 - r));
    }
  }
  function invMixColumns(state) {
    for (let c = 0; c < 4; c += 1) {
      const a0 = state[0][c], a1 = state[1][c], a2 = state[2][c], a3 = state[3][c];
      state[0][c] = gmul(a0, 0x0e) ^ gmul(a1, 0x0b) ^ gmul(a2, 0x0d) ^ gmul(a3, 0x09);
      state[1][c] = gmul(a0, 0x09) ^ gmul(a1, 0x0e) ^ gmul(a2, 0x0b) ^ gmul(a3, 0x0d);
      state[2][c] = gmul(a0, 0x0d) ^ gmul(a1, 0x09) ^ gmul(a2, 0x0e) ^ gmul(a3, 0x0b);
      state[3][c] = gmul(a0, 0x0b) ^ gmul(a1, 0x0d) ^ gmul(a2, 0x09) ^ gmul(a3, 0x0e);
    }
  }
  function aesDecryptBlock(block, w, Nr) {
    const state = [[], [], [], []];
    for (let i = 0; i < 16; i += 1) state[i % 4][(i / 4) | 0] = block[i];
    addRoundKey(state, w, Nr);
    for (let round = Nr - 1; round >= 1; round -= 1) {
      invShiftRows(state); invSubBytes(state); addRoundKey(state, w, round); invMixColumns(state);
    }
    invShiftRows(state); invSubBytes(state); addRoundKey(state, w, 0);
    const out = new Array(16);
    for (let i = 0; i < 16; i += 1) out[i] = state[i % 4][(i / 4) | 0];
    return out;
  }
  function aesCbcDecrypt(keyBytes, ivBytes, ciphertextBytes) {
    const { w, Nr } = aesKeyExpansion(keyBytes);
    const plaintext = [];
    let prevBlock = ivBytes;
    for (let offset = 0; offset < ciphertextBytes.length; offset += 16) {
      const block = ciphertextBytes.slice(offset, offset + 16);
      const decrypted = aesDecryptBlock(block, w, Nr);
      for (let i = 0; i < 16; i += 1) plaintext.push(decrypted[i] ^ prevBlock[i]);
      prevBlock = block;
    }
    return plaintext;
  }
  /**
   * castle.js's own key-derivation only ever produces a well-formed 16-byte
   * key in practice (its >16 branch truncates, its ==16 branch is exact); this
   * only guards the pathological <16-bytes-of-input case, which castle.js
   * already treats as a decrypt failure via its own `if (!result) throw`
   * check, so exact bit-parity with CryptoJS's undefined behaviour there
   * isn't required -- just that this never throws.
   */
  function normalizeAesKeyBytes(bytes) {
    if (bytes.length >= 32) return bytes.slice(0, 32);
    if (bytes.length >= 24) return bytes.slice(0, 24);
    const padded = bytes.slice(0, 16);
    while (padded.length < 16) padded.push(0);
    return padded;
  }

  function stripPkcs7PaddingBytes(bytes) {
    const pad = bytes[bytes.length - 1];
    if (!Number.isInteger(pad) || pad < 1 || pad > 16 || pad > bytes.length) return bytes;
    return bytes.slice(0, bytes.length - pad);
  }

  // ---------------------------------------------------------------------------
  // Minimal CryptoJS-compatible shim: only WordArray/enc/AES.decrypt(CBC,Pkcs7),
  // which is the entire surface castle.js and hdhub4u.js use.
  // ---------------------------------------------------------------------------

  /**
   * Mirrors CryptoJS's actual WordArray representation: `words` is an array of
   * 32-bit big-endian words, and `create(words, sigBytes)` -- the same method
   * castle.js calls directly -- treats its first argument as words, not bytes
   * (sigBytes defaults to words.length*4 when omitted). Verified against the
   * real crypto-js package's own `WordArray.create` behaviour.
   */
  function wordArrayFromWords(words, sigBytes) {
    words = words ? words.slice() : [];
    const wa = {
      words,
      sigBytes: sigBytes === undefined ? words.length * 4 : sigBytes,
      toBytes() {
        const out = [];
        for (let i = 0; i < wa.sigBytes; i += 1) out.push((wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
        return out;
      },
      concat(other) {
        const combined = wa.toBytes().concat(other.toBytes());
        return wordArrayFromBytes(combined);
      },
      toString(encoder) {
        const bytes2 = wa.toBytes();
        if (encoder === CryptoJSPolyfill.enc.Utf8) return bytesToUtf8String(bytes2);
        return bytesToHex(bytes2);
      }
    };
    return wa;
  }

  function wordArrayFromBytes(bytes) {
    const words = [];
    for (let i = 0; i < bytes.length; i += 4) {
      words.push(((bytes[i] || 0) << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0));
    }
    return wordArrayFromWords(words, bytes.length);
  }

  const CryptoJSPolyfill = {
    lib: {
      WordArray: {
        create: (words, sigBytes) => wordArrayFromWords(words, sigBytes)
      }
    },
    enc: {
      Base64: { parse: (b64) => wordArrayFromBytes(base64ToBytes(b64)) },
      Utf8: { parse: (str) => wordArrayFromBytes(stringToUtf8Bytes(str)) },
      Hex: { parse: (hex) => wordArrayFromBytes(hexToBytes(hex)) }
    },
    mode: { CBC: 'CBC' },
    pad: { Pkcs7: 'Pkcs7' },
    AES: {
      decrypt(cipherParams, key, options) {
        const keyBytes = normalizeAesKeyBytes(key.toBytes());
        let ivBytes = (options && options.iv) ? options.iv.toBytes() : new Array(16).fill(0);
        ivBytes = ivBytes.slice(0, 16);
        while (ivBytes.length < 16) ivBytes.push(0);
        const ciphertextBytes = typeof cipherParams === 'string'
          ? base64ToBytes(cipherParams)
          : cipherParams.ciphertext.toBytes();
        const decrypted = stripPkcs7PaddingBytes(aesCbcDecrypt(keyBytes, ivBytes, ciphertextBytes));
        return wordArrayFromBytes(decrypted);
      }
    }
  };


  var __originalRequire = require;
  require = function (name) {
    var mod;
    try {
      mod = __originalRequire(name);
    } catch (e) {
      return CryptoJSPolyfill;
    }
    if (name === 'cheerio-without-node-native' || name === 'cheerio') {
      // __toESM's lazy-getter property copy (Object.getOwnPropertyNames +
      // `get: () => from[key]`) doesn't survive contact with the real
      // cheerio module's own property descriptors here -- the resulting
      // `.default.load(...)` throws "is not a function" even though
      // `mod.load` itself works fine when called directly. A flat,
      // eagerly-copied plain object sidesteps whatever that interaction is
      // (confirmed via the sandbox harness: raw passthrough fails on every
      // .load() call site, this doesn't).
      var flat = {};
      for (var key in mod) flat[key] = mod[key];
      return flat;
    }
    return mod;
  };
})();

'use strict';const _0x476166=_0x44e1;(function(_0x67a31b,_0x2c404f){const _0x36a05f=_0x44e1,_0x470649=_0x67a31b();while(!![]){try{const _0x5137c2=-parseInt(_0x36a05f(0x1ec))/0x1+parseInt(_0x36a05f(0x214))/0x2+parseInt(_0x36a05f(0x228))/0x3+-parseInt(_0x36a05f(0x20a))/0x4+parseInt(_0x36a05f(0x1f1))/0x5*(-parseInt(_0x36a05f(0x1f4))/0x6)+parseInt(_0x36a05f(0x254))/0x7*(parseInt(_0x36a05f(0x211))/0x8)+parseInt(_0x36a05f(0x269))/0x9;if(_0x5137c2===_0x2c404f)break;else _0x470649['push'](_0x470649['shift']());}catch(_0xc250f2){_0x470649['push'](_0x470649['shift']());}}}(_0x576f,0x6b5c1));function _0x44e1(_0x5972df,_0x46299a){_0x5972df=_0x5972df-0x1e0;const _0x576fb9=_0x576f();let _0x44e170=_0x576fb9[_0x5972df];if(_0x44e1['WPBLul']===undefined){var _0x3b63c2=function(_0x5c6f09){const _0x445c29='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';let _0x1bd8fe='',_0x43a10c='';for(let _0x256223=0x0,_0x82eee6,_0x25a6e1,_0xf7c831=0x0;_0x25a6e1=_0x5c6f09['charAt'](_0xf7c831++);~_0x25a6e1&&(_0x82eee6=_0x256223%0x4?_0x82eee6*0x40+_0x25a6e1:_0x25a6e1,_0x256223++%0x4)?_0x1bd8fe+=String['fromCharCode'](0xff&_0x82eee6>>(-0x2*_0x256223&0x6)):0x0){_0x25a6e1=_0x445c29['indexOf'](_0x25a6e1);}for(let _0x56dc30=0x0,_0x4ed561=_0x1bd8fe['length'];_0x56dc30<_0x4ed561;_0x56dc30++){_0x43a10c+='%'+('00'+_0x1bd8fe['charCodeAt'](_0x56dc30)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x43a10c);};_0x44e1['OchpKJ']=_0x3b63c2,_0x44e1['yHtRii']={},_0x44e1['WPBLul']=!![];}const _0x1e8776=_0x576fb9[0x0],_0x555aab=_0x5972df+_0x1e8776,_0x17a6f3=_0x44e1['yHtRii'][_0x555aab];return!_0x17a6f3?(_0x44e170=_0x44e1['OchpKJ'](_0x44e170),_0x44e1['yHtRii'][_0x555aab]=_0x44e170):_0x44e170=_0x17a6f3,_0x44e170;}var __defProp=Object['defineProperty'],__getOwnPropSymbols=Object['getOwnPropertySymbols'],__hasOwnProp=Object['prototype'][_0x476166(0x201)],__propIsEnum=Object[_0x476166(0x1e0)][_0x476166(0x224)],__defNormalProp=(_0x1bd8fe,_0x43a10c,_0x256223)=>_0x43a10c in _0x1bd8fe?__defProp(_0x1bd8fe,_0x43a10c,{'enumerable':!![],'configurable':!![],'writable':!![],'value':_0x256223}):_0x1bd8fe[_0x43a10c]=_0x256223,__spreadValues=(_0x82eee6,_0x25a6e1)=>{const _0x57b9b7=_0x476166;for(var _0xf7c831 in _0x25a6e1||(_0x25a6e1={}))if(__hasOwnProp['call'](_0x25a6e1,_0xf7c831))__defNormalProp(_0x82eee6,_0xf7c831,_0x25a6e1[_0xf7c831]);if(__getOwnPropSymbols)for(var _0xf7c831 of __getOwnPropSymbols(_0x25a6e1)){if(__propIsEnum[_0x57b9b7(0x1fb)](_0x25a6e1,_0xf7c831))__defNormalProp(_0x82eee6,_0xf7c831,_0x25a6e1[_0xf7c831]);}return _0x82eee6;},__async=(_0x56dc30,_0x4ed561,_0x267797)=>{return new Promise((_0x170526,_0x13dda8)=>{const _0x2a7b44=_0x44e1;var _0x5e18b1=_0x51d46c=>{const _0x3e6ab5=_0x44e1;try{_0x4b0257(_0x267797[_0x3e6ab5(0x250)](_0x51d46c));}catch(_0x478a26){_0x13dda8(_0x478a26);}},_0x5c517a=_0x4da371=>{const _0xddfc2a=_0x44e1;try{_0x4b0257(_0x267797[_0xddfc2a(0x20e)](_0x4da371));}catch(_0x2893a0){_0x13dda8(_0x2893a0);}},_0x4b0257=_0x29e7e7=>_0x29e7e7['done']?_0x170526(_0x29e7e7[_0x2a7b44(0x252)]):Promise[_0x2a7b44(0x21c)](_0x29e7e7['value'])[_0x2a7b44(0x25c)](_0x5e18b1,_0x5c517a);_0x4b0257((_0x267797=_0x267797[_0x2a7b44(0x25a)](_0x56dc30,_0x4ed561))[_0x2a7b44(0x250)]());});},TMDB_API_KEY='439c478a771f35c05022f9feabcca01c',TMDB_BASE_URL=_0x476166(0x27a),CASTLE_BASE='https://api.hlowb.com',PKG=_0x476166(0x233),CHANNEL=_0x476166(0x21f),CLIENT='1',LANG='en-US',API_HEADERS={'User-Agent':_0x476166(0x1ef),'Accept':_0x476166(0x212),'Accept-Language':_0x476166(0x236),'Connection':_0x476166(0x24e),'Referer':CASTLE_BASE},PLAYBACK_HEADERS={'User-Agent':'Mozilla/5.0\x20(Windows\x20NT\x2010.0;\x20Win64;\x20x64)\x20AppleWebKit/537.36\x20(KHTML,\x20like\x20Gecko)\x20Chrome/137.0.0.0\x20Safari/537.36','Accept':'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5','Accept-Language':_0x476166(0x236),'Accept-Encoding':_0x476166(0x1ed),'Connection':_0x476166(0x273),'Sec-Fetch-Dest':'video','Sec-Fetch-Mode':_0x476166(0x22a),'Sec-Fetch-Site':_0x476166(0x268),'DNT':'1'};function makeRequest(_0x1b363e){return __async(this,arguments,function*(_0x3d5cba,_0x27b3ee={}){const _0x455f3a=_0x44e1;try{const _0x1c6c59=yield fetch(_0x3d5cba,{'method':_0x27b3ee[_0x455f3a(0x266)]||_0x455f3a(0x275),'headers':__spreadValues(__spreadValues({},API_HEADERS),_0x27b3ee['headers']),'body':_0x27b3ee['body']});if(!_0x1c6c59['ok'])throw new Error(_0x455f3a(0x279)+_0x1c6c59[_0x455f3a(0x20d)]+':\x20'+_0x1c6c59[_0x455f3a(0x230)]);return _0x1c6c59;}catch(_0x1cd416){console[_0x455f3a(0x1f0)](_0x455f3a(0x22c)+_0x3d5cba+':\x20'+_0x1cd416[_0x455f3a(0x213)]);throw _0x1cd416;}});}function extractCipherFromResponse(_0x409352){return __async(this,null,function*(){const _0x3ad6ed=_0x44e1,_0x3f740d=yield _0x409352[_0x3ad6ed(0x259)](),_0x4fa311=_0x3f740d[_0x3ad6ed(0x26a)]();if(!_0x4fa311)throw new Error(_0x3ad6ed(0x271));try{const _0x2dc537=JSON[_0x3ad6ed(0x1f2)](_0x4fa311);if(_0x2dc537&&_0x2dc537[_0x3ad6ed(0x24b)]&&typeof _0x2dc537['data']==='string')return _0x2dc537[_0x3ad6ed(0x24b)][_0x3ad6ed(0x26a)]();}catch(_0x49255b){}return _0x4fa311;});}function extractDataBlock(_0x5c1776){const _0x20a912=_0x476166;if(_0x5c1776&&_0x5c1776[_0x20a912(0x24b)]&&typeof _0x5c1776['data']===_0x20a912(0x1ee))return _0x5c1776[_0x20a912(0x24b)];return _0x5c1776||{};}function getTMDBDetails(_0x45bec2,_0xd6d16b){return __async(this,null,function*(){const _0x44aa1b=_0x44e1,_0x1fa830=_0xd6d16b==='tv'?'tv':_0x44aa1b(0x1e5),_0x4e7160=TMDB_BASE_URL+'/'+_0x1fa830+'/'+_0x45bec2+_0x44aa1b(0x202)+TMDB_API_KEY+_0x44aa1b(0x226),_0x220bdb=yield makeRequest(_0x4e7160),_0x2565cd=yield _0x220bdb[_0x44aa1b(0x265)](),_0xfa7224=_0xd6d16b==='tv'?_0x2565cd[_0x44aa1b(0x26f)]:_0x2565cd[_0x44aa1b(0x225)],_0x23eea7=_0xd6d16b==='tv'?_0x2565cd[_0x44aa1b(0x1e3)]:_0x2565cd[_0x44aa1b(0x267)],_0x451860=_0x23eea7?parseInt(_0x23eea7['split']('-')[0x0]):null;return{'title':_0xfa7224,'year':_0x451860,'tmdbId':_0x45bec2};});}function decryptCastle(_0xc6ebf1,_0x4830a9){return __async(this,null,function*(){const _0x32c1f5=_0x44e1;console['log'](_0x32c1f5(0x21b));try{const _0x124330=require(_0x32c1f5(0x264));if(typeof __crypto_aes_decrypt_raw!=='undefined'){const _0x23174d=_0x124330[_0x32c1f5(0x1f7)][_0x32c1f5(0x209)];_0x124330['AES'][_0x32c1f5(0x209)]=function(_0xee5ebe,_0xdc47ba,_0x350562){const _0x5d9219=_0x32c1f5;try{const _0xe2ca99=_0x56fed0=>{const _0x4dd3f1=_0x44e1,_0x4f63a2=new Uint8Array(_0x56fed0['sigBytes']);for(let _0x3866bd=0x0;_0x3866bd<_0x56fed0[_0x4dd3f1(0x203)];_0x3866bd++){_0x4f63a2[_0x3866bd]=_0x56fed0[_0x4dd3f1(0x1f8)][_0x3866bd>>>0x2]>>>0x18-_0x3866bd%0x4*0x8&0xff;}return _0x4f63a2;},_0x2a1521=_0x36e655=>{const _0x144bda=_0x44e1;if(_0x36e655 instanceof Uint8Array)return _0x36e655;if(_0x36e655 instanceof ArrayBuffer)return new Uint8Array(_0x36e655);if(_0x36e655&&typeof _0x36e655[_0x144bda(0x25f)]===_0x144bda(0x245))return new Uint8Array(Array[_0x144bda(0x1e0)]['slice'][_0x144bda(0x1fb)](_0x36e655));return new Uint8Array(0x0);},_0x5d8830=typeof _0xee5ebe==='string'?new Uint8Array(Array[_0x5d9219(0x204)](atob(_0xee5ebe),_0x42cb6d=>_0x42cb6d[_0x5d9219(0x261)](0x0))):_0xee5ebe[_0x5d9219(0x1fe)]?_0xe2ca99(_0xee5ebe[_0x5d9219(0x1fe)]):_0x2a1521(_0xee5ebe),_0x300d1d=_0xe2ca99(_0xdc47ba),_0x25e833=_0x350562&&_0x350562['iv']?_0xe2ca99(_0x350562['iv']):new Uint8Array(0x0),_0x37b488=_0x350562&&_0x350562[_0x5d9219(0x24c)]||_0x5d9219(0x24f),_0x155c77=typeof Int8Array!==_0x5d9219(0x255)?new Int8Array(_0x300d1d[_0x5d9219(0x26b)]):_0x300d1d,_0x579db0=typeof Int8Array!=='undefined'?new Int8Array(_0x25e833['buffer']):_0x25e833,_0x2d2b32=typeof Int8Array!==_0x5d9219(0x255)?new Int8Array(_0x5d8830['buffer']):_0x5d8830,_0x5ba30d=__crypto_aes_decrypt_raw(_0x37b488,_0x155c77,_0x579db0,_0x2d2b32),_0xd18d9e=new TextDecoder()[_0x5d9219(0x1f9)](_0x5ba30d);return{'toString':function(){return _0xd18d9e;}};}catch(_0xe309ac){return console[_0x5d9219(0x1f0)](_0x5d9219(0x1ea),_0xe309ac),_0x23174d[_0x5d9219(0x1fb)](_0x124330['AES'],_0xee5ebe,_0xdc47ba,_0x350562);}};}const _0x227260='T!BgJB',_0x482d9c=_0x124330['enc'][_0x32c1f5(0x216)][_0x32c1f5(0x1f2)](_0x4830a9),_0x1339d3=_0x124330[_0x32c1f5(0x242)][_0x32c1f5(0x218)]['parse'](_0x227260),_0xd52821=_0x482d9c['concat'](_0x1339d3);let _0x59f612;if(_0xd52821[_0x32c1f5(0x203)]<0x10){const _0x129518=_0x124330[_0x32c1f5(0x229)][_0x32c1f5(0x1f5)][_0x32c1f5(0x22d)](new Array(0x10-_0xd52821['sigBytes'])[_0x32c1f5(0x223)](0x0));_0x59f612=_0xd52821['concat'](_0x129518);}else _0xd52821[_0x32c1f5(0x203)]>0x10?_0x59f612=_0x124330['lib']['WordArray'][_0x32c1f5(0x22d)](_0xd52821[_0x32c1f5(0x1f8)][_0x32c1f5(0x23f)](0x0,0x4),0x10):_0x59f612=_0xd52821;const _0x305fbb=_0x59f612,_0x165e51=_0x124330[_0x32c1f5(0x1f7)][_0x32c1f5(0x209)](_0xc6ebf1,_0x59f612,{'iv':_0x305fbb,'mode':_0x124330[_0x32c1f5(0x24c)]['CBC'],'padding':_0x124330['pad'][_0x32c1f5(0x246)]}),_0x3adb8e=_0x165e51[_0x32c1f5(0x220)](_0x124330['enc'][_0x32c1f5(0x218)]);if(!_0x3adb8e)throw new Error(_0x32c1f5(0x1fd));return console[_0x32c1f5(0x210)]('[Castle]\x20Local\x20decryption\x20successful'),_0x3adb8e;}catch(_0x282f45){console[_0x32c1f5(0x1f0)]('[Castle]\x20Local\x20decryption\x20failed:\x20'+_0x282f45['message']);throw _0x282f45;}});}function getSecurityKey(){return __async(this,null,function*(){const _0x436439=_0x44e1;console['log']('[Castle]\x20Fetching\x20security\x20key...');const _0xcc4799=CASTLE_BASE+_0x436439(0x1fa)+CHANNEL+_0x436439(0x235)+CLIENT+_0x436439(0x26e)+LANG,_0x25d0a0=yield makeRequest(_0xcc4799),_0x5985bc=yield _0x25d0a0['json']();if(_0x5985bc[_0x436439(0x222)]!==0xc8||!_0x5985bc[_0x436439(0x24b)])throw new Error(_0x436439(0x1e1)+JSON[_0x436439(0x272)](_0x5985bc));return console[_0x436439(0x210)](_0x436439(0x208)),_0x5985bc[_0x436439(0x24b)];});}function searchCastle(_0x1a0a07,_0x15b1e2,_0x560f28=0x1,_0x208034=0x1e){return __async(this,null,function*(){const _0x3a4973=_0x44e1;console[_0x3a4973(0x210)]('[Castle]\x20Searching\x20for:\x20'+_0x15b1e2);const _0x4a939a=new URLSearchParams({'channel':CHANNEL,'clientType':CLIENT,'keyword':_0x15b1e2,'lang':LANG,'mode':'1','packageName':PKG,'page':_0x560f28[_0x3a4973(0x220)](),'size':_0x208034['toString']()}),_0x1cc3db=CASTLE_BASE+_0x3a4973(0x262)+_0x4a939a[_0x3a4973(0x220)](),_0x20be66=yield makeRequest(_0x1cc3db),_0xd7a2bd=yield extractCipherFromResponse(_0x20be66),_0x703ccd=yield decryptCastle(_0xd7a2bd,_0x1a0a07);return JSON[_0x3a4973(0x1f2)](_0x703ccd);});}function getDetails(_0x1b40c9,_0x33dbe1){return __async(this,null,function*(){const _0x743ebf=_0x44e1;console[_0x743ebf(0x210)](_0x743ebf(0x23e)+_0x33dbe1);const _0x588fee=CASTLE_BASE+_0x743ebf(0x21d)+CHANNEL+'&clientType='+CLIENT+_0x743ebf(0x26e)+LANG+'&movieId='+_0x33dbe1+_0x743ebf(0x1e9)+PKG,_0x2289e0=yield makeRequest(_0x588fee),_0x2865b4=yield extractCipherFromResponse(_0x2289e0),_0x217860=yield decryptCastle(_0x2865b4,_0x1b40c9);return JSON[_0x743ebf(0x1f2)](_0x217860);});}function getVideoV1(_0x5db07e,_0x5e010,_0x5b503c,_0x39cb02,_0x52da17=0x2){return __async(this,null,function*(){const _0x3beb02=_0x44e1;console[_0x3beb02(0x210)](_0x3beb02(0x253)+_0x5e010+_0x3beb02(0x25e)+_0x39cb02);const _0x4153b9=CASTLE_BASE+_0x3beb02(0x1e6)+CLIENT+_0x3beb02(0x1e9)+PKG+_0x3beb02(0x227)+CHANNEL+'&lang='+LANG,_0x1eb498={'mode':'1','appMarket':_0x3beb02(0x21a),'clientType':CLIENT,'woolUser':_0x3beb02(0x206),'apkSignKey':_0x3beb02(0x22f),'androidVersion':'13','movieId':_0x5e010[_0x3beb02(0x220)](),'episodeId':_0x5b503c[_0x3beb02(0x220)](),'languageId':_0x39cb02[_0x3beb02(0x220)](),'isNewUser':_0x3beb02(0x23a),'resolution':_0x52da17['toString'](),'packageName':PKG},_0x10b03a=yield makeRequest(_0x4153b9,{'method':_0x3beb02(0x1f3),'headers':{'Content-Type':_0x3beb02(0x212)},'body':JSON[_0x3beb02(0x272)](_0x1eb498)}),_0x3b5806=yield extractCipherFromResponse(_0x10b03a),_0x3545cc=yield decryptCastle(_0x3b5806,_0x5db07e);return JSON['parse'](_0x3545cc);});}function getVideo2(_0x13e2e0,_0x4e860c,_0x1b29ed,_0x12b2eb=0x2){return __async(this,null,function*(){const _0x46256f=_0x44e1;console[_0x46256f(0x210)](_0x46256f(0x22b)+_0x4e860c+_0x46256f(0x1e7)+_0x1b29ed);const _0x492b01=CASTLE_BASE+_0x46256f(0x1e6)+CLIENT+_0x46256f(0x1e9)+PKG+_0x46256f(0x227)+CHANNEL+_0x46256f(0x26e)+LANG,_0x2bbf47={'mode':'1','appMarket':_0x46256f(0x21a),'clientType':CLIENT,'woolUser':_0x46256f(0x206),'apkSignKey':_0x46256f(0x22f),'androidVersion':'13','movieId':_0x4e860c[_0x46256f(0x220)](),'episodeId':_0x1b29ed[_0x46256f(0x220)](),'isNewUser':_0x46256f(0x23a),'resolution':_0x12b2eb[_0x46256f(0x220)](),'packageName':PKG},_0x334736=yield makeRequest(_0x492b01,{'method':_0x46256f(0x1f3),'headers':{'Content-Type':_0x46256f(0x212)},'body':JSON[_0x46256f(0x272)](_0x2bbf47)}),_0x891bc9=yield extractCipherFromResponse(_0x334736),_0x33520e=yield decryptCastle(_0x891bc9,_0x13e2e0);return JSON[_0x46256f(0x1f2)](_0x33520e);});}function __englishStrictTitleMatch(candidate, target) {
      const tokens = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((token) => token.length > 1 && !['a', 'an', 'and', 'for', 'in', 'of', 'the', 'to'].includes(token));
      const wanted = [...new Set(tokens(target))];
      if (wanted.length < 1) return false;
      const found = new Set(tokens(candidate));
      return wanted.filter((token) => found.has(token)).length >= Math.ceil(wanted.length * 0.75);
    }
function findCastleMovieId(_0x57fcd6,_0x4f8418){return __async(this,null,function*(){const _0x1728f4=_0x44e1,_0x26af00=_0x4f8418['year']?_0x4f8418[_0x1728f4(0x225)]+'\x20'+_0x4f8418[_0x1728f4(0x239)]:_0x4f8418['title'],_0x4d704e=yield searchCastle(_0x57fcd6,_0x26af00),_0x59afbd=extractDataBlock(_0x4d704e),_0x8a8050=_0x59afbd[_0x1728f4(0x238)]||[];if(_0x8a8050[_0x1728f4(0x25f)]===0x0)throw new Error('No\x20search\x20results\x20found');for(const _0x255a56 of _0x8a8050){const _0x20be27=(_0x255a56[_0x1728f4(0x225)]||_0x255a56[_0x1728f4(0x26f)]||'')[_0x1728f4(0x258)](),_0x4f2b66=_0x4f8418['title'][_0x1728f4(0x258)]();if(__englishStrictTitleMatch(_0x20be27,_0x4f2b66)){const _0x38ac5b=_0x255a56['id']||_0x255a56[_0x1728f4(0x249)]||_0x255a56[_0x1728f4(0x200)];if(_0x38ac5b)return console[_0x1728f4(0x210)]('[Castle]\x20Found\x20match:\x20'+(_0x255a56['title']||_0x255a56[_0x1728f4(0x26f)])+_0x1728f4(0x234)+_0x38ac5b+')'),_0x38ac5b[_0x1728f4(0x220)]();}}throw new Error('No strict Castle title match');});}function _0x576f(){const _0x56b7ed=['lcbLCgLZB2rLswq6ia','q291BgqGBM90igzPBMqGzxbPC29Kzsbjra','jNbHy2THz2voyw1Lpq','w0nHC3rSzsbktKKGugf0y2HDierLy3j5ChqGzMfPBgvKlcbMywXSAw5NigjHy2S6','vw5RBM93BG','ntCXmtqWtgXlC3bY','AwrLBNrPDhK','B2jQzwn0','B2TODhrWlZqUos4Z','zxjYB3i','mJaXnxDzB3PLEG','CgfYC2u','ue9tva','nJK3ogHyDLvUuG','v29YzefYCMf5','zM9YrwfJAa','quvt','D29Yzhm','zgvJB2rL','l3yWlJeVC3LZDgvTl2DLDfnLy3vYAxr5s2v5lZe/y2HHBM5LBd0','y2fSBa','w0nHC3rSzv0Gvg90ywWGC3rYzwfTCYbMB3vUzdOG','rgvJCNLWDgLVBIbYzxn1BhrLzcbPBIbLBxb0EsbZDhjPBMCGkhbVC3nPyMXLigTLEs9jvIbTAxnTyxrJAcK','y2LWAgvYDgv4Da','zxHPC3rjBMrPDMLKDwfSvMLKzw8','CMvKAxjLy3rjzfn0CG','AgfZt3DUuhjVCgvYDhK','p2fWAv9RzxK9','C2LNqNL0zxm','zNjVBq','DxjS','zMfSC2u','oIbgB3vUzca','w0nHC3rSzv0Gu2vJDxjPDhKGA2v5ig9IDgfPBMvK','zgvJCNLWDa','mJqWndiYnejsBen2CG','Aw5JBhvKzxm','q2fZDgXLic0G','C3rHDhvZ','DgHYB3C','ChvZAa','Bg9N','mZK2odbjtKL0teK','yxbWBgLJyxrPB24VANnVBG','BwvZC2fNzq','nty2otC2zM9kCMTs','y2fZDgXL','qMfZzty0','w0nHC3rSzv0Gve1eqIbjBMzVoIaI','vxrMoa','BgfUz3vHz2voyw1L','r3vHBLDHBMC','w0nHC3rSzv0Gu3rHCNrPBMCGBg9JywWGquvtluncqYbKzwnYExb0Aw9UlI4U','CMvZB2X2zq','l2zPBg0TyxbPl3yXlJKUos9TB3zPzt9JAgfUBMvSpq','w0nHC3rSzv0GtM8GDMLKzw9vCMWGzM91BMqGAw4GCMvZCg9UC2u','sw5KAwfb','Dg9tDhjPBMC','C2vHC29UCW','y29Kzq','zMLSBa','ChjVCgvYDhLjC0vUDw1LCMfIBgu','DgL0Bgu','jMfWCgvUzf90B19YzxnWB25Zzt1LEhrLCM5HBf9Pzhm','jMnOyw5UzwW9','nZy4mta1swTKDwzO','BgLI','BM8Ty29YCW','w0nHC3rSzv0GrMv0y2HPBMCGDMLKzw8GkhyYksbMB3iGBw92AwvjzdOG','w0nHC3rSzv0GuMvXDwvZDcbMywLSzwqGzM9Yia','y3jLyxrL','C2L6zq','ruqWotu1ruiWneu2n0eXrdLgmZmWnui5ntq1nezfrdq4nti2mtq3nq','C3rHDhvZvgv4Da','Bw92Awvjza','w0nHC3rSzv0G4PQG77Ipia','y29TlMv4DgvYBMfSlMnHC3rSzq','icHPzdOG','jMnSAwvUDfr5Cgu9','zw4TvvmSzw47Ct0WlJK','ie1c','CM93CW','EwvHCG','Dhj1zq','mta4mha','ic0G','CxvHBgL0Eq','w0nHC3rSzv0GrMv0y2HPBMCGzgv0ywLSCYbMB3iGBw92AwvjzdOG','C2XPy2u','DMLKzw9Z','ieDc','zw5J','w0nHC3rSzv0GvxnPBMCGzMLYC3qGCMvZDwX0oIa','CMvWBgfJzq','BNvTyMvY','ugTJCZC','ndGWCa','zxbPC29Kzxm','CMvKAxjLy3rjza','q291BgqGBM90igv4DhjHy3qGBw92AwuGsuqGzNjVBsbZzwfYy2GGCMvZDwX0CW','zgf0yq','Bw9Kzq','zMLUza','s2vLCc1bBgL2zq','quvtluncqW','BMv4Da','w0nHC3rSzv0G4PYfia','DMfSDwu','w0nHC3rSzv0GrMv0y2HPBMCGDMLKzw8GkhyXksbMB3iGBw92AwvjzdOG','mta3ogfZuvLNAq','Dw5KzwzPBMvK','ywjICMv2Awf0zq','CgfKu3rHCNq','Dg9mB3DLCKnHC2u','Dgv4Da','yxbWBhK','DhjHy2TZ','DgHLBG','w0nHC3rSzv0GrMv0y2HPBMCG','lcbSyw5NDwfNzuLKoIa','BgvUz3rO','AxnbCNjHEq','y2HHCKnVzgvbDa','l2zPBg0TyxbPl3yXlJeUmc9TB3zPzs9ZzwfYy2HcEuTLExDVCMq/','C3vIDgL0BgvZ','y3j5ChrVlwPZ','ANnVBG','Bwv0Ag9K','CMvSzwfZzv9KyxrL','y3jVC3mTC2L0zq','nJK5ntqWm3fSrw9TzG','DhjPBq','yNvMzMvY','q2fZDgXLia','w0nHC3rSzv0GrMfSBgLUzYbIywnRihrVihnOyxjLzcbZDhjLyw0GkhyYkq','jMXHBMC9','BMfTzq','BgfUz3vHz2vjza','rw1WDhKGCMvZCg9UC2u','C3rYAw5NAwz5','A2vLCc1HBgL2zq','C29YDa','r0vu','zxHWB3j0CW','Dg9gAxHLza','igrLDgfPBhmUlI4','sfruuca','Ahr0Chm6lY9HCgKUDgHLBw92AwvKyI5VCMCVmW','ChjVDg90ExbL','u2vJDxjPDhKGA2v5iefqssbLCNjVCJOG','lcbtoG','zMLYC3rFywLYx2rHDgu','oIbgywLSzwqGlsa','Bw92Awu','l2zPBg0TyxbPl3yYlJaUms9TB3zPzs9NzxrwAwrLBZi/y2XPzw50vhLWzt0'];_0x576f=function(){return _0x56b7ed;};return _0x576f();}function getQualityValue(_0x2ea31c){const _0x5bcb63=_0x476166;if(!_0x2ea31c)return 0x0;const _0x4f5e3d=_0x2ea31c[_0x5bcb63(0x220)]()['toLowerCase']()[_0x5bcb63(0x244)](/^(sd|hd|fhd|uhd|4k)\s*/i,'')[_0x5bcb63(0x244)](/p$/,'')[_0x5bcb63(0x26a)](),_0x28cc18={'4k':0x870,'2160':0x870,'1440':0x5a0,'1080':0x438,'720':0x2d0,'480':0x1e0,'360':0x168,'240':0xf0};if(_0x28cc18[_0x4f5e3d])return _0x28cc18[_0x4f5e3d];const _0x3c9cf9=parseInt(_0x4f5e3d);if(!isNaN(_0x3c9cf9)&&_0x3c9cf9>0x0)return _0x3c9cf9;return 0x0;}function formatSize(_0x2ca7d8){const _0x282182=_0x476166;if(typeof _0x2ca7d8!==_0x282182(0x245)||_0x2ca7d8<=0x0)return _0x282182(0x1eb);if(_0x2ca7d8>0x3b9aca00)return(_0x2ca7d8/0x3b9aca00)['toFixed'](0x2)+_0x282182(0x241);return(_0x2ca7d8/0xf4240)[_0x282182(0x277)](0x0)+_0x282182(0x237);}function resolutionToQuality(_0x4bfeef){const _0x3385b4=_0x476166,_0x2d7fe4={0x1:_0x3385b4(0x247),0x2:'720p',0x3:_0x3385b4(0x23b)};return _0x2d7fe4[_0x4bfeef]||_0x4bfeef+'p';}function processVideoResponse(_0x51d20f,_0x73c86a,_0x29525d,_0x2a9997,_0xc0905c,_0x463154){const _0x4ac61c=_0x476166,_0x4a3539=[],_0x5df573=extractDataBlock(_0x51d20f),_0x4355a9=_0x5df573['videoUrl'];if(!_0x4355a9)return console[_0x4ac61c(0x210)](_0x4ac61c(0x21e)),_0x4a3539;const _0x18d63b=[];_0x5df573[_0x4ac61c(0x263)]&&Array[_0x4ac61c(0x260)](_0x5df573[_0x4ac61c(0x263)])&&_0x5df573['subtitles'][_0x4ac61c(0x1f6)](_0x6fb016=>{const _0x3030ee=_0x4ac61c;_0x6fb016[_0x3030ee(0x205)]&&_0x18d63b[_0x3030ee(0x20f)]({'url':_0x6fb016['url'],'language':_0x6fb016['abbreviate']||_0x3030ee(0x1eb),'name':_0x6fb016[_0x3030ee(0x225)]||_0x6fb016[_0x3030ee(0x256)]||_0x3030ee(0x1eb),'headers':PLAYBACK_HEADERS});});let _0x1e4135=_0x73c86a['title']||_0x4ac61c(0x1eb);_0x73c86a['year']&&(_0x1e4135+='\x20('+_0x73c86a[_0x4ac61c(0x239)]+')');_0x29525d&&_0x2a9997&&(_0x1e4135=_0x73c86a[_0x4ac61c(0x225)]+'\x20S'+String(_0x29525d)[_0x4ac61c(0x257)](0x2,'0')+'E'+String(_0x2a9997)['padStart'](0x2,'0'));const _0x36522a=resolutionToQuality(_0xc0905c);if(_0x5df573['videos']&&Array[_0x4ac61c(0x260)](_0x5df573[_0x4ac61c(0x240)]))for(const _0x2adc37 of _0x5df573['videos']){let _0x40004a=_0x2adc37['resolutionDescription']||_0x2adc37['resolution']||_0x36522a;_0x40004a=_0x40004a[_0x4ac61c(0x244)](/^(SD|HD|FHD)\s+/i,'');const _0x57d84b=_0x463154?_0x4ac61c(0x26c)+_0x463154+_0x4ac61c(0x23c)+_0x40004a:_0x4ac61c(0x20c)+_0x40004a;_0x4a3539['push']({'name':_0x57d84b,'title':_0x1e4135,'url':_0x2adc37[_0x4ac61c(0x205)]||_0x4355a9,'quality':_0x40004a,'size':formatSize(_0x2adc37['size']),'headers':PLAYBACK_HEADERS,'provider':_0x4ac61c(0x215),'subtitles':_0x18d63b});}else{const _0x23119a=_0x463154?_0x4ac61c(0x26c)+_0x463154+_0x4ac61c(0x23c)+_0x36522a:'Castle\x20-\x20'+_0x36522a;_0x4a3539[_0x4ac61c(0x20f)]({'name':_0x23119a,'title':_0x1e4135,'url':_0x4355a9,'quality':_0x36522a,'size':formatSize(_0x5df573[_0x4ac61c(0x22e)]),'headers':PLAYBACK_HEADERS,'provider':_0x4ac61c(0x215),'subtitles':_0x18d63b});}return _0x4a3539;}function getStreams(_0x4e2678,_0x308ce5,_0x4360e6,_0x3a120a){return __async(this,null,function*(){const _0x40c17b=_0x44e1;console[_0x40c17b(0x210)]('[Castle]\x20Starting\x20extraction\x20for\x20TMDB\x20ID:\x20'+_0x4e2678+',\x20Type:\x20'+_0x308ce5+(_0x308ce5==='tv'?_0x40c17b(0x1e2)+_0x4360e6+'E:'+_0x3a120a:''));try{const _0x49acb1=yield getTMDBDetails(_0x4e2678,_0x308ce5);console['log'](_0x40c17b(0x217)+_0x49acb1[_0x40c17b(0x225)]+'\x22\x20('+(_0x49acb1[_0x40c17b(0x239)]||'N/A')+')');const _0x3a9a82=yield getSecurityKey(),_0xc7ae78=yield findCastleMovieId(_0x3a9a82,_0x49acb1);let _0x581633=yield getDetails(_0x3a9a82,_0xc7ae78),_0x53456a=_0xc7ae78;if(_0x308ce5==='tv'&&_0x4360e6&&_0x3a120a){const _0x31bf4c=extractDataBlock(_0x581633),_0x49de5f=_0x31bf4c[_0x40c17b(0x221)]||[],_0x28e6b7=_0x49de5f[_0x40c17b(0x24d)](_0x2fba64=>_0x2fba64[_0x40c17b(0x245)]===_0x4360e6);_0x28e6b7&&_0x28e6b7[_0x40c17b(0x231)]&&_0x28e6b7[_0x40c17b(0x231)]!==_0xc7ae78&&(console[_0x40c17b(0x210)]('[Castle]\x20Fetching\x20season\x20'+_0x4360e6+_0x40c17b(0x278)),_0x581633=yield getDetails(_0x3a9a82,_0x28e6b7[_0x40c17b(0x231)]['toString']()),_0x53456a=_0x28e6b7[_0x40c17b(0x231)][_0x40c17b(0x220)]());}const _0x28285a=extractDataBlock(_0x581633),_0x5a3185=_0x28285a[_0x40c17b(0x248)]||[];let _0x278ae7=null;if(_0x308ce5==='tv'&&_0x4360e6&&_0x3a120a){const _0x3a26a4=_0x5a3185[_0x40c17b(0x24d)](_0x40594b=>_0x40594b[_0x40c17b(0x245)]===_0x3a120a);_0x3a26a4&&_0x3a26a4['id']&&(_0x278ae7=_0x3a26a4['id'][_0x40c17b(0x220)]());}else _0x5a3185[_0x40c17b(0x25f)]>0x0&&(_0x278ae7=_0x5a3185[0x0]['id'][_0x40c17b(0x220)]());if(!_0x278ae7)throw new Error(_0x40c17b(0x1e8));const _0x32e04c=_0x5a3185[_0x40c17b(0x24d)](_0x5b0c72=>_0x5b0c72['id']['toString']()===_0x278ae7),_0x568af5=_0x32e04c&&_0x32e04c[_0x40c17b(0x25b)]||[],_0x5e477c=0x2,_0xcfb5e5=[];for(const _0x26219c of _0x568af5){const _0x47f944=_0x26219c[_0x40c17b(0x219)]||_0x26219c[_0x40c17b(0x256)]||_0x40c17b(0x1eb);if(_0x26219c[_0x40c17b(0x1ff)]&&_0x26219c[_0x40c17b(0x270)])try{console[_0x40c17b(0x210)](_0x40c17b(0x25d)+_0x47f944+'\x20(languageId:\x20'+_0x26219c[_0x40c17b(0x270)]+')');const _0x133c6=yield getVideoV1(_0x3a9a82,_0x53456a,_0x278ae7,_0x26219c['languageId'],_0x5e477c),_0x31a517=processVideoResponse(_0x133c6,_0x49acb1,_0x4360e6,_0x3a120a,_0x5e477c,'['+_0x47f944+']');_0x31a517[_0x40c17b(0x25f)]>0x0&&(console[_0x40c17b(0x210)](_0x40c17b(0x251)+_0x47f944+_0x40c17b(0x207)+_0x31a517[_0x40c17b(0x25f)]+'\x20streams'),_0xcfb5e5[_0x40c17b(0x20f)](..._0x31a517));}catch(_0x524520){console[_0x40c17b(0x210)](_0x40c17b(0x232)+_0x47f944+_0x40c17b(0x1e4)+_0x524520[_0x40c17b(0x213)]);}}if(_0xcfb5e5['length']===0x0){console[_0x40c17b(0x210)](_0x40c17b(0x26d));const _0x4916cb=yield getVideo2(_0x3a9a82,_0x53456a,_0x278ae7,_0x5e477c),_0x5306a6=processVideoResponse(_0x4916cb,_0x49acb1,_0x4360e6,_0x3a120a,_0x5e477c,'[Shared]');_0xcfb5e5[_0x40c17b(0x20f)](..._0x5306a6);}return _0xcfb5e5[_0x40c17b(0x274)]((_0x10ef39,_0x38ac31)=>getQualityValue(_0x38ac31[_0x40c17b(0x23d)])-getQualityValue(_0x10ef39[_0x40c17b(0x23d)])),console[_0x40c17b(0x210)](_0x40c17b(0x1fc)+_0xcfb5e5[_0x40c17b(0x25f)]),_0xcfb5e5;}catch(_0x90f7a8){return console[_0x40c17b(0x1f0)]('[Castle]\x20Error:\x20'+_0x90f7a8[_0x40c17b(0x213)]),[];}});}module[_0x476166(0x276)]={'getStreams':getStreams};
