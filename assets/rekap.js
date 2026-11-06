/* =========================================================
   Perhitungan rekap hasil, Tujuan Pembelajaran (TP), dan analisis butir.
   Data berasal dari API guruRekap (Code.gs). Dipakai ekspor Excel & laporan PDF.
   ========================================================= */
(function () {
  'use strict';

  function r1(x) { return x == null ? null : Math.round(x * 10) / 10; }
  function r2(x) { return x == null ? null : Math.round(x * 100) / 100; }
  function rata(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; }
  function bandingNama(a, b) { return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' }); }
  function predikat(n) { return n == null ? '' : n >= 85 ? 'Sangat Baik' : n >= 70 ? 'Baik' : n >= 50 ? 'Cukup' : 'Perlu Bimbingan'; }
  function untukKelas(p, k) { return p.kelas.indexOf('SEMUA') >= 0 || p.kelas.indexOf(k) >= 0; }

  /** Lengkapi paket: peta soal per "PG-1"/"ES-1", daftar TP yang dipakai paket, teks TP */
  function siapkan(data) {
    if (data._siap) return data;
    data.pakets.forEach(function (p) {
      var key = (p.mapel || '').toUpperCase() || '-';
      var list = (data.tp && data.tp[key] ? data.tp[key].list : []) || [];
      var dipakai = {};
      p._soal = {};
      p.soal.forEach(function (s, i) {
        s.idx = i;
        p._soal[(s.t === 'PG' ? 'PG' : 'ES') + '-' + s.no] = s;
        if (s.tp) dipakai[s.tp] = 1;
      });
      p._tpTeks = {};
      list.forEach(function (t) { p._tpTeks[t.kode] = t.teks; });
      p._tp = list.filter(function (t) { return dipakai[t.kode]; });
      p._skorMaks = p.soal.reduce(function (s, x) { return s + (+x.maks || 0); }, 0);
    });
    data._siap = true;
    return data;
  }

  /**
   * Satu kiriman → jumlah benar/salah/kosong + pencapaian per TP.
   * PG benar = skor > 0 (sesuai kunci / koreksi guru). Essay benar = skor ≥ batas% skor maksimal.
   */
  function hitungKiriman(h, p, batas) {
    var o = { benar: 0, salah: 0, kosong: 0, menunggu: 0, jumlah: h.j.length, tpSkor: {}, tpPct: {}, butir: {} };
    h.j.forEach(function (x) {
      var es = x[0] === 1, akhir = x[2], maks = +x[3] || 0, kosong = !x[4];
      if (kosong) o.kosong++;
      else if (akhir == null) o.menunggu++;
      else if (es ? (maks > 0 && akhir >= batas / 100 * maks) : akhir > 0) o.benar++;
      else o.salah++;
      var s = p._soal[(es ? 'ES' : 'PG') + '-' + x[1]];
      if (!s) return;
      o.butir[s.idx] = { akhir: akhir, maks: maks, jw: x[4] };
      if (s.tp && akhir != null && maks > 0) {
        var t = o.tpSkor[s.tp] || (o.tpSkor[s.tp] = { skor: 0, maks: 0 });
        t.skor += akhir; t.maks += maks;
      }
    });
    Object.keys(o.tpSkor).forEach(function (k) { o.tpPct[k] = r1(o.tpSkor[k].skor / o.tpSkor[k].maks * 100); });
    var pilih = pilihTP(o, p);
    o.tpTinggi = pilih.tinggi; o.tpRendah = pilih.rendah;
    return o;
  }

  /** TP tertinggi & terendah. Seri → TP dengan bobot skor terbesar, lalu urutan kode. */
  function pilihTP(o, p) {
    var list = p._tp.filter(function (t) { return o.tpPct[t.kode] != null; }).map(function (t, i) {
      return { kode: t.kode, teks: t.teks, pct: o.tpPct[t.kode], bobot: o.tpSkor[t.kode].maks, urut: i };
    });
    if (!list.length) return { tinggi: null, rendah: null };
    var nilai = list.map(function (x) { return x.pct; });
    var maks = Math.max.apply(null, nilai), min = Math.min.apply(null, nilai);
    if (list.length === 1) return { tinggi: list[0], rendah: list[0] };
    if (maks === min) { var sama = { kode: 'Semua TP', teks: 'Pencapaian semua TP sama', pct: maks, semua: true }; return { tinggi: sama, rendah: sama }; }
    var urut = function (a, b) { return b.bobot - a.bobot || a.urut - b.urut; };
    return {
      tinggi: list.filter(function (x) { return x.pct === maks; }).sort(urut)[0],
      rendah: list.filter(function (x) { return x.pct === min; }).sort(urut)[0]
    };
  }

  /** Teks TP untuk sel: "TP2 (85%)" atau dengan rumusan "TP2 (85%) – Menjelaskan …" */
  function teksTP(t, panjang) {
    if (!t) return '-';
    var pct = String(t.pct).replace('.', ',') + '%';
    if (t.semua) return 'Semua TP sama (' + pct + ')';
    return t.kode + ' (' + pct + ')' + (panjang && t.teks ? ' – ' + t.teks : '');
  }

  /* ------------------------------------------------------------------
     1. Rekap hasil per kelas × ujian
     ------------------------------------------------------------------ */
  function hasil(data, opsi) {
    siapkan(data);
    var kkm = opsi.kkm, batas = opsi.batas || 50;
    var hmap = {}, grupMap = {};
    data.hasil.forEach(function (h) { hmap[h.paket + '|' + h.u] = h; });
    data.pakets.forEach(function (p) {
      data.users.forEach(function (u) {
        if (!untukKelas(p, u.k)) return;
        var key = u.k + '|' + p.id;
        var g = grupMap[key] || (grupMap[key] = { kelas: u.k, paket: p, rows: [] });
        var h = hmap[p.id + '|' + u.u] || null;
        var r = { u: u.u, n: u.n, k: u.k, mapel: p.mapel, ujian: p.nama, paket: p.id, h: h, nilai: null };
        if (h) {
          var o = hitungKiriman(h, p, batas);
          for (var key2 in o) r[key2] = o[key2];
          r.nilai = h.nilai; r.pg = h.pg; r.es = h.es; r.total = h.total; r.maks = h.maks; r.status = h.status; r.pel = h.pel;
          r.mulai = h.mulai; r.selesai = h.selesai; r.t = h.t;
          r.durasi = h.selesai && h.mulai && h.selesai > h.mulai ? Math.round((h.selesai - h.mulai) / 60000) : null;
        }
        r.predikat = predikat(r.nilai);
        r.ket = !h ? 'Tidak ikut' : r.nilai == null ? 'Menunggu nilai' : r.nilai >= kkm ? 'Tuntas' : 'Belum tuntas';
        g.rows.push(r);
      });
    });

    var grup = Object.keys(grupMap).map(function (k) { return grupMap[k]; }).filter(function (g) { return g.rows.some(function (r) { return r.h; }); });
    grup.forEach(function (g) {
      var dinilai = g.rows.filter(function (r) { return r.nilai != null; }).sort(function (a, b) { return b.nilai - a.nilai; });
      dinilai.forEach(function (r, i) { r.rank = i && r.nilai === dinilai[i - 1].nilai ? dinilai[i - 1].rank : i + 1; });
      var nilai = dinilai.map(function (r) { return r.nilai; });
      var tuntas = nilai.filter(function (v) { return v >= kkm; }).length;
      g.stat = {
        siswa: g.rows.length, peserta: g.rows.filter(function (r) { return r.h; }).length, dinilai: nilai.length,
        rata: r1(rata(nilai)), maks: nilai.length ? Math.max.apply(null, nilai) : null, min: nilai.length ? Math.min.apply(null, nilai) : null,
        tuntas: tuntas, belum: nilai.length - tuntas, persen: nilai.length ? r1(tuntas / nilai.length * 100) : null,
        menunggu: g.rows.filter(function (r) { return r.h && r.nilai == null; }).length
      };
      g.stat.tidakIkut = g.stat.siswa - g.stat.peserta;
      g.tp = g.paket._tp.map(function (t) {
        var arr = g.rows.filter(function (r) { return r.tpPct && r.tpPct[t.kode] != null; }).map(function (r) { return r.tpPct[t.kode]; });
        var avg = r1(rata(arr));
        return { kode: t.kode, teks: t.teks, rata: avg, tercapai: arr.filter(function (v) { return v >= kkm; }).length, n: arr.length,
          status: avg == null ? '-' : avg >= kkm ? 'Tercapai' : 'Belum tercapai' };
      });
      var adaTP = g.tp.filter(function (t) { return t.rata != null; });
      g.tpTinggi = adaTP.length ? adaTP.slice().sort(function (a, b) { return b.rata - a.rata; })[0] : null;
      g.tpRendah = adaTP.length ? adaTP.slice().sort(function (a, b) { return a.rata - b.rata; })[0] : null;
      g.adaMenunggu = g.rows.some(function (r) { return r.menunggu > 0; });

      if (!opsi.tidakIkut) g.rows = g.rows.filter(function (r) { return r.h; });
      if (opsi.remedial) g.rows = g.rows.filter(function (r) { return r.nilai != null && r.nilai < kkm; });
      g.rows.sort(opsi.urut === 'nilai' ?
        function (a, b) { return (a.rank || 1e9) - (b.rank || 1e9) || bandingNama(a.n, b.n); } :
        function (a, b) { return bandingNama(a.n, b.n); });
    });
    if (opsi.remedial) grup = grup.filter(function (g) { return g.rows.length; });
    grup.sort(function (a, b) {
      return bandingNama(a.kelas, b.kelas) || bandingNama(a.paket.mapel, b.paket.mapel) || bandingNama(a.paket.nama, b.paket.nama);
    });
    // Nama pendek grup (untuk sheet Excel & judul)
    var hit = {};
    grup.forEach(function (g) { var k = g.kelas + '|' + (g.paket.mapel || '').toUpperCase(); hit[k] = (hit[k] || 0) + 1; });
    grup.forEach(function (g) {
      var unik = hit[g.kelas + '|' + (g.paket.mapel || '').toUpperCase()] === 1;
      g.label = g.kelas + ' ' + (unik ? (g.paket.mapel || g.paket.id) : g.paket.id);
    });
    return { grup: grup, kkm: kkm, batas: batas, setting: data.setting || {}, dibuat: data.dibuat || Date.now(), label: opsi.label || '' };
  }

  /* ------------------------------------------------------------------
     2. Daftar Tujuan Pembelajaran per mata pelajaran
     ------------------------------------------------------------------ */
  function tp(data, opsi) {
    siapkan(data);
    var kkm = opsi.kkm, batas = opsi.batas || 50;
    var setUser = {};
    data.users.forEach(function (u) { setUser[u.u] = u; });
    var perPaket = {};
    data.hasil.forEach(function (h) { (perPaket[h.paket] = perPaket[h.paket] || []).push(h); });
    var mapelMap = {};
    data.pakets.forEach(function (p) {
      var key = (p.mapel || '').toUpperCase() || '-';
      var m = mapelMap[key] || (mapelMap[key] = { key: key, mapel: p.mapel || '-', tp: {}, tanpaTP: 0, jumlahSoal: 0, pakets: [] });
      m.pakets.push(p);
      p.soal.forEach(function (s) {
        m.jumlahSoal++;
        if (!s.tp) { m.tanpaTP++; return; }
        var t = m.tp[s.tp] || (m.tp[s.tp] = { kode: s.tp, teks: p._tpTeks[s.tp] || '', pakai: [], jumlah: 0, bobot: 0, nilai: [] });
        var pk = t.pakai.filter(function (x) { return x.id === p.id; })[0];
        if (!pk) { pk = { id: p.id, nama: p.nama, kelas: p.kelas, pg: [], es: [] }; t.pakai.push(pk); }
        (s.t === 'PG' ? pk.pg : pk.es).push(s.no);
        t.jumlah++; t.bobot += +s.maks || 0;
      });
      (perPaket[p.id] || []).forEach(function (h) {
        var o = hitungKiriman(h, p, batas);
        Object.keys(o.tpPct).forEach(function (k) { if (m.tp[k]) m.tp[k].nilai.push(o.tpPct[k]); });
      });
    });
    var hasilMapel = Object.keys(mapelMap).map(function (k) {
      var m = mapelMap[k];
      var urutan = (data.tp && data.tp[k] ? data.tp[k].list : []).map(function (t) { return t.kode; });
      m.list = urutan.filter(function (kode) { return m.tp[kode]; }).map(function (kode) {
        var t = m.tp[kode];
        t.rata = r1(rata(t.nilai)); t.n = t.nilai.length;
        t.tercapai = t.nilai.filter(function (v) { return v >= kkm; }).length;
        t.status = t.rata == null ? 'Belum ada data' : t.rata >= kkm ? 'Tercapai' : 'Belum tercapai';
        var banyak = t.pakai.length > 1;
        t.ujian = t.pakai.map(function (x) { return x.nama; }).join('; ');
        t.kelas = uniq([].concat.apply([], t.pakai.map(function (x) { return x.kelas; }))).join(', ');
        t.nomor = t.pakai.map(function (x) {
          var s = [x.pg.length ? 'PG ' + x.pg.join(', ') : '', x.es.length ? 'Essay ' + x.es.join(', ') : ''].filter(String).join('; ');
          return banyak ? x.nama + ': ' + s : s;
        }).join(' | ');
        return t;
      });
      return m;
    }).filter(function (m) { return m.list.length; }).sort(function (a, b) { return bandingNama(a.mapel, b.mapel); });
    return { mapel: hasilMapel, kkm: kkm, setting: data.setting || {}, dibuat: data.dibuat || Date.now(), label: opsi.label || '', analisis: !!opsi.analisis };
  }
  function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

  /* ------------------------------------------------------------------
     3. Analisis butir soal (satu ujian)
     ------------------------------------------------------------------ */
  function kategoriP(p) { return p == null ? '-' : p <= 0.30 ? 'Sukar' : p <= 0.70 ? 'Sedang' : 'Mudah'; }
  function kategoriD(d) { return d == null ? '-' : d >= 0.40 ? 'Sangat baik' : d >= 0.30 ? 'Baik' : d >= 0.20 ? 'Cukup' : d >= 0 ? 'Jelek' : 'Negatif'; }
  function kesimpulan(d) { return d == null ? 'Data kurang' : d >= 0.30 ? 'Diterima' : d >= 0.20 ? 'Direvisi' : 'Ditolak / diganti'; }

  function butir(data, opsi) {
    siapkan(data);
    var p = data.pakets[0];
    if (!p) return null;
    var batas = opsi.batas || 50;
    var peserta = data.hasil.filter(function (h) { return h.paket === p.id; }).map(function (h) {
      var o = hitungKiriman(h, p, batas);
      o.total = Object.keys(o.butir).reduce(function (s, i) { return s + (o.butir[i].akhir || 0); }, 0);
      o.nilai = h.nilai;
      return o;
    });
    var N = peserta.length;
    var urut = peserta.slice().sort(function (a, b) { return b.total - a.total; });
    var n = N >= 2 ? Math.max(1, Math.round(N * 0.27)) : 0;
    var atas = urut.slice(0, n), bawah = n ? urut.slice(N - n) : [];
    var skorOf = function (o, i) { return o.butir[i] ? o.butir[i].akhir : null; };

    var list = p.soal.map(function (s) {
      var resp = peserta.map(function (o) { return o.butir[s.idx]; }).filter(Boolean);
      var r = { no: s.no, t: s.t, kunci: s.kunci, tp: s.tp, tpTeks: p._tpTeks[s.tp] || '', teks: s.teks, maks: s.maks, opsi: s.opsi || [], n: resp.length };
      if (s.t === 'PG') {
        r.dist = {}; r.kosong = 0; r.benar = 0;
        r.opsi.forEach(function (k) { r.dist[k] = 0; });
        resp.forEach(function (b) {
          if (!b.jw) r.kosong++; else r.dist[b.jw] = (r.dist[b.jw] || 0) + 1;
          if (b.akhir > 0) r.benar++;
        });
        r.p = resp.length ? r2(r.benar / resp.length) : null;
        if (n) {
          var ba = atas.filter(function (o) { return skorOf(o, s.idx) > 0; }).length;
          var bb = bawah.filter(function (o) { return skorOf(o, s.idx) > 0; }).length;
          r.d = r2(ba / n - bb / n);
        }
        var pengecoh = r.opsi.filter(function (k) { return k !== s.kunci; });
        r.pengecohTotal = pengecoh.length;
        r.pengecohMati = pengecoh.filter(function (k) { return !resp.length || (r.dist[k] || 0) / resp.length < 0.05; });
        r.pengecohBerfungsi = pengecoh.length - r.pengecohMati.length;
      } else {
        var skor = resp.filter(function (b) { return b.akhir != null; }).map(function (b) { return b.akhir; });
        r.rataSkor = r1(rata(skor)); r.dinilai = skor.length;
        r.p = skor.length && s.maks ? r2(rata(skor) / s.maks) : null;
        if (n && s.maks) {
          var ma = rata(atas.map(function (o) { return skorOf(o, s.idx) || 0; }));
          var mb = rata(bawah.map(function (o) { return skorOf(o, s.idx) || 0; }));
          r.d = r2((ma - mb) / s.maks);
        }
      }
      if (r.d === undefined) r.d = null;
      r.kategoriP = kategoriP(r.p); r.kategoriD = kategoriD(r.d); r.kesimpulan = kesimpulan(r.d);
      return r;
    });

    // Reliabilitas KR-20 (khusus soal PG)
    var pg = p.soal.filter(function (s) { return s.t === 'PG'; });
    var kr20 = null;
    if (pg.length >= 2 && N >= 2) {
      var tot = peserta.map(function (o) { return pg.reduce(function (s, q) { return s + (skorOf(o, q.idx) > 0 ? 1 : 0); }, 0); });
      var mean = rata(tot), varians = rata(tot.map(function (t) { return (t - mean) * (t - mean); }));
      var spq = pg.reduce(function (s, q) {
        var pp = peserta.filter(function (o) { return skorOf(o, q.idx) > 0; }).length / N;
        return s + pp * (1 - pp);
      }, 0);
      if (varians > 0) kr20 = r2((pg.length / (pg.length - 1)) * (1 - spq / varians));
    }
    var nilai = peserta.map(function (o) { return o.nilai; }).filter(function (v) { return v != null; });
    var hitung = function (key, val) { return list.filter(function (x) { return x[key] === val; }).length; };
    return {
      paket: p, N: N, n: n, butir: list, kr20: kr20,
      ketKR20: kr20 == null ? '-' : kr20 >= 0.70 ? 'Reliabel' : kr20 >= 0.50 ? 'Cukup reliabel' : 'Kurang reliabel',
      rata: r1(rata(nilai)), maks: nilai.length ? Math.max.apply(null, nilai) : null, min: nilai.length ? Math.min.apply(null, nilai) : null,
      ringkas: {
        mudah: hitung('kategoriP', 'Mudah'), sedang: hitung('kategoriP', 'Sedang'), sukar: hitung('kategoriP', 'Sukar'),
        diterima: hitung('kesimpulan', 'Diterima'), direvisi: hitung('kesimpulan', 'Direvisi'), ditolak: hitung('kesimpulan', 'Ditolak / diganti')
      },
      setting: data.setting || {}, dibuat: data.dibuat || Date.now(), label: opsi.label || '', kkm: opsi.kkm
    };
  }

  window.Rekap = { hasil: hasil, tp: tp, butir: butir, teksTP: teksTP, predikat: predikat, r1: r1 };
})();
