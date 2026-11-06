/* =========================================================
   Aplikasi siswa — Petualangan Ujian v2 (Anti-Contek + Progres Bar Animasi)
   ========================================================= */
(function () {
  'use strict';
  var UE = window.UE, store = UE.store, CFG = UE.CFG;
  var K = { PKG: 'ue_pkg', OUT: 'ue_outbox', DONE: 'ue_done', ACTIVE: 'ue_active', SET: 'ue_settings', DEV: 'ue_dev', EV: 'ue_events', HP: 'ue_hp' };
  var $ = function (id) { return document.getElementById(id); };
  var HURUF = ['A', 'B', 'C', 'D', 'E'];
  var MODE_INFO = {
    TIMER: 'Timer berlaku untuk seluruh ujian. Kamu bebas pindah, kembali, dan menandai soal ragu-ragu.',
    TIMERSOAL: 'Setiap soal punya timer. Saat timer habis, jawaban terkunci dan soal otomatis berganti. Kamu boleh lanjut lebih cepat.',
    TIMERFIXED: 'Setiap soal punya timer minimal: tombol Lanjut terkunci sampai timer soal habis. Setelah itu kamu masih boleh menjawab sebelum lanjut. Ada juga timer total ujian.'
  };

  var S = { user: null, paket: null, pending: null, tempTok: null, att: null, tickId: null, hbId: null, saveId: null, prevId: null,
    busy: false, sending: false, wakeLock: null, peringatan: {}, lastBlur: 0, modalTerhenti: false };

  /* Anti copy-paste & Anti Klik Kanan */
  document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  document.addEventListener('copy', function(e) { e.preventDefault(); UE.toast('Dilarang menyalin (copy) saat ujian', 'err'); });
  document.addEventListener('cut', function(e) { e.preventDefault(); });

  /* ---------------- Utilitas ---------------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    $('topbar').classList.toggle('hidden', id === 'scr-play');
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () { UE.sfx('klik'); if (b.dataset.back === 'scr-map') renderMap(); show(b.dataset.back); });
  });
  function attKey(paket, u) { return 'ue_att_' + paket + '_' + u; }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function pkg() { return store.get(K.PKG, null); }
  function outbox() { return store.get(K.OUT, []); }
  function acak(arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  function terisi(v) { return !!String(v || '').trim(); }

  /* ---------------- Identitas perangkat & laporan ---------------- */
  function devId() {
    var d = store.get(K.DEV, null);
    if (!d) { d = 'HP-' + uid().replace(/-/g, '').slice(0, 6).toUpperCase(); store.set(K.DEV, d); }
    return d;
  }
  function devInfo() {
    var ua = navigator.userAgent || '';
    var m = ua.match(/\(([^)]+)\)/);
    var dalam = m ? m[1].split(';').map(function (x) { return x.trim(); }).filter(function (x) { return x && !/^(Linux|U|wv|K|x11|X11)$/i.test(x); }) : [];
    var browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return (dalam.slice(0, 2).join(' ') + (browser ? ' · ' + browser : '')).slice(0, 100);
  }
  function catatEvent(e) {
    var ev = store.get(K.EV, []);
    e.id = uid(); e.w = Date.now();
    ev.push(e);
    store.set(K.EV, ev.slice(-300));
    lapor();
  }
  var melapor = false;
  function lapor() {
    if (melapor || !navigator.onLine) return;
    melapor = true;
    var ev = store.get(K.EV, []);
    UE.api('lapor', { dev: devId(), info: devInfo(), antrian: outbox().length, events: ev }, 20000).then(function (r) {
      var ok = {};
      (r.diterima || []).forEach(function (id) { ok[id] = 1; });
      store.set(K.EV, store.get(K.EV, []).filter(function (e) { return !ok[e.id]; }));
    }).catch(function () {}).then(function () { melapor = false; });
  }

  /* ---------------- Inisialisasi ---------------- */
  function init() {
    UE.daftarSW();
    UE.pasangIndikatorOnline($('net'));
    if (CFG.NAMA_APLIKASI) { $('appName').textContent = CFG.NAMA_APLIKASI; document.title = CFG.NAMA_APLIKASI; }
    perbaruiTombolSuara();
    buatToolbar();
    devId();
    var p = pkg();
    if (p && p.sekolah) $('schoolName').textContent = p.sekolah;
    if (p && p.versi !== 2) { store.del(K.PKG); p = null; } 

    var aktif = store.get(K.ACTIVE, null);
    var att = aktif ? store.get(attKey(aktif.paket, aktif.u), null) : null;
    if (att && (att.status === 'play' || att.status === 'terhenti') && att.v === 2) {
      S.user = { u: att.u, n: att.n, k: att.k, h: att.h };
      S.att = att;
      UE.toast('Melanjutkan ' + att.namaPaket, 'ok');
      mulaiBermain(true);
    } else if (!p) show('scr-setup');
    else tampilLogin();

    updateBadge();
    window.addEventListener('online', function () { syncOutbox(true); lapor(); kirimDrafSegera(); });
    var menit = 0; // laporan HP cukup tiap 5 menit agar hemat kuota server; kiriman tertunda tetap dicoba tiap menit
    setInterval(function () { if (navigator.onLine) { if (outbox().length) syncOutbox(true); if (++menit % 5 === 0) lapor(); } }, 60000);
    if (navigator.onLine) setTimeout(function () { syncOutbox(true); lapor(); }, 1500);
  }

  /* ---------------- 1. Unduh data ---------------- */
  var kelasTerpilih = [];
  $('btnMuatKelas').addEventListener('click', function () {
    var b = this; UE.sfx('klik');
    b.disabled = true; b.innerHTML = '<span class="spinner"></span> Memuat…';
    UE.api('kelas').then(function (r) {
      if (r.versi !== 2) throw new Error('Versi server tidak cocok dengan aplikasi. Hubungi guru.');
      $('schoolName').textContent = r.sekolah || '';
      var p = pkg();
      kelasTerpilih = p ? p.kelas.slice() : [];
      $('kelasChips').innerHTML = r.kelas.map(function (k) {
        return '<button type="button" class="chip" aria-pressed="' + (kelasTerpilih.indexOf(k.kelas) >= 0) + '" data-k="' + UE.esc(k.kelas) + '">' +
          UE.esc(k.kelas) + ' <small>' + k.jumlah + ' siswa</small></button>';
      }).join('') || '<p class="muted">Belum ada data siswa di server.</p>';
      $('kelasBox').classList.add('hidden');
      $('kelasPilih').classList.remove('hidden');
      $('btnUnduh').disabled = !kelasTerpilih.length;
    }).catch(function (e) {
      $('setupMsg').textContent = e.message + (navigator.onLine ? '' : ' Pastikan HP terhubung internet.');
      UE.sfx('salah');
    }).finally(function () { b.disabled = false; b.textContent = 'Tampilkan daftar kelas'; });
  });
  $('kelasChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    UE.sfx('pop');
    var k = c.dataset.k, i = kelasTerpilih.indexOf(k);
    if (i >= 0) kelasTerpilih.splice(i, 1); else kelasTerpilih.push(k);
    c.setAttribute('aria-pressed', i < 0);
    $('btnUnduh').disabled = !kelasTerpilih.length;
  });
  $('btnUnduh').addEventListener('click', function () {
    var b = this; UE.sfx('klik');
    b.disabled = true; b.innerHTML = '<span class="spinner"></span> Mengunduh…';
    unduhPaket(kelasTerpilih).then(function (p) {
      UE.sfx('sukses');
      UE.toast('Data tersimpan: ' + Object.keys(p.users).length + ' siswa, ' + Object.keys(p.paket).length + ' ujian', 'ok');
      tampilLogin();
    }).catch(function (e) { $('setupMsg').textContent = e.message; UE.sfx('salah'); })
      .finally(function () { b.disabled = false; b.textContent = 'Unduh data'; });
  });
  $('btnSetupKembali').addEventListener('click', function () { tampilLogin(); });

  /* Overlay progres unduh: 4 tahap — server menyiapkan, menerima data, menyimpan di HP, gambar soal */
  var Unduh = {
    pct: 0, timer: null, lewati: null,
    buka: function () {
      this.pct = 0; this.henti();
      $('unduhBar').style.width = '0%'; $('unduhPersen').textContent = '0%'; $('unduhDetail').textContent = '';
      $('unduhJudul').textContent = '📥 Mengunduh data ujian…'; $('unduhLewati').classList.add('hidden'); $('unduhCatatan').classList.remove('hidden');
      document.querySelectorAll('#unduhLangkah li').forEach(function (li) { li.className = ''; li.querySelector('small').textContent = ''; });
      $('unduhOverlay').classList.remove('hidden');
    },
    /** Persen hanya boleh naik */
    set: function (pct, detail) {
      this.pct = Math.max(this.pct, Math.min(100, pct));
      $('unduhBar').style.width = this.pct.toFixed(1) + '%';
      $('unduhPersen').textContent = Math.floor(this.pct) + '%';
      $('unduhBar').parentNode.setAttribute('aria-valuenow', Math.floor(this.pct));
      if (detail != null) $('unduhDetail').textContent = detail;
    },
    /** Tandai tahap ke-i aktif, tahap sebelumnya selesai. ket = keterangan kecil di tahap itu. */
    tahap: function (i, ket) {
      document.querySelectorAll('#unduhLangkah li').forEach(function (li, j) {
        li.className = j < i ? 'selesai' : j === i ? 'aktif' : '';
        if (j === i && ket != null) li.querySelector('small').textContent = ket;
      });
    },
    ket: function (i, teks) { $('unduhLangkah').children[i].querySelector('small').textContent = teks; },
    /** Selama menunggu server: persen naik perlahan mendekati batas, sambil menampilkan lama menunggu */
    tunggu: function (dari, ke, teks) {
      var self = this, mulai = Date.now();
      this.henti();
      this.timer = setInterval(function () {
        var dtk = (Date.now() - mulai) / 1000;
        self.set(dari + (ke - dari) * (1 - Math.exp(-dtk / 8)), teks + ' (' + Math.floor(dtk) + ' detik)');
      }, 250);
    },
    henti: function () { clearInterval(this.timer); this.timer = null; },
    tutup: function (tunda) {
      this.henti();
      return new Promise(function (ok) { setTimeout(function () { $('unduhOverlay').classList.add('hidden'); ok(); }, tunda || 0); });
    }
  };
  $('unduhLewati').addEventListener('click', function () { if (Unduh.lewati) Unduh.lewati(); });
  function ukuranKB(b) { return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; }

  function unduhPaket(kelas) {
    var mulaiTerima = false, ukuran = 0;
    Unduh.buka();
    Unduh.tahap(0, 'Kelas ' + kelas.join(', '));
    Unduh.set(3, 'Menghubungi server…');
    Unduh.tunggu(4, 55, 'Server sedang menyiapkan soal & data siswa');
    return UE.api('unduh', { kelas: kelas, dev: devId(), info: devInfo() }, 90000, function (diterima, total) {
      if (!mulaiTerima) { mulaiTerima = true; Unduh.henti(); Unduh.tahap(1); }
      ukuran = diterima;
      var tahu = total && diterima <= total; // total = ukuran terkompresi; bila terlampaui, anggap tidak diketahui
      Unduh.set(56 + 20 * (tahu ? diterima / total : 1 - Math.exp(-diterima / 150000)),
        'Menerima data: ' + ukuranKB(diterima) + (tahu ? ' dari ' + ukuranKB(total) : ''));
      Unduh.ket(1, ukuranKB(diterima));
    }).then(function (r) {
      Unduh.henti();
      if (r.versi !== 2) throw new Error('Versi server tidak cocok dengan aplikasi. Hubungi guru.');
      var p = { versi: 2, sekolah: r.sekolah, kelas: r.kelas, users: {}, paket: {}, unduh: Date.now(), selisih: r.waktuServer - Date.now() };
      r.users.forEach(function (u) { p.users[u.u] = u; });
      r.paket.forEach(function (x) { p.paket[x.id] = x; });
      terapkanAturanHP(r.hp);
      var ringkas = r.users.length + ' siswa · ' + r.paket.length + ' ujian';
      Unduh.tahap(2, ringkas);
      if (!mulaiTerima) Unduh.ket(1, 'selesai');
      Unduh.set(78, 'Menyimpan ' + ringkas + ' di HP…');
      if (!store.set(K.PKG, p)) throw new Error('Gagal menyimpan data di HP');
      $('schoolName').textContent = r.sekolah || '';
      return simpanGambar(r.paket).then(function (g) {
        p.gambar = g;
        Unduh.tahap(4);
        var kurang = g.total - g.ok;
        Unduh.set(100, 'Selesai! ' + ringkas + (g.total ? ' · ' + g.ok + '/' + g.total + ' gambar' : '') + ' siap dipakai tanpa internet.' +
          (!kurang ? '' : g.lewat ? ' ' + kurang + ' gambar sisanya tetap diunduh di latar belakang selama aplikasi terbuka.'
            : ' ' + kurang + ' gambar belum tersimpan — tekan "Perbarui data" lagi saat sinyal bagus.'));
        if (g.total) Unduh.ket(3, g.ok + '/' + g.total + ' tersimpan');
        $('unduhJudul').textContent = '✅ Data berhasil diunduh';
        $('unduhCatatan').classList.add('hidden');
        return Unduh.tutup(kurang ? 3000 : 1300);
      }).then(function () {
        if (Math.abs(p.selisih) > 5 * 60000) {
          UE.dialog({ judul: 'Jam HP tidak tepat', pesan: 'Jam HP ini berbeda ' + Math.round(Math.abs(p.selisih) / 60000) + ' menit dari jam server. Betulkan jam HP agar token dan timer sesuai jadwal.' });
        }
        return p;
      });
    }).catch(function (e) { return Unduh.tutup(0).then(function () { throw e; }); });
  }

  function fetchBatas(u, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    return fetch(u, { mode: 'no-cors', signal: ctrl ? ctrl.signal : undefined }).finally(function () { clearTimeout(t); });
  }
  /** Simpan gambar soal ke cache (4 sekaligus) sambil menampilkan progres. Hasil: {total, ok}. Gambar yang gagal tidak menggagalkan unduhan. */
  function simpanGambar(paket) {
    var urls = [];
    paket.forEach(function (p) { (p.gambar || []).forEach(function (g) { if (urls.indexOf(g) < 0) urls.push(g); }); });
    if (!urls.length || !('caches' in window)) {
      Unduh.tahap(3, urls.length ? 'tidak didukung HP ini' : 'tidak ada gambar');
      return Promise.resolve({ total: 0, ok: 0 });
    }
    Unduh.tahap(3, '0/' + urls.length);
    Unduh.set(80, 'Menyimpan gambar soal agar bisa dibuka offline: 0 dari ' + urls.length);
    var hasil = { total: urls.length, ok: 0 }, selesai = 0, i = 0;
    var kerja = caches.open('ue-img').then(function (c) {
      function satu() {
        if (i >= urls.length) return Promise.resolve();
        var u = urls[i++];
        return c.match(u).then(function (ada) {
          return ada || fetchBatas(u, 20000).then(function (res) { return c.put(u, res); });
        }).then(function () { hasil.ok++; }, function () {}).then(function () {
          selesai++;
          Unduh.ket(3, selesai + '/' + urls.length);
          Unduh.set(80 + 20 * selesai / urls.length, 'Menyimpan gambar soal agar bisa dibuka offline: ' + selesai + ' dari ' + urls.length);
          return satu();
        });
      }
      var jalur = [];
      for (var k = 0; k < Math.min(4, urls.length); k++) jalur.push(satu());
      return Promise.all(jalur);
    }).catch(function () {}).then(function () { return hasil; });
    // Jaringan lambat: siswa boleh lanjut, gambar tetap diunduh di latar belakang
    var tombol = setTimeout(function () { $('unduhLewati').classList.remove('hidden'); }, 6000);
    var lewat = new Promise(function (ok) { Unduh.lewati = function () { ok({ total: hasil.total, ok: hasil.ok, lewat: true }); }; });
    return Promise.race([kerja, lewat]).then(function (g) {
      clearTimeout(tombol); Unduh.lewati = null; $('unduhLewati').classList.add('hidden');
      return g;
    });
  }

  /* ---------------- 2. Login ---------------- */
  function tampilLogin() {
    S.user = null;
    var p = pkg();
    if (!p) { show('scr-setup'); return; }
    $('inUser').value = ''; $('inPass').value = '';
    $('infoPaket').textContent = 'HP ' + devId() + ' · Kelas: ' + p.kelas.join(', ') + ' · diperbarui ' + UE.fmtTanggal(p.unduh);
    updateBadge();
    show('scr-login');
  }
  $('pwToggle').addEventListener('click', function () { var i = $('inPass'); i.type = i.type === 'password' ? 'text' : 'password'; });
  $('formLogin').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = pkg(), u = $('inUser').value.trim().toLowerCase(), user = p && p.users[u];
    if (!user) { UE.sfx('salah'); UE.toast('Username tidak ada di HP ini. Unduh kelasmu lewat "+ Kelas lain".', 'err'); return; }
    UE.pwHash(u, $('inPass').value).then(function (h) {
      if (h !== user.h) { UE.sfx('salah'); UE.toast('Password salah', 'err'); $('inPass').select(); return; }
      UE.sfx('sukses');
      S.user = user;
      catatEvent({ t: 'login', u: user.u });
      renderMap(); show('scr-map');
    });
  });
  $('btnLogout').addEventListener('click', function () { UE.sfx('klik'); tampilLogin(); });
  $('btnSync').addEventListener('click', function () {
    var b = this, p = pkg(); UE.sfx('klik');
    if (!navigator.onLine) { UE.toast('Butuh internet untuk memperbarui data', 'err'); return; }
    b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
    unduhPaket(p.kelas).then(function () { UE.sfx('sukses'); UE.toast('Data ujian diperbarui', 'ok'); tampilLogin(); })
      .catch(function (e) { UE.toast(e.message, 'err'); })
      .finally(function () { b.disabled = false; b.textContent = 'Perbarui data'; });
    syncOutbox(true);
  });
  $('btnTambahKelas').addEventListener('click', function () {
    UE.sfx('klik');
    $('kelasBox').classList.remove('hidden'); $('kelasPilih').classList.add('hidden');
    $('btnSetupKembali').classList.remove('hidden'); $('setupMsg').textContent = '';
    show('scr-setup');
  });
  $('btnOutbox').addEventListener('click', function () {
    UE.sfx('klik');
    if (!outbox().length) { UE.toast('Tidak ada jawaban yang menunggu dikirim', 'ok'); return; }
    syncOutbox(false);
  });
  $('btnReset').addEventListener('click', function () {
    var n = outbox().length;
    UE.dialog({
      judul: 'Hapus semua data di HP?',
      html: (n ? '<p style="color:var(--red-d)"><b>Ada ' + n + ' jawaban yang BELUM terkirim dan akan hilang!</b></p>' : '') +
        '<p>Data siswa dan soal akan dihapus. Perlu internet untuk mengunduh ulang.</p>',
      ok: 'Hapus', batal: 'Batal', bahaya: true
    }).then(function (ya) {
      if (!ya) return;
      var dev = devId();
      store.keys('ue_').forEach(store.del);
      store.set(K.DEV, dev);
      if ('caches' in window) caches.delete('ue-img');
      UE.toast('Data HP dihapus');
      $('kelasBox').classList.remove('hidden'); $('kelasPilih').classList.add('hidden'); $('btnSetupKembali').classList.add('hidden');
      show('scr-setup');
    });
  });
  $('btnSuara').addEventListener('click', function () {
    var s = store.get(K.SET, {}); s.mute = !s.mute; store.set(K.SET, s); perbaruiTombolSuara(); UE.sfx('pop');
  });
  function perbaruiTombolSuara() { $('btnSuara').textContent = store.get(K.SET, {}).mute ? '🔇 Suara mati' : '🔊 Suara hidup'; }

  /* ---------------- 3. Peta ujian ---------------- */
  function statusPaket(p, u) {
    var done = store.get(K.DONE, {});
    if (done[p.id + '|' + u] || (p.sudah || []).indexOf(u) >= 0) return 'done';
    if (outbox().some(function (o) { return o.paket === p.id && o.username === u; })) return 'wait';
    var att = store.get(attKey(p.id, u), null);
    if (att && (att.status === 'play' || att.status === 'terhenti')) return 'play';
    return 'go';
  }
  function labelMode(m) { return { TIMER: 'Timer ujian', TIMERSOAL: 'Timer per soal', TIMERFIXED: 'Timer tetap' }[m] || m; }
  function renderMap() {
    var p = pkg(), u = S.user;
    $('sapaNama').textContent = 'Hai, ' + u.n.split(' ')[0] + '!';
    var list = Object.keys(p.paket).map(function (id) { return p.paket[id]; }).filter(function (x) {
      return x.kelas.indexOf('SEMUA') >= 0 || x.kelas.indexOf(u.k) >= 0;
    });
    $('sapaInfo').textContent = list.length ? 'Kelas ' + u.k + ' — pilih ujian yang akan kamu kerjakan.' :
      'Belum ada ujian untuk kelas ' + u.k + '. Minta gurumu menyiapkan, lalu tekan "Perbarui data".';
    var now = Date.now();
    $('levelList').innerHTML = list.map(function (x, i) {
      var st = statusPaket(x, u.u);
      var tag = { go: '<span class="tag go">Mainkan</span>', play: '<span class="tag play">Lanjutkan</span>',
        wait: '<span class="tag wait">Menunggu dikirim</span>', done: '<span class="tag done">Terkirim ✔</span>' }[st];
      var tok = x.tokens.filter(function (t) { return t.e > now; }).sort(function (a, b) { return a.s - b.s; })[0];
      var jadwal = st === 'go' ? (tok ? (tok.s > now ? 'Dibuka ' + UE.fmtTanggal(tok.s) : 'Token aktif s/d ' + UE.fmtTanggal(tok.e)) : 'Token sudah kedaluwarsa') : '';
      var isi = [x.jumlahPG ? x.jumlahPG + ' PG' : '', x.jumlahES ? x.jumlahES + ' essay' : ''].filter(String).join(' + ');
      return '<button class="level" data-id="' + UE.esc(x.id) + '" ' + (st === 'done' ? 'disabled' : '') + '>' +
        '<span class="level-badge">' + (i + 1) + '</span>' +
        '<span><span class="level-name">' + UE.esc(x.nama) + '</span><br>' +
        '<span class="level-meta">' + UE.esc(x.mapel) + ' · ' + isi + ' · ' + Math.ceil(x.durasi / 60) + ' menit · ' + labelMode(x.mode) +
        (jadwal ? '<br>' + jadwal : '') + '</span></span>' + tag + '</button>';
    }).join('') || '<p class="muted">Kosong.</p>';
  }
  $('levelList').addEventListener('click', function (e) {
    var b = e.target.closest('.level'); if (!b || b.disabled) return;
    UE.sfx('pop');
    var p = pkg().paket[b.dataset.id], st = statusPaket(p, S.user.u);
    if (st === 'wait') { syncOutbox(false); return; }
    if (st === 'play') { S.att = store.get(attKey(p.id, S.user.u)); store.set(K.ACTIVE, { paket: p.id, u: S.user.u }); mulaiBermain(true); return; }
    S.paket = p;
    $('tokPaket').textContent = p.nama;
    $('inToken').value = ''; $('tokMsg').textContent = '';
    show('scr-token');
    setTimeout(function () { $('inToken').focus(); }, 200);
  });

  /* ---------------- 4. Token ---------------- */
  $('inToken').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('formToken').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = S.paket, T = $('inToken').value.trim().toUpperCase(), msg = $('tokMsg');
    if (!T) return;
    var btn = this.querySelector('button'); btn.disabled = true;
    UE.sha256Hex('VH|' + p.id + '|' + T).then(function (h) {
      var tok = p.tokens.filter(function (t) { return t.h === h; })[0], now = Date.now();
      if (!tok) throw new Error('Token salah. Periksa lagi hurufnya.');
      if (now < tok.s) throw new Error('Token belum aktif. Ujian dibuka ' + UE.fmtTanggal(tok.s) + '.');
      if (now > tok.e) throw new Error('Token sudah kedaluwarsa (' + UE.fmtTanggal(tok.e) + ').');
      return UE.decrypt(tok.k, 'TK|' + p.id + '|' + T).then(function (kunci) { return UE.decrypt(p.enc, 'CK|' + kunci); })
        .then(function (teks) {
          var data;
          try { data = JSON.parse(teks); } catch (er) { throw new Error('Data soal rusak. Tekan "Perbarui data" saat ada internet.'); }
          if (!data.soal || !data.soal.length) throw new Error('Soal kosong');
          S.pending = data.soal;
          S.tempTok = tok; // Simpan max_pel dan token_pemulihan
          UE.sfx('sukses');
          tampilBriefing();
        });
    }).catch(function (err) { msg.textContent = err.message; UE.sfx('salah'); $('inToken').select(); })
      .finally(function () { btn.disabled = false; });
  });

  /* ---------------- 5. Briefing ---------------- */
  function tampilBriefing() {
    var p = S.paket, soal = S.pending;
    var pg = soal.filter(function (s) { return s.tipe === 'PG'; }).length, es = soal.length - pg;
    $('brPaket').textContent = p.nama;
    $('brJudul').textContent = 'Siap, ' + S.user.n.split(' ')[0] + '?';
    var aturan = [
      '📜 <b>' + soal.length + ' soal</b>' + (pg && es ? ' (' + pg + ' pilihan ganda + ' + es + ' essay)' : pg ? ' pilihan ganda' : ' essay') +
        ', waktu ± <b>' + Math.ceil(p.durasi / 60) + ' menit</b>.',
      '⏱️ <b>' + labelMode(p.mode) + ':</b> ' + MODE_INFO[p.mode],
      p.mode === 'TIMER' ? '🔁 Kamu bisa kembali ke soal sebelumnya selama waktu masih ada.' : '↩️ Soal yang sudah lewat <b>tidak bisa dibuka lagi</b>.',
      '🔕 <b>Sangat disarankan:</b> Aktifkan <b>Mode Jangan Ganggu</b> (Do Not Disturb) di HP-mu sekarang agar ujian tidak terhenti karena notifikasi.',
      '🚫 Keluar dari aplikasi, membuka tab lain, mengaktifkan split-screen, atau merespon notifikasi <b>tercatat sebagai pelanggaran dan soal saat itu akan DIKUNCI</b>.',
      '⚠️ Maksimal pelanggaran: <b>' + (S.tempTok.mp || 3) + ' kali</b>. Melebihi ini, ujian terhenti dan butuh Token Pemulihan dari guru.'
    ];
    if (es) aturan.push('🧮 Untuk rumus di essay, pakai tombol simbol di atas kotak jawaban.');
    $('brList').innerHTML = aturan.map(function (a) { return '<li>' + a + '</li>'; }).join('');
    show('scr-brief');
  }
  $('btnMulai').addEventListener('click', function () {
    var p = S.paket, u = S.user;
    var soal = S.pending.map(function (q) { var c = JSON.parse(JSON.stringify(q)); if (c.opsi && p.acakOpsi) acak(c.opsi); return c; });
    if (p.acak) {
      var pg = acak(soal.filter(function (q) { return q.tipe === 'PG'; }));
      var es = acak(soal.filter(function (q) { return q.tipe !== 'PG'; }));
      soal = pg.concat(es);
    }
    S.att = { v: 2, id: uid(), paket: p.id, namaPaket: p.nama, mode: p.mode, durasi: p.durasi,
      u: u.u, n: u.n, k: u.k, h: u.h, soal: soal, idx: 0, qStart: 0, deadline: 0,
      ans: {}, ragu: {}, lewat: {}, terkunci: {}, pel: 0, maksPel: S.tempTok.mp || 3, htp: S.tempTok.htp, 
      mulai: 0, status: 'siap' };
    S.pending = null;
    var tombol = this;
    tombol.disabled = true;
    // Layar penuh harus diminta langsung saat tombol ditekan, sebelum menunggu jawaban server
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) {}
    tawarkanDraf(S.att).then(function (draf) {
      tombol.disabled = false;
      hitungMundur(function () {
        var now = Date.now(), a = S.att;
        a.status = 'play'; a.mulai = now; a.qStart = now;
        a.deadline = a.mode === 'TIMERSOAL' ? 0 : now + a.durasi * 1000;
        if (draf) pulihkanDraf(a, draf, now);
        simpanAtt();
        store.set(K.ACTIVE, { paket: a.paket, u: a.u });
        mulaiBermain(!!draf);
      });
    });
  });

  /* HP rusak atau hilang di tengah ujian: siswa masuk dari HP lain, jawaban sementara terakhir di server bisa dilanjutkan. */
  function tawarkanDraf(a) {
    if (!store.get(K.HP, null) || !navigator.onLine) return Promise.resolve(null); // aturan dari server belum ada = HP belum pernah terhubung ke server
    return UE.api('ambilDraf', { paket: a.paket, username: a.u, hash: a.h }, 8000).then(function (r) {
      var d = r.draf;
      if (!d || !d.data || !d.data.ans) return null;
      return UE.dialog({
        judul: 'Ada jawaban tersimpan',
        pesan: 'Server menyimpan ' + d.dijawab + ' dari ' + d.total + ' jawabanmu untuk ujian ini (terakhir ' + UE.relatif(d.t) + '). Lanjutkan dari jawaban itu? Pilih "Mulai baru" hanya bila diminta guru.',
        ok: 'Lanjutkan', batal: 'Mulai baru'
      }).then(function (ya) { return ya ? d : null; });
    }).catch(function () { return null; }); // tidak boleh menghalangi ujian
  }
  function pulihkanDraf(a, d, now) {
    var x = d.data, urut = {};
    if (x.id) a.id = x.id; // id yang sama: bila HP lama sempat mengirim juga, server tetap mencatat satu kiriman
    (x.urut || []).forEach(function (id, i) { urut[id] = i; });
    if (x.urut) a.soal.sort(function (p, q) { return (urut[p.id] === undefined ? 1e9 : urut[p.id]) - (urut[q.id] === undefined ? 1e9 : urut[q.id]); });
    a.ans = x.ans || {}; a.ragu = x.ragu || {}; a.lewat = x.lewat || {}; a.terkunci = x.terkunci || {};
    a.pel = x.pel || 0;
    a.idx = Math.min(x.idx || 0, a.soal.length - 1);
    if (x.mulai) a.mulai = x.mulai;
    a.qStart = now - (x.qDipakai || 0);
    // Waktu antara HP rusak dan siswa masuk lagi tidak dihitung: sisa waktu sama seperti saat terakhir tersimpan
    if (a.mode !== 'TIMERSOAL' && d.sisa !== null && d.sisa !== undefined) a.deadline = now + d.sisa * 1000;
  }

  /* ---------------- Pengaturan kiriman dari server ---------------- */
  /** Sebelum aturan dari server diterima: progres memakai config.js dan jawaban sementara belum dikirim. */
  function aturanHP() {
    var h = store.get(K.HP, null) || {};
    return { kirimMenit: h.kirimMenit || 0, progresDetik: h.progresDetik || CFG.INTERVAL_PROGRES_DETIK || 30 };
  }
  function terapkanAturanHP(h) {
    if (!h) return;
    var lama = aturanHP();
    store.set(K.HP, h);
    if (S.att && S.att.status === 'play' && S.hbId && lama.progresDetik !== aturanHP().progresDetik) pasangPengirim();
    if (lama.kirimMenit !== aturanHP().kirimMenit) jadwalkanDraf(1);
  }
  function jadwalkanDraf(sebaran) {
    var menit = aturanHP().kirimMenit;
    // Sebaran acak: ratusan HP tidak mengirim pada detik yang sama, upload & download laptop tetap lega
    S.drafBerikut = menit ? Date.now() + menit * 60000 * (sebaran === 1 ? 0.25 + Math.random() * 0.75 : 1) : 0;
  }
  function kirimDrafSegera() { if (S.att && S.att.status === 'play' && aturanHP().kirimMenit) { S.drafBerikut = 1; periksaDraf(); } }
  function periksaDraf() {
    var a = S.att;
    if (!a || a.status !== 'play' || !S.drafBerikut || Date.now() < S.drafBerikut || !navigator.onLine || S.drafJalan) return;
    var now = Date.now();
    S.drafJalan = true;
    UE.api('simpanDraf', {
      paket: a.paket, username: a.u, hash: a.h, dev: devId(), total: a.soal.length,
      dijawab: a.soal.filter(function (q) { return terisi(a.ans[q.id]); }).length,
      sisa: a.deadline ? Math.max(0, Math.round((a.deadline - now) / 1000)) : '',
      data: { id: a.id, mulai: a.mulai, ans: a.ans, ragu: a.ragu, lewat: a.lewat, terkunci: a.terkunci, pel: a.pel || 0, idx: a.idx,
        qDipakai: Math.max(0, now - a.qStart), urut: a.soal.map(function (q) { return q.id; }) }
    }, 25000).then(function (r) {
      S.drafTerakhir = Date.now();
      terapkanAturanHP(r.hp);
      jadwalkanDraf();
    }).catch(function () {
      // Sinyal hilang atau laptop mati: dicoba lagi satu menit lagi, jawaban tetap aman di HP
      S.drafBerikut = Date.now() + 60000;
    }).then(function () { S.drafJalan = false; });
  }
  function pasangPengirim() {
    clearInterval(S.hbId); S.hbId = setInterval(function () { kirimProgress('MENGERJAKAN'); }, aturanHP().progresDetik * 1000);
    clearInterval(S.drafId); S.drafId = setInterval(periksaDraf, 5000);
  }
  function hitungMundur(cb) {
    var ov = document.createElement('div'); ov.className = 'overlay';
    document.body.appendChild(ov);
    var n = 3;
    (function step() {
      if (n === 0) { ov.innerHTML = '<div class="big">Mulai!</div>'; UE.sfx('whoosh'); setTimeout(function () { ov.remove(); cb(); }, 650); return; }
      ov.innerHTML = '<div class="big">' + n + '</div>'; UE.sfx('detik'); n--; setTimeout(step, 800);
    })();
  }

  /* ---------------- 6. Bermain & Deteksi Contek ---------------- */
  function simpanAtt() { if (S.att) store.set(attKey(S.att.paket, S.att.u), S.att); }
  function cur() { return S.att.soal[S.att.idx]; }
  function waktuSoalMs(q) { return q.waktu * 1000; }

  function mulaiBermain(resume) {
    var a = S.att;
    S.peringatan = {};
    if (a.status === 'terhenti') { show('scr-pemulihan'); return; }

    $('hudName').innerHTML = UE.esc(a.n) + ' <span class="hud-sub">· ' + UE.esc(a.k) + ' · ' + UE.esc(a.namaPaket) + '</span>';
    $('hudName').title = a.n + ' · ' + a.k + ' · ' + a.namaPaket;
    $('totalPill').classList.toggle('hidden', a.mode !== 'TIMERFIXED');
    $('timerCap').textContent = a.mode === 'TIMER' ? 'total' : 'soal';
    $('btnPrev').classList.toggle('hidden', a.mode !== 'TIMER');
    $('btnRagu').classList.toggle('hidden', a.mode !== 'TIMER');
    $('btnPeta').classList.toggle('hidden', a.mode !== 'TIMER');
    
    $('hudPelanggaran').classList.remove('hidden');
    $('pelLbl').textContent = (a.pel || 0) + '/' + (a.maksPel || 3);
    show('scr-play');

    if (resume) {
      var now = Date.now();
      if (a.deadline && now >= a.deadline) { UE.toast('Waktu ujian sudah habis saat aplikasi ditutup', 'err'); selesai(); return; }
      if (a.mode === 'TIMERSOAL') {
        var lompat = 0;
        while (a.idx < a.soal.length && now >= a.qStart + waktuSoalMs(cur()) + 3000) {
          a.lewat[cur().id] = 1; a.qStart += waktuSoalMs(cur()) + 1500; a.idx++; lompat++;
        }
        if (lompat) UE.toast(lompat + ' soal terlewat karena waktunya habis saat aplikasi ditutup', 'err');
        simpanAtt();
        if (a.idx >= a.soal.length) { selesai(); return; }
      }
    }
    renderSoal(false);
    clearInterval(S.tickId); S.tickId = setInterval(tick, 250);
    pasangPengirim();
    jadwalkanDraf(1);
    kirimProgress('MENGERJAKAN');
    kunciLayar(true);
    history.pushState({ ujian: 1 }, '');
    tick();
  }

  /* Logika Anti-Contek (Blur, Visibility) */
  function catatPelanggaran() {
    var a = S.att;
    var now = Date.now();
    // Debounce agar tidak double count dalam 2 detik
    if (!a || a.status !== 'play' || S.modalTerhenti || now - S.lastBlur < 2000) return;
    S.lastBlur = now;
    
    simpanJawabanSekarang();
    a.pel = (a.pel || 0) + 1;
    var q = cur();
    if (q) {
      a.terkunci = a.terkunci || {};
      a.terkunci[q.id] = 1; // Kunci soal yang sedang aktif
    }
    simpanAtt();
    kunciLayar(true);
    UE.sfx('salah');
    $('pelLbl').textContent = a.pel + '/' + a.maksPel;

    if (a.pel >= a.maksPel) {
      a.status = 'terhenti';
      simpanAtt();
      kirimProgress('TERHENTI');
      show('scr-pemulihan');
    } else {
      S.modalTerhenti = true;
      UE.dialog({
        judul: 'Peringatan Pelanggaran!',
        html: '<p>Terdeteksi keluar dari layar ujian / membuka tab / notifikasi.</p><p>Ini adalah <b>pelanggaran ke-' + a.pel + ' dari maksimal ' + a.maksPel + '</b>.</p><p style="color:var(--red-d)">Soal nomor ' + (a.idx + 1) + ' <b>telah dikunci</b> dan tidak bisa kamu kerjakan lagi.</p><p>Timer ujian tetap berjalan.</p>',
        ok: 'Saya Mengerti',
        bahaya: true
      }).then(function() { 
        S.modalTerhenti = false; 
        S.lastBlur = Date.now(); // Perbarui waktu blur
        renderSoal(false); 
      });
      kirimProgress('MENGERJAKAN'); tick();
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) catatPelanggaran();
  });
  window.addEventListener('blur', function () {
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') return; // Bukan blur ke aplikasi lain
    setTimeout(function() { if (!document.hasFocus()) catatPelanggaran(); }, 500);
  });

  function renderSoal(animasi) {
    var a = S.att, q = cur();
    var isKunci = a.terkunci && !!a.terkunci[q.id];

    $('qNo').textContent = 'Soal ' + (a.idx + 1);
    var tt = $('qTipe');
    tt.textContent = q.tipe === 'PG' ? 'Pilihan ganda' : 'Essay';
    tt.classList.toggle('es', q.tipe !== 'PG');
    $('qPoin').textContent = q.skor + ' poin';
    $('hudPos').innerHTML = 'Soal <b>' + (a.idx + 1) + '</b>/' + a.soal.length;
    $('qText').innerHTML = (isKunci ? '<p style="color:var(--red-d);font-weight:800;border:2px dashed var(--red-d);padding:6px;border-radius:10px">🔒 Soal ini terkunci karena pelanggaran.</p>' : '') + UE.rich(q.soal);
    var img = $('qImg');
    if (q.gambar) { img.src = q.gambar; img.classList.remove('hidden'); img.onerror = function () { img.alt = 'Gambar tidak tersedia offline'; }; }
    else { img.classList.add('hidden'); img.removeAttribute('src'); }

    var isPG = q.tipe === 'PG';
    $('pgArea').classList.toggle('hidden', !isPG);
    $('esArea').classList.toggle('hidden', isPG);
    if (isPG) {
      $('opsiList').innerHTML = q.opsi.map(function (o, i) {
        return '<button type="button" class="opsi" role="radio" ' + (isKunci ? 'disabled ' : '') + 'aria-checked="' + (a.ans[q.id] === o.k) + '" data-k="' + o.k + '">' +
          '<span class="huruf">' + HURUF[i] + '</span><span class="isi">' + UE.rich(o.t) + '</span></button>';
      }).join('');
    } else {
      var ta = $('answer');
      ta.disabled = isKunci;
      ta.value = a.ans[q.id] || '';
      $('toolbar').classList.toggle('disabled', isKunci);
      updateCharCount();
      renderPreview();
    }
    UE.typeset(isPG ? $('scr-play') : $('qText'));
    $('btnRagu').setAttribute('aria-pressed', !!a.ragu[q.id]);
    $('btnPrev').disabled = a.idx === 0;
    
    var last = a.idx === a.soal.length - 1;
    $('btnNext').textContent = isKunci ? 'Terkunci, Lanjut ▶' : (last ? 'Selesai ✔' : 'Lanjut ▶');

    renderNomor();
    if (animasi) { var c = $('qCard'); c.classList.remove('fly', 'land'); void c.offsetWidth; c.classList.add('land'); }
    S.busy = false;
    S.izinLanjutDiumumkan = false;
  }

  /* Penanda nomor soal: hijau = sudah dijawab, bening = belum. Mode TIMER: nomor bisa diketuk untuk pindah soal. */
  function renderNomor() {
    var a = S.att, bebas = a.mode === 'TIMER', sudah = 0;
    var strip = $('nomorSoal');
    strip.innerHTML = a.soal.map(function (q, i) {
      var isKunci = a.terkunci && !!a.terkunci[q.id], dijawab = terisi(a.ans[q.id]);
      if (dijawab) sudah++;
      var cls = isKunci ? 'locked' : a.ragu[q.id] ? 'ragu' : dijawab ? 'sudah' : (!bebas && i < a.idx ? 'skip' : '');
      var ket = isKunci ? 'terkunci' : a.ragu[q.id] ? 'ragu-ragu' : dijawab ? 'sudah dijawab' : 'belum dijawab';
      var tag = bebas ? 'button type="button"' : 'span';
      return '<' + tag + ' class="nomor ' + cls + (i === a.idx ? ' now' : '') + '" data-go="' + i + '" aria-label="Soal ' + (i + 1) + ', ' + ket + '"' +
        (i === a.idx ? ' aria-current="step"' : '') + '>' + (i + 1) + '</' + (bebas ? 'button' : 'span') + '>';
    }).join('');
    $('hudSudah').textContent = sudah;
    $('hudBelum').textContent = a.soal.length - sudah;
    var el = strip.children[a.idx];
    if (el) strip.scrollLeft = Math.max(0, el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2);
  }
  $('nomorSoal').addEventListener('click', function (e) {
    var b = e.target.closest('button.nomor'), a = S.att;
    if (!b || !a || a.mode !== 'TIMER' || S.busy || S.modalTerhenti || +b.dataset.go === a.idx) return;
    UE.sfx('klik'); pindahKe(+b.dataset.go);
  });

  /* Pilihan ganda */
  $('opsiList').addEventListener('click', function (e) {
    var b = e.target.closest('.opsi'); if (!b || b.disabled || !S.att || S.busy) return;
    var q = cur();
    if (S.att.terkunci && S.att.terkunci[q.id]) return;
    S.att.ans[q.id] = b.dataset.k;
    simpanAtt();
    UE.sfx('pop');
    document.querySelectorAll('#opsiList .opsi').forEach(function (x) { x.setAttribute('aria-checked', x === b); });
    renderNomor();
  });

  var KELILING = 2 * Math.PI * 34;
  $('timerBar').style.strokeDasharray = KELILING;
  var detikTerakhir = -1;

  function setRing(sisaMs, totalMs) {
    var sisa = Math.max(0, sisaMs / 1000);
    $('timerLbl').textContent = UE.fmtWaktu(sisa);
    $('timerBar').style.strokeDashoffset = KELILING * (1 - Math.max(0, Math.min(1, sisaMs / totalMs)));
    var t = $('timer');
    var batasWarn = Math.max(15, totalMs / 1000 * 0.25), batasDanger = Math.min(60, Math.max(10, totalMs / 1000 * 0.1));
    t.classList.toggle('warn', sisa <= batasWarn && sisa > batasDanger);
    t.classList.toggle('danger', sisa <= batasDanger);
    var sd = Math.ceil(sisa);
    if (sd !== detikTerakhir) { detikTerakhir = sd; if (sd <= 5 && sd > 0) UE.sfx('detik'); }
  }

  function tick() {
    var a = S.att; if (!a || a.status !== 'play') return;
    var now = Date.now(), q = cur(), btn = $('btnNext'), last = a.idx === a.soal.length - 1;
    var isKunci = a.terkunci && !!a.terkunci[q.id];

    if (a.deadline) {
      var sisaTotal = a.deadline - now;
      $('totalLbl').textContent = UE.fmtWaktu(sisaTotal / 1000);
      $('totalPill').classList.toggle('danger', sisaTotal <= 60000);
      [[300000, '5 menit lagi waktu ujian habis!'], [60000, '1 menit lagi! Periksa jawabanmu.']].forEach(function (w) {
        if (sisaTotal <= w[0] && sisaTotal > w[0] - 5000 && !S.peringatan[w[0]] && a.durasi * 1000 > w[0] * 2) {
          S.peringatan[w[0]] = 1; UE.toast(w[1], 'err'); UE.sfx('salah');
        }
      });
      if (sisaTotal <= 0 && !S.busy) { waktuUjianHabis(); return; }
    }

    if (a.mode === 'TIMER') {
      setRing(a.deadline - now, a.durasi * 1000);
      btn.disabled = S.busy;
      return;
    }

    var total = waktuSoalMs(q), sisa = a.qStart + total - now;
    setRing(sisa, total);

    if (a.mode === 'TIMERSOAL') {
      btn.disabled = S.busy;
      if (sisa <= 0 && !S.busy) waktuSoalHabis(a.qStart + total);
      return;
    }

    // TIMERFIXED
    if (sisa > 0) {
      btn.disabled = true;
      btn.textContent = '🔒 ' + (isKunci ? 'Terkunci, Lanjut' : last ? 'Selesai' : 'Lanjut') + ' dalam ' + UE.fmtWaktu(sisa / 1000);
    } else {
      btn.disabled = S.busy;
      btn.textContent = isKunci ? 'Terkunci, Lanjut ▶' : (last ? 'Selesai ✔' : 'Lanjut ▶');
      if (!S.izinLanjutDiumumkan) {
        S.izinLanjutDiumumkan = true;
        $('timerLbl').textContent = '✔';
        UE.sfx('pop');
        UE.toast(last ? 'Waktu minimal habis. Tekan Selesai jika sudah yakin.' : 'Waktu soal habis. Kamu masih boleh menjawab, lalu tekan Lanjut.', 'ok');
      }
    }
  }

  function waktuSoalHabis(waktuBerakhir) {
    S.busy = true;
    simpanJawabanSekarang();
    kunciJawaban();
    UE.sfx('whoosh');
    overlayPesan('⏰ Waktu soal ini habis!', 1300, function () { pindahKe(S.att.idx + 1, waktuBerakhir + 1500); });
  }
  function waktuUjianHabis() {
    S.busy = true;
    simpanJawabanSekarang();
    kunciJawaban();
    UE.sfx('salah');
    overlayPesan('⏰ Waktu ujian habis!', 1800, function () { selesai(); });
  }
  function kunciJawaban() {
    $('answer').disabled = true;
    document.querySelectorAll('#opsiList .opsi').forEach(function (b) { b.disabled = true; });
  }
  function overlayPesan(teks, ms, cb) {
    var ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = '<div class="msg">' + teks + '</div>';
    document.body.appendChild(ov);
    setTimeout(function () { ov.remove(); cb(); }, ms);
  }

  function pindahKe(idx, qStartBaru) {
    var a = S.att;
    simpanJawabanSekarang();
    if (a.mode !== 'TIMER') a.lewat[cur().id] = 1;
    if (idx >= a.soal.length) { simpanAtt(); selesai(); return; }
    var maju = idx > a.idx;
    a.idx = Math.max(0, idx);
    a.qStart = qStartBaru || Date.now();
    simpanAtt();
    var c = $('qCard');
    c.classList.remove('land'); void c.offsetWidth;
    if (maju) c.classList.add('fly');
    setTimeout(function () { renderSoal(true); window.scrollTo(0, 0); tick(); }, maju ? 420 : 0);
    kirimProgress('MENGERJAKAN');
  }

  $('btnNext').addEventListener('click', function () {
    var a = S.att; if (!a || S.busy || this.disabled) return;
    var last = a.idx === a.soal.length - 1, q = cur(), idxAwal = a.idx;
    var isKunci = a.terkunci && !!a.terkunci[q.id];
    simpanJawabanSekarang();
    
    if (a.mode === 'TIMER') {
      if (!last) { UE.sfx('klik'); pindahKe(a.idx + 1); return; }
      konfirmasiSelesai();
      return;
    }
    var kosong = !terisi(a.ans[q.id]) && !isKunci;
    var pesan = (isKunci ? '<p><b>Soal terkunci karena pelanggaran.</b></p>' : (kosong ? '<p><b>Soal ini belum kamu jawab.</b></p>' : '')) +
      (last ? '<p>Ini soal terakhir. Selesaikan ujian sekarang?</p>' : '<p>Soal ini tidak bisa dibuka lagi setelah kamu lanjut.</p>');
    UE.dialog({ judul: last ? 'Selesai ujian?' : 'Lanjut ke soal berikutnya?', html: pesan, ok: last ? 'Selesai' : 'Lanjut', batal: 'Periksa lagi' })
      .then(function (ya) {
        if (ya && S.att === a && a.idx === idxAwal && !S.busy) { UE.sfx('whoosh'); S.busy = true; pindahKe(a.idx + 1); }
      });
  });
  $('btnPrev').addEventListener('click', function () {
    var a = S.att; if (!a || a.mode !== 'TIMER' || a.idx === 0 || S.busy) return;
    UE.sfx('klik'); pindahKe(a.idx - 1);
  });
  $('btnRagu').addEventListener('click', function () {
    var a = S.att; if (!a) return;
    var q = cur();
    if (a.terkunci && a.terkunci[q.id]) return; // Tidak bisa ragu jika terkunci
    if (a.ragu[q.id]) delete a.ragu[q.id]; else a.ragu[q.id] = 1;
    this.setAttribute('aria-pressed', !!a.ragu[q.id]);
    simpanAtt(); renderNomor(); UE.sfx('pop');
  });
  $('btnPeta').addEventListener('click', function () { UE.sfx('klik'); bukaPeta(false); });

  function bukaPeta(untukSelesai) {
    var a = S.att;
    var belum = a.soal.filter(function (q) { return !terisi(a.ans[q.id]) && (!a.terkunci || !a.terkunci[q.id]); }).length;
    var ragu = Object.keys(a.ragu).length;
    var html = (untukSelesai ? '<p>' + (belum ? '<b style="color:var(--red-d)">' + belum + ' soal belum dijawab.</b> ' : 'Semua soal sudah dikerjakan. ') +
      (ragu ? ragu + ' soal ditandai ragu-ragu. ' : '') + 'Waktu tersisa <b>' + UE.fmtWaktu((a.deadline - Date.now()) / 1000) + '</b>.</p>' : '') +
      '<div class="qgrid">' + a.soal.map(function (q, i) {
        var cls = (a.terkunci && a.terkunci[q.id]) ? 'locked' : a.ragu[q.id] ? 'ragu' : terisi(a.ans[q.id]) ? 'done' : '';
        return '<button class="qnum ' + cls + (i === a.idx ? ' now' : '') + '" data-go="' + i + '">' + (i + 1) + '</button>';
      }).join('') + '</div><div class="legend"><span><i class="done"></i>Dijawab</span><span><i class="ragu"></i>Ragu</span><span><i class="locked"></i>Terkunci</span><span><i></i>Belum</span></div>';
    var p = UE.dialog({ judul: untukSelesai ? 'Selesai ujian?' : 'Daftar soal', html: html, ok: untukSelesai ? 'Ya, selesai' : 'Tutup', batal: untukSelesai ? 'Periksa lagi' : null, bahaya: untukSelesai && belum > 0 });
    setTimeout(function () {
      document.querySelectorAll('.qgrid .qnum').forEach(function (b) {
        b.addEventListener('click', function () {
          var w = b.closest('.modal-wrap'); if (w) w.remove();
          UE.sfx('klik'); pindahKe(+b.dataset.go);
        });
      });
    }, 30);
    return p;
  }
  function konfirmasiSelesai() {
    var a = S.att;
    bukaPeta(true).then(function (ya) {
      if (ya && S.att === a && !S.busy) { S.busy = true; UE.sfx('whoosh'); simpanAtt(); selesai(); }
    });
  }

  /* Essay: simpan otomatis + pratinjau MathJax */
  function simpanJawabanSekarang() {
    if (!S.att || S.att.status !== 'play') return;
    var q = cur(); if (!q || q.tipe === 'PG') return;
    if (S.att.terkunci && S.att.terkunci[q.id]) return;
    S.att.ans[q.id] = $('answer').value;
    simpanAtt();
  }
  $('answer').addEventListener('input', function () {
    updateCharCount();
    $('saveHint').textContent = 'Menyimpan…';
    clearTimeout(S.saveId);
    S.saveId = setTimeout(function () { simpanJawabanSekarang(); renderNomor(); $('saveHint').textContent = 'Tersimpan otomatis di HP ✔'; }, 350);
    clearTimeout(S.prevId);
    S.prevId = setTimeout(renderPreview, 600);
  });
  $('answer').addEventListener('paste', function (e) { e.preventDefault(); UE.sfx('salah'); UE.toast('Menempel teks tidak diizinkan saat ujian', 'err'); });
  $('answer').addEventListener('drop', function (e) { e.preventDefault(); });
  function updateCharCount() {
    var v = $('answer').value.trim();
    $('charCount').textContent = (v ? v.split(/\s+/).length : 0) + ' kata';
  }
  function renderPreview() {
    var v = $('answer').value, pv = $('preview');
    if (/\$|\\\(|\\\[/.test(v)) { pv.classList.remove('hidden'); pv.innerHTML = UE.rich(v); UE.typeset(pv); }
    else { pv.innerHTML = ''; pv.classList.add('hidden'); }
  }
  function buatToolbar() {
    var tombol = [
      ['$…$', 'Rumus', '', 0, true], ['x²', 'Pangkat', '^{2}'], ['xₙ', 'Indeks bawah', '_{}'], ['a/b', 'Pecahan', '\\frac{}{}'],
      ['√', 'Akar', '\\sqrt{}'], ['×', 'Kali', '\\times '], ['÷', 'Bagi', '\\div '], ['±', 'Plus minus', '\\pm '],
      ['°', 'Derajat', '^\\circ '], ['Δ', 'Delta', '\\Delta '], ['π', 'Pi', '\\pi '], ['≤', 'Kurang dari sama dengan', '\\le '],
      ['≥', 'Lebih dari sama dengan', '\\ge '], ['≠', 'Tidak sama dengan', '\\neq '], ['→', 'Panah', '\\rightarrow ']
    ];
    $('toolbar').innerHTML = tombol.map(function (t, i) {
      return '<button type="button" class="tb ' + (t[4] ? 'math' : '') + '" data-i="' + i + '" title="' + t[1] + '" aria-label="' + t[1] + '">' + t[0] + '</button>';
    }).join('');
    $('toolbar').addEventListener('mousedown', function (e) { e.preventDefault(); });
    $('toolbar').addEventListener('click', function (e) {
      var b = e.target.closest('.tb'); if (!b) return;
      var t = tombol[+b.dataset.i], ta = $('answer');
      if (ta.disabled) return;
      UE.sfx('klik');
      var s = ta.selectionStart, en = ta.selectionEnd, v = ta.value, sel = v.slice(s, en), sisip, kursor;
      if (t[4]) { sisip = '$' + sel + '$'; kursor = sel ? sisip.length : 1; }
      else {
        var dalamMath = (v.slice(0, s).match(/(^|[^\\])\$/g) || []).length % 2 === 1;
        var isi = t[2], pk = isi.indexOf('{}');
        if (sel && pk >= 0) isi = isi.slice(0, pk + 1) + sel + isi.slice(pk + 1);
        sisip = dalamMath ? isi : '$' + isi + '$';
        var pos = isi.indexOf('{}');
        kursor = (dalamMath ? 0 : 1) + (pos >= 0 ? pos + 1 : isi.length);
      }
      ta.setRangeText(sisip, s, en, 'end');
      ta.selectionStart = ta.selectionEnd = s + kursor;
      ta.focus();
      ta.dispatchEvent(new Event('input'));
    });
  }

  function kunciLayar(on) {
    try {
      if (on && 'wakeLock' in navigator && !S.wakeLock) {
        navigator.wakeLock.request('screen').then(function (l) { S.wakeLock = l; l.addEventListener('release', function () { S.wakeLock = null; }); }).catch(function () {});
      } else if (!on && S.wakeLock) { S.wakeLock.release(); S.wakeLock = null; }
    } catch (e) {}
  }
  function kirimProgress(status) {
    var a = S.att; if (!a || !navigator.onLine) return;
    var dijawab = a.soal.filter(function (q) { return terisi(a.ans[q.id]); }).length;
    var sisa = a.deadline ? Math.max(0, Math.round((a.deadline - Date.now()) / 1000)) : '';
    UE.api('progress', { paket: a.paket, username: a.u, nama: a.n, kelas: a.k, dijawab: dijawab, total: a.soal.length,
      soalKe: Math.min(a.idx + 1, a.soal.length), status: status, pelanggaran: a.pel || 0, sisa: sisa, dev: devId() }, 15000)
      .then(function (r) { terapkanAturanHP(r && r.hp); }).catch(function () {});
  }
  
  /* Logika Token Pemulihan */
  $('inPemulihan').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('formPemulihan').addEventListener('submit', function (e) {
    e.preventDefault();
    var a = S.att, T = $('inPemulihan').value.trim().toUpperCase(), msg = $('pemMsg');
    if (!T) return;
    var btn = this.querySelector('button'); btn.disabled = true;
    UE.sha256Hex('TP|' + a.paket + '|' + T).then(function (h) {
      if (h !== a.htp) throw new Error('Token Pemulihan salah!');
      a.pel = 0; // Beri kesempatan lagi
      a.status = 'play';
      simpanAtt();
      UE.sfx('sukses');
      $('inPemulihan').value = ''; msg.textContent = '';
      $('pelLbl').textContent = a.pel + '/' + a.maksPel;
      mulaiBermain(true);
    }).catch(function(err) {
      msg.textContent = err.message; UE.sfx('salah'); $('inPemulihan').select();
    }).finally(function() { btn.disabled = false; });
  });

  /* ---------------- 7. Selesai ---------------- */
  function selesai() {
    var a = S.att;
    clearInterval(S.tickId); clearInterval(S.hbId); clearInterval(S.drafId); S.hbId = null; S.drafBerikut = 0;
    kunciLayar(false);
    a.status = 'done'; a.selesai = Date.now();
    var kiriman = {
      id: a.id, paket: a.paket, username: a.u, hash: a.h, nama: a.n, kelas: a.k, mulai: a.mulai, selesai: a.selesai,
      pelanggaran: a.pel || 0, perangkat: devInfo(), dev: devId(),
      jawaban: a.soal.map(function (q) { return { id: q.id, jawaban: a.ans[q.id] || '' }; })
    };
    var box = outbox(); box.push(kiriman);
    if (!store.set(K.OUT, box)) { simpanAtt(); return; }
    var dijawab = kiriman.jawaban.filter(function (j) { return terisi(j.jawaban); }).length;
    kirimProgress('SELESAI');
    store.del(attKey(a.paket, a.u)); store.del(K.ACTIVE);
    var adaEssay = a.soal.some(function (q) { return q.tipe !== 'PG'; });
    S.att = null;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});

    var rasio = dijawab / kiriman.jawaban.length;
    var bintang = rasio >= 1 ? 3 : rasio >= 0.66 ? 2 : rasio > 0 ? 1 : 0;
    $('finStars').innerHTML = UE.bintangSVG(bintang);
    $('finJudul').textContent = bintang === 3 ? 'Luar biasa!' : bintang === 2 ? 'Kerja bagus!' : 'Misi tuntas!';
    $('finInfo').textContent = dijawab + ' dari ' + kiriman.jawaban.length + ' soal terjawab. ' +
      (adaEssay ? 'Pilihan ganda dinilai otomatis, essay dinilai AI setelah jawaban terkirim.' : 'Nilai dihitung otomatis setelah jawaban terkirim.');
    S.finUser = { u: kiriman.username, paket: kiriman.paket };
    setFinStatus('wait', '<span class="spinner dark"></span> Menyimpan jawaban…');
    show('scr-finish'); UE.sfx('sukses'); updateBadge();
    
    // Auto-kirim dengan menampilkan animasi progress bar overlay
    syncOutbox(false);
  }
  function setFinStatus(cls, html) { var b = $('finStatus'); b.className = 'status-box ' + cls; b.innerHTML = html; }
  function refreshFinStatus(lastErr) {
    if (!$('scr-finish').classList.contains('active') || !S.finUser) return;
    var masih = outbox().some(function (o) { return o.paket === S.finUser.paket && o.username === S.finUser.u; });
    if (!masih) { setFinStatus('ok', '✅ Jawaban terkirim ke guru dan sudah dihapus dari HP ini.'); $('btnFinKirim').classList.add('hidden'); }
    else {
      setFinStatus('wait', '📦 Jawaban tersimpan aman di HP. ' + (navigator.onLine ? (lastErr ? 'Gagal kirim: ' + UE.esc(lastErr) + '. ' : '') : 'Belum ada internet. ') +
        'Jawaban tetap aman. Tekan Kirim sekarang untuk mencoba lagi, atau biarkan aplikasi terbuka saat ada internet.');
      $('btnFinKirim').classList.remove('hidden');
    }
  }
  $('btnFinKirim').addEventListener('click', function () { UE.sfx('klik'); syncOutbox(false); });
  $('btnFinSelesai').addEventListener('click', function () { UE.sfx('klik'); S.finUser = null; tampilLogin(); });

  /* ---------------- Kotak kirim ---------------- */
  function updateBadge() { var n = outbox().length, b = $('outboxBadge'); b.textContent = n; b.classList.toggle('hidden', !n); }
  
  function syncOutbox(diam) {
    if (S.sending) return Promise.resolve();
    var box = outbox();
    if (!box.length) { refreshFinStatus(); return Promise.resolve(); }
    if (!navigator.onLine) { if (!diam) UE.toast('Belum ada internet. Jawaban tetap aman di HP.', 'err'); refreshFinStatus(); return Promise.resolve(); }
    S.sending = true;

    var terkirim = 0, err = '', antre = box.slice(), totalAntre = box.length;
    
    // Siapkan UI Progress Kirim
    var overlay = $('syncOverlay');
    var isManualOrFinish = !diam || $('scr-finish').classList.contains('active');
    
    if (isManualOrFinish && overlay) {
      overlay.classList.remove('hidden');
      $('syncBar').style.width = '0%';
      $('syncText').textContent = '0 / ' + totalAntre;
    }

    function next() {
      if (!antre.length) return Promise.resolve();
      var item = antre.shift();
      return UE.api('kirim', { kiriman: item }, 150000).catch(function (e) {
        if (/terlalu lama|koneksi/i.test(e.message)) return UE.api('kirim', { kiriman: item }, 150000);
        throw e;
      }).then(function () {
        store.set(K.OUT, outbox().filter(function (o) { return o.id !== item.id; }));
        var done = store.get(K.DONE, {}); done[item.paket + '|' + item.username] = Date.now(); store.set(K.DONE, done);
        terkirim++;
        
        // Update Animasi Progress
        if (isManualOrFinish && overlay) {
          var pct = Math.round((terkirim / totalAntre) * 100);
          $('syncBar').style.width = pct + '%';
          $('syncText').textContent = terkirim + ' / ' + totalAntre;
        }
      }).catch(function (e) { err = e.message; }).then(next);
    }

    return next().then(function () {
      S.sending = false;
      updateBadge(); refreshFinStatus(err); lapor();
      
      // Delay singkat saat selesai agar animasi 100% terlihat jelas oleh siswa
      if (isManualOrFinish && overlay) {
        setTimeout(function() {
          overlay.classList.add('hidden');
          if (terkirim) { UE.sfx('sukses'); UE.toast(terkirim + ' jawaban terkirim ✔', 'ok'); }
          if (err && !diam) UE.toast('Gagal kirim: ' + err, 'err');
          if ($('scr-map').classList.contains('active') && S.user) renderMap();
        }, 700);
      } else {
        if (terkirim) { UE.sfx('sukses'); UE.toast(terkirim + ' jawaban terkirim ✔ dan dihapus dari HP', 'ok'); }
        if (err && !diam) UE.toast('Gagal kirim: ' + err, 'err');
        if ($('scr-map').classList.contains('active') && S.user) renderMap();
      }
    });
  }

  /* ---------------- 8. Nilai saya ---------------- */
  $('btnNilaiSaya').addEventListener('click', function () {
    UE.sfx('klik'); show('scr-nilai');
    var box = $('nilaiBox');
    if (!navigator.onLine) { box.innerHTML = '<p>Melihat nilai membutuhkan internet.</p>'; return; }
    box.innerHTML = '<span class="spinner dark"></span> Mengambil nilai…';
    UE.api('hasilSiswa', { username: S.user.u, hash: S.user.h }).then(function (r) {
      if (!r.hasil.length) { box.innerHTML = '<p>Belum ada ujian yang terkirim.</p>'; return; }
      box.innerHTML = '<ul class="list">' + r.hasil.sort(function (a, b) { return b.waktu - a.waktu; }).map(function (h) {
        var isi;
        if (h.nilai != null) {
          var pg = (h.detail || []).filter(function (d) { return d.tipe === 'PG'; });
          var es = (h.detail || []).filter(function (d) { return d.tipe !== 'PG'; });
          var benar = pg.filter(function (d) { return d.skor > 0; }).length;
          isi = '<div>' + UE.bintangSVG(UE.bintang(h.nilai)) + ' <span class="nilai-big">' + h.nilai + '</span></div>' +
            (pg.length ? '<div class="fb"><b>Pilihan ganda:</b> ' + benar + ' benar dari ' + pg.length + ' soal<br>' +
              pg.map(function (d) { return d.no + (d.skor > 0 ? '✔' : '✘'); }).join(' · ') + '</div>' : '') +
            es.map(function (d) { return '<div class="fb"><b>Essay ' + d.no + ':</b> ' + d.skor + '/' + d.maks + (d.feedback ? ' — ' + UE.esc(d.feedback) : '') + '</div>'; }).join('');
        } else if (!h.tampil) isi = '<p class="muted">Nilai belum dibuka oleh guru.</p>';
        else if (h.status.indexOf('ERROR') === 0) isi = '<p class="muted">Penilaian tertunda, gurumu akan memeriksanya.</p>';
        else isi = '<p class="muted">⏳ Essay sedang dinilai AI…</p>';
        return '<li><b>' + UE.esc(h.nama) + '</b><div class="small muted">' + UE.esc(h.mapel) + ' · dikirim ' + UE.fmtTanggal(h.waktu) + '</div>' + isi + '</li>';
      }).join('') + '</ul>';
    }).catch(function (e) { box.innerHTML = '<p>' + UE.esc(e.message) + '</p>'; });
  });

  init();
})();
