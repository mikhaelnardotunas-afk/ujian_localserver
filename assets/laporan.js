/* =========================================================
   Pembuat laporan PDF (dicetak lewat browser → Simpan sebagai PDF)
   ========================================================= */
(function () {
  'use strict';
  var esc = function (s) { return window.UE.esc(s); };
  var rich = function (s) { return window.UE.rich(s); };
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function tglIndo(iso) {
    var d = iso ? new Date(iso + 'T00:00:00') : new Date();
    return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }
  function waktu(ms) {
    if (!ms) return '-';
    var d = new Date(ms);
    return d.getDate() + ' ' + BULAN[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear() + ', ' +
      ('0' + d.getHours()).slice(-2) + '.' + ('0' + d.getMinutes()).slice(-2);
  }
  function angka(v) { return v == null || v === '' ? '-' : String(Math.round(v * 10) / 10).replace('.', ','); }
  function rata(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null; }
  function ket(nilai, kkm) { return nilai == null ? '' : (nilai >= kkm ? 'Tuntas' : 'Belum tuntas'); }

  var CSS = [
    '@page{size:A4 portrait;margin:14mm 14mm 16mm}',
    '*{box-sizing:border-box}',
    'body{font-family:"Times New Roman",Georgia,serif;font-size:11.5pt;color:#000;margin:0;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.wrap{max-width:190mm;margin:0 auto;padding:10mm 0}',
    '.kop{display:flex;align-items:center;gap:14px;border-bottom:3px double #000;padding-bottom:8px;margin-bottom:14px}',
    '.kop img{width:58px;height:58px}',
    '.kop .t{flex:1;text-align:center}',
    '.kop .s{font-size:15pt;font-weight:bold;letter-spacing:.5px}',
    '.kop .j{font-size:13pt;font-weight:bold;margin-top:2px}',
    '.kop .x{font-size:10.5pt}',
    'table{width:100%;border-collapse:collapse;margin:8px 0 12px}',
    'th,td{border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:left}',
    'th{background:#e9e9e9;text-align:center;font-weight:bold}',
    'td.c{text-align:center}td.r{text-align:right}',
    'table.info td{border:none;padding:2px 6px}table.info td:first-child{width:150px}',
    'tr{break-inside:avoid}',
    '.ringkas{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0 12px}',
    '.ringkas div{border:1px solid #000;padding:6px;text-align:center}',
    '.ringkas b{display:block;font-size:15pt}',
    '.bar{display:inline-block;height:10px;background:#555;vertical-align:middle}',
    '.belum{color:#b00000;font-weight:bold}.tuntas{color:#006400;font-weight:bold}',
    '.soal{margin:4px 0}.box{border:1px solid #999;padding:6px 8px;margin:3px 0 8px;min-height:24px}',
    '.lbl{font-size:9.5pt;font-weight:bold;text-transform:none;color:#333}',
    '.essay{border:1px solid #000;padding:8px;margin:8px 0;break-inside:avoid}',
    '.ttd{display:flex;justify-content:space-between;margin-top:24px;break-inside:avoid}',
    '.ttd div{width:45%;text-align:center}.ttd .nm{margin-top:62px;font-weight:bold;text-decoration:underline}',
    '.halaman{break-before:page}',
    '.kecil{font-size:9.5pt;color:#333}',
    '.legend td{border:none;padding:1px 6px;font-size:10pt}',
    'mjx-container{font-size:100%!important}',
    'table.rapat{font-size:9.5pt}table.rapat th,table.rapat td{padding:3px 4px}table.rapat th{font-size:9pt}',
    '.ringkas.lima{grid-template-columns:repeat(5,1fr)}',
    '.sub-judul{font-weight:bold;margin:12px 0 2px}',
    '.kunci-sel{background:#dff0d8;font-weight:bold}.mati{background:#fcf3dc;color:#7a4b00}',
    '.alat{position:sticky;top:0;background:#14284b;color:#fff;padding:10px 14px;display:flex;gap:10px;align-items:center;font-family:sans-serif;z-index:5}',
    '.alat button{font:bold 15px sans-serif;padding:10px 18px;border-radius:10px;border:0;cursor:pointer;background:#ffcb2b;color:#3a2310}',
    '.alat span{flex:1;font-size:13px}',
    '@media print{.alat{display:none}.wrap{padding:0;max-width:none}}',
    '@media screen{body{background:#ddd}.wrap{background:#fff;padding:12mm;margin:12px auto;box-shadow:0 2px 10px rgba(0,0,0,.2)}}'
  ].join('\n');

  function kop(o, data, judul, sub) {
    var s = data.setting || {};
    var logo = s.LOGO_URL || new URL('assets/icon-192.png', location.href).href;
    return '<div class="kop"><img src="' + logo + '" alt=""><div class="t"><div class="s">' + esc(s.NAMA_SEKOLAH || '') + '</div>' +
      '<div class="j">' + esc(judul) + '</div><div class="x">' + esc(sub || '') + (o.tp ? ' · Tahun Pelajaran ' + esc(o.tp) : '') + '</div></div>' +
      '<img src="' + logo + '" alt="" style="visibility:hidden"></div>';
  }
  function ttd(o, hanyaGuru) {
    if (!o.ttd) return '';
    var guru = '<div>' + (hanyaGuru ? esc(o.kota || '') + ', ' + tglIndo(o.tanggal) + '<br>' : '<br>') + 'Guru Mata Pelajaran<div class="nm">' + esc(o.guru || '') + '</div>NIP. ' + esc(o.nipGuru || '-') + '</div>';
    var kepsek = '<div>Mengetahui,<br>Kepala Sekolah<div class="nm">' + esc(o.kepsek || '') + '</div>NIP. ' + esc(o.nipKepsek || '-') + '</div>';
    if (hanyaGuru) return '<div class="ttd"><div></div>' + guru + '</div>';
    return '<p style="text-align:right;margin:18px 0 0">' + esc(o.kota || '') + ', ' + tglIndo(o.tanggal) + '</p><div class="ttd">' + kepsek + guru + '</div>';
  }
  function urutkan(rows, cara) {
    return rows.sort(function (a, b) {
      if (cara === 'nilai') return (b.nilai == null ? -1 : b.nilai) - (a.nilai == null ? -1 : a.nilai) || a.n.localeCompare(b.n);
      if (cara === 'nama') return a.n.localeCompare(b.n);
      return a.k.localeCompare(b.k) || a.n.localeCompare(b.n);
    });
  }

  /* ---------- 1. Rekap satu ujian ---------- */
  function rekap(o, d) {
    var p = d.paket, hmap = {};
    d.hasil.forEach(function (h) { hmap[h.u] = h; });
    var rows = d.users.map(function (u) { var h = hmap[u.u]; return { n: u.n, u: u.u, k: u.k, h: h, nilai: h ? h.nilai : null }; });
    if (!o.belum) rows = rows.filter(function (r) { return r.h; });
    urutkan(rows, o.urut);
    var nilai = rows.filter(function (r) { return r.nilai != null; }).map(function (r) { return r.nilai; });
    var tuntas = nilai.filter(function (v) { return v >= o.kkm; }).length;
    var peserta = rows.filter(function (r) { return r.h; }).length;
    var kelasTeks = o.kelas || p.kelas.join(', ');

    var html = kop(o, d, 'REKAP NILAI ' + p.nama.toUpperCase(), p.mapel + ' · Kelas ' + kelasTeks) +
      '<table class="info"><tr><td>Mata pelajaran</td><td>: ' + esc(p.mapel) + '</td><td>Jumlah soal</td><td>: ' +
      [d.jumlahPG ? d.jumlahPG + ' PG' : '', d.jumlahES ? d.jumlahES + ' essay' : ''].filter(String).join(' + ') + '</td></tr>' +
      '<tr><td>Kelas</td><td>: ' + esc(kelasTeks) + '</td><td>KKM</td><td>: ' + o.kkm + '</td></tr></table>' +
      '<div class="ringkas"><div>Peserta<b>' + peserta + ' / ' + d.users.length + '</b></div><div>Rata-rata<b>' + angka(rata(nilai)) + '</b></div>' +
      '<div>Tertinggi / Terendah<b>' + (nilai.length ? angka(Math.max.apply(null, nilai)) + ' / ' + angka(Math.min.apply(null, nilai)) : '-') + '</b></div>' +
      '<div>Tuntas<b>' + tuntas + (nilai.length ? ' (' + Math.round(tuntas / nilai.length * 100) + '%)' : '') + '</b></div></div>';

    html += '<table><thead><tr><th style="width:34px">No</th>' + (o.urut === 'nilai' ? '<th style="width:44px">Rank</th>' : '') +
      '<th>Nama siswa</th><th style="width:70px">Kelas</th>' + (d.jumlahPG ? '<th style="width:56px">PG</th>' : '') + (d.jumlahES ? '<th style="width:56px">Essay</th>' : '') +
      '<th style="width:60px">Nilai</th><th style="width:105px">Keterangan</th><th style="width:60px">Keluar app</th></tr></thead><tbody>';
    var rank = 0;
    rows.forEach(function (r, i) {
      var h = r.h, k;
      if (!h) k = '<span class="belum">Tidak ikut</span>';
      else if (r.nilai == null) k = 'Menunggu nilai';
      else k = r.nilai >= o.kkm ? '<span class="tuntas">Tuntas</span>' : '<span class="belum">Belum tuntas</span>';
      if (r.nilai != null) rank++;
      html += '<tr><td class="c">' + (i + 1) + '</td>' + (o.urut === 'nilai' ? '<td class="c">' + (r.nilai != null ? rank : '-') + '</td>' : '') +
        '<td>' + esc(r.n) + '</td><td class="c">' + esc(r.k) + '</td>' +
        (d.jumlahPG ? '<td class="c">' + (h ? angka(h.pg) : '-') + '</td>' : '') + (d.jumlahES ? '<td class="c">' + (h ? angka(h.es) : '-') + '</td>' : '') +
        '<td class="c"><b>' + angka(r.nilai) + '</b></td><td class="c">' + k + '</td><td class="c">' + (h ? h.pel : '-') + '</td></tr>';
    });
    html += '</tbody></table>';

    if (nilai.length) {
      var rentang = [[85, 100, 'Sangat baik (85–100)'], [70, 84.99, 'Baik (70–84)'], [50, 69.99, 'Cukup (50–69)'], [0, 49.99, 'Perlu bimbingan (0–49)']];
      html += '<table style="width:70%"><thead><tr><th>Rentang nilai</th><th style="width:60px">Jumlah</th><th>Grafik</th></tr></thead><tbody>' +
        rentang.map(function (r) {
          var n = nilai.filter(function (v) { return v >= r[0] && v <= r[1]; }).length;
          return '<tr><td>' + r[2] + '</td><td class="c">' + n + '</td><td><span class="bar" style="width:' + Math.round(n / nilai.length * 100) + '%"></span></td></tr>';
        }).join('') + '</tbody></table>';
    }
    return html + ttd(o, false);
  }

  /* ---------- 2. Lembar jawaban per siswa ---------- */
  function detail(o, d) {
    var p = d.paket, umap = {};
    d.users.forEach(function (u) { umap[u.u] = u; });
    var list = d.hasil.slice().sort(function (a, b) { return a.k.localeCompare(b.k) || a.n.localeCompare(b.n); });
    if (!list.length) return kop(o, d, 'LEMBAR JAWABAN', p.nama) + '<p>Belum ada jawaban terkirim untuk pilihan ini.</p>';
    return list.map(function (h, idx) {
      var items = d.detail[h.id] || [];
      var pg = items.filter(function (i) { return i.tipe === 'PG'; }), es = items.filter(function (i) { return i.tipe !== 'PG'; });
      var dur = h.selesai && h.mulai ? Math.round((h.selesai - h.mulai) / 60000) + ' menit' : '-';
      var s = '<div class="' + (idx ? 'halaman' : '') + '">' + kop(o, d, 'LEMBAR JAWABAN DAN NILAI', p.nama + ' · ' + p.mapel) +
        '<table class="info"><tr><td>Nama</td><td>: <b>' + esc(h.n) + '</b></td><td>Kelas</td><td>: ' + esc(h.k) + '</td></tr>' +
        '<tr><td>Username</td><td>: ' + esc(h.u) + '</td><td>Dikirim</td><td>: ' + waktu(h.t) + '</td></tr>' +
        '<tr><td>Lama mengerjakan</td><td>: ' + dur + '</td><td>Keluar aplikasi</td><td>: ' + h.pel + ' kali</td></tr></table>' +
        '<div class="ringkas">' + (pg.length ? '<div>Skor PG<b>' + angka(h.pg) + '</b></div>' : '') + (es.length ? '<div>Skor essay<b>' + angka(h.es) + '</b></div>' : '') +
        '<div>Nilai<b>' + angka(h.nilai) + '</b></div><div>Keterangan<b style="font-size:12pt">' + (h.nilai == null ? 'Menunggu' : ket(h.nilai, o.kkm)) + '</b></div></div>';
      if (pg.length) {
        var benar = pg.filter(function (i) { return i.akhir > 0; }).length;
        s += '<p><b>A. Pilihan ganda</b> — ' + benar + ' benar dari ' + pg.length + ' soal</p><table><thead><tr><th style="width:34px">No</th>' +
          (o.teksSoal ? '<th>Soal</th>' : '') + '<th style="width:' + (o.teksSoal ? '120' : '200') + 'px">Jawaban</th>' + (o.kunci ? '<th style="width:54px">Kunci</th>' : '') +
          '<th style="width:54px">Hasil</th><th style="width:50px">Skor</th></tr></thead><tbody>' +
          pg.map(function (i) {
            var op = (i.opsi || []).filter(function (x) { return x.k === i.jawaban; })[0];
            return '<tr><td class="c">' + i.no + '</td>' + (o.teksSoal ? '<td>' + rich(i.soal) + '</td>' : '') +
              '<td>' + (i.jawaban ? '<b>' + esc(i.jawaban) + '.</b> ' + (op ? rich(op.t) : '') : '<i>Tidak dijawab</i>') + '</td>' +
              (o.kunci ? '<td class="c">' + esc(i.kunci) + '</td>' : '') + '<td class="c">' + (i.akhir > 0 ? '✔' : '✘') + '</td><td class="c">' + angka(i.akhir) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      if (es.length) {
        s += '<p><b>' + (pg.length ? 'B. ' : '') + 'Essay</b></p>' + es.map(function (i) {
          return '<div class="essay"><b>Soal ' + i.no + '</b> <span class="kecil">(skor ' + angka(i.akhir) + ' / ' + i.maks + (i.guru != null ? ', dikoreksi guru' : '') + ')</span>' +
            (o.teksSoal ? '<div class="soal">' + rich(i.soal) + '</div>' : '') +
            '<div class="lbl">Jawaban siswa</div><div class="box">' + (i.jawaban ? rich(i.jawaban) : '<i>Tidak dijawab</i>') + '</div>' +
            (o.kunci && i.pedoman ? '<div class="lbl">Pedoman jawaban</div><div class="box">' + rich(i.pedoman) + '</div>' : '') +
            (i.feedback ? '<div class="lbl">Umpan balik</div><div class="box">' + esc(i.feedback) + '</div>' : '') + '</div>';
        }).join('');
      }
      return s + ttd(o, true) + '</div>';
    }).join('');
  }

  /* ---------- 3/4. Matriks nilai (per kelas / per mapel) ---------- */
  function matriks(o, d, judul, sub) {
    var hmap = {};
    d.hasil.forEach(function (h) { hmap[h.paket + '|' + h.u] = h; });
    var pk = d.pakets;
    if (!pk.length) return kop(o, d, judul, sub) + '<p>Tidak ada ujian untuk pilihan ini.</p>';
    var rows = d.users.map(function (u) {
      var vals = pk.map(function (p) { var h = hmap[p.id + '|' + u.u]; return h ? h.nilai : undefined; });
      var ada = vals.filter(function (v) { return v != null; });
      return { n: u.n, u: u.u, k: u.k, vals: vals, nilai: ada.length ? rata(ada) : null };
    });
    urutkan(rows, o.urut);
    var html = kop(o, d, judul, sub) + '<table class="legend">' + pk.map(function (p, i) {
      return '<tr><td><b>U' + (i + 1) + '</b></td><td>' + esc(p.nama) + '</td><td>' + esc(p.mapel) + '</td></tr>';
    }).join('') + '</table>' +
      '<table><thead><tr><th style="width:30px">No</th><th>Nama siswa</th><th style="width:62px">Kelas</th>' +
      pk.map(function (p, i) { return '<th>U' + (i + 1) + '</th>'; }).join('') + '<th>Rata-rata</th><th>Ket.</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(r.n) + '</td><td class="c">' + esc(r.k) + '</td>' +
          r.vals.map(function (v) { return '<td class="c' + (v != null && v < o.kkm ? ' belum' : '') + '">' + (v === undefined ? '-' : v == null ? '…' : angka(v)) + '</td>'; }).join('') +
          '<td class="c"><b>' + angka(r.nilai) + '</b></td><td class="c">' + (r.nilai == null ? '-' : ket(r.nilai, o.kkm)) + '</td></tr>';
      }).join('') +
      '<tr><th colspan="3" style="text-align:right">Rata-rata ujian</th>' + pk.map(function (p, j) {
        return '<th>' + angka(rata(rows.map(function (r) { return r.vals[j]; }).filter(function (v) { return v != null; }))) + '</th>';
      }).join('') + '<th>' + angka(rata(rows.map(function (r) { return r.nilai; }).filter(function (v) { return v != null; }))) + '</th><th></th></tr>' +
      '</tbody></table><p class="kecil">Keterangan: "-" tidak ikut / belum mengirim · "…" menunggu penilaian · angka merah di bawah KKM (' + o.kkm + ').</p>';
    return html + ttd(o, false);
  }

  /* ---------- 5. Riwayat satu siswa ---------- */
  function riwayat(o, d) {
    var u = d.users[0];
    if (!u) return '<p>Siswa tidak ditemukan.</p>';
    var hmap = {};
    d.hasil.forEach(function (h) { hmap[h.paket] = h; });
    var nilai = [];
    var html = kop(o, d, 'RIWAYAT NILAI SISWA', u.n + ' · Kelas ' + u.k) +
      '<table class="info"><tr><td>Nama</td><td>: <b>' + esc(u.n) + '</b></td></tr><tr><td>Kelas</td><td>: ' + esc(u.k) + '</td></tr>' +
      '<tr><td>Username</td><td>: ' + esc(u.u) + '</td></tr></table>' +
      '<table><thead><tr><th style="width:34px">No</th><th>Ujian</th><th>Mata pelajaran</th><th>Dikirim</th><th style="width:60px">Nilai</th><th style="width:105px">Keterangan</th></tr></thead><tbody>' +
      d.pakets.map(function (p, i) {
        var h = hmap[p.id];
        if (h && h.nilai != null) nilai.push(h.nilai);
        return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(p.nama) + '</td><td>' + esc(p.mapel) + '</td><td>' + (h ? waktu(h.t) : '-') + '</td>' +
          '<td class="c"><b>' + (h ? angka(h.nilai) : '-') + '</b></td><td class="c">' + (!h ? '<span class="belum">Tidak ikut</span>' : h.nilai == null ? 'Menunggu' : ket(h.nilai, o.kkm)) + '</td></tr>';
      }).join('') + '<tr><th colspan="4" style="text-align:right">Rata-rata</th><th>' + angka(rata(nilai)) + '</th><th></th></tr></tbody></table>';
    return html + ttd(o, false);
  }

  function tulis(w, o, d) {
    var isi, judulTab, landscape = false;
    if (o.jenis === 'rekap') { isi = rekap(o, d); judulTab = 'Rekap ' + d.paket.nama; }
    else if (o.jenis === 'detail') { isi = detail(o, d); judulTab = 'Lembar jawaban ' + d.paket.nama; }
    else if (o.jenis === 'kelas') { isi = matriks(o, d, 'REKAP NILAI KELAS ' + o.kelas, (o.mapel ? o.mapel + ' · ' : 'Semua mata pelajaran · ') + 'Kelas ' + o.kelas); judulTab = 'Rekap kelas ' + o.kelas; landscape = d.pakets.length > 6; }
    else if (o.jenis === 'mapel') { isi = matriks(o, d, 'REKAP NILAI ' + (o.mapel || 'SEMUA MAPEL').toUpperCase(), (o.kelas ? 'Kelas ' + o.kelas : 'Semua kelas')); judulTab = 'Rekap ' + (o.mapel || 'mapel'); landscape = d.pakets.length > 6; }
    else { isi = riwayat(o, d); judulTab = 'Riwayat ' + (d.users[0] ? d.users[0].n : ''); }

    dokumen(w, judulTab, isi, { landscape: landscape, mathjax: o.jenis === 'detail' });
  }

  /** Tulis dokumen laporan lengkap ke tab baru */
  function dokumen(w, judulTab, isi, opt) {
    var css = CSS + (opt.landscape ? '\n@page{size:A4 landscape}.wrap{max-width:277mm}' : '');
    var mathjax = opt.mathjax ?
      '<script>window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]]},svg:{fontCache:"global"},startup:{pageReady:function(){return MathJax.startup.defaultPageReady().then(function(){document.getElementById("st").textContent="Siap dicetak."})}}};<\/script>' +
      '<script async src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"><\/script>' : '';
    var doc = '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(judulTab) + '</title><style>' + css + '</style>' + mathjax + '</head><body>' +
      '<div class="alat"><button onclick="window.print()">🖨️ Cetak / Simpan PDF</button><span id="st">' + (opt.mathjax ? 'Merapikan rumus…' : 'Siap dicetak.') +
      ' Di jendela cetak pilih tujuan "Simpan sebagai PDF"' + (opt.landscape ? ' (kertas A4 mendatar)' : '') + '.</span></div><div class="wrap">' + isi +
      '<p class="kecil" style="margin-top:18px;text-align:right">Dicetak ' + waktu(Date.now()) + ' · Petualangan Ujian</p></div></body></html>';
    w.document.open();
    w.document.write(doc);
    w.document.close();
  }

  function persen(v) { return v == null ? '-' : angka(v) + '%'; }
  function kelasKet(v) { return v === 'Tuntas' || v === 'Tercapai' || v === 'Diterima' ? 'tuntas' : (v === 'Belum tuntas' || v === 'Belum tercapai' || v === 'Ditolak / diganti' || v === 'Tidak ikut') ? 'belum' : ''; }
  function infoBaris(pasangan) {
    var html = '<table class="info">';
    for (var i = 0; i < pasangan.length; i += 2) {
      html += '<tr><td>' + esc(pasangan[i][0]) + '</td><td>: ' + pasangan[i][1] + '</td>' +
        (pasangan[i + 1] ? '<td>' + esc(pasangan[i + 1][0]) + '</td><td>: ' + pasangan[i + 1][1] + '</td>' : '<td></td><td></td>') + '</tr>';
    }
    return html + '</table>';
  }
  function jumlahSoal(p) {
    var pg = p.soal.filter(function (s) { return s.t === 'PG'; }).length, es = p.soal.length - pg;
    return [pg ? pg + ' PG' : '', es ? es + ' essay' : ''].filter(String).join(' + ') + ' (skor maks ' + p._skorMaks + ')';
  }

  /* ---------- 6. Rekap hasil per mapel & kelas (menu Rekap & Export) ---------- */
  function rekapHasil(w, o, R) {
    var T = window.Rekap.teksTP;
    var isi = R.grup.map(function (g, gi) {
      var p = g.paket, s = g.stat;
      var tpKolom = o.perTP && g.tp.length <= 10 ? g.tp : [];
      var html = '<div class="' + (gi ? 'halaman' : '') + '">' +
        kop(o, R, o.remedial ? 'DAFTAR SISWA BELUM TUNTAS (REMEDIAL)' : 'REKAP HASIL UJIAN', (p.mapel || '-') + ' · Kelas ' + g.kelas) +
        infoBaris([['Mata pelajaran', esc(p.mapel || '-')], ['Kelas', esc(g.kelas)], ['Nama ujian', esc(p.nama)], ['KKM', o.kkm],
          ['Jumlah soal', jumlahSoal(p)], ['Peserta', s.peserta + ' dari ' + s.siswa + ' siswa']]) +
        '<div class="ringkas lima"><div>Rata-rata<b>' + angka(s.rata) + '</b></div><div>Tertinggi<b>' + angka(s.maks) + '</b></div>' +
        '<div>Terendah<b>' + angka(s.min) + '</b></div><div>Tuntas<b>' + s.tuntas + (s.persen != null ? ' (' + angka(s.persen) + '%)' : '') + '</b></div>' +
        '<div>Belum tuntas<b>' + s.belum + '</b></div></div>';
      html += '<table class="rapat"><thead><tr><th style="width:26px">No</th><th>Nama siswa</th><th style="width:40px">Benar</th><th style="width:40px">Salah</th>' +
        '<th style="width:50px">Tidak terjawab</th>' + (g.adaMenunggu ? '<th style="width:46px">Belum dinilai</th>' : '') +
        '<th style="width:40px">Nilai</th><th style="width:70px">Predikat</th><th style="width:70px">Ketuntasan</th><th style="width:34px">Rank</th>' +
        '<th>TP tertinggi</th><th>TP terendah</th>' + tpKolom.map(function (t) { return '<th style="width:38px">' + esc(t.kode) + '</th>'; }).join('') + '</tr></thead><tbody>';
      html += g.rows.map(function (r, i) {
        var ada = !!r.h;
        return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(r.n) + '</td>' +
          '<td class="c">' + (ada ? r.benar : '-') + '</td><td class="c">' + (ada ? r.salah : '-') + '</td><td class="c">' + (ada ? r.kosong : '-') + '</td>' +
          (g.adaMenunggu ? '<td class="c">' + (ada ? r.menunggu : '-') + '</td>' : '') +
          '<td class="c' + (r.nilai != null && r.nilai < o.kkm ? ' belum' : '') + '"><b>' + angka(r.nilai) + '</b></td>' +
          '<td class="c">' + esc(r.predikat || '-') + '</td><td class="c"><span class="' + kelasKet(r.ket) + '">' + esc(r.ket) + '</span></td>' +
          '<td class="c">' + (r.rank || '-') + '</td><td>' + (ada ? esc(T(r.tpTinggi, false)) : '-') + '</td><td>' + (ada ? esc(T(r.tpRendah, false)) : '-') + '</td>' +
          tpKolom.map(function (t) { var v = r.tpPct ? r.tpPct[t.kode] : null; return '<td class="c' + (v != null && v < o.kkm ? ' belum' : '') + '">' + (v == null ? '-' : angka(v)) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
      if (g.tp.length) {
        html += '<p class="sub-judul">Keterangan &amp; ketercapaian Tujuan Pembelajaran (rata-rata kelas)</p>' +
          '<table class="rapat"><thead><tr><th style="width:48px">Kode</th><th>Tujuan Pembelajaran</th><th style="width:70px">Rata-rata</th><th style="width:80px">Siswa ≥ KKM</th><th style="width:90px">Status</th></tr></thead><tbody>' +
          g.tp.map(function (t) {
            return '<tr><td class="c"><b>' + esc(t.kode) + '</b></td><td>' + esc(t.teks) + '</td><td class="c' + (t.rata != null && t.rata < o.kkm ? ' belum' : '') + '">' + persen(t.rata) + '</td>' +
              '<td class="c">' + (t.n ? t.tercapai + ' / ' + t.n : '-') + '</td><td class="c"><span class="' + kelasKet(t.status) + '">' + esc(t.status) + '</span></td></tr>';
          }).join('') + '</tbody></table>';
      }
      html += '<p class="kecil">Keterangan: benar/salah pilihan ganda sesuai kunci (atau koreksi guru); essay dihitung benar bila skor ≥ ' + R.batas + '% skor maksimal. ' +
        'Pencapaian TP = skor pada soal-soal TP tersebut ÷ skor maksimalnya × 100. Predikat: Sangat Baik ≥ 85, Baik 70–84, Cukup 50–69, Perlu Bimbingan &lt; 50.' +
        (g.adaMenunggu ? ' <b>Masih ada essay yang belum dinilai; nilai siswa tersebut belum final.</b>' : '') + '</p>';
      return html + ttd(o, false) + '</div>';
    }).join('');
    dokumen(w, (o.remedial ? 'Daftar remedial — ' : 'Rekap hasil — ') + (R.label || ''), isi, { landscape: true });
  }

  /* ---------- 7. Daftar Tujuan Pembelajaran per mapel ---------- */
  function daftarTP(w, o, T) {
    var isi = T.mapel.map(function (m, mi) {
      var html = '<div class="' + (mi ? 'halaman' : '') + '">' + kop(o, T, 'DAFTAR TUJUAN PEMBELAJARAN', 'Mata Pelajaran ' + m.mapel) +
        infoBaris([['Mata pelajaran', esc(m.mapel)], ['Jumlah TP', m.list.length + ' TP'], ['Ujian', esc(m.pakets.map(function (p) { return p.nama; }).join('; '))],
          ['Jumlah soal', m.jumlahSoal + ' soal' + (m.tanpaTP ? ' <span class="belum">(' + m.tanpaTP + ' belum ber-TP)</span>' : '')]].concat(T.analisis ? [['Kelas', esc(T.label.split(' · ')[0])], ['KKM', o.kkm]] : []));
      html += '<table class="rapat"><thead><tr><th style="width:26px">No</th><th style="width:52px">Kode</th><th>Tujuan Pembelajaran</th><th style="width:22%">Ujian &amp; nomor soal</th>' +
        '<th style="width:44px">Jml soal</th><th style="width:44px">Bobot</th>' +
        (T.analisis ? '<th style="width:62px">Rata-rata</th><th style="width:62px">Siswa ≥ KKM</th><th style="width:84px">Status</th>' : '') + '</tr></thead><tbody>' +
        m.list.map(function (t, i) {
          return '<tr><td class="c">' + (i + 1) + '</td><td class="c"><b>' + esc(t.kode) + '</b></td><td>' + esc(t.teks) + '</td>' +
            '<td>' + (t.pakai.length > 1 ? '' : esc(t.ujian) + '<br>') + '<span class="kecil">' + esc(t.nomor) + '</span></td>' +
            '<td class="c">' + t.jumlah + '</td><td class="c">' + angka(t.bobot) + '</td>' +
            (T.analisis ? '<td class="c' + (t.rata != null && t.rata < o.kkm ? ' belum' : '') + '">' + persen(t.rata) + '</td><td class="c">' + (t.n ? t.tercapai + ' / ' + t.n : '-') + '</td>' +
              '<td class="c"><span class="' + kelasKet(t.status) + '">' + esc(t.status) + '</span></td>' : '') + '</tr>';
        }).join('') + '</tbody></table>' +
        '<p class="kecil">Kode TP dibuat otomatis per mata pelajaran mengikuti urutan bank soal, atau diambil dari awalan teks (misalnya "TP 1.2: …").' +
        (T.analisis ? ' Ketercapaian = rata-rata skor siswa pada soal TP tersebut ÷ skor maksimalnya × 100; "Tercapai" bila ≥ KKM.' : '') + '</p>';
      return html + ttd(o, false) + '</div>';
    }).join('');
    dokumen(w, 'Daftar Tujuan Pembelajaran', isi, { landscape: !!T.analisis });
  }

  /* ---------- 8. Analisis butir soal ---------- */
  function analisisButir(w, o, B) {
    var p = B.paket, huruf = ['A', 'B', 'C', 'D', 'E'];
    var adaOpsi = huruf.filter(function (h) { return B.butir.some(function (b) { return b.t === 'PG' && b.opsi.indexOf(h) >= 0; }); });
    var desimal = function (v) { return v == null ? '-' : v.toFixed(2).replace('.', ','); };
    var html = kop(o, B, 'ANALISIS BUTIR SOAL', p.nama + ' · ' + (p.mapel || '-')) +
      infoBaris([['Ujian', esc(p.nama) + ' (' + esc(p.id) + ')'], ['Mata pelajaran', esc(p.mapel || '-')], ['Filter', esc(B.label)], ['Jumlah soal', jumlahSoal(p)],
        ['Peserta', B.N + ' siswa'], ['Kelompok atas/bawah', B.n + ' siswa (27%)']]) +
      '<div class="ringkas lima"><div>Rata-rata nilai<b>' + angka(B.rata) + '</b></div><div>KR-20 (PG)<b>' + desimal(B.kr20) + '</b><span class="kecil">' + esc(B.ketKR20) + '</span></div>' +
      '<div>Diterima<b>' + B.ringkas.diterima + '</b></div><div>Direvisi<b>' + B.ringkas.direvisi + '</b></div><div>Ditolak / diganti<b>' + B.ringkas.ditolak + '</b></div></div>';
    html += '<table class="rapat"><thead><tr><th style="width:24px">No</th><th style="width:44px">Soal</th><th style="width:40px">TP</th><th>Cuplikan soal</th><th style="width:34px">Kunci</th>' +
      adaOpsi.map(function (h) { return '<th style="width:26px">' + h + '</th>'; }).join('') + '<th style="width:36px">Kosong</th><th style="width:56px">Benar / rata-rata</th>' +
      '<th style="width:38px">P</th><th style="width:48px">Kategori</th><th style="width:38px">D</th><th style="width:58px">Kategori</th><th style="width:50px">Pengecoh berfungsi</th><th style="width:70px">Kesimpulan</th></tr></thead><tbody>' +
      B.butir.map(function (b, i) {
        var pg = b.t === 'PG';
        return '<tr><td class="c">' + (i + 1) + '</td><td class="c">' + (pg ? 'PG ' : 'Essay ') + b.no + '</td><td class="c">' + esc(b.tp || '-') + '</td>' +
          '<td>' + rich(b.teks) + '</td><td class="c">' + (pg ? esc(b.kunci) : '-') + '</td>' +
          adaOpsi.map(function (h) {
            if (!pg || b.opsi.indexOf(h) < 0) return '<td class="c">-</td>';
            return '<td class="c ' + (h === b.kunci ? 'kunci-sel' : b.pengecohMati.indexOf(h) >= 0 ? 'mati' : '') + '">' + (b.dist[h] || 0) + '</td>';
          }).join('') +
          '<td class="c">' + (pg ? b.kosong : '-') + '</td><td class="c">' + (pg ? b.benar + '/' + b.n : (b.rataSkor == null ? '-' : angka(b.rataSkor) + '/' + b.maks)) + '</td>' +
          '<td class="c">' + desimal(b.p) + '</td><td class="c">' + b.kategoriP + '</td>' +
          '<td class="c' + (b.d != null && b.d < 0.2 ? ' belum' : '') + '">' + desimal(b.d) + '</td><td class="c">' + b.kategoriD + '</td>' +
          '<td class="c">' + (pg ? b.pengecohBerfungsi + '/' + b.pengecohTotal : '-') + '</td><td class="c"><span class="' + kelasKet(b.kesimpulan) + '">' + esc(b.kesimpulan) + '</span></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="kecil">P (tingkat kesukaran) = proporsi siswa menjawab benar (essay: rata-rata skor ÷ skor maksimal): ≤ 0,30 sukar · 0,31–0,70 sedang · &gt; 0,70 mudah. ' +
      'D (daya pembeda) = P kelompok atas − P kelompok bawah: ≥ 0,40 sangat baik · 0,30–0,39 baik · 0,20–0,29 cukup (revisi) · &lt; 0,20 jelek. ' +
      'Pengecoh berfungsi bila dipilih ≥ 5% peserta (sel kuning = tidak berfungsi, sel hijau = kunci). KR-20 ≥ 0,70 = reliabel.' +
      (B.N < 20 ? ' <b>Peserta kurang dari 20 — tafsirkan hasil dengan hati-hati.</b>' : '') + '</p>';
    dokumen(w, 'Analisis butir — ' + p.nama, html + ttd(o, true), { landscape: true, mathjax: true });
  }

  /* ---------- Naskah soal (menu Ringkasan / Bank Soal) ---------- */
  function naskah(w, o, p, soal) {
    var pg = soal.filter(function (s) { return s.tipe === 'PG'; }), es = soal.filter(function (s) { return s.tipe !== 'PG'; });
    var gambar = function (s) { return s.gambar ? '<div><img src="' + esc(s.gambar) + '" alt="" style="max-width:70%;max-height:60mm;margin:4px 0"></div>' : ''; };
    var info = function (s) { return o.kunci ? '<div class="kecil">Skor ' + angka(s.skor) + (s.tp ? ' · TP: ' + esc(s.tp) : '') + '</div>' : ''; };
    var isi = kop(o, { setting: o.setting }, 'NASKAH SOAL', p.nama + (p.mapel ? ' · ' + p.mapel : '')) +
      '<table class="info"><tr><td>Mata pelajaran</td><td>: ' + esc(p.mapel || '-') + '</td></tr><tr><td>Kelas</td><td>: ' + esc(p.kelas.join(', ')) + '</td></tr>' +
      '<tr><td>Jumlah soal</td><td>: ' + [pg.length ? pg.length + ' pilihan ganda' : '', es.length ? es.length + ' essay' : ''].filter(String).join(' + ') + '</td></tr>' +
      (o.kunci ? '<tr><td>Keterangan</td><td>: Kunci jawaban ditandai warna; pedoman essay dicetak di bawah soal</td></tr>' : '') + '</table>';
    if (pg.length) {
      isi += '<div class="sub-judul">A. Pilihan Ganda</div><ol class="naskah">' + pg.map(function (s) {
        return '<li value="' + s.no + '"><div class="soal">' + rich(s.soal) + '</div>' + gambar(s) + '<ol type="A" class="opsi">' + s.opsi.map(function (x) {
          return '<li value="' + (x.k.charCodeAt(0) - 64) + '"' + (o.kunci && x.k === s.kunci ? ' class="kunci-sel"' : '') + '>' + rich(x.t) + '</li>';
        }).join('') + '</ol>' + info(s) + '</li>';
      }).join('') + '</ol>';
    }
    if (es.length) {
      isi += '<div class="sub-judul">' + (pg.length ? 'B. ' : '') + 'Essay</div><ol class="naskah">' + es.map(function (s) {
        return '<li value="' + s.no + '"><div class="soal">' + rich(s.soal) + '</div>' + gambar(s) +
          (o.kunci ? '<div class="lbl">Pedoman jawaban</div><div class="box">' + rich(s.pedoman || '-') + '</div>' : '') + info(s) + '</li>';
      }).join('') + '</ol>';
    }
    var css = '<style>ol.naskah{padding-left:24px}ol.naskah>li{margin:0 0 12px;break-inside:avoid}ol.opsi{margin:3px 0 0;padding-left:22px}ol.opsi li{padding:1px 4px}</style>';
    dokumen(w, 'Naskah ' + p.nama, css + isi, { mathjax: true });
  }

  window.Laporan = { tulis: tulis, rekapHasil: rekapHasil, daftarTP: daftarTP, analisisButir: analisisButir, naskah: naskah };
})();
