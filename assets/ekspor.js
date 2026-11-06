/* =========================================================
   Export Excel (.xlsx) — rekap hasil, daftar TP, analisis butir.
   Pustaka ExcelJS dimuat saat pertama dipakai (lalu disimpan service worker).
   ========================================================= */
(function () {
  'use strict';
  var URL_EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  var W = { navy: 'FF14284B', head: 'FF1F4E8C', putih: 'FFFFFFFF', zebra: 'FFF5F7FA', garis: 'FFB8C2D0', abu: 'FF5B6577',
    merah: 'FFB42318', merahBg: 'FFFDECEA', hijau: 'FF1E7B45', hijauBg: 'FFE7F5EC', kuning: 'FF9A5B06', kuningBg: 'FFFDF3E2', grup: 'FFE3EAF5' };
  var TIPIS = { style: 'thin', color: { argb: W.garis } };
  var KOTAK = { top: TIPIS, left: TIPIS, bottom: TIPIS, right: TIPIS };
  var janji = null;

  function muat() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (janji) return janji;
    janji = new Promise(function (ok, gagal) {
      var s = document.createElement('script');
      s.src = URL_EXCELJS; s.async = true;
      s.onload = function () { if (window.ExcelJS) ok(window.ExcelJS); else { janji = null; gagal(new Error('Pustaka Excel tidak lengkap. Coba lagi.')); } };
      s.onerror = function () { janji = null; s.remove(); gagal(new Error('Gagal memuat pustaka Excel. Pastikan ada internet, lalu coba lagi.')); };
      document.head.appendChild(s);
    });
    return janji;
  }

  /* ---------- Utilitas lembar kerja ---------- */
  function namaSheet(wb, nama) {
    var bersih = String(nama).replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
    var n = bersih, i = 2;
    while (wb.getWorksheet(n)) { var akhir = ' (' + i++ + ')'; n = bersih.slice(0, 31 - akhir.length) + akhir; }
    return n;
  }
  function sheetBaru(wb, nama, setting, landscape) {
    var ws = wb.addWorksheet(namaSheet(wb, nama), {
      pageSetup: { paperSize: 9, orientation: landscape === false ? 'portrait' : 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.25 } }
    });
    ws.headerFooter.oddFooter = '&L&8' + String(setting.NAMA_SEKOLAH || '').replace(/&/g, '&&') + '&R&8Halaman &P dari &N';
    return ws;
  }
  function tanggalLokal(ms) { return ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000) : null; }
  function teksTanggal(ms) {
    var d = new Date(ms || Date.now());
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  /** Kop: nama sekolah, judul, subjudul, lalu baris info "Label : nilai". Mengembalikan nomor baris berikutnya. */
  function kop(ws, ncol, setting, judul, sub, info) {
    var r = 1;
    [[setting.NAMA_SEKOLAH, 14, true, W.navy], [judul, 12, true, W.navy], [sub, 10, false, W.abu]].forEach(function (x) {
      if (!x[0]) return;
      ws.mergeCells(r, 1, r, ncol);
      var c = ws.getCell(r, 1);
      c.value = x[0]; c.font = { size: x[1], bold: x[2], color: { argb: x[3] } }; c.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(r).height = x[1] + 9; r++;
    });
    for (var k = 1; k <= ncol; k++) ws.getCell(r - 1, k).border = { bottom: { style: 'medium', color: { argb: W.navy } } };
    r++;
    (info || []).forEach(function (pair) {
      ws.mergeCells(r, 1, r, ncol);
      ws.getCell(r, 1).value = { richText: [{ font: { bold: true, color: { argb: W.abu } }, text: pair[0] + '  :  ' }, { font: { color: { argb: 'FF1B2533' } }, text: String(pair[1] == null ? '-' : pair[1]) }] };
      r++;
    });
    return info && info.length ? r + 1 : r;
  }

  /**
   * Tabel berformat. kolom: [{h: judul, w: lebar, v: fn(baris, i), fmt, al: 'center', wrap, gaya: fn(baris) → {font, fill}}]
   * Mengembalikan {awal: baris header, akhir: baris data terakhir}
   */
  function tabel(ws, rAwal, kolom, data, opts) {
    opts = opts || {};
    var hr = ws.getRow(rAwal);
    kolom.forEach(function (k, i) {
      var c = hr.getCell(i + 1);
      c.value = k.h;
      c.font = { bold: true, color: { argb: W.putih }, size: 10 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.warnaHead || W.head } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = KOTAK;
      if (!opts.tanpaLebar && k.w) ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width || 0, k.w);
    });
    hr.height = opts.tinggiHead || 32;
    data.forEach(function (d, j) {
      var row = ws.getRow(rAwal + 1 + j);
      kolom.forEach(function (k, i) {
        var c = row.getCell(i + 1), v = k.v(d, j);
        c.value = v === undefined || v === '' ? null : v;
        if (k.fmt) c.numFmt = k.fmt;
        c.alignment = { horizontal: k.al || 'left', vertical: 'top', wrapText: !!k.wrap };
        c.border = KOTAK;
        c.font = { size: 10 };
        if (j % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: W.zebra } };
        var g = k.gaya && k.gaya(d, v);
        if (g && g.font) c.font = Object.assign({ size: 10 }, g.font);
        if (g && g.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: g.fill } };
      });
    });
    return { awal: rAwal, akhir: rAwal + data.length };
  }
  function catatan(ws, r, ncol, teks, gaya) {
    ws.mergeCells(r, 1, r, ncol);
    var c = ws.getCell(r, 1);
    c.value = teks; c.font = Object.assign({ size: 9, italic: true, color: { argb: W.abu } }, gaya || {}); c.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(r).height = Math.max(15, Math.ceil(String(teks).length / (ncol * 9)) * 13);
    return r + 1;
  }
  function judulBagian(ws, r, ncol, teks) {
    ws.mergeCells(r, 1, r, ncol);
    var c = ws.getCell(r, 1);
    c.value = teks; c.font = { bold: true, size: 11, color: { argb: W.navy } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: W.grup } };
    c.border = KOTAK;
    ws.getRow(r).height = 20;
    return r + 1;
  }
  function unduh(wb, nama) {
    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = nama;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
  }
  function bukuBaru(ExcelJS, judul) {
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Dashboard Guru — Sistem Ujian'; wb.created = new Date(); wb.title = judul;
    return wb;
  }

  /* Gaya bersama */
  function gayaNilai(kkm) { return function (d, v) { return v != null && typeof v === 'number' && v < kkm ? { font: { color: { argb: W.merah }, bold: true } } : null; }; }
  function gayaKet(d, v) {
    if (v === 'Tuntas' || v === 'Tercapai' || v === 'Diterima') return { font: { color: { argb: W.hijau }, bold: true } };
    if (v === 'Belum tuntas' || v === 'Belum tercapai' || v === 'Ditolak / diganti') return { font: { color: { argb: W.merah }, bold: true } };
    if (v === 'Tidak ikut' || v === 'Direvisi') return { font: { color: { argb: W.kuning }, bold: true } };
    return null;
  }
  var angka1 = '0.0', persen1 = '0.0"%"';
  function nol(v) { return v == null ? null : v; }

  /* ------------------------------------------------------------------
     1. Rekap hasil
     ------------------------------------------------------------------ */
  function kolomHasil(R, g, mode) {
    var T = window.Rekap.teksTP, kkm = R.kkm;
    var menunggu = mode === 'semua' ? R.grup.some(function (x) { return x.adaMenunggu; }) : g.adaMenunggu;
    var k = [
      { h: 'No', w: 5, al: 'center', v: function (d, i) { return i + 1; } },
      { h: 'Nama Siswa', w: 28, wrap: true, v: function (d) { return d.n; } },
      { h: 'Username', w: 13, v: function (d) { return d.u; } }
    ];
    if (mode === 'semua') {
      k.push({ h: 'Kelas', w: 9, al: 'center', v: function (d) { return d.k; } });
    }
    k.push({ h: 'Mata Pelajaran', w: 16, wrap: true, v: function (d) { return d.mapel; } });
    if (mode === 'semua') k.push({ h: 'Nama Ujian', w: 24, wrap: true, v: function (d) { return d.ujian; } });
    k.push(
      { h: 'Jumlah Benar', w: 9, al: 'center', v: function (d) { return d.h ? d.benar : null; } },
      { h: 'Jumlah Salah', w: 9, al: 'center', v: function (d) { return d.h ? d.salah : null; } },
      { h: 'Tidak Terjawab', w: 10, al: 'center', v: function (d) { return d.h ? d.kosong : null; } }
    );
    if (menunggu) k.push({ h: 'Belum Dinilai', w: 9, al: 'center', v: function (d) { return d.h ? d.menunggu : null; } });
    k.push(
      { h: 'Nilai', w: 8, al: 'center', fmt: angka1, v: function (d) { return nol(d.nilai); }, gaya: gayaNilai(kkm) },
      { h: 'Pencapaian TP Tertinggi', w: 36, wrap: true, v: function (d) { return d.h ? T(d.tpTinggi, true) : null; } },
      { h: 'Pencapaian TP Terendah', w: 36, wrap: true, v: function (d) { return d.h ? T(d.tpRendah, true) : null; } },
      { h: 'Predikat', w: 14, al: 'center', v: function (d) { return d.predikat; } },
      { h: 'Ketuntasan (KKM ' + kkm + ')', w: 13, al: 'center', v: function (d) { return d.ket; }, gaya: gayaKet },
      { h: 'Peringkat', w: 9, al: 'center', v: function (d) { return nol(d.rank); } },
      { h: 'Skor PG', w: 8, al: 'center', fmt: angka1, v: function (d) { return d.h ? nol(d.pg) : null; } },
      { h: 'Skor Essay', w: 8, al: 'center', fmt: angka1, v: function (d) { return d.h ? nol(d.es) : null; } },
      { h: 'Total Skor', w: 8, al: 'center', fmt: angka1, v: function (d) { return d.h ? nol(d.total) : null; } },
      { h: 'Skor Maks', w: 8, al: 'center', v: function (d) { return d.h ? nol(d.maks) : null; } },
      { h: 'Pelang-garan', w: 9, al: 'center', v: function (d) { return d.h ? d.pel || 0 : null; } },
      { h: 'Durasi (menit)', w: 9, al: 'center', v: function (d) { return nol(d.durasi); } },
      { h: 'Waktu Kirim', w: 17, al: 'center', fmt: 'dd/mm/yyyy hh:mm', v: function (d) { return d.t ? tanggalLokal(d.t) : null; } }
    );
    if (mode === 'semua') k.push({ h: 'Status Penilaian', w: 14, v: function (d) { return d.h ? (d.status || '') : ''; } });
    if (mode === 'grup' && g.tpKolom) {
      g.tp.forEach(function (t) {
        k.push({ h: t.kode + ' (%)', w: 9, al: 'center', fmt: angka1, v: function (d) { return d.tpPct && d.tpPct[t.kode] != null ? d.tpPct[t.kode] : null; }, gaya: gayaNilai(kkm) });
      });
    }
    return k;
  }

  function sheetGrup(wb, R, g, opsi) {
    var ws = sheetBaru(wb, g.label, R.setting);
    g.tpKolom = !!opsi.perTP;
    var kol = kolomHasil(R, g, 'grup');
    var p = g.paket, s = g.stat;
    var r = kop(ws, kol.length, R.setting, opsi.remedial ? 'DAFTAR SISWA BELUM TUNTAS (REMEDIAL)' : 'REKAP HASIL UJIAN',
      'Kelas ' + g.kelas + ' · ' + (p.mapel || '-') + (R.setting.TAHUN_PELAJARAN ? ' · Tahun Pelajaran ' + R.setting.TAHUN_PELAJARAN : ''), [
        ['Mata Pelajaran', p.mapel || '-'], ['Nama Ujian', p.nama + ' (' + p.id + ')'], ['Kelas', g.kelas],
        ['Jumlah Soal', p.soal.length + ' soal (' + p.soal.filter(function (x) { return x.t === 'PG'; }).length + ' PG, ' + p.soal.filter(function (x) { return x.t !== 'PG'; }).length + ' essay) · skor maksimal ' + p._skorMaks],
        ['KKM', R.kkm], ['Dicetak', teksTanggal(R.dibuat)]
      ]);
    ws.views = [{ state: 'frozen', ySplit: r, xSplit: 2 }];
    var t = tabel(ws, r, kol, g.rows);
    ws.pageSetup.printTitlesRow = r + ':' + r;
    r = t.akhir + 2;
    r = judulBagian(ws, r, 3, 'Ringkasan kelas');
    var pasangan = [['Jumlah siswa', s.siswa], ['Peserta', s.peserta], ['Tidak ikut', s.tidakIkut], ['Rata-rata nilai', s.rata],
      ['Nilai tertinggi', s.maks], ['Nilai terendah', s.min], ['Tuntas (≥ KKM ' + R.kkm + ')', s.tuntas], ['Belum tuntas', s.belum],
      ['Persentase ketuntasan', s.persen, persen1]];
    pasangan.forEach(function (x) {
      var a = ws.getCell(r, 2), b = ws.getCell(r, 3);
      a.value = x[0]; a.font = { bold: true, size: 10, color: { argb: W.abu } }; a.border = KOTAK;
      b.value = x[1] == null ? '-' : x[1]; b.font = { bold: true, size: 10 }; b.alignment = { horizontal: 'center' }; b.border = KOTAK;
      if (x[2] && x[1] != null) b.numFmt = x[2];
      else if (typeof x[1] === 'number' && !Number.isInteger(x[1])) b.numFmt = angka1;
      r++;
    });
    r++;
    if (g.tp.length) {
      r = judulBagian(ws, r, 5, 'Keterangan & ketercapaian Tujuan Pembelajaran (rata-rata kelas)');
      var kTP = [
        { h: 'Kode', v: function (d) { return d.kode; }, al: 'center' },
        { h: 'Tujuan Pembelajaran', v: function (d) { return d.teks; }, wrap: true },
        { h: 'Rata-rata (%)', v: function (d) { return nol(d.rata); }, al: 'center', fmt: angka1, gaya: gayaNilai(R.kkm) },
        { h: 'Siswa ≥ KKM', v: function (d) { return d.n ? d.tercapai + ' dari ' + d.n : '-'; }, al: 'center', wrap: true },
        { h: 'Status', v: function (d) { return d.status; }, al: 'center', wrap: true, gaya: gayaKet }
      ];
      var tt = tabel(ws, r, kTP, g.tp, { tanpaLebar: true, tinggiHead: 30, warnaHead: W.navy });
      g.tp.forEach(function (x, i) { ws.getRow(r + 1 + i).height = Math.max(16, Math.ceil(String(x.teks || '').length / 30) * 13); });
      r = tt.akhir + 2;
    }
    r = catatan(ws, r, kol.length, 'Keterangan: Jumlah benar/salah pilihan ganda sesuai kunci (atau koreksi guru); soal essay dihitung benar bila skor ≥ ' + R.batas +
      '% skor maksimal. Pencapaian TP = skor yang diperoleh ÷ skor maksimal soal-soal TP tersebut × 100. Predikat: Sangat Baik ≥ 85, Baik 70–84, Cukup 50–69, Perlu Bimbingan < 50.');
    if (g.adaMenunggu) catatan(ws, r, kol.length, 'Masih ada essay yang belum dinilai AI/guru; nilai dan pencapaian TP siswa tersebut belum final.', { color: { argb: W.kuning } });
    return ws;
  }

  function hasil(R, opsi, namaFile) {
    return muat().then(function (ExcelJS) {
      var wb = bukuBaru(ExcelJS, 'Rekap Hasil Ujian');
      var judul = opsi.remedial ? 'DAFTAR SISWA BELUM TUNTAS (REMEDIAL)' : 'REKAP HASIL UJIAN PER MATA PELAJARAN DAN KELAS';
      var sub = (R.label || '') + (R.setting.TAHUN_PELAJARAN ? ' · Tahun Pelajaran ' + R.setting.TAHUN_PELAJARAN : '');

      // Ringkasan
      var ws = sheetBaru(wb, 'Ringkasan', R.setting);
      var kR = [
        { h: 'No', w: 5, al: 'center', v: function (g, i) { return i + 1; } },
        { h: 'Kelas', w: 9, al: 'center', v: function (g) { return g.kelas; } },
        { h: 'Mata Pelajaran', w: 18, wrap: true, v: function (g) { return g.paket.mapel; } },
        { h: 'Nama Ujian', w: 26, wrap: true, v: function (g) { return g.paket.nama; } },
        { h: 'Jumlah Siswa', w: 9, al: 'center', v: function (g) { return g.stat.siswa; } },
        { h: 'Peserta', w: 9, al: 'center', v: function (g) { return g.stat.peserta; } },
        { h: 'Tidak Ikut', w: 9, al: 'center', v: function (g) { return g.stat.tidakIkut; } },
        { h: 'Rata-rata', w: 9, al: 'center', fmt: angka1, v: function (g) { return nol(g.stat.rata); }, gaya: gayaNilai(R.kkm) },
        { h: 'Tertinggi', w: 9, al: 'center', fmt: angka1, v: function (g) { return nol(g.stat.maks); } },
        { h: 'Terendah', w: 9, al: 'center', fmt: angka1, v: function (g) { return nol(g.stat.min); } },
        { h: 'Tuntas', w: 8, al: 'center', v: function (g) { return g.stat.tuntas; } },
        { h: 'Belum Tuntas', w: 8, al: 'center', v: function (g) { return g.stat.belum; } },
        { h: 'Ketuntasan', w: 10, al: 'center', fmt: persen1, v: function (g) { return nol(g.stat.persen); } },
        { h: 'TP Tertinggi (rata-rata kelas)', w: 34, wrap: true, v: function (g) { return g.tpTinggi ? g.tpTinggi.kode + ' (' + String(g.tpTinggi.rata).replace('.', ',') + '%) – ' + g.tpTinggi.teks : '-'; } },
        { h: 'TP Terendah (rata-rata kelas)', w: 34, wrap: true, v: function (g) { return g.tpRendah ? g.tpRendah.kode + ' (' + String(g.tpRendah.rata).replace('.', ',') + '%) – ' + g.tpRendah.teks : '-'; } }
      ];
      var r = kop(ws, kR.length, R.setting, judul, sub, [['Filter', R.label], ['KKM', R.kkm], ['Dicetak', teksTanggal(R.dibuat)]]);
      var t = tabel(ws, r, kR, R.grup);
      ws.views = [{ state: 'frozen', ySplit: r }];
      catatan(ws, t.akhir + 2, kR.length, 'Rata-rata, tertinggi, terendah, dan ketuntasan dihitung dari siswa yang sudah dinilai. Rincian per siswa ada di sheet "Semua Data"' +
        (opsi.perSheet ? ' dan sheet tiap kelas/ujian.' : '.'));

      // Semua data (tabel datar, bisa difilter)
      var semua = [];
      R.grup.forEach(function (g) { g.rows.forEach(function (x) { semua.push(x); }); });
      var ws2 = sheetBaru(wb, 'Semua Data', R.setting);
      var kS = kolomHasil(R, null, 'semua');
      var r2 = kop(ws2, kS.length, R.setting, judul, sub, null);
      var t2 = tabel(ws2, r2, kS, semua);
      ws2.views = [{ state: 'frozen', ySplit: r2, xSplit: 2 }];
      ws2.autoFilter = { from: { row: r2, column: 1 }, to: { row: t2.akhir, column: kS.length } };
      ws2.pageSetup.printTitlesRow = r2 + ':' + r2;

      if (opsi.perSheet) R.grup.forEach(function (g) { sheetGrup(wb, R, g, opsi); });
      return unduh(wb, namaFile);
    });
  }

  /* ------------------------------------------------------------------
     2. Daftar Tujuan Pembelajaran
     ------------------------------------------------------------------ */
  function tp(T, opsi, namaFile) {
    return muat().then(function (ExcelJS) {
      var wb = bukuBaru(ExcelJS, 'Daftar Tujuan Pembelajaran');
      T.mapel.forEach(function (m) {
        var ws = sheetBaru(wb, m.mapel, T.setting);
        var k = [
          { h: 'No', w: 5, al: 'center', v: function (d, i) { return i + 1; } },
          { h: 'Kode TP', w: 9, al: 'center', v: function (d) { return d.kode; } },
          { h: 'Tujuan Pembelajaran', w: 52, wrap: true, v: function (d) { return d.teks; } },
          { h: 'Ujian', w: 24, wrap: true, v: function (d) { return d.ujian; } },
          { h: 'Kelas', w: 12, wrap: true, al: 'center', v: function (d) { return d.kelas; } },
          { h: 'Nomor Soal', w: 22, wrap: true, v: function (d) { return d.nomor; } },
          { h: 'Jumlah Soal', w: 8, al: 'center', v: function (d) { return d.jumlah; } },
          { h: 'Bobot Skor', w: 8, al: 'center', v: function (d) { return d.bobot; } }
        ];
        if (T.analisis) k.push(
          { h: 'Rata-rata Ketercapaian (%)', w: 12, al: 'center', fmt: angka1, v: function (d) { return nol(d.rata); }, gaya: gayaNilai(T.kkm) },
          { h: 'Siswa ≥ KKM', w: 9, al: 'center', v: function (d) { return d.n ? d.tercapai : null; } },
          { h: 'Jumlah Siswa', w: 9, al: 'center', v: function (d) { return d.n || null; } },
          { h: 'Status', w: 14, al: 'center', v: function (d) { return d.status; }, gaya: gayaKet }
        );
        var r = kop(ws, k.length, T.setting, 'DAFTAR TUJUAN PEMBELAJARAN', 'Mata Pelajaran ' + m.mapel + (T.setting.TAHUN_PELAJARAN ? ' · Tahun Pelajaran ' + T.setting.TAHUN_PELAJARAN : ''), [
          ['Mata Pelajaran', m.mapel], ['Ujian', m.pakets.map(function (p) { return p.nama; }).join('; ')],
          ['Jumlah TP', m.list.length + ' TP dari ' + m.jumlahSoal + ' soal' + (m.tanpaTP ? ' (' + m.tanpaTP + ' soal belum memiliki TP)' : '')],
          ['Filter', T.label], T.analisis ? ['KKM', T.kkm] : null, ['Dicetak', teksTanggal(T.dibuat)]
        ].filter(Boolean));
        var t = tabel(ws, r, k, m.list);
        ws.views = [{ state: 'frozen', ySplit: r }];
        ws.pageSetup.printTitlesRow = r + ':' + r;
        catatan(ws, t.akhir + 2, k.length, 'Kode TP dibuat otomatis per mata pelajaran (urutan soal di bank soal) atau diambil dari awalan teks TP, misalnya "TP 1.2: …".' +
          (T.analisis ? ' Ketercapaian = rata-rata (skor siswa pada soal TP tersebut ÷ skor maksimalnya × 100). Status "Tercapai" bila rata-rata ≥ KKM.' : ''));
      });
      return unduh(wb, namaFile);
    });
  }

  /* ------------------------------------------------------------------
     3. Analisis butir soal
     ------------------------------------------------------------------ */
  function butir(B, opsi, namaFile) {
    return muat().then(function (ExcelJS) {
      var wb = bukuBaru(ExcelJS, 'Analisis Butir Soal');
      var ws = sheetBaru(wb, 'Analisis Butir', B.setting);
      var p = B.paket, huruf = ['A', 'B', 'C', 'D', 'E'];
      var desimal = '0.00';
      var k = [
        { h: 'No', w: 5, al: 'center', v: function (d, i) { return i + 1; } },
        { h: 'Jenis', w: 7, al: 'center', v: function (d) { return d.t === 'PG' ? 'PG' : 'Essay'; } },
        { h: 'No Soal', w: 6, al: 'center', v: function (d) { return d.no; } },
        { h: 'TP', w: 8, al: 'center', v: function (d) { return d.tp || '-'; } },
        { h: 'Cuplikan Soal', w: 40, wrap: true, v: function (d) { return d.teks; } },
        { h: 'Kunci', w: 6, al: 'center', v: function (d) { return d.t === 'PG' ? d.kunci : '-'; } }
      ];
      huruf.forEach(function (hf) {
        k.push({ h: hf, w: 5, al: 'center', v: function (d) { return d.t === 'PG' && d.opsi.indexOf(hf) >= 0 ? d.dist[hf] || 0 : null; },
          gaya: function (d) {
            if (d.t !== 'PG' || d.opsi.indexOf(hf) < 0) return null;
            if (hf === d.kunci) return { font: { bold: true, color: { argb: W.hijau } }, fill: W.hijauBg };
            if (d.pengecohMati.indexOf(hf) >= 0) return { font: { color: { argb: W.kuning } }, fill: W.kuningBg };
            return null;
          } });
      });
      k.push(
        { h: 'Kosong', w: 7, al: 'center', v: function (d) { return d.t === 'PG' ? d.kosong : null; } },
        { h: 'Benar / Rata-rata Skor', w: 11, al: 'center', v: function (d) { return d.t === 'PG' ? d.benar + ' dari ' + d.n : (d.rataSkor == null ? '-' : String(d.rataSkor).replace('.', ',') + ' / ' + d.maks); } },
        { h: 'Tingkat Kesukaran (P)', w: 10, al: 'center', fmt: desimal, v: function (d) { return nol(d.p); } },
        { h: 'Kategori P', w: 9, al: 'center', v: function (d) { return d.kategoriP; } },
        { h: 'Daya Pembeda (D)', w: 10, al: 'center', fmt: desimal, v: function (d) { return nol(d.d); }, gaya: function (d) { return d.d != null && d.d < 0.2 ? { font: { bold: true, color: { argb: W.merah } } } : null; } },
        { h: 'Kategori D', w: 11, al: 'center', v: function (d) { return d.kategoriD; } },
        { h: 'Pengecoh Berfungsi', w: 10, al: 'center', v: function (d) { return d.t === 'PG' ? d.pengecohBerfungsi + ' dari ' + d.pengecohTotal : '-'; } },
        { h: 'Kesimpulan', w: 14, al: 'center', v: function (d) { return d.kesimpulan; }, gaya: gayaKet }
      );
      var r = kop(ws, k.length, B.setting, 'ANALISIS BUTIR SOAL', p.nama + ' · ' + (p.mapel || '-') + (B.setting.TAHUN_PELAJARAN ? ' · Tahun Pelajaran ' + B.setting.TAHUN_PELAJARAN : ''), [
        ['Ujian', p.nama + ' (' + p.id + ')'], ['Mata Pelajaran', p.mapel || '-'], ['Filter', B.label],
        ['Jumlah peserta', B.N + ' siswa · kelompok atas & bawah masing-masing ' + B.n + ' siswa (27%)'],
        ['Nilai', 'rata-rata ' + (B.rata == null ? '-' : String(B.rata).replace('.', ',')) + ' · tertinggi ' + (B.maks == null ? '-' : B.maks) + ' · terendah ' + (B.min == null ? '-' : B.min)],
        ['Reliabilitas KR-20 (PG)', B.kr20 == null ? '-' : B.kr20.toFixed(2).replace('.', ',') + ' (' + B.ketKR20 + ')'],
        ['Dicetak', teksTanggal(B.dibuat)]
      ]);
      var t = tabel(ws, r, k, B.butir, { tinggiHead: 46 });
      ws.views = [{ state: 'frozen', ySplit: r }];
      ws.pageSetup.printTitlesRow = r + ':' + r;
      r = t.akhir + 2;
      r = judulBagian(ws, r, k.length, 'Ringkasan: ' + B.ringkas.mudah + ' mudah · ' + B.ringkas.sedang + ' sedang · ' + B.ringkas.sukar + ' sukar  |  ' +
        B.ringkas.diterima + ' diterima · ' + B.ringkas.direvisi + ' direvisi · ' + B.ringkas.ditolak + ' ditolak/diganti');
      r = catatan(ws, r + 1, k.length, 'Tingkat kesukaran (P) = proporsi siswa menjawab benar (essay: rata-rata skor ÷ skor maksimal). P ≤ 0,30 sukar; 0,31–0,70 sedang; > 0,70 mudah.');
      r = catatan(ws, r, k.length, 'Daya pembeda (D) = P kelompok atas − P kelompok bawah (27% skor total tertinggi & terendah). D ≥ 0,40 sangat baik; 0,30–0,39 baik; 0,20–0,29 cukup (perlu revisi); < 0,20 jelek; negatif = soal bermasalah.');
      r = catatan(ws, r, k.length, 'Pengecoh berfungsi bila dipilih ≥ 5% peserta (sel kuning = pengecoh tidak berfungsi; sel hijau = kunci). KR-20 ≥ 0,70 menunjukkan soal PG reliabel.');
      if (B.N < 20) catatan(ws, r, k.length, 'Catatan: jumlah peserta kurang dari 20, hasil analisis butir sebaiknya ditafsirkan dengan hati-hati.', { color: { argb: W.kuning } });
      return unduh(wb, namaFile);
    });
  }

  window.Ekspor = { muat: muat, hasil: hasil, tp: tp, butir: butir };
})();
