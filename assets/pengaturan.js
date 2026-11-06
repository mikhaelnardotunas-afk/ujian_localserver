/* =========================================================
   Menu "Pengaturan & Data" (server laptop / Cloudflare).
   Menggantikan pekerjaan yang dulu dilakukan langsung di Google Spreadsheet:
   sheet PENGATURAN, menu "🎯 Ujian", serta ekspor/impor seluruh data
   dalam format spreadsheet yang sama (bisa dipakai untuk migrasi & cadangan).
   ========================================================= */
(function () {
  'use strict';
  var UE = window.UE, esc = UE.esc;
  var LEMBAR = ['PENGATURAN', 'PAKET', 'SOAL_PG', 'SOAL_ESSAY', 'TOKEN', 'USER', 'HASIL', 'JAWABAN', 'PROGRESS', 'PERANGKAT', 'LOGIN_LOG'];
  var KOLOM_WAKTU = {
    TOKEN: ['MULAI', 'SELESAI'], HASIL: ['WAKTU_TERIMA', 'MULAI', 'SELESAI'], PROGRESS: ['UPDATE_TERAKHIR'],
    PERANGKAT: ['WAKTU_UNDUH', 'TERAKHIR_ONLINE'], LOGIN_LOG: ['WAKTU', 'DITERIMA']
  };
  var KET_LEMBAR = {
    PENGATURAN: 'Nama sekolah, KKM, tanda tangan, AI', PAKET: 'Daftar ujian', SOAL_PG: 'Soal pilihan ganda', SOAL_ESSAY: 'Soal essay', TOKEN: 'Token ujian',
    USER: 'Akun siswa', HASIL: 'Nilai per kiriman', JAWABAN: 'Jawaban per soal', PROGRESS: 'Pantauan langsung', PERANGKAT: 'Daftar HP', LOGIN_LOG: 'Riwayat login'
  };
  var API = null, pane = null, data = null;
  var $$ = function (s) { return pane.querySelector(s); };

  /* ---------- Waktu: Excel menyimpan jam dinding tanpa zona, jadi dibaca & ditulis sebagai waktu setempat ---------- */
  function msKeSel(ms) { var n = Number(ms); return n ? new Date(n - new Date(n).getTimezoneOffset() * 60000) : ''; }
  function selKeMs(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (v instanceof Date) return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds()).getTime();
    if (typeof v === 'number') return v > 1e11 ? v : Math.round((v - 25569) * 86400000 + new Date((v - 25569) * 86400000).getTimezoneOffset() * 60000); // nomor seri Excel
    var s = String(v).trim(), m;
    if (/^\d{10,}$/.test(s)) return Number(s);
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/)) && s.indexOf('Z') < 0) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime();
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/))) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
    var d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  /** Isi sel ExcelJS → nilai polos */
  function nilaiSel(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map(function (x) { return x.text; }).join('');
      if (v.text !== undefined) return typeof v.text === 'object' ? nilaiSel(v.text) : v.text;
      if (v.result !== undefined) return nilaiSel(v.result);
      if (v.error) return '';
      return String(v);
    }
    return v;
  }
  var normHead = function (h) { return String(h == null ? '' : h).trim().toUpperCase().replace(/\s+/g, '_'); };

  /* ---------- Tampilan ---------- */
  function kartu(judul, sub, isi) {
    return '<section class="cf-kartu"><h3>' + judul + '</h3>' + (sub ? '<p class="small muted">' + sub + '</p>' : '') + isi + '</section>';
  }
  function isian(k, label, ket, tipe) {
    return '<label class="field"><span>' + esc(label) + '</span><input class="input" name="' + k + '" type="' + (tipe || 'text') + '" value="' + esc((data.nilai && data.nilai[k]) || '') + '" autocomplete="off">' +
      (ket ? '<small class="hint">' + esc(ket) + '</small>' : '') + '</label>';
  }
  function statistik() {
    var j = data.jumlah || {}, a = data.antrean || {};
    return '<div class="stats">' +
      '<div class="stat"><b>' + (j.paket || 0) + '</b><span>Paket ujian</span></div><div class="stat"><b>' + ((j.pg || 0) + (j.essay || 0)) + '</b><span>Soal</span></div>' +
      '<div class="stat"><b>' + (j.siswa || 0) + '</b><span>Siswa</span></div><div class="stat"><b>' + (j.token || 0) + '</b><span>Token</span></div>' +
      '<div class="stat s-done"><b>' + (j.hasil || 0) + '</b><span>Kiriman</span></div><div class="stat s-wait"><b>' + ((a.menunggu || 0) + (a.sedang || 0)) + '</b><span>Essay menunggu AI</span></div>' +
      (a.error ? '<div class="stat s-play"><b>' + a.error + '</b><span>Gagal dinilai</span></div>' : '') + '</div>';
  }
  /* ---------- Server di laptop ---------- */
  function jam(ms) { return ms ? new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'; }
  function kartuServer() {
    var s = data.server, n = data.nilai;
    if (!s) return '';
    var t = s.tunnel || {}, e = s.excel || {}, st = e.status || {}, c = s.cadangan || {};
    var KET_TUNNEL = { aktif: 'Tersambung', menghubungkan: 'Menghubungkan…', terputus: 'Terputus, mencoba lagi', gangguan: 'Ada gangguan internet', mati: 'Tunnel tidak dijalankan server', 'tanpa-cloudflared': 'cloudflared belum terpasang' };
    var baris = function (nama, x) {
      x = x || {};
      return '<tr><td><b>' + nama + '</b></td><td>' + (x.terbuka ? '📝 Sedang dibuka' : 'Tertutup') + '</td><td>' + jam(x.tulisTerakhir) + '</td><td>' + jam(x.bacaTerakhir) + '</td><td class="small">' + esc(x.ringkasan || '') +
        (x.galat ? '<br><span class="form-err">' + esc(x.galat) + '</span>' : '') + ((x.peringatan || []).length ? '<br><span class="form-err">' + esc(x.peringatan.join(' ')) + '</span>' : '') + '</td></tr>';
    };
    return kartu('Server di laptop', 'Folder data: <b>' + esc(s.folder) + '</b>',
      '<div class="table-wrap"><table class="tbl"><tbody><tr><td>Koneksi internet</td><td><b>' + esc(KET_TUNNEL[t.status] || t.status || '') + '</b>' + (t.galat ? ' · <span class="form-err">' + esc(t.galat) + '</span>' : '') + '</td></tr>' +
      '<tr><td>Alamat aplikasi</td><td>' + esc(t.alamatTetap || 'Belum diatur') + '</td></tr>' +
      '<tr><td>Cadangan terakhir</td><td>' + esc(c.nama || 'Belum ada') + ' · ' + (c.jumlah || 0) + ' tersimpan' + (c.galat ? ' · <span class="form-err">' + esc(c.galat) + '</span>' : '') + '</td></tr>' +
      '<tr><td>Lalu lintas sejak dinyalakan</td><td>' + ((s.statistik || {}).permintaan || 0) + ' permintaan · masuk ' + ((s.statistik || {}).masukMB || 0) + ' MB · keluar ' + ((s.statistik || {}).keluarMB || 0) + ' MB</td></tr></tbody></table></div>' +
      '<h4 style="margin:12px 0 6px">File Excel</h4><div class="table-wrap"><table class="tbl"><thead><tr><th>File</th><th>Keadaan</th><th>Ditulis server</th><th>Dibaca server</th><th>Perubahan terakhir</th></tr></thead><tbody>' +
      baris('DATA_UJIAN.xlsx', st.data) + baris('HASIL_UJIAN.xlsx', st.hasil) + '</tbody></table></div>' +
      (e.tertahan ? '<div class="cf-impor"><p class="form-err"><b>Perubahan besar dari Excel ditahan:</b> ' + esc((e.tertahan.rincian || []).join('; ')) + '.</p><p class="small">Biasanya terjadi bila baris terhapus tanpa sengaja atau file lama ditaruh di folder ini.</p>' +
        '<div class="toolbar-guru"><button type="button" class="btn btn-wood btn-sm" data-server="abaikanTertahan">Batalkan, kembalikan isi file dari server</button><button type="button" class="btn btn-blue btn-sm" data-server="terapkanTertahan">Ya, terapkan penghapusan</button></div></div>' : '') +
      '<div class="toolbar-guru" style="margin-top:10px"><button type="button" class="btn btn-green btn-sm" data-server="simpanExcel">Perbarui file Excel sekarang</button><button type="button" class="btn btn-blue btn-sm" data-server="cadangkan">Buat cadangan sekarang</button></div>' +
      '<hr class="cf-garis"><form data-form="server"><div class="lap-grid">' +
      isian('INTERVAL_KIRIM_MENIT', 'Kirim jawaban sementara tiap (menit)', 'Selama ujian, HP yang online mengirim jawaban ke server. 0 = dimatikan.') +
      isian('INTERVAL_PROGRES_DETIK', 'Kirim progres Pantau tiap (detik)', '15 sampai 110. Makin besar, makin hemat internet laptop.') +
      isian('INTERVAL_EXCEL_MENIT', 'Perbarui file Excel tiap (menit)', 'Minimal 0,5 menit.') +
      isian('CADANGAN_TIAP_JAM', 'Cadangan otomatis tiap (jam)', '0 = dimatikan.') +
      isian('CADANGAN_SIMPAN_HARI', 'Simpan cadangan selama (hari)') +
      isian('FOLDER_CADANGAN_KEDUA', 'Folder cadangan kedua', 'Opsional, misalnya folder Google Drive di laptop: ' + (n.FOLDER_CADANGAN_KEDUA ? '' : 'G:\\My Drive')) +
      '</div><button class="btn btn-green btn-sm">Simpan pengaturan server</button><p class="small muted">Berlaku untuk HP yang sedang ujian pada kiriman berikutnya, tanpa perlu unduh ulang.</p></form>');
  }
  function render() {
    var n = data.nilai, prov = (n.AI_PROVIDER || 'gemini').toLowerCase(), k = data.kunci || {};
    pane.querySelector('[data-isi]').innerHTML = statistik() + kartuServer() +
      kartu('Identitas sekolah &amp; laporan', 'Pengganti sheet PENGATURAN. Dipakai di aplikasi, kop laporan, dan tanda tangan.',
        '<form data-form="umum"><div class="lap-grid">' + isian('NAMA_SEKOLAH', 'Nama sekolah') + isian('TAHUN_PELAJARAN', 'Tahun pelajaran') + isian('KKM', 'KKM', 'Batas tuntas di laporan.') + isian('KOTA', 'Kota (tanda tangan)') +
        isian('NAMA_GURU', 'Nama guru') + isian('NIP_GURU', 'NIP guru') + isian('NAMA_KEPSEK', 'Nama kepala sekolah') + isian('NIP_KEPSEK', 'NIP kepala sekolah') + isian('LOGO_URL', 'Link logo sekolah', 'Opsional. Link Google Drive boleh.') +
        '</div><button class="btn btn-green btn-sm">Simpan identitas</button></form>') +
      kartu('Password', 'Password disimpan dalam bentuk hash, sehingga tidak bisa dibaca dari database.',
        '<div class="lap-grid"><form data-form="pwguru"><label class="field"><span>Password guru baru</span><input class="input" name="baru" type="password" minlength="6" autocomplete="new-password"><small class="hint">Minimal 6 karakter. Berlaku untuk dashboard ini.</small></label><button class="btn btn-blue btn-sm">Ganti password guru</button></form>' +
        '<form data-form="pwcetak"><label class="field"><span>Password khusus Cetak Soal</span><input class="input" name="baru" type="password" autocomplete="new-password"><small class="hint">' + (data.adaPasswordCetak ? '<b>Sudah diatur.</b> ' : 'Belum diatur. ') + 'Bisa melihat semua soal &amp; kunci, tidak bisa membuka dashboard. Kosongkan lalu simpan untuk mematikan.</small></label><button class="btn btn-blue btn-sm">Simpan password cetak</button></form></div>') +
      kartu('Penilaian AI', 'Pengganti menu 🎯 Ujian. Essay dinilai otomatis setiap menit selama penilaian otomatis aktif.',
        '<form data-form="ai"><div class="lap-grid">' +
        '<label class="field"><span>Penyedia AI</span><select class="input" name="AI_PROVIDER"><option value="gemini"' + (prov === 'gemini' ? ' selected' : '') + '>Gemini</option><option value="claude"' + (prov === 'claude' ? ' selected' : '') + '>Claude</option></select></label>' +
        isian('AI_MODEL', 'Model', 'gemini: gemini-2.5-flash | claude: claude-haiku-4-5-20251001') +
        '<label class="field"><span>Penilaian otomatis</span><select class="input" name="AUTO_NILAI"><option value="YA"' + (n.AUTO_NILAI === 'TIDAK' ? '' : ' selected') + '>Aktif</option><option value="TIDAK"' + (n.AUTO_NILAI === 'TIDAK' ? ' selected' : '') + '>Mati</option></select></label></div>' +
        '<label class="field"><span>Instruksi tambahan untuk AI</span><textarea class="input" name="INSTRUKSI_AI" rows="2">' + esc(n.INSTRUKSI_AI || '') + '</textarea></label>' +
        '<button class="btn btn-green btn-sm">Simpan pengaturan AI</button></form>' +
        '<hr class="cf-garis"><form data-form="kunci"><div class="lap-grid"><label class="field"><span>Penyedia</span><select class="input" name="provider"><option value="gemini">Gemini' + (k.gemini ? ' (tersimpan ' + esc(k.gemini) + ')' : ' (belum ada)') + '</option><option value="claude">Claude' + (k.claude ? ' (tersimpan ' + esc(k.claude) + ')' : ' (belum ada)') + '</option></select></label>' +
        '<label class="field"><span>API key</span><input class="input" name="key" type="password" autocomplete="off" placeholder="Tempel API key"><small class="hint">Gemini: aistudio.google.com/apikey · Claude: platform.claude.com. Kosongkan lalu simpan untuk menghapus.</small></label></div>' +
        '<div class="toolbar-guru"><button class="btn btn-blue btn-sm">Simpan API key</button><button type="button" class="btn btn-wood btn-sm" data-aksi="tes">Tes koneksi AI</button><button type="button" class="btn btn-wood btn-sm" data-aksi="nilai">Nilai sekarang (yang menunggu)</button></div></form>') +
      kartu('Cadangan &amp; migrasi data', 'Semua data dalam satu berkas Excel dengan lembar dan judul kolom yang sama seperti spreadsheet lama.',
        '<div class="toolbar-guru"><button type="button" class="btn btn-green btn-sm" data-aksi="ekspor">Unduh seluruh data (.xlsx)</button><label class="btn btn-blue btn-sm cf-file">Impor dari berkas spreadsheet…<input type="file" accept=".xlsx" data-file hidden></label>' +
        (data.jumlah && !data.jumlah.paket ? '<button type="button" class="btn btn-wood btn-sm" data-aksi="contoh">Isi data contoh</button>' : '') + '</div><div data-impor></div><p class="small" data-status></p>');
  }
  function status(teks, jenis) {
    var el = $$('[data-status]');
    if (!el) return;
    el.textContent = teks;
    el.className = 'small ' + (jenis === 'err' ? 'form-err' : 'muted');
  }

  /* ---------- Ekspor ---------- */
  function ekspor(tombol) {
    tombol.disabled = true;
    return window.Ekspor.muat().then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook(); wb.creator = 'Dashboard Guru'; wb.created = new Date();
      var total = 0;
      return LEMBAR.reduce(function (p, nama) {
        return p.then(function () {
          var ws = wb.addWorksheet(nama), ofs = 0, indeksWaktu = [];
          function halaman() {
            status('Mengambil ' + nama + '…');
            return API.guru('guruEkspor', { lembar: nama, offset: ofs }, 90000).then(function (r) {
              if (ofs === 0) {
                ws.addRow(r.head); ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }];
                indeksWaktu = (r.waktu || []).map(function (k) { return r.head.indexOf(k); });
                indeksWaktu.forEach(function (i) { ws.getColumn(i + 1).numFmt = 'yyyy-mm-dd hh:mm'; ws.getColumn(i + 1).width = 18; });
              }
              r.baris.forEach(function (b) {
                indeksWaktu.forEach(function (i) { b[i] = msKeSel(b[i]); });
                ws.addRow(b.map(function (x) { return x === null || x === undefined ? '' : x; }));
              });
              total += r.baris.length;
              if (r.berikut !== null) { ofs = r.berikut; return halaman(); }
            });
          }
          return halaman();
        });
      }, Promise.resolve()).then(function () { return wb.xlsx.writeBuffer(); }).then(function (buf) {
        var a = document.createElement('a'), d = new Date();
        a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = 'Cadangan_Ujian_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.xlsx';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        status('Selesai: ' + total + ' baris diunduh.');
        UE.toast('Cadangan data berhasil diunduh', 'ok');
      });
    }).catch(function (e) { status('Gagal: ' + e.message, 'err'); UE.toast(e.message, 'err'); })
      .finally(function () { tombol.disabled = false; });
  }

  /* ---------- Impor ---------- */
  var berkas = null;
  function bacaBerkas(file) {
    status('Membaca ' + file.name + '…');
    return window.Ekspor.muat().then(function (ExcelJS) {
      return file.arrayBuffer().then(function (buf) { var wb = new ExcelJS.Workbook(); return wb.xlsx.load(buf).then(function () { return wb; }); });
    }).then(function (wb) {
      berkas = {};
      LEMBAR.forEach(function (nama) {
        var ws = wb.worksheets.filter(function (w) { return normHead(w.name) === nama; })[0];
        if (!ws) return;
        var head = [], baris = [], waktu = KOLOM_WAKTU[nama] || [];
        ws.eachRow({ includeEmpty: false }, function (row, no) {
          if (no === 1) { row.eachCell({ includeEmpty: true }, function (c, i) { head[i] = normHead(nilaiSel(c.value)); }); return; }
          var o = {}, ada = false;
          head.forEach(function (h, i) {
            if (!h) return;
            var v = nilaiSel(row.getCell(i).value);
            if (waktu.indexOf(h) >= 0) v = selKeMs(v);
            else if (v instanceof Date) v = v.toISOString().slice(0, 10);
            if (v !== '' && v !== 0) ada = true;
            o[h] = v;
          });
          if (ada) baris.push(o);
        });
        berkas[nama] = baris;
      });
      if (!Object.keys(berkas).length) throw new Error('Tidak ada lembar yang dikenali. Berkas harus punya lembar seperti PAKET, SOAL_PG, USER.');
      tampilImpor(file.name);
      status('');
    }).catch(function (e) { status('Gagal membaca berkas: ' + e.message, 'err'); });
  }
  function tampilImpor(nama) {
    var adaPw = (berkas.PENGATURAN || []).some(function (r) { return /^PASSWORD_/.test(String(r.KUNCI).toUpperCase()) && r.NILAI !== ''; });
    $$('[data-impor]').innerHTML = '<div class="cf-impor"><p><b>' + esc(nama) + '</b>: pilih lembar yang akan dimasukkan.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Ikut</th><th>Lembar</th><th>Isi</th><th>Baris</th><th>Cara</th></tr></thead><tbody>' +
      LEMBAR.filter(function (n) { return berkas[n]; }).map(function (n) {
        return '<tr><td><input type="checkbox" data-ikut="' + n + '" checked aria-label="Ikutkan ' + n + '"></td><td><b>' + n + '</b></td><td class="small muted">' + KET_LEMBAR[n] + '</td><td>' + berkas[n].length + '</td><td>' +
          (n === 'PENGATURAN' ? '<span class="small muted">Perbarui</span>' : '<select class="input" data-cara="' + n + '" aria-label="Cara impor ' + n + '"><option value="">Tambah &amp; perbarui</option><option value="ganti">Ganti seluruh isi</option></select>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (adaPw ? '<label class="check"><input type="checkbox" data-pakaipw> Ikut gunakan password dari berkas (password yang berlaku sekarang akan diganti)</label>' : '') +
      '<div class="toolbar-guru" style="margin-top:10px"><input class="input hidden" data-konfirmasi placeholder="Ketik GANTI untuk melanjutkan" style="flex:0 1 240px"><button type="button" class="btn btn-green btn-sm" data-aksi="impor">Mulai impor</button><button type="button" class="btn btn-wood btn-sm" data-aksi="batalimpor">Batal</button></div>' +
      '<div class="cf-bar hidden" data-bar><i></i></div></div>';
    pane.querySelectorAll('[data-cara]').forEach(function (s) { s.addEventListener('change', perluKonfirmasi); });
  }
  function adaGanti() { return Array.prototype.some.call(pane.querySelectorAll('[data-cara]'), function (s) { return s.value === 'ganti' && $$('[data-ikut="' + s.dataset.cara + '"]').checked; }); }
  function perluKonfirmasi() { $$('[data-konfirmasi]').classList.toggle('hidden', !adaGanti()); }
  /** Potongan kiriman. Lembar JAWABAN dipotong di batas kiriman agar satu kiriman tidak terbelah. */
  function potong(nama, baris) {
    var hasil = [], per = 200;
    if (nama !== 'JAWABAN') { for (var i = 0; i < baris.length; i += per) hasil.push(baris.slice(i, i + per)); return hasil; }
    var grup = {}, urut = [];
    baris.forEach(function (b) { var k = String(b.ID_SUBMIT); if (!grup[k]) { grup[k] = []; urut.push(k); } grup[k].push(b); });
    var kini = [];
    urut.forEach(function (k) {
      if (kini.length && kini.length + grup[k].length > 600) { hasil.push(kini); kini = []; }
      kini = kini.concat(grup[k]);
    });
    if (kini.length) hasil.push(kini);
    return hasil;
  }
  function kirimPotongan(data2, ke) {
    return API.guru('guruImpor', data2, 90000).catch(function (e) {
      if (ke >= 3 || !/koneksi|lama|server/i.test(e.message)) throw e;
      return new Promise(function (ok) { setTimeout(ok, 1500 * ke); }).then(function () { return kirimPotongan(data2, ke + 1); });
    });
  }
  function impor(tombol) {
    var pilih = LEMBAR.filter(function (n) { var c = $$('[data-ikut="' + n + '"]'); return c && c.checked; });
    if (!pilih.length) { status('Pilih minimal satu lembar.', 'err'); return; }
    if (adaGanti() && $$('[data-konfirmasi]').value.trim() !== 'GANTI') { status('Ketik GANTI untuk mengganti isi lembar yang dipilih.', 'err'); return; }
    var pakaiPw = !!($$('[data-pakaipw]') && $$('[data-pakaipw]').checked);
    var rencana = [], totalBaris = 0;
    pilih.forEach(function (n) {
      var baris = berkas[n];
      if (n === 'PENGATURAN' && !pakaiPw) baris = baris.filter(function (r) { return !/^PASSWORD_/.test(String(r.KUNCI).toUpperCase()); });
      var cara = $$('[data-cara="' + n + '"]'), ganti = !!(cara && cara.value === 'ganti'), bagian = potong(n, baris);
      if (ganti && !bagian.length) bagian = [[]];
      bagian.forEach(function (b, i) { rencana.push({ lembar: n, baris: b, ganti: ganti && i === 0 }); totalBaris += b.length; });
    });
    tombol.disabled = true;
    var bar = $$('[data-bar]'), hasil = {}, selesai = 0;
    bar.classList.remove('hidden');
    return rencana.reduce(function (p, r) {
      return p.then(function () {
        status('Mengimpor ' + r.lembar + ' (' + selesai + ' dari ' + totalBaris + ' baris)…');
        var kiriman = { lembar: r.lembar, baris: r.baris };
        if (r.ganti) { kiriman.ganti = true; kiriman.konfirmasi = 'GANTI'; }
        return kirimPotongan(kiriman, 1).then(function (j) {
          var h = hasil[r.lembar] || (hasil[r.lembar] = { masuk: 0, dilewati: 0 });
          h.masuk += j.masuk; h.dilewati += j.dilewati; selesai += r.baris.length;
          bar.firstChild.style.width = (totalBaris ? Math.round(selesai / totalBaris * 100) : 100) + '%';
        });
      });
    }, Promise.resolve()).then(function () { return API.guru('guruImporSelesai', {}, 60000); }).then(function () {
      status('Selesai. ' + Object.keys(hasil).map(function (n) { return n + ': ' + hasil[n].masuk + (hasil[n].dilewati ? ' (' + hasil[n].dilewati + ' dilewati)' : ''); }).join(' · '));
      UE.toast('Impor selesai', 'ok');
      berkas = null;
      if (pakaiPw) { UE.dialog({ judul: 'Password diganti', pesan: 'Password dari berkas kini berlaku. Silakan masuk kembali.' }).then(function () { API.keluar(); }); return; }
      var pesan = $$('[data-status]').textContent;
      return muatData().then(function () { status(pesan); API.muatUlang(); });
    }).catch(function (e) {
      status('Impor berhenti: ' + e.message + '. Data yang sudah masuk tetap tersimpan; ulangi impor untuk melanjutkan.', 'err');
      tombol.disabled = false;
    });
  }

  /* ---------- Formulir ---------- */
  function nilaiForm(f) {
    var o = {};
    Array.prototype.forEach.call(f.elements, function (el) { if (el.name) o[el.name] = el.value; });
    return o;
  }
  function kirimForm(f, tombol, fn) {
    var asli = tombol.innerHTML; tombol.disabled = true;
    return Promise.resolve().then(fn).catch(function (e) { UE.toast(e.message, 'err'); }).finally(function () { tombol.disabled = false; tombol.innerHTML = asli; });
  }
  function pasangAcara() {
    pane.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-form]'); if (!f) return;
      e.preventDefault();
      var v = nilaiForm(f), b = f.querySelector('button:not([type=button])');
      var tugas = {
        umum: function () { return API.guru('guruSimpanPengaturan', { nilai: v }).then(function () { Object.assign(data.nilai, v); UE.toast('Identitas sekolah tersimpan', 'ok'); API.muatUlang(); }); },
        ai: function () { return API.guru('guruSimpanPengaturan', { nilai: v }).then(function () { Object.assign(data.nilai, v); UE.toast('Pengaturan AI tersimpan', 'ok'); }); },
        server: function () { return API.guru('guruSimpanPengaturan', { nilai: v }).then(function () { Object.assign(data.nilai, v); UE.toast('Pengaturan server tersimpan', 'ok'); }); },
        pwguru: function () {
          if (v.baru.length < 6) throw new Error('Password guru minimal 6 karakter');
          return API.guru('guruGantiPassword', { jenis: 'GURU', baru: v.baru }).then(function () { API.aturPassword(v.baru); f.reset(); UE.toast('Password guru diganti', 'ok'); });
        },
        pwcetak: function () {
          return API.guru('guruGantiPassword', { jenis: 'CETAK', baru: v.baru }).then(function () { data.adaPasswordCetak = !!v.baru; UE.toast(v.baru ? 'Password cetak disimpan' : 'Password cetak dimatikan', 'ok'); render(); });
        },
        kunci: function () { return API.guru('guruSimpanKunciAI', { provider: v.provider, key: v.key }).then(function () { UE.toast(v.key ? 'API key tersimpan' : 'API key dihapus', 'ok'); return muatData(); }); }
      }[f.dataset.form];
      kirimForm(f, b, tugas);
    });
    pane.addEventListener('click', function (e) {
      var sv = e.target.closest('[data-server]');
      if (sv) {
        sv.disabled = true;
        API.guru('guruServer', { aksi: sv.dataset.server }, 120000).then(function (r) {
          var h = r.hasil, terbuka = h && (h.data === 'terbuka' || h.hasil === 'terbuka');
          UE.toast(r.pesan || (r.nama ? 'Cadangan dibuat: ' + r.nama : terbuka ? 'File yang sedang dibuka di Excel dilewati. Tutup file itu lalu coba lagi.' : 'File Excel sudah terbaru'), terbuka ? 'err' : 'ok');
          return muatData();
        }).catch(function (x) { UE.toast(x.message, 'err'); sv.disabled = false; });
        return;
      }
      var b = e.target.closest('[data-aksi]'); if (!b) return;
      var a = b.dataset.aksi;
      if (a === 'ekspor') ekspor(b);
      else if (a === 'impor') impor(b);
      else if (a === 'batalimpor') { berkas = null; $$('[data-impor]').innerHTML = ''; }
      else if (a === 'tes') {
        b.disabled = true;
        API.guru('guruTesAI', {}, 130000).then(function (r) { UE.dialog({ judul: 'Koneksi AI berhasil', pesan: 'Respon: ' + r.respon }); })
          .catch(function (x) { UE.dialog({ judul: 'Koneksi AI gagal', pesan: x.message }); }).finally(function () { b.disabled = false; });
      } else if (a === 'nilai') {
        b.disabled = true;
        API.guru('guruNilaiAI', {}, 300000).then(function (r) { UE.toast(r.dinilai + ' kiriman selesai dinilai', 'ok'); return muatData(); })
          .catch(function (x) { UE.toast(x.message, 'err'); }).finally(function () { b.disabled = false; });
      } else if (a === 'contoh') {
        UE.dialog({ judul: 'Isi data contoh?', pesan: 'Menambahkan 2 ujian, 6 soal PG, 3 soal essay, 2 token, dan 5 siswa contoh.', ok: 'Isi', batal: 'Batal' }).then(function (ya) {
          if (!ya) return;
          API.guru('guruIsiContoh', {}).then(function () { UE.toast('Data contoh ditambahkan', 'ok'); API.muatUlang(); return muatData(); }).catch(function (x) { UE.toast(x.message, 'err'); });
        });
      }
    });
    pane.addEventListener('change', function (e) {
      if (e.target.matches('[data-file]') && e.target.files[0]) { bacaBerkas(e.target.files[0]); e.target.value = ''; }
      if (e.target.matches('[data-ikut]')) perluKonfirmasi();
    });
  }

  function muatData() {
    return API.guru('guruPengaturan', {}, 60000).then(function (r) { data = r; render(); }).catch(function (e) {
      var isi = pane.querySelector('[data-isi]');
      if (/Aksi tidak dikenal/i.test(e.message)) {
        isi.innerHTML = '<p>Aplikasi masih memakai backend <b>Google Apps Script</b>. Pengaturan diubah langsung di Google Spreadsheet (sheet <b>PENGATURAN</b> dan menu <b>🎯 Ujian</b>).</p><p class="small muted">Menu ini aktif setelah pindah ke server laptop. Lihat <b>PANDUAN_SERVER_LAPTOP.md</b>.</p>';
      } else isi.innerHTML = '<p class="form-err">' + esc(e.message) + '</p>';
    });
  }
  window.Pengaturan = {
    /** api: { guru(aksi, data, batasMs), muatUlang(), aturPassword(baru), keluar() } */
    pasang: function (api) { API = api; pane = document.getElementById('t-pengaturan'); if (pane) pasangAcara(); },
    buka: function () { if (pane && !berkas) muatData(); } // berkas terbuka: pilihan impor jangan tertimpa
  };
})();
