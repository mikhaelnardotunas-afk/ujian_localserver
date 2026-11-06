/* =========================================================
   Dashboard Guru v3 — tampilan formal, Rekap & Export (Excel/PDF),
   Tujuan Pembelajaran, analisis butir soal (+ Pemulihan & Anti-Contek)
   ========================================================= */
(function () {
  'use strict';
  var UE = window.UE;
  var $ = function (id) { return document.getElementById(id); };
  var G = { pw: sessionStorage.getItem('ue_guru_pw') || '', paket: sessionStorage.getItem('ue_guru_paket') || '', data: null, meta: null,
    metaT: 0, metaJanji: null, identitas: false, tab: sessionStorage.getItem('ue_guru_tab') || 't-ringkasan', sort: { k: 'n', dir: 1 }, loading: false, janji: null, modal: false };
  var MODE = { TIMER: 'Timer ujian', TIMERSOAL: 'Timer per soal', TIMERFIXED: 'Timer tetap per soal' };
  var TAB_PAKET = ['t-pantau', 't-hasil', 't-siswa', 't-token']; // menu yang memakai pilihan "Paket ujian"

  // Dashboard formal: tanpa efek suara game
  UE.sfx = function () {};
  UE.pasangIndikatorOnline($('net'));
  UE.daftarSW();

  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    $('btnKeluar').classList.toggle('hidden', id !== 'g-main');
  }
  // password guru selalu ditaruh terakhir agar tidak tertimpa field data (mis. password siswa)
  function guru(action, data, t) { return UE.api(action, Object.assign({}, data || {}, { password: G.pw }), t || 90000); }
  function stat(n, label, cls) { return '<div class="stat ' + (cls || '') + '"><b>' + n + '</b><span>' + label + '</span></div>'; }
  function opsiKelas(sel, list, semuaLabel) {
    var pilih = sel.value;
    sel.innerHTML = '<option value="">' + (semuaLabel || 'Semua kelas') + '</option>' + list.map(function (k) {
      return '<option' + (k === pilih ? ' selected' : '') + '>' + UE.esc(k) + '</option>';
    }).join('');
  }

  /* ---------- Login ---------- */
  $('formGuru').addEventListener('submit', function (e) {
    e.preventDefault();
    G.pw = $('inGuruPw').value;
    var b = this.querySelector('button'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
    guru('guruLogin').then(function () {
      sessionStorage.setItem('ue_guru_pw', G.pw); UE.sfx('sukses'); show('g-main'); muat();
      if (G.tab === 't-pengaturan') window.Pengaturan.buka();
    }).catch(function (err) { $('gMsg').textContent = err.message; UE.sfx('salah'); })
      .finally(function () { b.disabled = false; b.textContent = 'Masuk'; });
  });
  $('btnKeluar').addEventListener('click', function () { sessionStorage.removeItem('ue_guru_pw'); G.pw = ''; $('inGuruPw').value = ''; show('g-login'); });

  /* ---------- Muat data ---------- */
  /** Muat data dashboard. Mengembalikan promise; bila sedang memuat, promise yang berjalan dipakai ulang. */
  function muat(diam) {
    if (G.loading) return G.janji;
    G.loading = true;
    if (!diam) $('btnRefresh').innerHTML = '<span class="spinner"></span>';
    G.janji = guru('guruData', { paket: G.paket }).then(function (d) {
      G.data = d;
      if (d.paket) { G.paket = d.paket.id; sessionStorage.setItem('ue_guru_paket', G.paket); }
      $('gSekolah').textContent = d.sekolah || 'Dashboard ujian';
      renderPaketSelect();
      if (d.paket) { renderPantau(); renderHasil(); renderSiswa(); renderToken(); }
      renderRingkasan(); renderMasterSiswa(); renderMasterPaket(); renderKartu();
      if (G.tab === 't-master-soal' && $('selMasterPaketSoal').value !== soalPaketId) fetchSoal($('selMasterPaketSoal').value);
      if (!G.meta) ambilMeta().catch(function () {});
    }).catch(function (e) {
      if (/password/i.test(e.message)) { show('g-login'); $('gMsg').textContent = e.message; return; }
      if (!diam) UE.toast(e.message, 'err');
    }).finally(function () { G.loading = false; $('btnRefresh').textContent = 'Segarkan'; });
    return G.janji;
  }
  $('btnRefresh').addEventListener('click', function () { UE.sfx('klik'); muat(); });
  $('selPaket').addEventListener('change', function () { G.paket = this.value; muat(); });
  setInterval(function () {
    if ($('autoRefresh').checked && !document.hidden && !G.modal && G.pw && $('g-main').classList.contains('active') &&
      ['t-pantau', 't-hasil', 't-siswa'].indexOf(G.tab) >= 0) muat(true);
  }, 30000);

  function bukaTab(id) {
    if (!$(id)) id = 't-ringkasan';
    G.tab = id;
    try { sessionStorage.setItem('ue_guru_tab', id); } catch (e) {}
    document.querySelectorAll('.tab').forEach(function (x) { x.setAttribute('aria-selected', x.dataset.tab === id); });
    document.querySelectorAll('.tabpane').forEach(function (p) { p.classList.toggle('hidden', p.id !== id); });
    $('ctxBar').classList.toggle('hidden', TAB_PAKET.indexOf(id) < 0);
    if (id === 't-laporan') siapkanLaporan();
    if (id === 't-rekap') siapkanRekap();
    if (id === 't-master-soal' && G.data) { opsiPaketSoal(); fetchSoal($('selMasterPaketSoal').value); }
    if (id === 't-pengaturan' && G.pw) window.Pengaturan.buka();
  }
  window.Pengaturan.pasang({
    guru: guru,
    muatUlang: function () { return muatUlang(); },
    aturPassword: function (baru) { G.pw = baru; sessionStorage.setItem('ue_guru_pw', baru); },
    keluar: function () { $('btnKeluar').click(); }
  });
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { UE.sfx('klik'); bukaTab(t.dataset.tab); });
  });

  function renderPaketSelect() {
    var d = G.data;
    $('selPaket').innerHTML = d.pakets.map(function (p) {
      return '<option value="' + UE.esc(p.id) + '"' + (p.id === G.paket ? ' selected' : '') + '>' + UE.esc(p.nama) + ' (' + UE.esc(p.id) + ')' + (p.aktif ? '' : ' — nonaktif') + '</option>';
    }).join('') || '<option>Belum ada paket di sheet PAKET</option>';
    if (d.paket) {
      var isi = [d.jumlahPG ? d.jumlahPG + ' PG' : '', d.jumlahES ? d.jumlahES + ' essay' : ''].filter(String).join(' + ');
      $('paketInfo').textContent = d.paket.mapel + ' · Kelas ' + d.paket.kelas.join(', ') + ' · ' + isi + ' · ' + (MODE[d.paket.mode] || d.paket.mode) +
        ' · ' + Math.ceil(d.durasi / 60) + ' menit · Nilai ' + (d.paket.tampil ? 'ditampilkan ke siswa' : 'disembunyikan') +
        ' · Diperbarui ' + new Date().toLocaleTimeString('id-ID');
    }
  }

  /* ---------- Gabungan status siswa ---------- */
  var URUT = { MENGERJAKAN: 0, TERHENTI: 1, SELESAI: 2, TERKIRIM: 3, LOGIN: 4, BELUM: 5 };
  var LABEL = { MENGERJAKAN: 'Mengerjakan', TERHENTI: 'Ujian Terhenti', SELESAI: 'Selesai, belum terkirim', TERKIRIM: 'Terkirim', LOGIN: 'Sudah login', BELUM: 'Belum login' };
  function gabungSiswa() {
    var d = G.data, map = {};
    d.users.forEach(function (u) {
      var lg = d.login[u.u];
      map[u.u] = { u: u.u, n: u.n, k: u.k, status: lg ? 'LOGIN' : 'BELUM', dijawab: 0, total: d.jumlahPG + d.jumlahES, soalKe: 0, pel: 0, t: lg ? lg.last : 0,
        login: lg || null, sisa: null };
    });
    d.progress.forEach(function (p) {
      var x = map[p.u] || (map[p.u] = { u: p.u, n: p.n, k: p.k, login: null });
      Object.assign(x, { status: p.status, dijawab: p.dijawab, total: p.total || x.total, soalKe: p.soalKe, pel: p.pel, t: p.t, sisa: p.sisa, dev: p.dev });
    });
    (d.draf || []).forEach(function (r) { if (map[r.u]) map[r.u].draf = r; }); // jawaban sementara di server (server laptop)
    d.hasil.forEach(function (h) {
      var x = map[h.u] || (map[h.u] = { u: h.u, n: h.n, k: h.k, dijawab: 0, total: 0, soalKe: 0, pel: 0, t: 0, login: null });
      x.status = 'TERKIRIM'; x.pel = Math.max(x.pel || 0, h.pel); x.t = Math.max(x.t || 0, h.t);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function kelasDari(list) { var s = {}; list.forEach(function (x) { if (x.k) s[x.k] = 1; }); return Object.keys(s).sort(); }

  /* ---------- Pantau langsung ---------- */
  function renderPantau() {
    var semua = gabungSiswa();
    opsiKelas($('filterKelas'), kelasDari(semua));
    var fk = $('filterKelas').value, cari = $('cariPantau').value.trim().toLowerCase();
    var list = semua.filter(function (s) { return !fk || s.k === fk; });
    var hit = { MENGERJAKAN: 0, TERHENTI: 0, SELESAI: 0, TERKIRIM: 0, LOGIN: 0, BELUM: 0 };
    list.forEach(function (s) { hit[s.status] = (hit[s.status] || 0) + 1; });
    $('stats').innerHTML = stat(list.length, 'Total siswa') + stat(hit.BELUM, 'Belum login', 's-none') + stat(hit.LOGIN, 'Sudah login, belum mulai', 's-login') +
      stat(hit.MENGERJAKAN, 'Mengerjakan', 's-play') + stat(hit.SELESAI, 'Selesai, blm terkirim', 's-wait') + stat(hit.TERKIRIM, 'Terkirim', 's-done') +
      (hit.TERHENTI ? stat(hit.TERHENTI, 'Terhenti (Pelanggaran)', 's-play') : '');
      
    list = list.filter(function (s) { return !cari || s.n.toLowerCase().indexOf(cari) >= 0 || s.u.indexOf(cari) >= 0; })
      .sort(function (a, b) { return (URUT[a.status] - URUT[b.status]) || a.n.localeCompare(b.n); });
    var now = Date.now();
    $('students').innerHTML = list.map(function (s, i) {
      var pct = s.total ? Math.round(s.dijawab / s.total * 100) : 0;
      var lama = s.status === 'MENGERJAKAN' && s.t && now - s.t > 120000;
      var mulai = s.status !== 'BELUM' && s.status !== 'LOGIN';
      var terjawab = mulai ? s.dijawab + '/' + s.total + (s.status === 'MENGERJAKAN' ? ' · soal ' + s.soalKe : '') : '-';
      var update = s.status === 'BELUM' ? 'Belum pernah login'
        : s.status === 'LOGIN' ? 'Login ' + UE.relatif(s.login.last) + (s.login.dev ? ' · ' + UE.esc(s.login.dev) : '')
        : s.t ? (lama ? '📴 Terakhir terlihat ' : '') + UE.relatif(s.t) : '-';
      var sisa = s.sisa != null && s.status === 'MENGERJAKAN' ? '⏳ ' + UE.fmtWaktu(Math.max(0, s.sisa - (now - s.t) / 1000)) : '-';
      return '<tr class="stu ' + s.status + '"><td class="c">' + (i + 1) + '</td>' +
        '<td class="wrap"><b>' + UE.esc(s.n) + '</b></td><td>' + UE.esc(s.k) + '</td><td>' + UE.esc(s.u) + '</td>' +
        '<td><span class="pill st-' + s.status + '">' + (LABEL[s.status] || s.status) + '</span></td>' +
        '<td style="min-width:110px"><div class="prog"><i style="width:' + (mulai ? pct : 0) + '%"></i></div></td>' +
        '<td>' + terjawab + '</td>' +
        '<td class="' + (s.pel ? 'warn-pel' : '') + '">' + (s.pel ? '⚠ ' + s.pel + 'x keluar' : '-') + '</td>' +
        '<td>' + sisa + '</td><td class="small">' + update +
        (s.draf && s.status !== 'TERKIRIM' ? '<div style="white-space:normal;min-width:170px;margin-top:4px">💾 Tersimpan di server: ' + s.draf.dijawab + '/' + s.draf.total + ' jawaban, ' + UE.relatif(s.draf.t) +
          '<br><button type="button" class="btn btn-wood btn-sm" style="margin-top:4px" data-draf="' + UE.esc(s.u) + '">Jadikan kiriman</button></div>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="10" class="muted">Tidak ada siswa.</td></tr>';  }
  /* HP siswa rusak dan jawaban akhir tak mungkin terkirim: guru memakai jawaban sementara terakhir sebagai kiriman */
  $('students').addEventListener('click', function (e) {
    var b = e.target.closest('[data-draf]'); if (!b) return;
    var u = b.dataset.draf, s = gabungSiswa().filter(function (x) { return x.u === u; })[0];
    UE.dialog({
      judul: 'Jadikan kiriman?',
      pesan: (s ? s.n : u) + ': ' + s.draf.dijawab + ' dari ' + s.draf.total + ' jawaban yang tersimpan ' + UE.relatif(s.draf.t) + ' akan dicatat sebagai kiriman dan dinilai. Pakai ini hanya bila siswa tidak bisa lagi mengirim dari HP-nya.',
      ok: 'Jadikan kiriman', batal: 'Batal'
    }).then(function (ya) {
      if (!ya) return;
      b.disabled = true;
      guru('guruDrafKeKiriman', { paket: G.paket, username: u }).then(function () { UE.toast('Kiriman dibuat dari jawaban sementara', 'ok'); return muat(true); })
        .catch(function (x) { UE.toast(x.message, 'err'); b.disabled = false; });
    });
  });
  $('cariPantau').addEventListener('input', renderPantau);
  $('filterKelas').addEventListener('change', renderPantau);

  /* ---------- Hasil ---------- */
  function barisHasil() {
    var cari = $('cariHasil').value.trim().toLowerCase();
    var rows = G.data.hasil.map(function (h) { return Object.assign({ dur: h.selesai && h.mulai ? h.selesai - h.mulai : 0 }, h); })
      .filter(function (h) { return !cari || h.n.toLowerCase().indexOf(cari) >= 0; });
    var k = G.sort.k, dir = G.sort.dir;
    rows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x == null) x = -1; if (y == null) y = -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
    return rows;
  }
  function pillStatus(s) {
    var err = s.indexOf('ERROR') === 0, c = err ? 'ERROR' : s.split(' ')[0];
    var txt = err ? 'Error AI' : { DINILAI: 'Dinilai', MENUNGGU: 'Menunggu AI', SEDANG: 'Sedang dinilai' }[c] || s;
    return '<span class="pill ' + c + '" title="' + UE.esc(s) + '">' + txt + '</span>';
  }
  function renderHasil() {
    var d = G.data, rows = barisHasil();
    var nilai = d.hasil.filter(function (h) { return h.nilai != null; }).map(function (h) { return h.nilai; });
    var rata = nilai.length ? Math.round(nilai.reduce(function (a, b) { return a + b; }, 0) / nilai.length * 10) / 10 : '–';
    $('statsHasil').innerHTML = stat(d.hasil.length, 'Kiriman masuk', 's-done') + stat(nilai.length, 'Sudah dinilai') +
      stat(rata, 'Rata-rata', 's-wait') + stat(nilai.length ? Math.max.apply(null, nilai) : '–', 'Tertinggi') +
      stat(nilai.length ? Math.min.apply(null, nilai) : '–', 'Terendah', 's-play');
    var ganda = {};
    d.hasil.forEach(function (h) { ganda[h.u] = (ganda[h.u] || 0) + 1; });
    var f = function (v) { return v == null ? '–' : v; };
    document.querySelector('#tblHasil tbody').innerHTML = rows.map(function (h) {
      return '<tr><td class="wrap"><b>' + UE.esc(h.n) + '</b>' + (ganda[h.u] > 1 ? ' <span class="pill ERROR" title="Siswa ini mengirim lebih dari sekali">ganda</span>' : '') +
        '<div class="small muted">' + UE.esc(h.u) + '</div></td><td>' + UE.esc(h.k) + '</td>' +
        '<td>' + (d.jumlahPG ? f(h.pg) : '–') + '</td><td>' + (d.jumlahES ? f(h.es) : '–') + '</td>' +
        '<td>' + (h.nilai != null ? '<span class="nilai-big">' + h.nilai + '</span> ' + UE.bintangSVG(UE.bintang(h.nilai)) : '–') + '</td>' +
        '<td>' + pillStatus(h.status) + '</td><td class="' + (h.pel ? 'warn-pel' : '') + '">' + (h.pel || 0) + '</td>' +
        '<td>' + (h.dur ? Math.round(h.dur / 60000) + ' mnt' : '–') + '</td><td>' + UE.fmtTanggal(h.t) + '</td>' +
        '<td><button class="btn btn-blue btn-sm" data-detail="' + UE.esc(h.id) + '">Detail</button></td></tr>';
    }).join('') || '<tr><td colspan="10" class="muted">Belum ada jawaban yang masuk.</td></tr>';
  }
  $('cariHasil').addEventListener('input', renderHasil);
  document.querySelectorAll('#tblHasil th[data-s]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.s;
      G.sort = { k: k, dir: G.sort.k === k ? -G.sort.dir : (k === 'n' || k === 'k' ? 1 : -1) };
      renderHasil();
    });
  });
  $('tblHasil').addEventListener('click', function (e) { var b = e.target.closest('[data-detail]'); if (b) bukaDetail(b.dataset.detail); });
  $('btnNilaiSemua').addEventListener('click', function () {
    var b = this; UE.sfx('klik');
    b.disabled = true; b.innerHTML = '<span class="spinner dark"></span> AI sedang menilai…';
    guru('guruNilaiAI', {}, 300000).then(function (r) { UE.toast(r.dinilai + ' kiriman selesai dinilai', 'ok'); UE.sfx('sukses'); muat(true); })
      .catch(function (e) { UE.toast(e.message, 'err'); })
      .finally(function () { b.disabled = false; b.textContent = 'Nilai semua yang tertunda (AI)'; });
  });
  $('btnCSV').addEventListener('click', function () {
    var d = G.data; if (!d || !d.paket) return;
    var angka = function (v) { return v == null ? '' : String(v).replace('.', ','); };
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = [['Nama', 'Username', 'Kelas', 'Skor PG', 'Skor Essay', 'Nilai', 'Total skor', 'Skor maks', 'Status', 'Pelanggaran', 'Mulai', 'Selesai', 'Dikirim'].map(q).join(';')];
    barisHasil().forEach(function (h) {
      lines.push([q(h.n), q(h.u), q(h.k), angka(h.pg), angka(h.es), angka(h.nilai), angka(h.total), angka(h.maks), q(h.status), h.pel,
        q(UE.fmtTanggal(h.mulai)), q(UE.fmtTanggal(h.selesai)), q(UE.fmtTanggal(h.t))].join(';'));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nilai_' + d.paket.id + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  /* ---------- Detail jawaban ---------- */
  function bukaDetail(id) {
    G.modal = true;
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal board" style="width:min(880px,100%)" role="dialog" aria-modal="true"><div id="detailIsi"><span class="spinner dark"></span> Memuat…</div></div>';
    document.body.appendChild(wrap);
    function tutup() { wrap.remove(); G.modal = false; muat(true); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) tutup(); });

    function itemHTML(it) {
      var kepala = '<h4>' + (it.tipe === 'PG' ? 'Pilihan ganda ' : 'Essay ') + it.no + ' <span class="small muted">(maks ' + it.maks + ')</span></h4>' +
        '<div class="box math">' + UE.rich(it.soal) + '</div>' + (it.gambar ? '<img class="q-img" src="' + UE.esc(it.gambar) + '" alt="Gambar soal">' : '');
      var isi;
      if (it.tipe === 'PG') {
        isi = '<div class="opsi-guru">' + (it.opsi || []).map(function (o) {
          var c = o.k === it.kunci ? 'kunci' : (o.k === it.jawaban ? 'salah' : '');
          return '<div class="' + c + ' math"><b>' + o.k + '.</b> ' + UE.rich(o.t) + (o.k === it.jawaban ? ' ← <b>dipilih siswa</b>' : '') + (o.k === it.kunci ? ' ✔ kunci' : '') + '</div>';
        }).join('') + '</div>' + (!it.jawaban ? '<p class="small muted">Siswa tidak menjawab.</p>' : '') +
          '<div class="lbl">Hasil otomatis</div><div class="box">' + (it.oto != null ? '<b>' + it.oto + '/' + it.maks + '</b> — ' + UE.esc(it.feedback) : '-') + '</div>';
      } else {
        isi = '<div class="lbl">Pedoman jawaban</div><div class="box math">' + UE.rich(it.pedoman || '-') + '</div>' +
          '<div class="lbl">Jawaban siswa</div><div class="box ans math">' + (it.jawaban ? UE.rich(it.jawaban) : '<i class="muted">(kosong)</i>') + '</div>' +
          '<div class="lbl">Penilaian AI</div><div class="box">' + (it.oto != null ? '<b>' + it.oto + '/' + it.maks + '</b> — ' + UE.esc(it.feedback) : '<i class="muted">Belum dinilai</i>') + '</div>';
      }
      return '<div class="detail-item">' + kepala + isi +
        '<div class="skor-row"><span class="small" style="font-weight:800">Skor guru (koreksi):</span>' +
        '<input class="input" type="number" step="0.5" min="0" max="' + it.maks + '" value="' + (it.guru != null ? it.guru : '') + '" placeholder="' + (it.oto != null ? it.oto : '') + '" aria-label="Skor guru">' +
        '<button class="btn btn-green btn-sm" data-simpan="' + it.tipe + '|' + it.no + '">Simpan</button>' +
        (it.guru != null ? '<button class="btn btn-wood btn-sm" data-reset="' + it.tipe + '|' + it.no + '">Pakai skor otomatis</button>' : '') +
        '<span class="small muted">Skor akhir: <b>' + (it.akhir != null ? it.akhir : '–') + '</b></span></div></div>';
    }
    function render(r) {
      var h = r.hasil, isi = wrap.querySelector('#detailIsi');
      var pg = r.items.filter(function (i) { return i.tipe === 'PG'; }), es = r.items.filter(function (i) { return i.tipe !== 'PG'; });
      isi.innerHTML = '<h2 class="board-title">' + UE.esc(h.n) + ' <span class="small muted">' + UE.esc(h.k) + '</span></h2>' +
        '<p class="board-sub">Nilai: <b class="nilai-big">' + (h.nilai != null ? h.nilai : '–') + '</b> ' + pillStatus(h.status) +
        (pg.length ? ' · PG ' + (h.pg != null ? h.pg : '–') : '') + (es.length ? ' · Essay ' + (h.es != null ? h.es : '–') : '') +
        (h.pel ? ' · <span class="warn-pel">⚠ keluar aplikasi ' + h.pel + 'x</span>' : '') + '</p>' +
        (pg.length ? '<h3 class="section-title">Pilihan ganda — ' + pg.filter(function (i) { return i.akhir > 0; }).length + ' benar dari ' + pg.length + '</h3>' + pg.map(itemHTML).join('') : '') +
        (es.length ? '<h3 class="section-title">Essay</h3>' + es.map(itemHTML).join('') : '') +
        '<div class="modal-actions"><button class="btn btn-red btn-sm" data-act="hapus">Hapus kiriman</button>' +
        (es.length ? '<button class="btn btn-gold" data-act="ulang">Nilai ulang essay dengan AI</button>' : '') +
        '<button class="btn btn-wood" data-act="tutup">Tutup</button></div>';
      UE.typeset(isi);
    }
    function proses(p) { return p.then(render).catch(function (e) { UE.toast(e.message, 'err'); }); }
    proses(guru('guruDetail', { id: id }));

    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'tutup') { tutup(); return; }
      if (b.dataset.simpan || b.dataset.reset) {
        var key = (b.dataset.simpan || b.dataset.reset).split('|');
        var val = b.dataset.reset ? '' : b.closest('.skor-row').querySelector('input').value;
        b.disabled = true;
        proses(guru('guruSetSkor', { id: id, tipe: key[0], no: +key[1], skor: val === '' ? '' : Number(val) })).then(function () { UE.sfx('pop'); UE.toast('Skor disimpan', 'ok'); });
        return;
      }
      if (b.dataset.act === 'ulang') {
        b.disabled = true; b.innerHTML = '<span class="spinner dark"></span> Menilai…';
        proses(guru('guruNilaiAI', { id: id }, 300000)).then(function () { UE.sfx('sukses'); });
        return;
      }
      if (b.dataset.act === 'hapus') {
        UE.dialog({ judul: 'Hapus kiriman ini?', pesan: 'Jawaban dan nilai siswa ini dihapus permanen dari spreadsheet. Pakai hanya untuk data uji coba, kiriman ganda, atau ujian ulang.', ok: 'Hapus', batal: 'Batal', bahaya: true })
          .then(function (ya) { if (ya) guru('guruHapusKiriman', { id: id }).then(function () { UE.toast('Kiriman dihapus', 'ok'); tutup(); }).catch(function (e) { UE.toast(e.message, 'err'); }); });
      }
    });
  }

  /* ---------- Siswa & HP ---------- */
  function renderSiswa() {
    var d = G.data, now = Date.now();
    var semua = gabungSiswa();
    opsiKelas($('filterKelasSiswa'), kelasDari(semua));
    var fk = $('filterKelasSiswa').value, cari = $('cariSiswa').value.trim().toLowerCase();
    var hpPerKelas = {};
    d.perangkat.forEach(function (p) { p.kelas.forEach(function (k) { hpPerKelas[k] = (hpPerKelas[k] || 0) + 1; }); });
    var list = semua.filter(function (s) { return (!fk || s.k === fk); });
    var sudahLogin = list.filter(function (s) { return s.login; }).length;
    var antre = d.perangkat.reduce(function (a, p) { return a + p.antrian; }, 0);
    var adaPaket = d.perangkat.filter(function (p) { return p.paket.indexOf(d.paket.id) >= 0; }).length;
    $('statsSiswa').innerHTML = stat(list.length, 'Siswa') + stat(sudahLogin, 'Pernah login', 's-login') + stat(list.length - sudahLogin, 'Belum pernah login', 's-none') +
      stat(d.perangkat.length, 'HP mengunduh data', 's-done') + stat(adaPaket, 'HP memuat ujian ini', 's-wait') + stat(antre, 'Jawaban tertahan di HP', antre ? 's-play' : '');

    document.querySelector('#tblSiswa tbody').innerHTML = list.filter(function (s) { return !cari || s.n.toLowerCase().indexOf(cari) >= 0 || s.u.indexOf(cari) >= 0; })
      .sort(function (a, b) { return a.k.localeCompare(b.k) || a.n.localeCompare(b.n); }).map(function (s) {
        var nHP = hpPerKelas[s.k] || 0;
        return '<tr><td class="wrap"><b>' + UE.esc(s.n) + '</b><div class="small muted">' + UE.esc(s.u) + '</div></td><td>' + UE.esc(s.k) + '</td>' +
          '<td>' + (nHP ? '<span class="pill ok">✔ di ' + nHP + ' HP</span>' : '<span class="pill warn">Belum diunduh</span>') + '</td>' +
          '<td>' + (s.login ? UE.relatif(s.login.last) : '<span class="pill no">Belum login</span>') + '</td>' +
          '<td>' + (s.login ? UE.esc(s.login.devs.join(', ')) : '–') + '</td>' +
          '<td>' + (s.login ? s.login.jml : 0) + '</td><td>' + (LABEL[s.status] || s.status) + '</td></tr>';
      }).join('') || '<tr><td colspan="7" class="muted">Tidak ada siswa.</td></tr>';

    document.querySelector('#tblHP tbody').innerHTML = d.perangkat.sort(function (a, b) { return b.online - a.online; }).map(function (p) {
      var ada = p.paket.indexOf(d.paket.id) >= 0;
      return '<tr><td><b>' + UE.esc(p.dev) + '</b></td><td class="wrap">' + UE.esc(p.info || '-') + '</td><td>' + UE.esc(p.kelas.join(', ')) + '</td>' +
        '<td>' + (ada ? '<span class="pill ok">Ya</span>' : '<span class="pill warn" title="Minta siswa menekan Perbarui data">Tidak</span>') + '</td>' +
        '<td>' + UE.fmtTanggal(p.unduh) + '</td><td>' + (p.online ? UE.relatif(p.online) : '–') + '</td>' +
        '<td>' + (p.antrian ? '<span class="pill warn">' + p.antrian + ' kiriman</span>' : '0') + '</td><td>' + p.login + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="muted">Belum ada HP yang mengunduh data kelas ujian ini.</td></tr>';
  }
  $('cariSiswa').addEventListener('input', renderSiswa);
  $('filterKelasSiswa').addEventListener('change', renderSiswa);

  /* ---------- Token ---------- */
  function renderToken() {
    var d = G.data;
    document.querySelector('#tblToken tbody').innerHTML = d.tokens.map(function (t) {
      var c = t.status === 'AKTIF' ? 'DINILAI' : t.status === 'BELUM AKTIF' ? 'MENUNGGU' : 'ERROR';
      return '<tr><td><b class="nilai-big" style="letter-spacing:3px">' + UE.esc(t.token) + '</b></td><td>' + UE.fmtTanggal(t.mulai) + '</td><td>' +
        UE.fmtTanggal(t.selesai) + '</td><td><span class="pill ' + c + '">' + t.status + '</span></td><td class="wrap">' + UE.esc(t.ket) + '</td>' +
        '<td class="c"><b>' + (t.mp||3) + '</b> kali</td><td><b>' + UE.esc(t.tp||'-') + '</b></td>' +
        '<td><button class="btn btn-blue btn-sm" data-edittoken="' + UE.esc(t.token) + '">Edit</button> ' +
        '<button class="btn btn-red btn-sm" data-hapustoken="' + UE.esc(t.token) + '">Hapus</button></td></tr>';
    }).join('') || '<tr><td colspan="8" class="muted">Belum ada token. Paket tanpa token tidak ikut terunduh ke HP siswa.</td></tr>';
  }
  function lokal(ms) { return new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function acakToken() {
    var huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '', r = crypto.getRandomValues(new Uint32Array(6));
    for (var i = 0; i < 6; i++) s += huruf[r[i] % huruf.length];
    return s;
  }
  
  $('tkKode').value = acakToken();
  $('tkPemulihan').value = acakToken().slice(0, 6);
  $('tkMulai').value = lokal(Date.now());
  $('tkSelesai').value = lokal(Date.now() + 2 * 3600000);
  
  $('btnAcakToken').addEventListener('click', function () { 
    UE.sfx('pop'); 
    $('tkKode').value = acakToken(); 
    $('tkPemulihan').value = acakToken().slice(0, 6);
  });
  
  var tokenLama = '';
  $('tblToken').addEventListener('click', function(e) {
    var b = e.target.closest('button'); if(!b) return;
    if(b.dataset.hapustoken) {
      var tok = b.dataset.hapustoken;
      UE.dialog({ judul: 'Hapus token ' + tok + '?', pesan: 'Siswa yang belum memulai ujian tidak bisa memakai token ini lagi setelah memperbarui data.', ok: 'Hapus', batal: 'Batal', bahaya: true })
        .then(function (ya) { if (ya) guru('guruHapusToken', { paket: G.paket, token: tok }).then(function () { UE.toast('Token dihapus', 'ok'); muat(true); }).catch(function (e) { UE.toast(e.message, 'err'); }); });
    }
    if(b.dataset.edittoken) {
      var tk = G.data.tokens.find(function(x) { return x.token === b.dataset.edittoken; });
      if(tk) {
        tokenLama = tk.token;
        $('tkKode').value = tk.token;
        $('tkMulai').value = new Date(tk.mulai - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
        $('tkSelesai').value = new Date(tk.selesai - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
        $('tkMaks').value = tk.mp || 3;
        $('tkPemulihan').value = tk.tp || acakToken().slice(0,6);
        var btnBatal = $('btnBatalToken');
        if(btnBatal) btnBatal.classList.remove('hidden');
        $('formToken').querySelector('[type=submit]').textContent = 'Simpan Edit';
      }
    }
  });

  var btnBatal = $('btnBatalToken');
  if(btnBatal) {
    btnBatal.addEventListener('click', function() {
      tokenLama = '';
      $('tkKode').value = acakToken();
      $('tkPemulihan').value = acakToken().slice(0, 6);
      this.classList.add('hidden');
      $('formToken').querySelector('[type=submit]').textContent = 'Simpan token';
    });
  }

  $('formToken').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = this.querySelector('[type=submit]'); b.disabled = true;
    var aksi = tokenLama ? 'guruEditToken' : 'guruBuatToken';
    guru(aksi, { 
      paket: G.paket, 
      token: $('tkKode').value.trim().toUpperCase(),
      tokenlama: tokenLama,
      mulai: new Date($('tkMulai').value).getTime(), 
      selesai: new Date($('tkSelesai').value).getTime(),
      maksPel: $('tkMaks').value, 
      tokenPemulihan: $('tkPemulihan').value.trim().toUpperCase() 
    }).then(function () { 
      UE.sfx('sukses'); 
      UE.toast('Token tersimpan.', 'ok'); 
      if($('btnBatalToken')) $('btnBatalToken').click();
      muat(true); 
    }).catch(function (e) { 
      UE.toast(e.message, 'err'); 
    }).finally(function () { 
      b.disabled = false; 
    });
  });

  /* ---------- Data induk (paket, siswa, pengaturan) — dipakai Laporan & Rekap ---------- */
  function ambilMeta() {
    if (G.meta && Date.now() - G.metaT < 60000) return Promise.resolve(G.meta);
    if (G.metaJanji) return G.metaJanji;
    G.metaJanji = guru('guruMeta').then(function (m) {
      G.meta = m; G.metaT = Date.now();
      if (!G.identitas) { G.identitas = true; isiIdentitas(m.setting || {}); }
      return m;
    }).finally(function () { G.metaJanji = null; });
    return G.metaJanji;
  }
  function isiIdentitas(s) {
    $('lapKKM').value = s.KKM || 75; $('exKKM').value = s.KKM || 75; $('lapKota').value = s.KOTA || ''; $('lapTP').value = s.TAHUN_PELAJARAN || '';
    $('lapGuru').value = s.NAMA_GURU || ''; $('lapNipGuru').value = s.NIP_GURU || ''; $('lapKepsek').value = s.NAMA_KEPSEK || ''; $('lapNipKepsek').value = s.NIP_KEPSEK || '';
    $('lapTanggal').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (s.LOGO_URL) {
      var img = $('gLogo');
      img.onload = function () { img.classList.remove('hidden'); $('gEmblem').classList.add('hidden'); };
      img.src = s.LOGO_URL;
    }
  }
  /** Isi <select>; pilihan sebelumnya dipertahankan bila masih ada. items = [{v, t}] */
  function opsiSelect(sel, items, semuaLabel, bawaan) {
    var pilih = sel.value || bawaan || '';
    sel.innerHTML = (semuaLabel ? '<option value="">' + UE.esc(semuaLabel) + '</option>' : '') +
      items.map(function (x) { return '<option value="' + UE.esc(x.v) + '">' + UE.esc(x.t) + '</option>'; }).join('');
    if (pilih && items.some(function (x) { return x.v === pilih; })) sel.value = pilih;
  }
  function daftarMapel(m) {
    var s = {};
    m.pakets.forEach(function (p) { var k = (p.mapel || '').toUpperCase(); if (k && !s[k]) s[k] = p.mapel; });
    return Object.keys(s).map(function (k) { return s[k]; }).sort(function (a, b) { return a.localeCompare(b); });
  }
  function untukKelas(p, k) { return p.kelas.indexOf('SEMUA') >= 0 || p.kelas.indexOf(k) >= 0; }

  /* ---------- Laporan PDF ---------- */
  function siapkanLaporan() {
    ambilMeta().then(function (m) {
      opsiSelect($('lapPaket'), m.pakets.map(function (p) { return { v: p.id, t: p.nama + ' — ' + p.mapel }; }), null, G.paket);
      opsiSelect($('lapMapel'), daftarMapel(m).map(function (x) { return { v: x, t: x }; }), 'Semua mapel');
      aturFormLaporan();
    }).catch(function (e) { UE.toast(e.message, 'err'); });
  }
  function aturFormLaporan() {
    var m = G.meta, jenis = $('lapJenis').value;
    document.querySelectorAll('#formLaporan [data-lap]').forEach(function (el) { el.classList.toggle('hidden', el.dataset.lap.split(' ').indexOf(jenis) < 0); });
    var kelasSemua = kelasDari(m.users);
    var p = m.pakets.filter(function (x) { return x.id === $('lapPaket').value; })[0];
    var kelasOpsi = (jenis === 'rekap' || jenis === 'detail') && p ? kelasSemua.filter(function (k) { return p.kelas.indexOf('SEMUA') >= 0 || p.kelas.indexOf(k) >= 0; }) : kelasSemua;
    var sel = $('lapKelas'), pilih = sel.value;
    var wajib = jenis === 'kelas';
    sel.innerHTML = (wajib ? '' : '<option value="">Semua kelas</option>') + kelasOpsi.map(function (k) { return '<option' + (k === pilih ? ' selected' : '') + '>' + UE.esc(k) + '</option>'; }).join('');
    // Daftar siswa
    var ss = $('lapSiswa'), pilihS = ss.value;
    var siswa = m.users.filter(function (u) { return jenis === 'siswa' || !p || p.kelas.indexOf('SEMUA') >= 0 || p.kelas.indexOf(u.k) >= 0; })
      .filter(function (u) { return jenis === 'siswa' || !sel.value || u.k === sel.value; })
      .sort(function (a, b) { return a.k.localeCompare(b.k) || a.n.localeCompare(b.n); });
    ss.innerHTML = (jenis === 'detail' ? '<option value="">Semua siswa (1 halaman per siswa)</option>' : '') +
      siswa.map(function (u) { return '<option value="' + UE.esc(u.u) + '"' + (u.u === pilihS ? ' selected' : '') + '>' + UE.esc(u.n) + ' — ' + UE.esc(u.k) + '</option>'; }).join('');
  }
  ['lapJenis', 'lapPaket', 'lapKelas'].forEach(function (id) { $(id).addEventListener('change', aturFormLaporan); });

  $('formLaporan').addEventListener('submit', function (e) {
    e.preventDefault();
    var jenis = $('lapJenis').value;
    var opsi = {
      jenis: jenis, kkm: Number($('lapKKM').value) || 0, tanggal: $('lapTanggal').value, urut: $('lapUrut').value,
      belum: $('lapBelum').checked, teksSoal: $('lapTeksSoal').checked, kunci: $('lapKunci').checked, ttd: $('lapTTD').checked,
      kota: $('lapKota').value, tp: $('lapTP').value, guru: $('lapGuru').value, nipGuru: $('lapNipGuru').value,
      kepsek: $('lapKepsek').value, nipKepsek: $('lapNipKepsek').value, kelas: $('lapKelas').value, mapel: $('lapMapel').value
    };
    var req = { kelas: opsi.kelas };
    if (jenis === 'rekap') { req.jenis = 'paket'; req.paket = $('lapPaket').value; }
    else if (jenis === 'detail') { req.jenis = 'detail'; req.paket = $('lapPaket').value; req.username = $('lapSiswa').value; }
    else if (jenis === 'kelas') { req.jenis = 'matriks'; req.mapel = opsi.mapel; if (!opsi.kelas) { UE.toast('Pilih kelas', 'err'); return; } }
    else if (jenis === 'mapel') { req.jenis = 'matriks'; req.mapel = opsi.mapel; }
    else { req.jenis = 'matriks'; req.username = $('lapSiswa').value; req.kelas = ''; if (!req.username) { UE.toast('Pilih siswa', 'err'); return; } }
    
    var w = window.open('', '_blank');
    if (!w) { UE.toast('Browser memblokir tab baru. Izinkan pop-up untuk situs ini.', 'err'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:30px">Menyiapkan laporan…</p>');
    var b = this.querySelector('[type=submit]'); b.disabled = true;
    ambilLaporan(req, w).then(function (data) {
      window.Laporan.tulis(w, opsi, data);
    }).catch(function (err) {
      w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:30px;color:#b00">Gagal: ' + UE.esc(err.message) + '</p>';
    }).finally(function () { b.disabled = false; });
  });

  /** Lembar jawaban diambil per potongan bila server mendukung (Cloudflare). Apps Script mengabaikan detailDari dan mengirim semuanya sekaligus. */
  function ambilLaporan(req, w) {
    if (req.jenis !== 'detail') return guru('guruLaporan', req, 120000);
    return guru('guruLaporan', Object.assign({}, req, { detailDari: 0 }), 120000).then(function (data) {
      var total = data.hasil.length;
      function lanjut(dari) {
        if (dari === null || dari === undefined) return data;
        try { w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:30px">Menyiapkan laporan… ' + dari + ' dari ' + total + ' siswa</p>'; } catch (e) { /* tab ditutup */ }
        return guru('guruLaporan', Object.assign({}, req, { detailDari: dari }), 120000).then(function (x) {
          Object.assign(data.detail, x.detail);
          return lanjut(x.detailBerikut);
        });
      }
      return lanjut(data.detailBerikut);
    });
  }

  /* ================== REKAP & EXPORT (Excel / PDF) ================== */
  function siapkanRekap() {
    ambilMeta().then(function (m) {
      var kelas = kelasDari(m.users).map(function (k) { return { v: k, t: 'Kelas ' + k }; });
      var mapel = daftarMapel(m).map(function (x) { return { v: x, t: x }; });
      opsiSelect($('exKelas'), kelas, 'Semua kelas');
      opsiSelect($('exMapel'), mapel, 'Semua mata pelajaran');
      aturPaketRekap();
      opsiSelect($('tpMapel'), mapel, 'Semua mata pelajaran');
      opsiSelect($('tpKelas'), kelas, 'Semua kelas');
      opsiSelect($('abPaket'), m.pakets.map(function (p) { return { v: p.id, t: p.nama + ' — ' + p.mapel }; }), null, G.paket);
      aturKelasButir();
    }).catch(function (e) { UE.toast(e.message, 'err'); });
  }
  function aturPaketRekap() {
    var mp = $('exMapel').value.toUpperCase(), kl = $('exKelas').value;
    var list = G.meta.pakets.filter(function (p) { return (!mp || (p.mapel || '').toUpperCase() === mp) && (!kl || untukKelas(p, kl)); });
    opsiSelect($('exPaket'), list.map(function (p) { return { v: p.id, t: p.nama + (mp ? '' : ' — ' + p.mapel) }; }), 'Semua ujian');
  }
  function aturKelasButir() {
    var p = G.meta.pakets.filter(function (x) { return x.id === $('abPaket').value; })[0];
    var kelas = kelasDari(G.meta.users).filter(function (k) { return !p || untukKelas(p, k); });
    opsiSelect($('abKelas'), kelas.map(function (k) { return { v: k, t: 'Kelas ' + k }; }), 'Semua kelas');
  }
  $('exMapel').addEventListener('change', aturPaketRekap);
  $('exKelas').addEventListener('change', aturPaketRekap);
  $('abPaket').addEventListener('change', aturKelasButir);

  function angkaKKM() { var v = $('exKKM').value; return v === '' || isNaN(+v) ? 75 : Math.max(0, Math.min(100, +v)); }
  function batasEssay() { var v = +$('exBatas').value; return v >= 1 && v <= 100 ? v : 50; }
  function opsiDokumen() {
    return { kkm: angkaKKM(), tanggal: $('lapTanggal').value, ttd: $('exTTD').checked, kota: $('lapKota').value, tp: $('lapTP').value,
      guru: $('lapGuru').value, nipGuru: $('lapNipGuru').value, kepsek: $('lapKepsek').value, nipKepsek: $('lapNipKepsek').value };
  }
  function labelFilter(f) {
    var p = f.paket && G.meta.pakets.filter(function (x) { return x.id === f.paket; })[0];
    return [f.kelas ? 'Kelas ' + f.kelas : 'Semua kelas', f.mapel || (p ? p.mapel : 'Semua mata pelajaran'), p ? p.nama : 'Semua ujian'].join(' · ');
  }
  function namaFile(awal, f) {
    var bagian = [awal, f.mapel || (f.paket ? '' : 'Semua-Mapel'), f.kelas ? 'Kelas-' + f.kelas : 'Semua-Kelas', f.paket || '', new Date().toISOString().slice(0, 10)];
    return bagian.filter(String).join('_').replace(/[^\w.\-]+/g, '-') + '.xlsx';
  }
  function sibuk(btn, on, teks) {
    if (on) { btn.dataset.asli = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + teks; }
    else { btn.disabled = false; if (btn.dataset.asli) btn.innerHTML = btn.dataset.asli; }
  }
  /** Ambil data guruRekap lalu buat dokumen. PDF: tab dibuka lebih dulu agar tidak diblokir browser. */
  function jalankanEkspor(btn, req, pdf, buat) {
    var w = null;
    if (pdf) {
      w = window.open('', '_blank');
      if (!w) { UE.toast('Browser memblokir tab baru. Izinkan pop-up untuk situs ini.', 'err'); return; }
      w.document.write('<p style="font-family:sans-serif;padding:30px">Menyiapkan dokumen…</p>');
    }
    sibuk(btn, true, pdf ? 'Menyiapkan PDF…' : 'Menyiapkan Excel…');
    Promise.all([guru('guruRekap', req, 180000), pdf ? null : window.Ekspor.muat()]).then(function (r) { return buat(r[0], w); })
      .then(function (pesan) { if (pesan) UE.toast(pesan, 'ok'); })
      .catch(function (e) {
        if (w) w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:30px;color:#b00">' + UE.esc(e.message) + '</p>';
        UE.toast(e.message, 'err');
      })
      .finally(function () { sibuk(btn, false); });
  }

  function eksporHasil(btn, pdf) {
    var f = { kelas: $('exKelas').value, mapel: $('exMapel').value, paket: $('exPaket').value };
    var opsi = { kkm: angkaKKM(), batas: batasEssay(), urut: $('exUrut').value, tidakIkut: $('exTidakIkut').checked, remedial: $('exRemedial').checked,
      perTP: $('exPerTP').checked, perSheet: $('exSheet').checked, label: labelFilter(f) };
    jalankanEkspor(btn, f, pdf, function (data, w) {
      var R = window.Rekap.hasil(data, opsi);
      if (!R.grup.length) throw new Error(opsi.remedial ? 'Tidak ada siswa yang belum tuntas untuk pilihan ini.' : 'Belum ada hasil ujian yang masuk untuk pilihan ini.');
      if (pdf) { window.Laporan.rekapHasil(w, Object.assign(opsiDokumen(), opsi), R); return; }
      return window.Ekspor.hasil(R, opsi, namaFile(opsi.remedial ? 'Daftar_Remedial' : 'Rekap_Hasil', f)).then(function () { return 'File Excel rekap hasil sudah diunduh'; });
    });
  }
  function eksporTP(btn, pdf) {
    var f = { kelas: $('tpKelas').value, mapel: $('tpMapel').value };
    var opsi = { kkm: angkaKKM(), batas: batasEssay(), analisis: $('tpAnalisis').checked, label: labelFilter(f).split(' · ').slice(0, 2).join(' · ') };
    jalankanEkspor(btn, f, pdf, function (data, w) {
      var T = window.Rekap.tp(data, opsi);
      if (!T.mapel.length) throw new Error('Belum ada soal yang memiliki Tujuan Pembelajaran untuk pilihan ini. Isi kolom TUJUAN_PEMBELAJARAN di sheet SOAL_PG / SOAL_ESSAY (atau lewat menu Bank Soal).');
      if (pdf) { window.Laporan.daftarTP(w, Object.assign(opsiDokumen(), opsi), T); return; }
      return window.Ekspor.tp(T, opsi, namaFile('Daftar_TP', f)).then(function () { return 'File Excel daftar TP sudah diunduh'; });
    });
  }
  function eksporButir(btn, pdf) {
    var f = { paket: $('abPaket').value, kelas: $('abKelas').value };
    if (!f.paket) { UE.toast('Pilih ujian dulu', 'err'); return; }
    var opsi = { kkm: angkaKKM(), batas: batasEssay(), label: labelFilter(f) };
    jalankanEkspor(btn, f, pdf, function (data, w) {
      var B = window.Rekap.butir(data, opsi);
      if (!B || !B.N) throw new Error('Belum ada jawaban siswa yang masuk untuk ujian/kelas ini.');
      if (pdf) { window.Laporan.analisisButir(w, Object.assign(opsiDokumen(), opsi), B); return; }
      return window.Ekspor.butir(B, opsi, namaFile('Analisis_Butir', f)).then(function () { return 'File Excel analisis butir sudah diunduh'; });
    });
  }
  $('btnExXlsx').addEventListener('click', function () { eksporHasil(this, false); });
  $('btnExPdf').addEventListener('click', function () { eksporHasil(this, true); });
  $('btnTpXlsx').addEventListener('click', function () { eksporTP(this, false); });
  $('btnTpPdf').addEventListener('click', function () { eksporTP(this, true); });
  $('btnAbXlsx').addEventListener('click', function () { eksporButir(this, false); });
  $('btnAbPdf').addEventListener('click', function () { eksporButir(this, true); });

  /* ================== CRUD UI ================== */
  /** Seluruh akun siswa (dengan password); cadangan: daftar siswa paket aktif. */
  function semuaSiswa() { var d = G.data || {}; return d.semuaUsers || d.users || []; }
  /** Siswa yang berhak mengikuti paket tertentu (kosong = semua siswa). */
  function siswaPaket(list, pid) {
    if (!pid) return list;
    var p = (G.data.pakets || []).filter(function (x) { return x.id === pid; })[0];
    if (!p) return list;
    return list.filter(function (u) { return p.kelas.indexOf('SEMUA') >= 0 || p.kelas.indexOf(u.k) >= 0; });
  }
  function opsiPaketSiswa(sel) {
    var pilih = sel.value;
    sel.innerHTML = '<option value="">Semua siswa</option>' + (G.data.pakets || []).map(function (p) {
      return '<option value="' + UE.esc(p.id) + '"' + (p.id === pilih ? ' selected' : '') + '>Paket: ' + UE.esc(p.nama) + ' (' + UE.esc(p.id) + ')</option>';
    }).join('');
  }
  function urutAlami(a, b) { return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' }); }
  function cariPaket(id) { return ((G.data && G.data.pakets) || []).filter(function (p) { return p.id === id; })[0] || null; }
  function ringkasPaket(id) { return ((G.data && G.data.ringkasan) || []).filter(function (r) { return r.id === id; })[0] || null; }
  /** Kelas dari data siswa + kelas yang sudah dipakai paket */
  function daftarKelasSemua() {
    var s = {};
    semuaSiswa().forEach(function (u) { if (u.k) s[u.k] = 1; });
    ((G.data && G.data.pakets) || []).forEach(function (p) { p.kelas.forEach(function (k) { if (k && k !== 'SEMUA') s[k] = 1; }); });
    return Object.keys(s).sort(urutAlami);
  }
  function daftarMapelData() {
    var s = {};
    ((G.data && G.data.pakets) || []).forEach(function (p) { var m = (p.mapel || '').trim(); if (m && !s[m.toUpperCase()]) s[m.toUpperCase()] = m; });
    return Object.keys(s).map(function (k) { return s[k]; }).sort(urutAlami);
  }
  function gagal(e) { UE.toast(e.message, 'err'); }
  /** Muat ulang setelah data diubah (menunggu pemuatan yang sedang berjalan agar data terbaru yang tampil) */
  function muatUlang() { return Promise.resolve(G.loading ? G.janji : null).then(function () { return muat(true); }); }
  /** Fitur baru butuh Code.gs 3.1 — beri tahu guru bila server belum diperbarui */
  function serverBaru() {
    if (G.data && G.data.versiKode) return true;
    UE.dialog({ judul: 'Perbarui Apps Script', pesan: 'Fitur ini membutuhkan Code.gs versi 3.1. Tempel ulang isi apps-script/Code.gs ke Apps Script, simpan, lalu Terapkan → Kelola deployment → Edit → Versi baru → Terapkan.', ok: 'Mengerti' });
    return false;
  }

  /* ---------- Formulir modal (dropdown, ceklis, sakelar) ---------- */
  /**
   * cfg: { judul, sub (html), lebar, ok, bahaya, nilai {k: v}, fields: [...], validasi(v) → pesan, simpan(v) → Promise, onUbah(k, v, ctl), pratinjau(v) → html }
   * field: { k, label, type: text|number|password|textarea|select|combo|checks|toggles, opsi [{v,t}] / [{k,t,d}] (toggles),
   *          req, hint (teks atau fungsi(v)), wide, up (huruf besar), list (saran isian), show(v), disabled, placeholder, min, max, step, rows,
   *          semua + semuaLabel (checks: pilihan "semua"), tambahan (checks: isian nilai lain), pratinjau (textarea: tampilkan pratinjau di bawahnya) }
   */
  function formModal(cfg) {
    G.modal = true;
    var nilai = cfg.nilai || {}, esc = UE.esc;
    var wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    function attr(f) {
      return (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.disabled ? ' disabled' : '') +
        (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + (f.step ? ' step="' + f.step + '"' : '') +
        (f.up ? ' style="text-transform:uppercase"' : '');
    }
    function fieldHTML(f, i) {
      var v = nilai[f.k], lbl = esc(f.label || '') + (f.req ? ' <i class="wajib">*</i>' : ''), id = 'ff' + i;
      var hint = '<small class="hint" data-hint="' + f.k + '">' + (typeof f.hint === 'string' ? esc(f.hint) : '') + '</small>';
      if (f.type === 'checks') {
        var dipilih = (v || []).map(function (x) { return String(x).toUpperCase(); });
        var semua = f.semua && dipilih.indexOf(f.semua) >= 0;
        var opsi = f.opsi.slice();
        dipilih.forEach(function (x) { if (x !== f.semua && !opsi.some(function (o) { return o.v === x; })) opsi.push({ v: x, t: x }); });
        return '<fieldset class="field cekgrup"><legend>' + lbl + '</legend><div class="cek-list">' +
          (f.semua ? '<label class="cek cek-semua"><input type="checkbox" data-semua="' + f.k + '"' + (semua ? ' checked' : '') + '> ' + esc(f.semuaLabel || 'Semua') + '</label>' : '') +
          opsi.map(function (o) {
            return '<label class="cek"><input type="checkbox" name="' + f.k + '" value="' + esc(o.v) + '"' + (!semua && dipilih.indexOf(o.v) >= 0 ? ' checked' : '') + '> ' + esc(o.t) + '</label>';
          }).join('') + (opsi.length ? '' : '<span class="small muted">Belum ada data kelas — isi di kolom bawah.</span>') + '</div>' +
          (f.tambahan ? '<input class="input cek-extra" data-extra="' + f.k + '" placeholder="' + esc(f.tambahan) + '" style="text-transform:uppercase">' : '') + hint + '</fieldset>';
      }
      if (f.type === 'toggles') {
        return '<fieldset class="field cekgrup"><legend>' + lbl + '</legend><div class="cek-list kolom">' + f.opsi.map(function (o) {
          return '<label class="cek"><input type="checkbox" name="' + o.k + '"' + (nilai[o.k] ? ' checked' : '') + '><span><b>' + esc(o.t) + '</b>' +
            (o.d ? '<small>' + esc(o.d) + '</small>' : '') + '</span></label>';
        }).join('') + '</div>' + hint + '</fieldset>';
      }
      var inp;
      if (f.type === 'textarea') inp = '<textarea class="input" id="' + id + '" name="' + f.k + '" rows="' + (f.rows || 3) + '"' + attr(f) + '>' + esc(v == null ? '' : v) + '</textarea>';
      else if (f.type === 'select' || f.type === 'combo') {
        var sv = v == null ? '' : String(v), ada = f.opsi.some(function (o) { return o.v === sv; });
        var lain = f.type === 'combo' && sv && !ada;
        inp = '<select class="input" id="' + id + '" name="' + f.k + '"' + attr(f) + '>' +
          (f.type === 'combo' ? '<option value="">— pilih —</option>' : '') +
          f.opsi.map(function (o) { return '<option value="' + esc(o.v) + '"' + (o.v === sv ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('') +
          (f.type === 'combo' ? '<option value="__baru"' + (lain ? ' selected' : '') + '>' + esc(f.baruLabel || '+ Isi baru…') + '</option>' : '') + '</select>' +
          (f.type === 'combo' ? '<input class="input combo-baru' + (lain ? '' : ' hidden') + '" name="' + f.k + '__baru" value="' + esc(lain ? sv : '') + '" placeholder="Ketik ' + esc((f.label || '').toLowerCase()) + ' baru"' + (f.up ? ' style="text-transform:uppercase"' : '') + '>' : '');
      } else {
        inp = '<input class="input" id="' + id + '" name="' + f.k + '" type="' + (f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text') + '"' +
          (f.list ? ' list="dl' + i + '"' : '') + ' value="' + esc(v == null ? '' : v) + '"' + attr(f) + ' autocomplete="off">' +
          (f.list ? '<datalist id="dl' + i + '">' + f.list.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>' : '');
      }
      return '<label class="field" for="' + id + '"><span>' + lbl + '</span>' + inp + hint + '</label>' +
        (f.pratinjau ? '<div class="pratinjau"><div class="lbl">Pratinjau</div><div class="box math" data-pratinjau></div></div>' : '');
    }
    wrap.innerHTML = '<div class="modal board form-modal" role="dialog" aria-modal="true" style="width:min(' + (cfg.lebar || 560) + 'px,100%)">' +
      '<h2 class="board-title">' + esc(cfg.judul) + '</h2>' + (cfg.sub ? '<p class="board-sub">' + cfg.sub + '</p>' : '') +
      '<form novalidate><div class="form-grid">' + cfg.fields.map(function (f, i) {
        return '<div class="ff' + (f.wide || f.type === 'checks' || f.type === 'toggles' || f.type === 'textarea' ? ' wide' : '') + '" data-ff="' + f.k + '">' + fieldHTML(f, i) + '</div>';
      }).join('') + '</div><p class="form-err hidden" role="alert"></p>' +
      '<div class="modal-actions"><button type="button" class="btn btn-wood" data-batal>Batal</button>' +
      '<button type="submit" class="btn ' + (cfg.bahaya ? 'btn-red' : 'btn-green') + '">' + esc(cfg.ok || 'Simpan') + '</button></div></form></div>';
    document.body.appendChild(wrap);
    var form = wrap.querySelector('form'), err = wrap.querySelector('.form-err'), q = function (s) { return form.querySelector(s); };

    function baca() {
      var v = {};
      cfg.fields.forEach(function (f) {
        if (f.type === 'checks') {
          var semua = q('[data-semua="' + f.k + '"]');
          if (semua && semua.checked) { v[f.k] = [f.semua]; return; }
          var list = Array.prototype.map.call(form.querySelectorAll('input[name="' + f.k + '"]:checked'), function (x) { return x.value; });
          var ex = q('[data-extra="' + f.k + '"]');
          if (ex) ex.value.split(/[,;]/).forEach(function (s) { s = s.trim().toUpperCase(); if (s && list.indexOf(s) < 0) list.push(s); });
          v[f.k] = list;
        } else if (f.type === 'toggles') {
          f.opsi.forEach(function (o) { v[o.k] = q('[name="' + o.k + '"]').checked; });
        } else {
          var el = q('[name="' + f.k + '"]'), x = el.value;
          if (f.type === 'combo' && x === '__baru') x = q('[name="' + f.k + '__baru"]').value;
          if (f.type !== 'textarea') x = x.trim();
          v[f.k] = f.up ? x.toUpperCase() : x;
        }
      });
      return v;
    }
    var tPrev = null;
    function atur(k) {
      var v = baca();
      cfg.fields.forEach(function (f) {
        var box = q('[data-ff="' + f.k + '"]');
        if (f.show) box.classList.toggle('hidden', !f.show(v));
        if (typeof f.hint === 'function') box.querySelector('[data-hint]').textContent = f.hint(v) || '';
        if (f.type === 'combo') box.querySelector('.combo-baru').classList.toggle('hidden', q('[name="' + f.k + '"]').value !== '__baru');
        if (f.type === 'checks' && f.semua) {
          var semua = q('[data-semua="' + f.k + '"]').checked;
          box.querySelectorAll('input[name="' + f.k + '"], [data-extra]').forEach(function (x) { x.disabled = semua; });
          box.classList.toggle('semua-on', semua);
        }
      });
      if (cfg.onUbah && k) cfg.onUbah(k, v, ctl);
      var prev = q('[data-pratinjau]');
      if (prev && cfg.pratinjau) {
        clearTimeout(tPrev);
        tPrev = setTimeout(function () { prev.innerHTML = cfg.pratinjau(baca()) || '<span class="muted">–</span>'; UE.typeset(prev); }, k ? 350 : 0);
      }
    }
    var ctl = {
      set: function (k, x) { var el = q('[name="' + k + '"]'); if (el) el.value = x; },
      tutup: tutup
    };
    function tutup() { wrap.remove(); G.modal = false; }
    function ubah(e) { var n = e.target.name || e.target.getAttribute('data-semua') || e.target.getAttribute('data-extra') || ''; atur(n.replace(/__baru$/, '') || 'x'); }
    form.addEventListener('input', ubah);
    form.addEventListener('change', ubah);
    wrap.querySelector('[data-batal]').addEventListener('click', tutup);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = baca(), pesan = '';
      cfg.fields.some(function (f) {
        if (!f.req || q('[data-ff="' + f.k + '"]').classList.contains('hidden')) return false;
        var x = v[f.k];
        if (Array.isArray(x) ? !x.length : !String(x == null ? '' : x).trim()) { pesan = (f.label || f.k) + ' wajib diisi.'; return true; }
        return false;
      });
      if (!pesan && cfg.validasi) pesan = cfg.validasi(v) || '';
      err.textContent = pesan; err.classList.toggle('hidden', !pesan);
      if (pesan) return;
      var b = form.querySelector('[type=submit]'), asli = b.innerHTML;
      b.disabled = true; b.innerHTML = '<span class="spinner"></span> Menyimpan…';
      Promise.resolve(cfg.simpan(v, ctl)).then(tutup).catch(function (e2) {
        err.textContent = e2.message; err.classList.remove('hidden');
        b.disabled = false; b.innerHTML = asli;
      });
    });
    atur('');
    var awal = form.querySelector('input:not([type=checkbox]):not([disabled]), textarea, select');
    if (awal) setTimeout(function () { awal.focus(); }, 30);
    return ctl;
  }

  /** Modal pilihan aksi (mis. format template / export). tombol: [{t, d, fn → Promise?}] */
  function pilihAksi(judul, sub, tombol) {
    G.modal = true;
    var wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal board" role="dialog" aria-modal="true" style="width:min(560px,100%)"><h2 class="board-title">' + UE.esc(judul) + '</h2>' +
      (sub ? '<p class="board-sub">' + sub + '</p>' : '') + '<div class="pilih-aksi">' + tombol.map(function (x, i) {
        return '<button type="button" class="pilih-btn" data-i="' + i + '"><b>' + UE.esc(x.t) + '</b>' + (x.d ? '<span>' + UE.esc(x.d) + '</span>' : '') + '</button>';
      }).join('') + '</div><div class="modal-actions"><button type="button" class="btn btn-wood" data-batal>Tutup</button></div></div>';
    document.body.appendChild(wrap);
    function tutup() { wrap.remove(); G.modal = false; }
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.closest('[data-batal]')) { tutup(); return; }
      var b = e.target.closest('[data-i]'); if (!b || b.disabled) return;
      b.disabled = true; b.classList.add('sibuk');
      Promise.resolve().then(function () { return tombol[+b.dataset.i].fn(); }).then(tutup)
        .catch(function (er) { gagal(er); b.disabled = false; b.classList.remove('sibuk'); });
    });
  }

  /* ================== RINGKASAN (beranda dashboard) ================== */
  function statusPaket(p, r) {
    var masalah = [];
    if (!r) return { siap: false, nonaktif: !p.aktif, masalah: [] };
    if (!r.pg && !r.es) masalah.push('Belum ada soal');
    if (r.tanpaKunci) masalah.push(r.tanpaKunci + ' soal PG kuncinya tidak valid');
    if (!r.tokenAktif && !r.tokenNanti) masalah.push('Belum ada token aktif');
    if (!r.peserta) masalah.push('Tidak ada siswa di kelas sasaran');
    if (batasTerlaluPendek(p.mode, p.durasiMenit, r.waktuSoal)) masalah.push('Waktu maksimal ' + p.durasiMenit + ' menit lebih pendek dari waktu minimal semua soal (' + Math.ceil(r.waktuSoal / 60) + ' menit), siswa tidak akan sempat sampai soal terakhir');
    return { siap: p.aktif && !masalah.length, nonaktif: !p.aktif, masalah: masalah };
  }
  function renderRingkasan() {
    var d = G.data; if (!d || !$('tblRingkasan')) return;
    var pakets = d.pakets || [], rk = {};
    (d.ringkasan || []).forEach(function (r) { rk[r.id] = r; });
    $('bannerServer').classList.toggle('hidden', !!d.versiKode);
    opsiSelect($('filterMapelRingkasan'), daftarMapelData().map(function (x) { return { v: x, t: x }; }), 'Semua mata pelajaran');
    var cari = $('cariRingkasan').value.trim().toLowerCase(), fm = $('filterMapelRingkasan').value.toUpperCase(), fs = $('filterStatusRingkasan').value;
    var tot = { pg: 0, es: 0, siap: 0, aktif: 0 };
    pakets.forEach(function (p) {
      var r = rk[p.id] || {};
      tot.pg += r.pg || 0; tot.es += r.es || 0;
      if (p.aktif) tot.aktif++;
      if (statusPaket(p, rk[p.id]).siap) tot.siap++;
    });
    var siswa = semuaSiswa();
    $('statsRingkasan').innerHTML = stat(pakets.length, 'Paket ujian') + stat(tot.aktif, 'Paket aktif', 's-login') + stat(tot.siap, 'Siap diujikan', 's-done') +
      stat(tot.pg, 'Soal pilihan ganda', 's-wait') + stat(tot.es, 'Soal essay', 's-wait') + stat(siswa.length, 'Siswa terdaftar') + stat(kelasDari(siswa).length, 'Kelas');

    var list = pakets.filter(function (p) {
      var st = statusPaket(p, rk[p.id]);
      return (!cari || (p.nama + ' ' + p.id + ' ' + p.mapel).toLowerCase().indexOf(cari) >= 0) &&
        (!fm || (p.mapel || '').toUpperCase() === fm) &&
        (!fs || (fs === 'siap' ? st.siap : fs === 'nonaktif' ? st.nonaktif : !st.siap && !st.nonaktif));
    });
    document.querySelector('#tblRingkasan tbody').innerHTML = list.map(function (p) {
      var r = rk[p.id] || { pg: 0, es: 0, skorPG: 0, skorES: 0, tp: 0, tanpaTP: 0, tokenAktif: 0, tokenNanti: 0, peserta: 0, kiriman: 0 };
      var st = statusPaket(p, rk[p.id]), total = r.pg + r.es, id = UE.esc(p.id);
      var status = st.nonaktif ? '<span class="pill no">Nonaktif</span>' : st.siap ? '<span class="pill ok">Siap diujikan</span>' : '<span class="pill warn">Perlu dilengkapi</span>';
      if (st.masalah.length) status += '<div class="small muted ket-masalah">' + st.masalah.map(UE.esc).join('<br>') + '</div>';
      var tp = !total ? '–' : r.tanpaTP ? '<span class="pill warn" title="' + r.tanpaTP + ' soal belum memiliki TP">' + (total - r.tanpaTP) + '/' + total + ' soal</span>' : '<span class="pill ok">' + r.tp + ' TP</span>';
      var token = r.tokenAktif ? '<span class="pill ok">' + r.tokenAktif + ' aktif</span>' : r.tokenNanti ? '<span class="pill MENUNGGU">' + r.tokenNanti + ' terjadwal</span>' : '<span class="pill warn">Belum ada</span>';
      return '<tr><td class="wrap"><b>' + UE.esc(p.nama) + '</b><div class="small muted">' + id + ' · ' + UE.esc(MODE[p.mode] || p.mode) + (r.durasi ? ' · ' + Math.ceil(r.durasi / 60) + ' mnt' : '') + '</div></td>' +
        '<td>' + UE.esc(p.mapel || '–') + '</td><td class="wrap">' + UE.esc(p.kelas.join(', ')) + '</td>' +
        '<td>' + (total ? '<b>' + r.pg + '</b> PG · <b>' + r.es + '</b> essay<div class="small muted">Skor maks ' + (r.skorPG + r.skorES) + '</div>' : '<span class="pill warn">Belum ada soal</span>') + '</td>' +
        '<td>' + tp + '</td><td>' + token + '</td>' +
        '<td class="c" title="Sudah mengirim / peserta">' + r.kiriman + '/' + r.peserta + '</td><td class="wrap">' + status + '</td>' +
        '<td><div class="aksi"><button class="btn btn-blue btn-sm" data-lihat="' + id + '"' + (total ? '' : ' disabled') + '>Lihat soal</button>' +
        '<button class="btn btn-wood btn-sm" data-kelola="' + id + '">Kelola</button></div></td></tr>';
    }).join('') || '<tr><td colspan="9" class="muted">' + (pakets.length ? 'Tidak ada paket yang cocok dengan filter.' : 'Belum ada paket. Buat paket baru di menu <b>Paket Soal</b>.') + '</td></tr>';

    var mp = {};
    pakets.forEach(function (p) {
      var nama = p.mapel || '(tanpa mapel)', r = rk[p.id] || {};
      var m = mp[nama.toUpperCase()] || (mp[nama.toUpperCase()] = { n: nama, paket: 0, pg: 0, es: 0, siap: 0 });
      m.paket++; m.pg += r.pg || 0; m.es += r.es || 0;
      if (statusPaket(p, rk[p.id]).siap) m.siap++;
    });
    document.querySelector('#tblMapel tbody').innerHTML = Object.keys(mp).sort(urutAlami).map(function (k) {
      var m = mp[k];
      return '<tr><td><b>' + UE.esc(m.n) + '</b></td><td class="c">' + m.paket + '</td><td class="c">' + m.pg + '</td><td class="c">' + m.es + '</td>' +
        '<td class="c"><b>' + (m.pg + m.es) + '</b></td><td class="c">' + m.siap + '/' + m.paket + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="muted">Belum ada data.</td></tr>';
  }
  ['cariRingkasan', 'filterMapelRingkasan', 'filterStatusRingkasan'].forEach(function (id) { $(id).addEventListener(id === 'cariRingkasan' ? 'input' : 'change', renderRingkasan); });
  $('tblRingkasan').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.lihat) lihatSoal(b.dataset.lihat);
    if (b.dataset.kelola) kelolaSoal(b.dataset.kelola);
  });
  $('btnRingkasanSegar').addEventListener('click', function () { muat(); });
  $('btnRingkasanPaket').addEventListener('click', function () { formPaket(null); });

  /** Buka Bank Soal untuk paket tertentu */
  function kelolaSoal(pid) {
    opsiPaketSoal();
    $('selMasterPaketSoal').value = pid;
    bukaTab('t-master-soal');
  }

  /** Pratinjau seluruh soal satu paket + cetak naskah */
  function lihatSoal(pid) {
    var p = cariPaket(pid); if (!p) return;
    G.modal = true;
    var soal = [], wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal board" role="dialog" aria-modal="true" style="width:min(900px,100%)">' +
      '<h2 class="board-title">' + UE.esc(p.nama) + ' <span class="small muted">' + UE.esc(p.id) + '</span></h2>' +
      '<p class="board-sub">' + UE.esc((p.mapel || '-') + ' · Kelas ' + p.kelas.join(', ') + ' · ' + (MODE[p.mode] || p.mode)) + '</p>' +
      '<div class="toolbar-guru"><label class="check"><input type="checkbox" data-kunci checked> Tampilkan kunci &amp; pedoman</label>' +
      '<select class="input" data-tipe style="flex:0 1 170px"><option value="">Semua tipe</option><option value="PG">Pilihan ganda</option><option value="ES">Essay</option></select>' +
      '<button type="button" class="btn btn-red btn-sm" data-cetak disabled><svg class="ic"><use href="#i-pdf"/></svg> Cetak naskah</button>' +
      '<button type="button" class="btn btn-blue btn-sm" data-kelola>Kelola di Bank Soal</button>' +
      '<button type="button" class="btn btn-wood btn-sm" data-tutup>Tutup</button></div>' +
      '<div data-isi><span class="spinner dark"></span> Memuat soal…</div></div>';
    document.body.appendChild(wrap);
    var isi = wrap.querySelector('[data-isi]');
    function tutup() { wrap.remove(); G.modal = false; }
    function render() {
      var kunci = wrap.querySelector('[data-kunci]').checked, ft = wrap.querySelector('[data-tipe]').value;
      var list = soal.filter(function (s) { return !ft || s.tipe === ft; });
      isi.innerHTML = list.map(function (s) {
        var pg = s.tipe === 'PG';
        return '<div class="detail-item"><h4>' + (pg ? 'Pilihan ganda ' : 'Essay ') + s.no + ' <span class="small muted">· skor ' + s.skor + ' · ' + s.waktu + ' detik</span></h4>' +
          '<div class="box math">' + UE.rich(s.soal) + '</div>' + (s.gambar ? '<img class="q-img" src="' + UE.esc(s.gambar) + '" alt="Gambar soal">' : '') +
          (pg ? '<div class="opsi-guru">' + s.opsi.map(function (o) {
            return '<div class="' + (kunci && o.k === s.kunci ? 'kunci' : '') + ' math"><b>' + o.k + '.</b> ' + UE.rich(o.t) + (kunci && o.k === s.kunci ? ' ✔ kunci' : '') + '</div>';
          }).join('') + '</div>' : (kunci ? '<div class="lbl">Pedoman jawaban</div><div class="box math">' + UE.rich(s.pedoman || '-') + '</div>' : '')) +
          (kunci ? '<p class="small muted" style="margin:6px 0 0">TP: ' + (s.tp ? UE.esc(s.tp) : '<span class="pill warn">belum diisi</span>') + '</p>' : '') + '</div>';
      }).join('') || '<p class="muted">Tidak ada soal.</p>';
      UE.typeset(isi);
    }
    guru('guruAmbilSoal', { paket: pid }).then(function (r) { soal = r.soal || []; wrap.querySelector('[data-cetak]').disabled = !soal.length; render(); })
      .catch(function (e) { isi.innerHTML = '<p class="form-err">' + UE.esc(e.message) + '</p>'; });
    wrap.addEventListener('change', function (e) { if (e.target.matches('[data-kunci], [data-tipe]')) render(); });
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.closest('[data-tutup]')) { tutup(); return; }
      if (e.target.closest('[data-kelola]')) { tutup(); kelolaSoal(pid); return; }
      if (e.target.closest('[data-cetak]')) cetakNaskah(p, soal, wrap.querySelector('[data-kunci]').checked);
    });
  }
  function cetakNaskah(p, soal, kunci) {
    var w = window.open('', '_blank');
    if (!w) { UE.toast('Browser memblokir tab baru. Izinkan pop-up untuk situs ini.', 'err'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:30px">Menyiapkan naskah…</p>');
    ambilMeta().catch(function () { return {}; }).then(function (m) {
      window.Laporan.naskah(w, { kunci: kunci, tp: $('lapTP').value, setting: (m && m.setting) || { NAMA_SEKOLAH: G.data.sekolah } }, p, soal);
    });
  }

  /* ================== DATA SISWA ================== */
  function renderMasterSiswa() {
    var d = G.data; if (!d) return;
    var cariEl = $('cariMasterSiswa'), fp = $('filterMasterPaket');
    if (fp) opsiPaketSiswa(fp);
    var cari = cariEl ? cariEl.value.trim().toLowerCase() : '';
    var semua = semuaSiswa();
    var list = siswaPaket(semua, fp ? fp.value : '').filter(function (u) { return !cari || u.n.toLowerCase().indexOf(cari) >= 0 || u.u.indexOf(cari) >= 0; })
      .sort(function (a, b) { return urutAlami(a.k, b.k) || a.n.localeCompare(b.n); });
    var info = $('infoMasterSiswa');
    if (info) info.textContent = 'Menampilkan ' + list.length + ' dari ' + semua.length + ' siswa · ' + kelasDari(semua).length + ' kelas.';
    var tbl = $('tblMasterSiswa');
    if (tbl) {
      tbl.querySelector('tbody').innerHTML = list.map(function (u) {
        return '<tr><td><b>' + UE.esc(u.u) + '</b></td><td><code>' + UE.esc(u.p == null ? '' : u.p) + '</code></td><td>' + UE.esc(u.n) + '</td><td>' + UE.esc(u.k) + '</td>' +
          '<td><div class="aksi"><button class="btn btn-blue btn-sm" data-editsiswa="' + UE.esc(u.u) + '">Edit</button>' +
          '<button class="btn btn-red btn-sm" data-hapussiswa="' + UE.esc(u.u) + '">Hapus</button></div></td></tr>';
      }).join('') || '<tr><td colspan="5" class="muted">Tidak ada data</td></tr>';
    }
  }
  if ($('filterMasterPaket')) $('filterMasterPaket').addEventListener('change', renderMasterSiswa);
  if ($('cariMasterSiswa')) $('cariMasterSiswa').addEventListener('input', renderMasterSiswa);

  function formSiswa(u) {
    var baru = !u;
    formModal({
      judul: baru ? 'Tambah siswa' : 'Edit siswa ' + u.u, lebar: 560,
      nilai: baru ? { username: '', password: String(1000 + Math.floor(Math.random() * 9000)), nama: '', kelas: '' } : { username: u.u, password: u.p || '', nama: u.n, kelas: u.k },
      fields: [
        { k: 'username', label: 'Username', req: true, placeholder: 'mis. siswa01', hint: 'Tanpa spasi; dipakai untuk login.' },
        { k: 'password', label: 'Password', hint: baru ? 'Kosong = 1234' : 'Kosongkan bila tidak diubah.' },
        { k: 'nama', label: 'Nama lengkap', req: true, wide: true },
        { k: 'kelas', label: 'Kelas', type: 'combo', req: true, up: true, baruLabel: '+ Kelas baru…', opsi: daftarKelasSemua().map(function (k) { return { v: k, t: k }; }) }
      ],
      validasi: function (v) { return /\s/.test(v.username) ? 'Username tidak boleh mengandung spasi.' : ''; },
      simpan: function (v) {
        // Code.gs lama membaca "password" (= password guru) sebagai password siswa → wajib server 3.1
        if (!G.data.versiKode) return Promise.reject(new Error('Perbarui Code.gs ke versi 3.1 (Kelola deployment → Versi baru) sebelum menyimpan data siswa.'));
        return guru('guruSimpanSiswa', { usernamelama: baru ? '' : u.u, username: v.username, pwSiswa: v.password, nama: v.nama, kelas: v.kelas })
          .then(function () { UE.toast('Data siswa tersimpan', 'ok'); muatUlang(); });
      }
    });
  }

  if ($('tblMasterSiswa')) $('tblMasterSiswa').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.hapussiswa) {
      var id = b.dataset.hapussiswa;
      UE.dialog({ judul: 'Hapus siswa ' + id + '?', pesan: 'Akun siswa dihapus dari sheet USER. Hasil ujian yang sudah masuk tetap tersimpan.', ok: 'Hapus', batal: 'Batal', bahaya: true })
        .then(function (ya) { if (ya) guru('guruHapusSiswa', { username: id }).then(function () { UE.toast('Siswa dihapus', 'ok'); muatUlang(); }).catch(gagal); });
    }
    if (b.dataset.editsiswa) {
      var u = semuaSiswa().filter(function (x) { return x.u === b.dataset.editsiswa; })[0];
      if (u) formSiswa(u);
    }
  });
  if ($('btnTambahSiswa')) $('btnTambahSiswa').addEventListener('click', function () { formSiswa(null); });

  /* ================== PAKET SOAL ================== */
  var OPSI_MODE = [
    { v: 'TIMER', t: 'TIMER — satu timer untuk seluruh ujian' },
    { v: 'TIMERSOAL', t: 'TIMERSOAL — timer per soal, terkunci saat habis' },
    { v: 'TIMERFIXED', t: 'TIMERFIXED — waktu minimal per soal + timer total' }
  ];
  var KET_MODE = {
    TIMER: 'Siswa bebas maju-mundur, lompat nomor, dan menandai ragu-ragu. Ujian selesai otomatis saat durasi habis.',
    TIMERSOAL: 'Setiap soal memakai waktu soalnya. Saat habis jawaban terkunci dan pindah otomatis; tidak bisa kembali.',
    TIMERFIXED: 'Tombol Lanjut terkunci sampai waktu soal habis, lalu siswa masih boleh menjawab sampai waktu maksimal ujian habis. Tidak bisa kembali.'
  };
  var MODE_BERBATAS = ['TIMER', 'TIMERFIXED']; // mode yang memakai DURASI_MENIT
  /** TIMERFIXED: tombol Lanjut terkunci selama waktu tiap soal, jadi batas di bawah jumlahnya membuat soal terakhir tak tercapai */
  function batasTerlaluPendek(mode, menit, waktuSoal) { return mode === 'TIMERFIXED' && +menit > 0 && !!waktuSoal && +menit * 60 < waktuSoal; }
  function petunjukDurasi(v, r) {
    var ring = (G.data && G.data.ringkasan) || [];
    if (v.mode !== 'TIMERFIXED') return 'Kosongkan = jumlah waktu semua soal.';
    if (ring.length && !ring.some(function (x) { return x.waktuSoal !== undefined; })) return 'Server belum diperbarui: batas ini baru berlaku setelah Code.gs versi baru di-deploy.';
    var total = r && r.waktuSoal, mnt = total ? Math.ceil(total / 60) : 0;
    if (batasTerlaluPendek(v.mode, v.durasi, total)) return 'Terlalu pendek: tombol Lanjut terkunci total ' + mnt + ' menit, siswa tidak akan sempat sampai soal terakhir.';
    return 'Kosongkan = jumlah waktu soal + 5%' + (total ? ' (' + Math.ceil(total * 1.05 / 60) + ' menit). Waktu minimal semua soal: ' + mnt + ' menit.' : '.');
  }
  var POLA_ID = /^[A-Za-z0-9._-]+$/;
  var PESAN_ID = 'ID paket hanya boleh huruf, angka, titik, tanda hubung (-) dan garis bawah (_), tanpa spasi.';

  function renderMasterPaket() {
    var d = G.data; if (!d || !d.pakets) return;
    var tbl = $('tblMasterPaket'), cari = $('cariMasterPaket').value.trim().toLowerCase();
    var ya = function (b) { return b ? '<span class="pill ok">Ya</span>' : '<span class="pill no">Tidak</span>'; };
    if (tbl) {
      tbl.querySelector('tbody').innerHTML = d.pakets.filter(function (p) {
        return !cari || (p.id + ' ' + p.nama + ' ' + p.mapel + ' ' + p.kelas.join(' ')).toLowerCase().indexOf(cari) >= 0;
      }).map(function (p) {
        var r = ringkasPaket(p.id) || {}, id = UE.esc(p.id);
        return '<tr><td><b>' + id + '</b></td><td class="wrap">' + UE.esc(p.nama) + '</td><td>' + UE.esc(p.mapel) + '</td><td class="wrap">' + UE.esc(p.kelas.join(', ')) + '</td>' +
          '<td>' + (r.pg || 0) + ' PG · ' + (r.es || 0) + ' essay</td><td>' + UE.esc(p.mode) + '</td>' +
          '<td>' + (MODE_BERBATAS.indexOf(p.mode) >= 0 ? (p.durasiMenit ? p.durasiMenit + ' mnt' : 'Otomatis') : '–') + '</td>' +
          '<td>' + ya(p.acak) + '</td><td>' + ya(p.acakOpsi) + '</td><td>' + ya(p.tampil) + '</td><td>' + ya(p.aktif) + '</td>' +
          '<td><div class="aksi"><button class="btn btn-blue btn-sm" data-editpaket="' + id + '">Edit</button>' +
          '<button class="btn btn-wood btn-sm" data-duplikatpaket="' + id + '">Duplikat</button>' +
          '<button class="btn btn-red btn-sm" data-hapuspaket="' + id + '">Hapus</button></div></td></tr>';
      }).join('') || '<tr><td colspan="12" class="muted">' + (d.pakets.length ? 'Tidak ada paket yang cocok.' : 'Belum ada paket. Klik Tambah Paket.') + '</td></tr>';
    }
    opsiPaketSoal();
  }
  function opsiPaketSoal() {
    var sel = $('selMasterPaketSoal'), d = G.data; if (!sel || !d || !d.pakets) return;
    var curr = sel.value || G.paket || (d.pakets[0] && d.pakets[0].id) || '';
    sel.innerHTML = d.pakets.map(function (p) {
      var r = ringkasPaket(p.id);
      return '<option value="' + UE.esc(p.id) + '">' + UE.esc(p.nama) + ' (' + UE.esc(p.id) + ')' + (r ? ' — ' + r.pg + ' PG, ' + r.es + ' essay' : '') + '</option>';
    }).join('') || '<option value="">Belum ada paket</option>';
    sel.value = cariPaket(curr) ? curr : (d.pakets[0] ? d.pakets[0].id : '');
  }
  $('cariMasterPaket').addEventListener('input', renderMasterPaket);

  function formPaket(p) {
    var baru = !p, r = p ? ringkasPaket(p.id) : null, terkunci = !!(r && r.kiriman);
    formModal({
      judul: baru ? 'Tambah paket soal' : 'Edit paket ' + p.id, lebar: 760,
      sub: baru ? 'Setelah paket dibuat, isi soal di <b>Bank Soal</b> dan buat <b>Token</b> agar paket bisa diunduh siswa.' : '',
      nilai: baru ? { id: '', nama: '', mapel: '', kelas: [], mode: 'TIMER', durasi: '60', acak: true, acakopsi: true, tampil: true, aktif: true }
        : { id: p.id, nama: p.nama, mapel: p.mapel, kelas: p.kelas, mode: p.mode, durasi: p.durasiMenit || '', acak: p.acak, acakopsi: p.acakOpsi, tampil: p.tampil, aktif: p.aktif },
      fields: [
        { k: 'id', label: 'ID paket', req: true, up: baru, disabled: terkunci, placeholder: 'mis. IPA8-KALOR',
          hint: terkunci ? 'ID terkunci karena paket ini sudah memiliki hasil ujian.' : 'Kode unik tanpa spasi (huruf, angka, - atau _).' },
        { k: 'nama', label: 'Nama ujian', req: true, placeholder: 'mis. Ulangan Harian Kalor' },
        { k: 'mapel', label: 'Mata pelajaran', list: daftarMapelData(), placeholder: 'mis. IPA', hint: 'Tulis konsisten agar laporan per mapel rapi.' },
        { k: 'mode', label: 'Mode timer', type: 'select', wide: true, opsi: OPSI_MODE, hint: function (v) { return KET_MODE[v.mode]; } },
        { k: 'durasi', label: 'Waktu maksimal ujian (menit)', type: 'number', min: 1, show: function (v) { return MODE_BERBATAS.indexOf(v.mode) >= 0; }, hint: function (v) { return petunjukDurasi(v, r); } },
        { k: 'kelas', label: 'Kelas peserta', type: 'checks', req: true, opsi: daftarKelasSemua().map(function (k) { return { v: k, t: k }; }),
          semua: 'SEMUA', semuaLabel: 'Semua kelas', tambahan: 'Kelas lain yang belum ada di daftar (pisahkan dengan koma)' },
        { k: 'pengaturan', label: 'Pengaturan ujian', type: 'toggles', opsi: [
          { k: 'acak', t: 'Acak urutan soal', d: 'Per siswa; PG tetap di depan, essay di belakang' },
          { k: 'acakopsi', t: 'Acak urutan opsi A–E', d: 'Per siswa' },
          { k: 'tampil', t: 'Tampilkan nilai ke siswa', d: 'Lewat menu "Lihat nilaiku"' },
          { k: 'aktif', t: 'Aktif', d: 'Ikut terunduh ke HP siswa (perlu soal & token)' }] }
      ],
      validasi: function (v) { return POLA_ID.test(v.id) ? '' : PESAN_ID; },
      simpan: function (v) {
        var yt = function (b) { return b ? 'YA' : 'TIDAK'; };
        var yakin = !batasTerlaluPendek(v.mode, v.durasi, r && r.waktuSoal) ? Promise.resolve(true) : UE.dialog({
          judul: 'Waktu maksimal terlalu pendek', bahaya: true, ok: 'Tetap simpan', batal: 'Perbaiki',
          pesan: 'Tombol Lanjut terkunci total ' + Math.ceil(r.waktuSoal / 60) + ' menit, sedangkan waktu maksimal hanya ' + v.durasi + ' menit. Ujian akan berakhir otomatis sebelum siswa sampai soal terakhir.' });
        return yakin.then(function (lanjut) {
          if (!lanjut) throw new Error('Belum disimpan. Perbesar waktu maksimal ujian atau kosongkan.');
          return guru('guruSimpanPaket', { idlama: baru ? '' : p.id, id: terkunci ? p.id : v.id, nama: v.nama, mapel: v.mapel, kelas: v.kelas.join(', '), mode: v.mode,
          durasi: MODE_BERBATAS.indexOf(v.mode) >= 0 ? v.durasi : (p ? p.durasiMenit || '' : ''), acak: yt(v.acak), acakopsi: yt(v.acakopsi), tampil: yt(v.tampil), aktif: yt(v.aktif) });
        }).then(function (res) {
            var id = (res && res.id) || v.id;
            UE.toast('Paket ' + id + ' tersimpan' + (res && res.pindah ? ' · ' + res.pindah + ' soal/token ikut pindah ke ID baru' : ''), 'ok');
            return muatUlang().then(function () {
              if (!baru) return;
              UE.dialog({ judul: 'Paket ' + id + ' dibuat', pesan: 'Lanjut mengisi soal untuk paket ini sekarang? Jangan lupa membuat token di menu Token agar paket bisa diunduh siswa.', ok: 'Isi soal sekarang', batal: 'Nanti' })
                .then(function (ya) { if (ya) kelolaSoal(id); });
            });
          });
      }
    });
  }
  function formDuplikat(p) {
    if (!serverBaru()) return;
    var idBaru = p.id + '-2', n = 2;
    while (cariPaket(idBaru)) idBaru = p.id + '-' + (++n);
    var r = ringkasPaket(p.id) || {};
    formModal({
      judul: 'Duplikat paket ' + p.id, lebar: 520,
      sub: 'Paket baru berisi salinan <b>' + ((r.pg || 0) + (r.es || 0)) + ' soal</b> (PG &amp; essay) beserta pengaturannya. Token tidak ikut disalin dan paket salinan dibuat <b>nonaktif</b>.',
      nilai: { idBaru: idBaru, nama: p.nama + ' (salinan)' },
      fields: [{ k: 'idBaru', label: 'ID paket baru', req: true, up: true }, { k: 'nama', label: 'Nama ujian', req: true, wide: true }],
      validasi: function (v) { return POLA_ID.test(v.idBaru) ? '' : PESAN_ID; },
      ok: 'Duplikat',
      simpan: function (v) {
        return guru('guruDuplikatPaket', { id: p.id, idBaru: v.idBaru, nama: v.nama }, 120000).then(function (res) {
          UE.toast('Paket ' + res.id + ' dibuat dengan ' + res.soal + ' soal', 'ok');
          return muatUlang();
        });
      }
    });
  }
  function hapusPaket(p) {
    var r = ringkasPaket(p.id) || {}, nSoal = (r.pg || 0) + (r.es || 0);
    formModal({
      judul: 'Hapus paket ' + p.id + '?', lebar: 520, bahaya: true, ok: 'Hapus paket',
      sub: 'Paket <b>' + UE.esc(p.nama) + '</b> dihapus dari sheet PAKET. Hasil ujian siswa yang sudah masuk tetap tersimpan.',
      nilai: { hapusData: false },
      fields: [{ k: 'opsi', label: 'Data terkait', type: 'toggles', opsi: [{ k: 'hapusData', t: 'Hapus juga ' + nSoal + ' soal dan semua token paket ini',
        d: 'Bila tidak dicentang, soal tetap ada di sheet dan muncul lagi bila paket dengan ID yang sama dibuat ulang.' }] }],
      simpan: function (v) {
        return guru('guruHapusPaket', { id: p.id, hapusData: v.hapusData ? 'YA' : '' }).then(function (res) {
          UE.toast('Paket dihapus' + (res && (res.soal || res.token) ? ' · ' + res.soal + ' soal & ' + res.token + ' token ikut dihapus' : ''), 'ok');
          if (G.paket === p.id) { G.paket = ''; sessionStorage.removeItem('ue_guru_paket'); }
          return muatUlang();
        });
      }
    });
  }

  if ($('tblMasterPaket')) $('tblMasterPaket').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var p = cariPaket(b.dataset.editpaket || b.dataset.duplikatpaket || b.dataset.hapuspaket);
    if (!p) return;
    if (b.dataset.editpaket) formPaket(p);
    if (b.dataset.duplikatpaket) formDuplikat(p);
    if (b.dataset.hapuspaket) hapusPaket(p);
  });
  if ($('btnTambahPaket')) $('btnTambahPaket').addEventListener('click', function () { formPaket(null); });

  /* ================== BANK SOAL ================== */
  var currentSoal = [], soalReq = 0, soalPaketId = '', soalMuat = false;
  var HURUF = ['A', 'B', 'C', 'D', 'E'];
  function daftarTP() { var tp = {}; currentSoal.forEach(function (s) { if (s.tp) tp[s.tp] = 1; }); return Object.keys(tp).sort(urutAlami); }
  function nomorBaru(tipe) { return currentSoal.filter(function (s) { return s.tipe === tipe; }).reduce(function (m, s) { return Math.max(m, s.no); }, 0) + 1; }
  function linkAman(u) { return /^https?:\/\//i.test(u || ''); }

  function renderMasterSoal() {
    var tbl = $('tblMasterSoal'); if (!tbl) return;
    var ft = $('filterTipeSoal').value, cari = $('cariSoal').value.trim().toLowerCase();
    var list = currentSoal.filter(function (s) { return (!ft || s.tipe === ft) && (!cari || (s.soal + ' ' + (s.tp || '')).toLowerCase().indexOf(cari) >= 0); });
    tbl.querySelector('tbody').innerHTML = list.map(function (s) {
      var pg = s.tipe === 'PG', key = s.tipe + '|' + s.no;
      var kunci = pg ? (s.opsi.some(function (o) { return o.k === s.kunci; }) ? '<b>' + UE.esc(s.kunci) + '</b> <span class="small muted">dari ' + s.opsi.length + ' opsi</span>' : '<span class="pill warn">Tidak valid</span>')
        : (s.pedoman ? '<span class="pill ok">Ada pedoman</span>' : '<span class="pill warn">Tanpa pedoman</span>');
      return '<tr><td><b>' + s.no + '</b></td><td><span class="tipe-tag ' + s.tipe.toLowerCase() + '">' + (pg ? 'PG' : 'Essay') + '</span></td>' +
        '<td class="wrap soal-sel math">' + UE.rich(s.soal) + '</td>' +
        '<td>' + (s.gambar && linkAman(s.gambar) ? '<a href="' + UE.esc(s.gambar) + '" target="_blank" rel="noopener">Lihat</a>' : '–') + '</td>' +
        '<td>' + kunci + '</td><td>' + s.skor + '</td><td>' + s.waktu + ' dtk</td>' +
        '<td class="tp-sel">' + (s.tp ? UE.esc(s.tp) : '<span class="pill warn">Belum diisi</span>') + '</td>' +
        '<td><div class="aksi"><button class="btn btn-blue btn-sm" data-editsoal="' + key + '">Edit</button>' +
        '<button class="btn btn-red btn-sm" data-hapussoal="' + key + '">Hapus</button></div></td></tr>';
    }).join('') || '<tr><td colspan="9" class="muted">' + (soalMuat ? '<span class="spinner dark"></span> Memuat soal…' : currentSoal.length ? 'Tidak ada soal yang cocok dengan filter.'
      : 'Paket ini belum memiliki soal. Klik <b>Tambah Soal</b>, atau <b>Import File</b> CSV / Excel (unduh <b>Template</b> dulu).') + '</td></tr>';

    var pgL = currentSoal.filter(function (s) { return s.tipe === 'PG'; }), esL = currentSoal.filter(function (s) { return s.tipe !== 'PG'; });
    var skor = function (l) { return l.reduce(function (a, s) { return a + s.skor; }, 0); };
    var adaTP = currentSoal.filter(function (s) { return s.tp; }), unik = {};
    adaTP.forEach(function (s) { unik[s.tp.replace(/\s+/g, ' ').trim().toLowerCase()] = 1; });
    $('statsSoal').innerHTML = currentSoal.length ? stat(pgL.length, 'Soal PG (skor ' + skor(pgL) + ')', 's-done') + stat(esL.length, 'Soal essay (skor ' + skor(esL) + ')', 's-wait') +
      stat(skor(pgL) + skor(esL), 'Total skor maksimal') + stat(Object.keys(unik).length, 'TP berbeda', 's-login') +
      stat(currentSoal.length - adaTP.length, 'Soal tanpa TP', currentSoal.length - adaTP.length ? 's-play' : '') : '';
    $('infoTPSoal').textContent = currentSoal.length ? currentSoal.length + ' soal · ' + adaTP.length + ' sudah memiliki Tujuan Pembelajaran · ' +
      Object.keys(unik).length + ' TP berbeda' + (adaTP.length < currentSoal.length ? ' — lengkapi TP agar laporan ketercapaian akurat.' : '') +
      (list.length < currentSoal.length ? ' · Menampilkan ' + list.length + ' soal sesuai filter.' : '') : '';
    UE.typeset(tbl);
  }

  function fetchSoal(paket) {
    var req = ++soalReq;
    if (paket !== soalPaketId) { currentSoal = []; soalPaketId = paket; }
    if (!paket) { soalMuat = false; renderMasterSoal(); return Promise.resolve(); }
    soalMuat = true; renderMasterSoal();
    return guru('guruAmbilSoal', { paket: paket }).then(function (res) { if (req === soalReq) currentSoal = res.soal || []; })
      .catch(function (e) { if (req === soalReq) gagal(e); })
      .finally(function () { if (req === soalReq) { soalMuat = false; renderMasterSoal(); } });
  }
  /** Setelah soal berubah: muat ulang daftar soal + ringkasan */
  function soalBerubah(pkt) { fetchSoal(pkt); muatUlang(); }

  if ($('selMasterPaketSoal')) $('selMasterPaketSoal').addEventListener('change', function () { fetchSoal(this.value); });
  $('filterTipeSoal').addEventListener('change', renderMasterSoal);
  $('cariSoal').addEventListener('input', renderMasterSoal);

  function paketSoalTerpilih() {
    var pkt = $('selMasterPaketSoal').value, p = cariPaket(pkt);
    if (!p) UE.toast('Pilih paket soal dulu (buat paket di menu Paket Soal)', 'err');
    return p;
  }

  function formSoal(s) {
    var p = paketSoalTerpilih(); if (!p) return;
    var baru = !s, pkt = p.id;
    var isPG = function (v) { return v.tipe === 'PG'; };
    var opsiTeks = function (k) { var o = s && s.opsi ? s.opsi.filter(function (x) { return x.k === k; })[0] : null; return o ? o.t : ''; };
    var nilai = baru ? { tipe: 'PG', no: nomorBaru('PG'), soal: '', gambar: '', kunci: 'A', pedoman: '', skor: '2', waktu: '60', tp: '', level: '' }
      : { tipe: s.tipe, no: s.no, soal: s.soal, gambar: s.gambar || '', kunci: s.kunci || 'A', pedoman: s.pedoman || '', skor: s.skor, waktu: s.waktu, tp: s.tp || '', level: s.level || '' };
    HURUF.forEach(function (k) { nilai[k] = opsiTeks(k); });
    var fields = [
      { k: 'tipe', label: 'Tipe soal', type: 'select', disabled: !baru, opsi: [{ v: 'PG', t: 'Pilihan ganda' }, { v: 'ES', t: 'Essay' }] },
      { k: 'no', label: 'Nomor', type: 'number', req: true, min: 1 },
      { k: 'skor', label: 'Skor / bobot', type: 'number', min: 0, step: '0.5' },
      { k: 'waktu', label: 'Waktu (detik)', type: 'number', min: 10, hint: 'Dipakai mode per soal & durasi otomatis.' },
      { k: 'soal', label: 'Teks soal', type: 'textarea', rows: 4, req: true, pratinjau: true },
      { k: 'gambar', label: 'Link gambar (opsional)', wide: true, placeholder: 'https://… (link Google Drive boleh)' }
    ];
    HURUF.forEach(function (k) { fields.push({ k: k, label: 'Opsi ' + k + (k < 'C' ? '' : ' (opsional)'), req: k < 'C', show: isPG }); });
    fields.push({ k: 'kunci', label: 'Kunci jawaban', type: 'select', show: isPG, opsi: HURUF.map(function (k) { return { v: k, t: 'Opsi ' + k }; }) });
    fields.push({ k: 'pedoman', label: 'Pedoman jawaban / rubrik penilaian (untuk AI, tidak dikirim ke siswa)', type: 'textarea', rows: 4, show: function (v) { return !isPG(v); } });
    fields.push({ k: 'tp', label: 'Tujuan Pembelajaran (TP)', wide: true, list: daftarTP(), placeholder: 'mis. TP 1.2: Menjelaskan perbedaan suhu dan kalor' });
    fields.push({ k: 'level', label: 'Level (opsional)', list: ['L1', 'L2', 'L3', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6'], placeholder: 'L1–L3 atau C1–C6', hint: 'Dipakai Cetak Soal. Tersimpan bila backend Cloudflare.' });
    formModal({
      judul: baru ? 'Tambah soal' : 'Edit soal ' + (s.tipe === 'PG' ? 'PG' : 'essay') + ' no ' + s.no, lebar: 860,
      sub: 'Paket <b>' + UE.esc(p.nama) + ' (' + UE.esc(pkt) + ')</b>. Rumus ditulis dengan LaTeX di antara <code>$…$</code>, teks tebal <code>**seperti ini**</code>.',
      nilai: nilai, fields: fields,
      pratinjau: function (v) {
        return UE.rich(v.soal) + (v.gambar && linkAman(v.gambar) ? '<img class="q-img" src="' + UE.esc(v.gambar) + '" alt="">' : '') +
          (isPG(v) ? '<div class="opsi-guru">' + HURUF.filter(function (k) { return v[k]; }).map(function (k) {
            return '<div class="' + (k === v.kunci ? 'kunci' : '') + ' math"><b>' + k + '.</b> ' + UE.rich(v[k]) + (k === v.kunci ? ' ✔' : '') + '</div>';
          }).join('') + '</div>' : '');
      },
      onUbah: function (k, v, ctl) {
        if (!baru || k !== 'tipe') return;
        ctl.set('no', nomorBaru(v.tipe)); ctl.set('skor', isPG(v) ? '2' : '10'); ctl.set('waktu', isPG(v) ? '60' : '120');
      },
      validasi: function (v) {
        if (!(+v.no >= 1)) return 'Nomor soal harus angka 1 atau lebih.';
        if (!isPG(v)) return '';
        var isi = HURUF.filter(function (k) { return v[k]; });
        if (isi.indexOf(v.kunci) < 0) return 'Kunci ' + v.kunci + ' menunjuk opsi yang masih kosong.';
        return '';
      },
      simpan: function (v) {
        var data = { paket: pkt, tipe: v.tipe, nolama: baru ? '' : s.no, no: v.no, soal: v.soal, gambar: v.gambar, kunci: v.kunci, pedoman: v.pedoman, skor: v.skor, waktu: v.waktu, tp: v.tp, level: v.level };
        HURUF.forEach(function (k) { data[k] = isPG(v) ? v[k] : ''; });
        return guru('guruSimpanSoal', data).then(function () { UE.toast('Soal tersimpan', 'ok'); soalBerubah(pkt); });
      }
    });
  }

  if ($('btnTambahSoal')) $('btnTambahSoal').addEventListener('click', function () { formSoal(null); });

  if ($('tblMasterSoal')) $('tblMasterSoal').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var pkt = $('selMasterPaketSoal').value;
    var arr = (b.dataset.hapussoal || b.dataset.editsoal || '').split('|');
    var s = currentSoal.filter(function (x) { return x.tipe === arr[0] && x.no == arr[1]; })[0];
    if (b.dataset.hapussoal) {
      UE.dialog({ judul: 'Hapus soal ' + (arr[0] === 'PG' ? 'PG' : 'essay') + ' no ' + arr[1] + '?', pesan: s ? s.soal.slice(0, 160) : '', ok: 'Hapus', batal: 'Batal', bahaya: true })
        .then(function (ya) {
          if (ya) guru('guruHapusSoal', { paket: pkt, tipe: arr[0], no: arr[1] }).then(function () { UE.toast('Soal dihapus', 'ok'); soalBerubah(pkt); }).catch(gagal);
        });
    }
    if (b.dataset.editsoal && s) formSoal(s);
  });

  /* ---------- Hapus seluruh soal paket ---------- */
  $('btnHapusSemuaSoal').addEventListener('click', function () {
    var p = paketSoalTerpilih(); if (!p || !serverBaru()) return;
    if (soalMuat) { UE.toast('Tunggu, daftar soal masih dimuat', 'err'); return; }
    var nPG = currentSoal.filter(function (s) { return s.tipe === 'PG'; }).length, nES = currentSoal.length - nPG, r = ringkasPaket(p.id);
    if (!currentSoal.length) { UE.toast('Paket ini belum memiliki soal', 'err'); return; }
    formModal({
      judul: 'Hapus seluruh soal paket ini?', lebar: 540, bahaya: true, ok: 'Hapus soal',
      sub: 'Paket <b>' + UE.esc(p.nama) + ' (' + UE.esc(p.id) + ')</b> memiliki <b>' + nPG + ' soal PG</b> dan <b>' + nES + ' soal essay</b>. ' +
        'Soal yang dihapus tidak bisa dikembalikan — gunakan <b>Export</b> dulu sebagai cadangan.' +
        (r && r.kiriman ? '<br><span class="warn-pel">Perhatian: ' + r.kiriman + ' siswa sudah mengirim jawaban paket ini. Teks soal di detail jawaban, analisis butir, dan laporan TP akan ikut hilang.</span>' : ''),
      nilai: { tipe: 'SEMUA', konfirmasi: '' },
      fields: [
        { k: 'tipe', label: 'Yang dihapus', type: 'select', wide: true, opsi: [{ v: 'SEMUA', t: 'Semua soal (' + currentSoal.length + ')' }, { v: 'PG', t: 'Hanya pilihan ganda (' + nPG + ')' }, { v: 'ES', t: 'Hanya essay (' + nES + ')' }] },
        { k: 'konfirmasi', label: 'Ketik HAPUS untuk konfirmasi', req: true, wide: true, up: true, placeholder: 'HAPUS' }
      ],
      validasi: function (v) { return v.konfirmasi === 'HAPUS' ? '' : 'Ketik HAPUS untuk melanjutkan.'; },
      simpan: function (v) {
        return guru('guruHapusSemuaSoal', { paket: p.id, tipe: v.tipe }, 120000).then(function (res) {
          UE.toast((res.pg + res.es) + ' soal dihapus dari paket ' + p.id, 'ok'); soalBerubah(p.id);
        });
      }
    });
  });

  /* ---------- Baca file CSV / TSV / Excel ---------- */
  /** Parser CSV/TSV: deteksi pemisah (tab ; ,), dukung "kutip", "" di dalam kutip, baris baru dalam sel, BOM, dan baris sep=; dari Excel */
  function parseCSV(str) {
    str = String(str || '').replace(/^﻿/, '');
    var sep = null, m = str.match(/^sep=(.)\r?\n/i);
    if (m) { sep = m[1]; str = str.slice(m[0].length); }
    if (!sep) {
      var hit = { '\t': 0, ';': 0, ',': 0 }, q = false;
      for (var j = 0; j < str.length; j++) {
        var ch = str[j];
        if (ch === '"') q = !q;
        else if (!q && (ch === '\n' || ch === '\r')) { if (hit['\t'] + hit[';'] + hit[',']) break; }
        else if (!q && hit[ch] !== undefined) hit[ch]++;
      }
      sep = hit['\t'] ? '\t' : hit[';'] > hit[','] ? ';' : ',';
    }
    var res = [], row = [], val = '', inQ = false, awalSel = true;
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (inQ) {
        if (c === '"') { if (str[i + 1] === '"') { val += '"'; i++; } else inQ = false; }
        else val += c;
      } else if (c === '"' && awalSel) { inQ = true; awalSel = false; }
      else if (c === sep) { row.push(val); val = ''; awalSel = true; }
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && str[i + 1] === '\n') i++;
        row.push(val); res.push(row); row = []; val = ''; awalSel = true;
      } else { val += c; if (c !== ' ') awalSel = false; }
    }
    if (val !== '' || row.length) { row.push(val); res.push(row); }
    return res.map(function (r) { return r.map(function (v) { return v.trim(); }); });
  }
  function bacaTeks(file) {
    return file.arrayBuffer().then(function (buf) {
      try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch (e) { return new TextDecoder('windows-1252').decode(buf); } // CSV lama dari Excel (ANSI)
    });
  }
  function teksSel(cell) {
    var v = cell.value;
    if (v == null) return '';
    if (v instanceof Date) return ('0' + v.getDate()).slice(-2) + '/' + ('0' + (v.getMonth() + 1)).slice(-2) + '/' + v.getFullYear();
    if (typeof v === 'object') {
      var rt = function (x) { return x && x.richText ? x.richText.map(function (t) { return t.text; }).join('') : x; };
      if (v.richText) return rt(v);
      if (v.formula !== undefined || v.sharedFormula !== undefined) return v.result == null || typeof v.result === 'object' ? String(rt(v.result) || '') : String(v.result);
      if (v.hyperlink !== undefined) { var t = String(rt(v.text) || ''); return /^https?:/i.test(t) || !v.hyperlink ? t : v.hyperlink; }
      if (v.text !== undefined) return String(rt(v.text));
      return '';
    }
    return String(v);
  }
  function bacaXlsx(file) {
    return Promise.all([window.Ekspor.muat(), file.arrayBuffer()]).then(function (r) {
      var wb = new r[0].Workbook();
      return wb.xlsx.load(r[1]).then(function () {
        var lembar = [];
        wb.eachSheet(function (ws) {
          var rows = [], lebar = ws.columnCount;
          ws.eachRow({ includeEmpty: true }, function (row, n) {
            var a = [];
            for (var c = 1; c <= lebar; c++) a.push(teksSel(row.getCell(c)).trim());
            rows[n - 1] = a;
          });
          for (var i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
          lembar.push({ nama: ws.name, rows: rows });
        });
        return lembar;
      });
    });
  }
  /** File → [{nama, rows}] (satu per sheet Excel; CSV = satu lembar) */
  function bacaFile(file) {
    if (/\.xlsx$/i.test(file.name)) return bacaXlsx(file);
    if (/\.(xls|ods|numbers)$/i.test(file.name)) return Promise.reject(new Error('Format ini tidak didukung. Simpan ulang sebagai Excel (.xlsx) atau CSV.'));
    return bacaTeks(file).then(function (t) { return [{ nama: file.name.replace(/\.[^.]+$/, ''), rows: parseCSV(t) }]; });
  }
  function pilihFile(accept, cb) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.addEventListener('change', function () { if (inp.files[0]) cb(inp.files[0]); });
    inp.click();
  }

  /** Nama kolom → kunci baku. "Waktu (detik)" → "waktu", "Opsi A" → "opsi_a" */
  function normKol(h) { return String(h || '').replace(/^﻿/, '').replace(/\(.*?\)/g, ' ').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
  /** Kolom → indeks; alias yang lebih awal di daftar lebih diutamakan */
  function petaHeader(cells, alias) {
    var h = cells.map(normKol), pakai = {}, peta = { _n: 0 };
    Object.keys(alias).forEach(function (k) {
      alias[k].some(function (a) {
        var i = h.indexOf(a);
        while (i >= 0 && pakai[i]) i = h.indexOf(a, i + 1);
        if (i < 0) return false;
        peta[k] = i; pakai[i] = 1; peta._n++;
        return true;
      });
    });
    return peta;
  }
  /** Cari baris judul di 5 baris teratas (boleh ada baris judul dokumen di atasnya). wajib = kolom yang harus ada. */
  function cariHeader(rows, alias, wajib) {
    for (var i = 0; i < Math.min(5, rows.length); i++) {
      var peta = petaHeader(rows[i].c, alias);
      if (peta._n >= 2 && wajib.every(function (k) { return peta[k] !== undefined; })) return { peta: peta, data: rows.slice(i + 1) };
    }
    return { peta: null, data: rows };
  }
  /** Baris tak kosong + nomor barisnya di file */
  function barisIsi(rows) {
    var out = [];
    rows.forEach(function (r, i) { if (r && r.some(function (c) { return String(c).trim() !== ''; })) out.push({ c: r, n: i + 1 }); });
    return out;
  }
  /** Petunjuk tipe dari nama sheet/file: 'PG' | 'ES' | 'skip' | '' */
  function tipeDariNama(nama) {
    var t = String(nama || '').toUpperCase().split(/[^A-Z0-9]+/);
    if (t.some(function (x) { return /^(PETUNJUK|INFO|CARA|PANDUAN|README)$/.test(x); })) return 'skip';
    if (t.some(function (x) { return /^(ES|ESSAY|ESAI|URAIAN)$/.test(x); })) return 'ES';
    if (t.some(function (x) { return /^(PG|PILIHAN|GANDA|MC)$/.test(x); })) return 'PG';
    return '';
  }
  function normTipe(v) {
    var t = String(v || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (/^(PG|P|PILIHANGANDA|PILGAN|MC|MULTIPLECHOICE|OBJEKTIF)$/.test(t)) return 'PG';
    if (/^(ES|E|ESSAY|ESAI|URAIAN|ISIAN|SUBJEKTIF)$/.test(t)) return 'ES';
    return '';
  }
  function angkaID(v) { // "2,5" → 2.5 ; kosong → undefined ; salah → NaN
    var t = String(v == null ? '' : v).trim();
    if (!t) return undefined;
    return Number(t.replace(/\s/g, '').replace(',', '.'));
  }

  /* ---------- Import soal ---------- */
  var ALIAS_SOAL = {
    tipe: ['tipe', 'jenis', 'jenis_soal', 'tipe_soal', 'type', 'bentuk', 'bentuk_soal'],
    no: ['no', 'nomor', 'no_soal', 'nomor_soal', 'nomer', 'number'],
    soal: ['soal', 'pertanyaan', 'teks_soal', 'butir_soal', 'isi_soal', 'question'],
    gambar: ['gambar', 'link_gambar', 'url_gambar', 'gambar_url', 'image', 'foto'],
    A: ['a', 'opsi_a', 'pilihan_a', 'option_a', 'jawaban_a'], B: ['b', 'opsi_b', 'pilihan_b', 'option_b', 'jawaban_b'],
    C: ['c', 'opsi_c', 'pilihan_c', 'option_c', 'jawaban_c'], D: ['d', 'opsi_d', 'pilihan_d', 'option_d', 'jawaban_d'],
    E: ['e', 'opsi_e', 'pilihan_e', 'option_e', 'jawaban_e'],
    kunci: ['kunci', 'kunci_jawaban', 'jawaban_benar', 'kunci_pg', 'answer', 'key'],
    pedoman: ['pedoman', 'pedoman_jawaban', 'rubrik', 'pedoman_penskoran', 'kunci_essay', 'jawaban_essay', 'pembahasan'],
    skor: ['skor', 'skor_maks', 'skor_maksimal', 'bobot', 'poin', 'score'],
    waktu: ['waktu', 'waktu_detik', 'detik', 'durasi', 'durasi_detik', 'time'],
    tp: ['tp', 'tujuan_pembelajaran', 'tujuan', 'indikator', 'indikator_soal', 'kompetensi'],
    level: ['level', 'level_soal', 'level_kognitif']
  };
  var POS_PG = ['no', 'soal', 'gambar', 'A', 'B', 'C', 'D', 'E', 'kunci', 'skor', 'waktu', 'tp'];
  var POS_ES = ['no', 'soal', 'gambar', 'pedoman', 'skor', 'waktu', 'tp'];
  var HEAD_PG = ['NO', 'SOAL', 'GAMBAR', 'OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D', 'OPSI_E', 'KUNCI', 'SKOR', 'WAKTU_DETIK', 'TUJUAN_PEMBELAJARAN'];
  var HEAD_ES = ['NO', 'SOAL', 'GAMBAR', 'PEDOMAN_JAWABAN', 'SKOR_MAKS', 'WAKTU_DETIK', 'TUJUAN_PEMBELAJARAN'];
  var HEAD_GAB = ['TIPE', 'NO', 'SOAL', 'GAMBAR', 'OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D', 'OPSI_E', 'KUNCI', 'PEDOMAN_JAWABAN', 'SKOR', 'WAKTU_DETIK', 'TUJUAN_PEMBELAJARAN'];
  var CONTOH_PG = [
    [1, 'Satuan kalor dalam Sistem Internasional (SI) adalah …', '', 'kalori', 'joule', 'watt', 'kelvin', '', 'B', 2, 45, 'Menjelaskan konsep kalor dan satuannya'],
    [2, 'Rumus kalor untuk menaikkan suhu benda adalah …', '', '$Q = m \\cdot c \\cdot \\Delta T$', '$Q = m \\cdot L$', '$Q = m \\cdot U$', '$Q = P \\cdot t$', '', 'A', 2, 45, 'Menghitung kalor, suhu, dan massa'],
    [3, 'Pecahan yang senilai dengan 0,5 adalah …', '', '1/2', '1/3', '2/5', '3/4', '5/8', 'A', 2, 60, 'Menentukan pecahan senilai']
  ];
  var CONTOH_ES = [
    [1, 'Jelaskan perbedaan antara **suhu** dan **kalor**!', '', 'Suhu = ukuran derajat panas/dingin (°C, K). Kalor = energi panas yang berpindah dari suhu tinggi ke rendah (joule/kalori). Skor penuh jika keduanya benar.', 10, 120, 'Menjelaskan konsep kalor dan satuannya']
  ];
  var PETUNJUK_SOAL = [
    'PETUNJUK PENGISIAN TEMPLATE SOAL',
    '1. Isi soal pilihan ganda di sheet "PG" dan soal essay di sheet "ESSAY". Jangan mengubah baris judul (baris pertama). Baris contoh boleh ditimpa/dihapus.',
    '2. NO boleh dikosongkan — nomor dibuat otomatis melanjutkan nomor terakhir. Nomor yang sudah ada di paket akan DIPERBARUI (mode "Tambah & perbarui").',
    '3. PG: isi minimal OPSI_A dan OPSI_B (maksimal sampai OPSI_E). KUNCI cukup satu huruf A–E.',
    '4. SKOR = bobot soal. WAKTU_DETIK = waktu per soal (dipakai mode TIMERSOAL/TIMERFIXED, atau durasi total bila durasi paket kosong).',
    '5. GAMBAR (opsional) = link gambar. Link Google Drive boleh, pastikan aksesnya "Siapa saja yang memiliki link".',
    '6. Rumus ditulis dengan LaTeX di antara tanda $, misalnya $Q = m \\cdot c \\cdot \\Delta T$. Teks tebal: **tebal**.',
    '7. PEDOMAN_JAWABAN (essay) = rubrik penilaian untuk AI; tidak pernah dikirim ke HP siswa.',
    '8. TUJUAN_PEMBELAJARAN = TP yang diukur soal. Soal dengan teks TP yang sama dihitung satu TP. Boleh diawali kode, misalnya "TP 1.2: …".',
    '9. Simpan sebagai .xlsx, lalu buka Dashboard Guru → Bank Soal → pilih paket → Import File (CSV / Excel).',
    'Kolom di file ini diformat sebagai TEKS agar isian seperti 1/2, 0,5, atau 08 tidak berubah menjadi tanggal/angka.'
  ];

  function normKunci(v, s) {
    var t = String(v || '').trim();
    if (!t) return '';
    var u = t.toUpperCase(), m = u.match(/^[(\[]?\s*(?:OPSI|PILIHAN|JAWABAN)?\s*([A-E])\s*[)\].:]?$/) || u.match(/^([A-E])[.)]\s+/);
    if (m) return m[1];
    var cocok = HURUF.filter(function (k) { return s[k] && s[k].trim().toLowerCase() === t.toLowerCase(); });
    return cocok.length === 1 ? cocok[0] : '?';
  }
  /** Satu lembar → daftar soal (dengan galat/peringatan per baris) */
  function lembarKeSoal(L, tipeBawaan) {
    var rows = barisIsi(L.rows); if (!rows.length) return [];
    var hd = cariHeader(rows, ALIAS_SOAL, ['soal']), peta = hd.peta, adaHeader = !!peta;
    return hd.data.map(function (r) {
      var c = r.c, tipe = tipeBawaan, ambil;
      if (adaHeader) {
        ambil = function (k) { var i = peta[k]; return i === undefined ? undefined : String(c[i] == null ? '' : c[i]).trim(); };
        if (peta.tipe !== undefined) tipe = normTipe(ambil('tipe')) || tipe;
        if (!tipe) tipe = ambil('A') || ambil('B') || /^[A-E]$/i.test(ambil('kunci') || '') ? 'PG' : 'ES';
      } else {
        if (!tipe) tipe = /^[A-E]$/i.test(String(c[8] || '').trim()) ? 'PG' : 'ES';
        var pos = tipe === 'PG' ? POS_PG : POS_ES;
        ambil = function (k) { var i = pos.indexOf(k); return i < 0 || i >= c.length ? undefined : String(c[i] == null ? '' : c[i]).trim(); };
      }
      // Kolom yang tidak ada di file dibiarkan undefined → data lama di sheet tidak ditimpa
      var s = { tipe: tipe, baris: r.n, lembar: L.nama, err: [], warn: [], soal: ambil('soal') || '', gambar: ambil('gambar'), tp: ambil('tp'), level: ambil('level') };
      var no = ambil('no');
      s.no = no ? parseInt(no, 10) : 0;
      if (no && !(s.no > 0)) { s.err.push('Nomor "' + no + '" bukan angka'); s.no = 0; }
      ['skor', 'waktu'].forEach(function (k) {
        var x = angkaID(ambil(k));
        if (x === undefined) return;
        if (isNaN(x) || x < 0) s.err.push((k === 'skor' ? 'Skor' : 'Waktu') + ' "' + ambil(k) + '" bukan angka');
        else s[k] = x;
      });
      if (s.waktu !== undefined && s.waktu < 10) s.warn.push('Waktu minimal 10 detik');
      if (!s.soal) s.err.push('Teks soal kosong');
      if (tipe === 'PG') {
        HURUF.forEach(function (k) { s[k] = ambil(k) || ''; });
        s.kunci = normKunci(ambil('kunci'), s);
        var isi = HURUF.filter(function (k) { return s[k]; });
        if (isi.length < 2) s.err.push('Minimal 2 opsi (A & B)');
        if (!s.kunci) s.err.push('Kunci kosong');
        else if (s.kunci === '?') s.err.push('Kunci "' + ambil('kunci') + '" tidak dikenali');
        else if (isi.indexOf(s.kunci) < 0) s.err.push('Kunci ' + s.kunci + ' tetapi opsi ' + s.kunci + ' kosong');
      } else {
        s.pedoman = ambil('pedoman');
        var k2 = ambil('kunci') || '';
        if (!s.pedoman && k2.length > 1) s.pedoman = k2;
        if (!s.pedoman) s.warn.push('Pedoman kosong — AI menilai tanpa rubrik');
      }
      return s;
    });
  }
  function olahSoal(lembar, pil) {
    var semua = [];
    lembar.forEach(function (L) {
      var t = tipeDariNama(L.nama);
      if (t === 'skip') return;
      semua = semua.concat(lembarKeSoal(L, pil.jenis || t));
    });
    var lihat = {};
    semua.forEach(function (s) {
      if (s.err.length || !s.no) return;
      var key = s.tipe + s.no;
      if (lihat[key]) s.warn.push('Nomor ' + s.no + ' ganda — baris terakhir yang dipakai');
      lihat[key] = 1;
    });
    var ok = semua.filter(function (s) { return !s.err.length; });
    var nPG = ok.filter(function (s) { return s.tipe === 'PG'; }).length, nES = ok.length - nPG, nErr = semua.length - ok.length;
    var p = cariPaket($('selMasterPaketSoal').value), r = p ? ringkasPaket(p.id) : null;
    var ringkas = '<div class="imp-ringkas"><span class="pill ok">' + nPG + ' soal PG</span><span class="pill ok">' + nES + ' soal essay</span>' +
      (nErr ? '<span class="pill warn">' + nErr + ' baris bermasalah (tidak diimport)</span>' : '') +
      (semua.some(function (s) { return s.warn.length; }) ? '<span class="pill MENUNGGU">ada peringatan</span>' : '') + '</div>' +
      (pil.mode === 'ganti' && r ? '<p class="warn-pel small">Mode GANTI: ' + r.pg + ' soal PG dan ' + r.es + ' soal essay lama di paket ini akan dihapus lebih dulu.</p>' : '');
    var maks = 400, esc = UE.esc, ring = function (t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n) + '…' : t; };
    var tabel = '<div class="table-wrap imp-tabel"><table class="tbl"><thead><tr><th>Baris</th><th>Tipe</th><th>No</th><th>Soal</th><th>Opsi / Pedoman</th><th>Kunci</th><th>Skor</th><th>Waktu</th><th>TP</th><th>Keterangan</th></tr></thead><tbody>' +
      semua.slice(0, maks).map(function (s) {
        var opsi = s.tipe === 'PG' ? HURUF.filter(function (k) { return s[k]; }).map(function (k) { return k + '. ' + ring(s[k], 24); }).join(' · ') : ring(s.pedoman, 70);
        var ket = s.err.length ? '<b>' + esc(s.err.join('; ')) + '</b>' : s.warn.length ? esc(s.warn.join('; ')) : 'OK';
        return '<tr class="' + (s.err.length ? 'imp-err' : s.warn.length ? 'imp-warn' : '') + '"><td class="small">' + (lembar.length > 1 ? esc(s.lembar) + ' · ' : '') + s.baris + '</td>' +
          '<td><span class="tipe-tag ' + s.tipe.toLowerCase() + '">' + (s.tipe === 'PG' ? 'PG' : 'Essay') + '</span></td><td>' + (s.no || '<i class="muted">auto</i>') + '</td>' +
          '<td class="wrap">' + esc(ring(s.soal, 110)) + '</td><td class="wrap small">' + esc(opsi) + '</td><td>' + esc(s.kunci && s.kunci !== '?' ? s.kunci : '') + '</td>' +
          '<td>' + (s.skor !== undefined ? s.skor : '<i class="muted">bawaan</i>') + '</td><td>' + (s.waktu !== undefined ? s.waktu : '<i class="muted">bawaan</i>') + '</td>' +
          '<td class="wrap small">' + esc(ring(s.tp, 50)) + '</td><td class="wrap small">' + ket + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (semua.length > maks ? '<p class="small muted">Menampilkan ' + maks + ' dari ' + semua.length + ' baris.</p>' : '');
    return { items: ok, siap: ok.length, html: semua.length ? ringkas + tabel : '<p class="muted">Tidak ada baris soal yang terbaca. Pastikan baris pertama berisi judul kolom seperti pada template.</p>' };
  }
  function bukaImportSoal(file) {
    var p = paketSoalTerpilih(); if (!p || !serverBaru()) return;
    bukaImport({
      judul: 'Import soal ke paket ' + p.id, file: file,
      sub: 'Paket tujuan: <b>' + UE.esc(p.nama) + '</b>. Kolom dikenali dari judul (NO, SOAL, OPSI_A… KUNCI, PEDOMAN_JAWABAN, SKOR, WAKTU_DETIK, TUJUAN_PEMBELAJARAN, TIPE). ' +
        'Tanpa baris judul, urutan kolom harus sama dengan template. Belum punya format? <a href="#" data-template>Unduh template</a>.',
      pilihan: '<div class="imp-pilihan lap-grid">' +
        '<label class="field"><span>Jenis soal (bila tidak ada kolom TIPE)</span><select class="input" name="jenis">' +
        '<option value="">Otomatis (nama sheet / isi kolom)</option><option value="PG">Semua pilihan ganda</option><option value="ES">Semua essay</option></select></label>' +
        '<label class="field"><span>Cara import</span><select class="input" name="mode">' +
        '<option value="timpa">Tambah &amp; perbarui — nomor yang sama ditimpa</option>' +
        '<option value="lanjut">Tambahkan di akhir — nomor dilanjutkan otomatis</option>' +
        '<option value="ganti">Ganti SELURUH soal paket ini (soal lama dihapus)</option></select></label></div>',
      olah: olahSoal,
      kirim: function (items, pil) {
        var bersih = function (s) {
          var o = { no: s.no || '', soal: s.soal, gambar: s.gambar, skor: s.skor, waktu: s.waktu, tp: s.tp, level: s.level };
          if (s.tipe === 'PG') { HURUF.forEach(function (k) { o[k] = s[k]; }); o.kunci = s.kunci; } else o.pedoman = s.pedoman;
          return o;
        };
        var kirim = function () {
          return guru('guruImportSoal', {
            paket: p.id, mode: pil.mode,
            pg: items.filter(function (s) { return s.tipe === 'PG'; }).map(bersih), es: items.filter(function (s) { return s.tipe !== 'PG'; }).map(bersih)
          }, 240000).then(function (r) {
            soalBerubah(p.id);
            var baru = r.pg.baru + r.es.baru, ubah = r.pg.diperbarui + r.es.diperbarui;
            return 'Import berhasil: ' + baru + ' soal baru' + (ubah ? ', ' + ubah + ' diperbarui' : '') + (r.dihapus ? ', ' + r.dihapus + ' soal lama dihapus' : '');
          });
        };
        if (pil.mode !== 'ganti') return kirim();
        return UE.dialog({ judul: 'Ganti seluruh soal?', pesan: 'Semua soal lama di paket ' + p.id + ' dihapus lalu diganti ' + items.length + ' soal dari file. Lanjutkan?', ok: 'Ya, ganti', batal: 'Batal', bahaya: true })
          .then(function (ya) { if (!ya) throw new Error('Import dibatalkan'); return kirim(); });
      }
    });
  }

  /**
   * Modal import umum: pilih/seret file atau tempel dari Excel → pratinjau & validasi → kirim.
   * cfg: { judul, sub, file, pilihan (html), olah(lembar, pilihan) → {items, siap, html}, kirim(items, pilihan) → Promise<pesan> }
   */
  function bukaImport(cfg) {
    G.modal = true;
    var st = { lembar: null, items: [] };
    var wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal board" role="dialog" aria-modal="true" style="width:min(1080px,100%)"><h2 class="board-title">' + UE.esc(cfg.judul) + '</h2>' +
      '<p class="board-sub">' + cfg.sub + '</p>' +
      '<div class="imp-drop" tabindex="0" role="button"><svg class="ic"><use href="#i-upload"/></svg><div><b data-namafile>Pilih file atau seret ke sini</b>' +
      '<div class="small muted">CSV (pemisah koma / titik koma), TSV, TXT, atau Excel .xlsx</div></div></div>' +
      '<details class="imp-paste"><summary>…atau tempel (paste) langsung dari Excel / Google Sheets</summary>' +
      '<textarea class="input" rows="6" placeholder="Blok sel di Excel termasuk baris judul, tekan Ctrl+C, lalu Ctrl+V di sini"></textarea></details>' +
      (cfg.pilihan || '') + '<div class="imp-hasil"></div><p class="form-err hidden" role="alert"></p>' +
      '<div class="modal-actions"><button type="button" class="btn btn-wood" data-batal>Batal</button>' +
      '<button type="button" class="btn btn-green" data-kirim disabled>Import</button></div></div>';
    document.body.appendChild(wrap);
    var drop = wrap.querySelector('.imp-drop'), ta = wrap.querySelector('textarea'), hasil = wrap.querySelector('.imp-hasil'),
      err = wrap.querySelector('.form-err'), btn = wrap.querySelector('[data-kirim]');
    function tutup() { wrap.remove(); G.modal = false; }
    function pesan(t) { err.textContent = t || ''; err.classList.toggle('hidden', !t); }
    function pilihan() {
      var o = {};
      wrap.querySelectorAll('.imp-pilihan [name]').forEach(function (el) { o[el.name] = el.value; });
      return o;
    }
    function olah() {
      pesan('');
      if (!st.lembar) { hasil.innerHTML = ''; btn.disabled = true; return; }
      var r = cfg.olah(st.lembar, pilihan());
      st.items = r.items; hasil.innerHTML = r.html;
      btn.disabled = !r.siap; btn.textContent = r.siap ? 'Import ' + r.siap + ' data' : 'Import';
      btn.className = 'btn ' + (pilihan().mode === 'ganti' ? 'btn-red' : 'btn-green');
    }
    function muatFile(file) {
      wrap.querySelector('[data-namafile]').textContent = file.name;
      hasil.innerHTML = '<p><span class="spinner dark"></span> Membaca ' + UE.esc(file.name) + '…</p>'; btn.disabled = true;
      bacaFile(file).then(function (lembar) { st.lembar = lembar; ta.value = ''; olah(); })
        .catch(function (e) { st.lembar = null; hasil.innerHTML = ''; pesan(e.message); });
    }
    var tKetik = null;
    ta.addEventListener('input', function () {
      clearTimeout(tKetik);
      tKetik = setTimeout(function () {
        st.lembar = ta.value.trim() ? [{ nama: 'tempel', rows: parseCSV(ta.value) }] : null;
        wrap.querySelector('[data-namafile]').textContent = 'Pilih file atau seret ke sini';
        olah();
      }, 250);
    });
    drop.addEventListener('click', function () { pilihFile('.csv,.tsv,.txt,.xlsx', muatFile); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.click(); } });
    ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) muatFile(f); });
    wrap.querySelectorAll('.imp-pilihan [name]').forEach(function (el) { el.addEventListener('change', olah); });
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-batal]')) tutup();
      if (e.target.closest('[data-template]')) { e.preventDefault(); unduhTemplateSoal(); }
    });
    btn.addEventListener('click', function () {
      if (!st.items.length) return;
      var asli = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Mengimport…'; pesan('');
      Promise.resolve(cfg.kirim(st.items, pilihan())).then(function (msg) { UE.toast(msg || 'Import berhasil', 'ok'); tutup(); })
        .catch(function (e) { pesan(e.message); btn.disabled = false; btn.textContent = asli; });
    });
    if (cfg.file) muatFile(cfg.file); else wrap.querySelector('.imp-paste').open = true;
  }

  if ($('btnImportSoal')) $('btnImportSoal').addEventListener('click', function () {
    if (!paketSoalTerpilih() || !serverBaru()) return;
    pilihFile('.csv,.tsv,.txt,.xlsx', bukaImportSoal);
  });
  $('btnPasteSoal').addEventListener('click', function () { bukaImportSoal(null); });

  /* ---------- Template & export soal ---------- */
  function sel(v) { v = v == null ? '' : String(v); return /[",;\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function csvBlob(rows) { return new Blob(['﻿' + rows.map(function (r) { return r.map(sel).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' }); }
  /** Buku Excel soal: sheet PG, ESSAY, PETUNJUK. Kolom teks diformat "@" agar 1/2 tidak jadi tanggal. */
  function bukuSoal(pg, es) {
    return window.Ekspor.muat().then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook(); wb.creator = 'Dashboard Guru';
      var ANGKA = ['NO', 'SKOR', 'SKOR_MAKS', 'WAKTU_DETIK'];
      var lembar = function (nama, head, rows, lebar) {
        var ws = wb.addWorksheet(nama, { views: [{ state: 'frozen', ySplit: 1 }] });
        ws.columns = head.map(function (h, i) {
          return { header: h, key: h, width: lebar[i], style: ANGKA.indexOf(h) >= 0 ? { alignment: { vertical: 'top' } } : { numFmt: '@', alignment: { wrapText: true, vertical: 'top' } } };
        });
        rows.forEach(function (r) { ws.addRow(r.map(function (v, i) { return ANGKA.indexOf(head[i]) >= 0 || v === '' ? v : String(v); })); });
        var h = ws.getRow(1);
        h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E8C' } };
      };
      lembar('PG', HEAD_PG, pg, [6, 55, 20, 20, 20, 20, 20, 20, 8, 8, 13, 42]);
      lembar('ESSAY', HEAD_ES, es, [6, 55, 20, 55, 11, 13, 42]);
      var pt = wb.addWorksheet('PETUNJUK');
      pt.columns = [{ width: 130, style: { alignment: { wrapText: true } } }];
      PETUNJUK_SOAL.forEach(function (t, i) { var r = pt.addRow([t]); if (!i) r.font = { bold: true, size: 13 }; });
      return wb.xlsx.writeBuffer();
    }).then(function (buf) { return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); });
  }
  function unduhTemplateSoal() {
    pilihAksi('Template import soal', 'Excel paling disarankan: PG dan essay ada dalam satu file, dan isian seperti <b>1/2</b> atau <b>0,5</b> tidak berubah menjadi tanggal.', [
      { t: 'Excel (.xlsx) — PG & essay', d: 'Sheet PG, ESSAY, dan PETUNJUK', fn: function () { return bukuSoal(CONTOH_PG, CONTOH_ES).then(function (b) { unduh(b, 'template_soal.xlsx'); }); } },
      { t: 'CSV pilihan ganda', d: HEAD_PG.join(', '), fn: function () { unduh(csvBlob([HEAD_PG].concat(CONTOH_PG)), 'template_soal_pg.csv'); } },
      { t: 'CSV essay', d: HEAD_ES.join(', '), fn: function () { unduh(csvBlob([HEAD_ES].concat(CONTOH_ES)), 'template_soal_es.csv'); } },
      { t: 'CSV gabungan (kolom TIPE = PG / ES)', d: 'PG dan essay dalam satu file CSV', fn: function () {
        var rows = CONTOH_PG.map(function (r) { return ['PG'].concat(r.slice(0, 9), [''], r.slice(9)); })
          .concat(CONTOH_ES.map(function (r) { return ['ES', r[0], r[1], r[2], '', '', '', '', '', '', r[3], r[4], r[5], r[6]]; }));
        unduh(csvBlob([HEAD_GAB].concat(rows)), 'template_soal_gabungan.csv');
      } }
    ]);
  }
  if ($('btnTemplateSoal')) $('btnTemplateSoal').addEventListener('click', unduhTemplateSoal);

  $('btnEksporSoal').addEventListener('click', function () {
    var p = paketSoalTerpilih(); if (!p) return;
    if (!currentSoal.length) { UE.toast(soalMuat ? 'Tunggu, daftar soal masih dimuat' : 'Paket ini belum memiliki soal', 'err'); return; }
    var opsi = function (s, k) { var o = s.opsi.filter(function (x) { return x.k === k; })[0]; return o ? o.t : ''; };
    var pg = currentSoal.filter(function (s) { return s.tipe === 'PG'; }), es = currentSoal.filter(function (s) { return s.tipe !== 'PG'; });
    var rowsPG = pg.map(function (s) { return [s.no, s.soal, s.gambar].concat(HURUF.map(function (k) { return opsi(s, k); }), [s.kunci, s.skor, s.waktu, s.tp]); });
    var rowsES = es.map(function (s) { return [s.no, s.soal, s.gambar, s.pedoman, s.skor, s.waktu, s.tp]; });
    var nama = 'soal_' + p.id.replace(/[^\w.\-]+/g, '-') + '_' + new Date().toISOString().slice(0, 10);
    pilihAksi('Export soal ' + p.id, pg.length + ' soal PG dan ' + es.length + ' soal essay, lengkap dengan kunci, pedoman, dan TP. File bisa diedit lalu di-import kembali.', [
      { t: 'Excel (.xlsx)', d: 'Format sama dengan template (sheet PG & ESSAY)', fn: function () { return bukuSoal(rowsPG, rowsES).then(function (b) { unduh(b, nama + '.xlsx'); }); } },
      { t: 'CSV (satu file, kolom TIPE)', d: 'Bisa dibuka di Excel / Google Sheets', fn: function () {
        unduh(csvBlob([HEAD_GAB].concat(rowsPG.map(function (r) { return ['PG'].concat(r.slice(0, 9), [''], r.slice(9)); }),
          rowsES.map(function (r) { return ['ES', r[0], r[1], r[2], '', '', '', '', '', '', r[3], r[4], r[5], r[6]]; }))), nama + '.csv');
      } }
    ]);
  });
  $('btnLihatSoal').addEventListener('click', function () { var p = paketSoalTerpilih(); if (p) lihatSoal(p.id); });

  /* ---------- Import & template siswa ---------- */
  var ALIAS_SISWA = {
    username: ['username', 'user', 'user_name', 'nama_pengguna', 'akun', 'login', 'nis', 'nisn'],
    password: ['password', 'pass', 'kata_sandi', 'sandi', 'pw', 'pin'],
    nama: ['nama', 'nama_siswa', 'nama_lengkap', 'name', 'nama_peserta'],
    kelas: ['kelas', 'rombel', 'class', 'kelas_rombel']
  };
  function olahSiswa(lembar) {
    var semua = [], ada = {}, lihat = {};
    semuaSiswa().forEach(function (u) { ada[u.u] = 1; });
    lembar.forEach(function (L) {
      if (tipeDariNama(L.nama) === 'skip') return;
      var rows = barisIsi(L.rows); if (!rows.length) return;
      var hd = cariHeader(rows, ALIAS_SISWA, ['username', 'nama']), peta = hd.peta, adaHeader = !!peta;
      var pos = ['username', 'password', 'nama', 'kelas'];
      hd.data.forEach(function (r) {
        var ambil = function (k) { var i = adaHeader ? peta[k] : pos.indexOf(k); return i === undefined || i < 0 ? '' : String(r.c[i] == null ? '' : r.c[i]).trim(); };
        var s = { username: ambil('username'), password: ambil('password'), nama: ambil('nama'), kelas: ambil('kelas').toUpperCase(), baris: r.n, err: [], warn: [] };
        if (!s.username) s.err.push('Username kosong');
        else if (/\s/.test(s.username)) s.err.push('Username tidak boleh ada spasi');
        if (!s.nama) s.err.push('Nama kosong');
        if (!s.kelas) s.warn.push('Kelas kosong');
        var key = s.username.toLowerCase();
        if (key && lihat[key]) s.warn.push('Username ganda di file — baris terakhir yang dipakai');
        lihat[key] = 1;
        s.lama = !!ada[key];
        if (s.lama) s.warn.push('Sudah ada — data diperbarui' + (s.password ? '' : ', password lama tetap'));
        else if (!s.password) s.warn.push('Password kosong → 1234');
        semua.push(s);
      });
    });
    var ok = semua.filter(function (s) { return !s.err.length; }), esc = UE.esc;
    var nLama = ok.filter(function (s) { return s.lama; }).length;
    var html = semua.length ? '<div class="imp-ringkas"><span class="pill ok">' + (ok.length - nLama) + ' siswa baru</span><span class="pill MENUNGGU">' + nLama + ' diperbarui</span>' +
      (semua.length - ok.length ? '<span class="pill warn">' + (semua.length - ok.length) + ' baris bermasalah</span>' : '') + '</div>' +
      '<div class="table-wrap imp-tabel"><table class="tbl"><thead><tr><th>Baris</th><th>Username</th><th>Password</th><th>Nama</th><th>Kelas</th><th>Keterangan</th></tr></thead><tbody>' +
      semua.slice(0, 500).map(function (s) {
        return '<tr class="' + (s.err.length ? 'imp-err' : s.warn.length ? 'imp-warn' : '') + '"><td class="small">' + s.baris + '</td><td><b>' + esc(s.username) + '</b></td><td><code>' + esc(s.password) + '</code></td>' +
          '<td class="wrap">' + esc(s.nama) + '</td><td>' + esc(s.kelas) + '</td><td class="wrap small">' + (s.err.length ? '<b>' + esc(s.err.join('; ')) + '</b>' : esc(s.warn.join('; ') || 'OK')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">Tidak ada data siswa yang terbaca.</p>';
    return { items: ok, siap: ok.length, html: html };
  }
  if ($('btnImportSiswa')) $('btnImportSiswa').addEventListener('click', function () {
    bukaImport({
      judul: 'Import data siswa',
      sub: 'Kolom: <b>USERNAME, PASSWORD, NAMA, KELAS</b> (baris judul boleh ada/tidak). Username yang sudah ada akan diperbarui; password kosong = password lama tetap (siswa baru: 1234).',
      olah: olahSiswa,
      kirim: function (items) {
        return guru('guruImportSiswa', { data: items.map(function (s) { return { username: s.username, password: s.password, nama: s.nama, kelas: s.kelas }; }) }, 180000)
          .then(function (r) {
            muatUlang();
            return r && r.baru !== undefined ? 'Import siswa berhasil: ' + r.baru + ' baru, ' + r.diperbarui + ' diperbarui' + (r.dilewati ? ', ' + r.dilewati + ' dilewati' : '') : 'Import siswa berhasil';
          });
      }
    });
  });
  if ($('btnTemplateSiswa')) $('btnTemplateSiswa').addEventListener('click', function () {
    unduh(csvBlob([['USERNAME', 'PASSWORD', 'NAMA', 'KELAS'], ['siswa01', '1234', 'Andi Pratama', 'VIII-A'], ['siswa02', '0789', 'Budi Santoso', 'VIII-A'], ['siswa03', '4321', 'Citra Lestari', 'VIII-B']]), 'template_siswa.csv');
  });

  /* ================== Cetak Cepat Kartu Siswa ================== */
  var KARTU_TEMA = {
    biru: ['Biru Modern', '#172554', '#2563eb', '#ffffff', '#93c5fd'],
    laut: ['Laut', '#083344', '#0891b2', '#ffffff', '#a5f3fc'],
    senja: ['Senja', '#7c2d12', '#f97316', '#ffffff', '#fed7aa'],
    ungu: ['Ungu Royal', '#3b0764', '#9333ea', '#ffffff', '#e9d5ff'],
    hijau: ['Hijau Zamrud', '#064e3b', '#10b981', '#ffffff', '#a7f3d0'],
    gelap: ['Gelap', '#111827', '#374151', '#ffffff', '#d1d5db'],
    putih: ['Putih Bersih', '#f8fafc', '#e2e8f0', '#172033', '#475569'],
    emas: ['Emas Sekolah', '#422006', '#ca8a04', '#ffffff', '#fde68a']
  };
  var K = { sel: {}, tampil: [] };
  var KW = 1004, KH = 638; // 85 x 54 mm pada ±300 dpi

  function renderKartu() {
    if (!G.data || !$('tblKartu')) return;
    var fp = $('kartuPaket'), fk = $('kartuKelas'), ft = $('kartuTema');
    opsiPaketSiswa(fp);
    var semua = siswaPaket(semuaSiswa(), fp.value);
    opsiKelas(fk, kelasDari(semua));
    if (!ft.options.length) ft.innerHTML = Object.keys(KARTU_TEMA).map(function (k) { return '<option value="' + k + '">' + KARTU_TEMA[k][0] + '</option>'; }).join('');
    var cari = $('kartuCari').value.trim().toLowerCase();
    K.tampil = semua.filter(function (u) { return (!fk.value || u.k === fk.value) && (!cari || u.n.toLowerCase().indexOf(cari) >= 0 || u.u.indexOf(cari) >= 0); })
      .sort(function (a, b) { return a.k.localeCompare(b.k) || a.n.localeCompare(b.n); });
    document.querySelector('#tblKartu tbody').innerHTML = K.tampil.map(function (u) {
      return '<tr><td><input type="checkbox" data-pilih="' + UE.esc(u.u) + '"' + (K.sel[u.u] ? ' checked' : '') + '></td><td><b>' + UE.esc(u.n) + '</b></td><td>' + UE.esc(u.k) +
        '</td><td>' + UE.esc(u.u) + '</td><td><code>' + UE.esc(u.p || '') + '</code></td>' +
        '<td><button class="btn btn-blue btn-sm" data-cetak1="' + UE.esc(u.u) + '">Cetak</button> <button class="btn btn-wood btn-sm" data-png1="' + UE.esc(u.u) + '">PNG</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="muted">Tidak ada siswa.</td></tr>';
    updateInfoKartu();
  }
  function terpilih() { return K.tampil.filter(function (u) { return K.sel[u.u]; }); }
  function updateInfoKartu() {
    var n = terpilih().length;
    $('kartuInfo').textContent = n + ' dipilih dari ' + K.tampil.length + ' tampil';
    $('kartuSemua').checked = K.tampil.length > 0 && n === K.tampil.length;
  }

  function bulat(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  /** Gambar satu kartu ke canvas; kembalikan canvas. */
  function gambarKartu(u) {
    var th = KARTU_TEMA[$('kartuTema').value] || KARTU_TEMA.biru;
    var cv = document.createElement('canvas'); cv.width = KW; cv.height = KH;
    var c = cv.getContext('2d'), F = '"Segoe UI", Arial, sans-serif', pad = 54;
    var g = c.createLinearGradient(0, 0, KW, KH); g.addColorStop(0, th[1]); g.addColorStop(1, th[2]);
    bulat(c, 0, 0, KW, KH, 36); c.fillStyle = g; c.fill(); c.save(); c.clip();
    c.globalAlpha = .09; c.fillStyle = th[3]; c.font = '900 380px ' + F; c.textAlign = 'right'; c.fillText('ID', KW + 40, KH + 60); c.restore();
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = th[4]; c.font = '800 28px ' + F;
    var judul = ((G.data && G.data.sekolah) || 'KARTU PESERTA UJIAN').toUpperCase();
    while (c.measureText(judul).width > KW - pad * 2 - 170 && judul.length > 4) judul = judul.slice(0, -2);
    c.fillText(judul, pad, pad + 20);
    c.font = '700 26px ' + F; c.fillText('KARTU PESERTA UJIAN', pad, pad + 56);
    // kelas (lencana)
    var kls = String(u.k || ''), bw = Math.max(110, kls.length * 22 + 50);
    bulat(c, KW - pad - bw, pad - 8, bw, 56, 28); c.fillStyle = 'rgba(255,255,255,.25)'; c.fill();
    c.fillStyle = th[3]; c.font = '800 30px ' + F; c.textAlign = 'center'; c.fillText(kls, KW - pad - bw / 2, pad + 30); c.textAlign = 'left';
    // nama (kecilkan bila panjang)
    var fs = 74; c.font = '900 ' + fs + 'px ' + F;
    while (c.measureText(u.n).width > KW - pad * 2 && fs > 30) { fs -= 2; c.font = '900 ' + fs + 'px ' + F; }
    c.fillStyle = th[3]; c.fillText(u.n, pad, 250);
    // kotak login
    var by = 320, bh = 230;
    bulat(c, pad, by, KW - pad * 2, bh, 24); c.fillStyle = 'rgba(255,255,255,.22)'; c.fill();
    c.fillStyle = th[4]; c.font = '700 28px ' + F; c.fillText('Username', pad + 36, by + 62); c.fillText('Password', pad + 36, by + 158);
    c.fillStyle = th[3]; c.font = '800 54px "Consolas", "Courier New", monospace';
    c.fillText(u.u, pad + 36, by + 118); c.fillText(u.p || '-', pad + 36, by + 214);
    return cv;
  }

  function namaBerkas(u, dipakai) {
    var b = String(u.n || u.u).trim().replace(/[\\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') || u.u;
    var nm = b; if (dipakai[nm.toLowerCase()]) nm = b + '_' + u.u;
    dipakai[nm.toLowerCase()] = 1;
    return nm + '.PNG';
  }
  function dataUrlKeBytes(url) {
    var bin = atob(url.split(',')[1]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  /* ZIP tanpa kompresi (PNG sudah terkompres) — tanpa pustaka luar, jalan offline */
  var CRC_T = (function () { var t = [], n, k; for (n = 0; n < 256; n++) { var c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(a) { var c = 0xFFFFFFFF; for (var i = 0; i < a.length; i++) c = CRC_T[(c ^ a[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function buatZip(berkas) { // berkas: [{nama, data: Uint8Array}]
    var enc = new TextEncoder(), parts = [], cd = [], off = 0, now = new Date();
    var dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    var dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    berkas.forEach(function (f) {
      var nm = enc.encode(f.nama), crc = crc32(f.data), sz = f.data.length;
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
      h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, nm, f.data);
      var e = new DataView(new ArrayBuffer(46));
      e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true); e.setUint16(10, 0, true);
      e.setUint16(12, dt, true); e.setUint16(14, dd, true); e.setUint32(16, crc, true); e.setUint32(20, sz, true); e.setUint32(24, sz, true);
      e.setUint16(28, nm.length, true); e.setUint32(42, off, true);
      cd.push(e.buffer, nm);
      off += 30 + nm.length + sz;
    });
    var cdSize = cd.reduce(function (s, p) { return s + (p.byteLength != null ? p.byteLength : p.length); }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, berkas.length, true); end.setUint16(10, berkas.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(cd, [end.buffer]), { type: 'application/zip' });
  }
  function unduh(blob, nama) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nama;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function cetakKartu(list) {
    if (!list.length) { UE.toast('Pilih siswa dulu', 'err'); return; }
    var w = window.open('', '_blank');
    if (!w) { UE.toast('Pop-up diblokir browser. Izinkan pop-up lalu coba lagi.', 'err'); return; }
    var imgs = list.map(function (u) { return '<img src="' + gambarKartu(u).toDataURL('image/png') + '">'; }).join('');
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Kartu Siswa</title><style>' +
      '@page{size:A4;margin:8mm}body{margin:0;display:grid;grid-template-columns:repeat(2,85mm);gap:3mm;justify-content:center}' +
      'img{width:85mm;height:54mm;display:block;break-inside:avoid;page-break-inside:avoid}</style></head><body>' + imgs + '</body></html>');
    w.document.close();
    var jalan = function () { w.focus(); w.print(); };
    var gambar = w.document.images, sisa = gambar.length;
    Array.prototype.forEach.call(gambar, function (im) { if (im.complete) sisa--; else im.onload = im.onerror = function () { if (--sisa <= 0) jalan(); }; });
    if (sisa <= 0) setTimeout(jalan, 200);
  }

  ['kartuPaket', 'kartuKelas', 'kartuCari'].forEach(function (id) { $(id).addEventListener(id === 'kartuCari' ? 'input' : 'change', renderKartu); });
  $('kartuSemua').addEventListener('change', function () {
    var on = this.checked; K.tampil.forEach(function (u) { if (on) K.sel[u.u] = 1; else delete K.sel[u.u]; });
    renderKartu();
  });
  $('tblKartu').addEventListener('change', function (e) {
    var cb = e.target.closest('[data-pilih]'); if (!cb) return;
    if (cb.checked) K.sel[cb.dataset.pilih] = 1; else delete K.sel[cb.dataset.pilih];
    updateInfoKartu();
  });
  $('tblKartu').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var cari = function (id) { return K.tampil.filter(function (u) { return u.u === id; }); };
    if (b.dataset.cetak1) cetakKartu(cari(b.dataset.cetak1));
    if (b.dataset.png1) {
      var u = cari(b.dataset.png1)[0]; if (!u) return;
      gambarKartu(u).toBlob(function (bl) { unduh(bl, namaBerkas(u, {})); }, 'image/png');
    }
  });
  $('btnKartuCetak').addEventListener('click', function () { cetakKartu(terpilih()); });
  $('btnKartuZip').addEventListener('click', function () {
    var list = terpilih(); if (!list.length) { UE.toast('Pilih siswa dulu', 'err'); return; }
    var b = this; b.disabled = true;
    setTimeout(function () { // beri kesempatan UI menampilkan status
      try {
        var dipakai = {};
        var berkas = list.map(function (u) { return { nama: namaBerkas(u, dipakai), data: dataUrlKeBytes(gambarKartu(u).toDataURL('image/png')) }; });
        unduh(buatZip(berkas), 'kartu_siswa.zip'); UE.toast(berkas.length + ' kartu diunduh', 'ok');
      } catch (err) { UE.toast(err.message, 'err'); }
      b.disabled = false;
    }, 30);
  });

  bukaTab(G.tab);
  if (G.pw) { show('g-main'); muat(); } else show('g-login');
})();
