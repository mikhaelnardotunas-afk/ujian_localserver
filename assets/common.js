/* ===== Fungsi bersama untuk aplikasi siswa & dashboard guru ===== */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};

  /* ---------- API ke Google Apps Script ---------- */
  // Aksi yang hanya membaca aman diulang bila server sedang penuh. Aksi yang menulis tidak diulang otomatis.
  var AKSI_BACA = { ping: 1, kelas: 1, unduh: 1, hasilSiswa: 1, guruLogin: 1, guruData: 1, guruMeta: 1, guruDetail: 1, guruLaporan: 1, guruRekap: 1, guruAmbilSoal: 1, guruEkspor: 1, guruPengaturan: 1, cetakMeta: 1, cetakSoal: 1 };
  var GALAT_SEMENTARA = /too many times|service .*(failed|unavailable|error)|server error|internal error|timed out|sedang sibuk|try again|tidak aktif|mengalami masalah/i;

  /** onProgress(diterima, total) opsional: dipanggil saat data balasan mengalir (total 0 = ukuran tidak diketahui) */
  function api(action, data, timeoutMs, onProgress) {
    function coba(ke) {
      return apiSekali(action, data, timeoutMs, onProgress).catch(function (e) {
        // Batas waktu habis berarti pengguna sudah lama menunggu: cukup diulang sekali
        var batas = e && e.waktuHabis ? 1 : 2;
        if (!e || !e.sementara || !AKSI_BACA[action] || ke >= batas || navigator.onLine === false) throw e;
        return new Promise(function (ok) { setTimeout(ok, ke === 0 ? 1500 : 4000); }).then(function () { return coba(ke + 1); });
      });
    }
    return coba(0);
  }
  function sementara(pesan, tambahan) { return Object.assign(new Error(pesan), { sementara: true }, tambahan || {}); }

  function apiSekali(action, data, timeoutMs, onProgress) {
    if (!CFG.API_URL || CFG.API_URL.indexOf('GANTI_DENGAN') >= 0) {
      return Promise.reject(new Error('URL API belum diatur di config.js'));
    }
    var body = Object.assign({ action: action }, data || {});
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 60000) : null;
    // text/plain → "simple request", tidak memicu preflight CORS di Apps Script
    return fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw sementara('Server sedang sibuk (kode ' + r.status + '). Coba lagi sebentar.');
      if (!onProgress || !r.body || !r.body.getReader || typeof TextDecoder === 'undefined') return r.json();
      var total = +r.headers.get('Content-Length') || 0, diterima = 0, teks = '';
      var reader = r.body.getReader(), dec = new TextDecoder();
      onProgress(0, total);
      return (function baca() {
        return reader.read().then(function (x) {
          if (x.done) { teks += dec.decode(); return JSON.parse(teks); }
          diterima += x.value.length;
          teks += dec.decode(x.value, { stream: true });
          onProgress(diterima, total);
          return baca();
        });
      })();
    }).then(function (j) {
      if (!j || j.ok === false) {
        var pesan = (j && j.pesan) || 'Permintaan ditolak server', gl = new Error(pesan);
        gl.sementara = GALAT_SEMENTARA.test(pesan);
        throw gl;
      }
      return j;
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw sementara('Koneksi terlalu lama, coba lagi', { waktuHabis: true });
      if (e && (e.message === 'Failed to fetch' || e.name === 'TypeError')) throw sementara('Tidak ada koneksi ke server');
      // Saat kewalahan Apps Script membalas halaman HTML, bukan JSON
      if (e && e.name === 'SyntaxError') throw sementara('Server sedang sibuk. Coba lagi sebentar.');
      throw e;
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  /* ---------- Kripto (pasangan dari Code.gs) ---------- */
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }
  function sha256Bytes(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) { return new Uint8Array(b); });
  }
  function sha256Hex(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(hex);
  }
  /** Format "a1:" dari backend Cloudflare: AES-GCM, kuncinya SHA-256 dari keyStr. */
  async function decryptAES(b64, keyStr) {
    var bin = atob(b64), n = bin.length, b = new Uint8Array(n);
    for (var i = 0; i < n; i++) b[i] = bin.charCodeAt(i);
    var k = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr));
    var key = await crypto.subtle.importKey('raw', k, 'AES-GCM', false, ['decrypt']);
    var hasil = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, key, b.subarray(12));
    return new TextDecoder().decode(hasil);
  }
  async function decrypt(b64, keyStr) {
    if (b64.indexOf('a1:') === 0) return decryptAES(b64.slice(3), keyStr);
    // Format lama (Apps Script): data yang sudah terunduh di HP tetap bisa dibuka
    var bin = atob(b64);
    var out = new Array(bin.length);
    var block = null;
    for (var i = 0; i < bin.length; i++) {
      if (i % 32 === 0) block = await sha256Bytes(keyStr + ':' + (i / 32));
      out[i] = String.fromCharCode((bin.charCodeAt(i) ^ block[i % 32]) & 0xff);
    }
    return out.join('');
  }
  function pwHash(username, password) {
    return sha256Hex('PW|' + String(username).trim().toLowerCase() + '|' + String(password).trim());
  }

  /* ---------- Penyimpanan lokal ---------- */
  var store = {
    get: function (k, def) {
      try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) {
        toast('Memori HP penuh! Hapus data lain lalu coba lagi.', 'err'); return false;
      }
    },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    keys: function (prefix) {
      var out = [];
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(prefix) === 0) out.push(k); } } catch (e) {}
      return out;
    }
  };

  /* ---------- Teks + MathJax ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** Teks soal: escape HTML, dukung **tebal**, _miring_, dan baris baru. LaTeX dibiarkan untuk MathJax. */
  function rich(s) {
    var parts = String(s == null ? '' : s).split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g);
    return parts.map(function (p, i) {
      if (i % 2 === 1) return esc(p); // bagian matematika, jangan diubah
      return esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_(.+?)_(?=\s|$|[.,!?])/g, '$1<i>$2</i>').replace(/\n/g, '<br>');
    }).join('');
  }
  function typeset(el) {
    if (!el || !window.MathJax || !MathJax.typesetPromise) return Promise.resolve();
    var p = (MathJax.startup && MathJax.startup.promise) || Promise.resolve();
    return p.then(function () {
      if (MathJax.typesetClear) MathJax.typesetClear([el]);
      return MathJax.typesetPromise([el]);
    }).catch(function () {});
  }

  /* ---------- Suara efek (dibuat dengan Web Audio, tanpa file) ---------- */
  var actx = null;
  function sfx(jenis) {
    if (store.get('ue_settings', {}).mute) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var now = actx.currentTime;
      var nada = {
        klik: [[520, 0, 0.06]],
        pop: [[660, 0, 0.08], [880, 0.07, 0.08]],
        sukses: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.25]],
        salah: [[220, 0, 0.18], [170, 0.15, 0.25]],
        detik: [[1200, 0, 0.04]],
        whoosh: [[300, 0, 0.25, 900]]
      }[jenis] || [[440, 0, 0.1]];
      nada.forEach(function (n) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = jenis === 'salah' ? 'sawtooth' : 'triangle';
        o.frequency.setValueAtTime(n[0], now + n[1]);
        if (n[3]) o.frequency.exponentialRampToValueAtTime(n[3], now + n[1] + n[2]);
        g.gain.setValueAtTime(0.0001, now + n[1]);
        g.gain.exponentialRampToValueAtTime(0.18, now + n[1] + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + n[2]);
        o.connect(g); g.connect(actx.destination);
        o.start(now + n[1]); o.stop(now + n[1] + n[2] + 0.02);
      });
    } catch (e) {}
  }

  /* ---------- Toast & dialog ---------- */
  function toast(msg, tipe) {
    var box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'toast ' + (tipe || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  }
  function dialog(opts) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = '<div class="modal board" role="dialog" aria-modal="true">' +
        (opts.judul ? '<h2 class="board-title">' + esc(opts.judul) + '</h2>' : '') +
        '<div class="modal-body">' + (opts.html || esc(opts.pesan || '')) + '</div>' +
        '<div class="modal-actions">' +
        (opts.batal ? '<button class="btn btn-wood" data-v="0">' + esc(opts.batal) + '</button>' : '') +
        '<button class="btn ' + (opts.bahaya ? 'btn-red' : 'btn-green') + '" data-v="1">' + esc(opts.ok || 'Oke') + '</button>' +
        '</div></div>';
      document.body.appendChild(wrap);
      var okBtn = wrap.querySelector('[data-v="1"]');
      setTimeout(function () { okBtn.focus(); }, 30);
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-v]');
        if (!b) return;
        sfx('klik');
        wrap.remove();
        resolve(b.getAttribute('data-v') === '1');
      });
    });
  }

  /* ---------- Format ---------- */
  function fmtWaktu(detik) {
    detik = Math.max(0, Math.ceil(detik));
    var m = Math.floor(detik / 60), s = detik % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtTanggal(ms) {
    if (!ms) return '-';
    var d = new Date(ms);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  function relatif(ms) {
    if (!ms) return '-';
    var d = Math.round((Date.now() - ms) / 1000);
    if (d < 60) return d + ' dtk lalu';
    if (d < 3600) return Math.floor(d / 60) + ' mnt lalu';
    if (d < 86400) return Math.floor(d / 3600) + ' jam lalu';
    return fmtTanggal(ms);
  }
  function bintang(nilai) {
    if (nilai == null) return 0;
    return nilai >= 85 ? 3 : nilai >= 70 ? 2 : nilai >= 50 ? 1 : 0;
  }
  function bintangSVG(n, total) {
    total = total || 3;
    var s = '';
    for (var i = 0; i < total; i++) {
      s += '<svg class="star ' + (i < n ? 'on' : 'off') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
    }
    return '<span class="stars" aria-label="' + n + ' dari ' + total + ' bintang">' + s + '</span>';
  }

  /* ---------- Status online ---------- */
  function pasangIndikatorOnline(el) {
    function upd() {
      var on = navigator.onLine;
      el.classList.toggle('on', on);
      el.title = on ? 'Ada internet' : 'Mode offline';
      el.innerHTML = '<span class="dot"></span>' + (on ? 'Online' : 'Offline');
    }
    window.addEventListener('online', upd);
    window.addEventListener('offline', upd);
    upd();
  }

  /* ---------- Service worker ---------- */
  function daftarSW() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(function (e) { console.warn('SW gagal', e); });
    }
  }

  window.UE = {
    CFG: CFG, api: api, sha256Hex: sha256Hex, decrypt: decrypt, pwHash: pwHash,
    store: store, esc: esc, rich: rich, typeset: typeset, sfx: sfx, toast: toast, dialog: dialog,
    fmtWaktu: fmtWaktu, fmtTanggal: fmtTanggal, relatif: relatif, bintang: bintang, bintangSVG: bintangSVG,
    pasangIndikatorOnline: pasangIndikatorOnline, daftarSW: daftarSW
  };
})();
