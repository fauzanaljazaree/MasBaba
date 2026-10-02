/**
 * Penyusun PDF laporan keuangan bulanan.
 *
 * PDF dirakit manual (tanpa dependensi tambahan) memakai font standar Helvetica:
 * setiap baris teks ditulis sebagai hex string ber-encoding WinAnsi sehingga isi
 * berkas selalu ASCII dan bebas dari masalah encoding.
 *
 * Kertas A4 portrait, satuan poin. Helper menerima koordinat "dari sisi atas"
 * agar penataan berurutan mudah dibaca.
 */
import { NAMA_BULAN, type LaporanBulanan } from "./laporan-keuangan";

export const LEBAR_HALAMAN = 595.28;
export const TINGGI_HALAMAN = 841.89;

const MARGIN = 36;
const LEBAR_ISI = LEBAR_HALAMAN - MARGIN * 2;
const BATAS_BAWAH = TINGGI_HALAMAN - MARGIN;

/** Judul & identitas masjid pada kop laporan. */
const NAMA_TAKMIR = "TAKMIR MASJID BAITUL BAROKAH";
const ALAMAT_TAKMIR = "Dukuh Keputihan, RT 01 RW 01, Desa Surotrunan, Kecamatan Alian, Kabupaten Kebumen, Jawa Tengah";
const KOTA_TANDA_TANGAN = "Kebumen";
const JUDUL_LAPORAN = "LAPORAN REKAPITULASI TRANSAKSI KEUANGAN";

/** Kolom tanda tangan pada footer laporan (urutan mengikuti format baku masjid). */
const PENANDATANGAN = [
  { peran: ["Bendahara 1"], nama: "Mustolih" },
  { peran: ["Bendahara 2"], nama: "Moh. Nur Fauzan" },
  { peran: ["Mengetahui,", "Ketua Takmir Masjid"], nama: "Ahmad Supadi" },
] as const;

type Warna = readonly [number, number, number];

const HITAM: Warna = [0.11, 0.13, 0.16];
const ABU_TEKS: Warna = [0.36, 0.42, 0.44];
const ABU_GARIS: Warna = [0.75, 0.8, 0.81];
const ABU_BARIS: Warna = [0.96, 0.97, 0.97];
const HIJAU_TUA: Warna = [0.05, 0.33, 0.29];
const HIJAU_ISIAN: Warna = [0.94, 0.98, 0.96];
const MERAH_TUA: Warna = [0.62, 0.12, 0.16];
const MERAH_ISIAN: Warna = [0.99, 0.94, 0.94];
const BIRU_TUA: Warna = [0.09, 0.25, 0.5];
const BIRU_ISIAN: Warna = [0.94, 0.96, 0.99];
const KUNING_TUA: Warna = [0.55, 0.4, 0.03];
const KUNING_ISIAN: Warna = [0.99, 0.97, 0.9];
const PUTIH: Warna = [1, 1, 1];

/** Karakter di luar Latin-1 yang perlu dipetakan ke kode WinAnsi. */
const PETA_WINANSI: Record<string, number> = {
  "–": 0x96,
  "—": 0x97,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "…": 0x85,
  "•": 0x95,
};

/** Teks -> hex string WinAnsi (karakter tak dikenal diganti tanda tanya). */
function keHex(teks: string): string {
  let hex = "";
  for (const karakter of teks) {
    const kode = karakter.codePointAt(0) ?? 0x3f;
    const byte = PETA_WINANSI[karakter] ?? (kode <= 0xff ? kode : 0x3f);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Lebar karakter Helvetica (per 1000 pt), dipakai untuk perataan & pemotongan teks. */
const LEBAR_KARAKTER: Record<string, number> = {
  " ": 278,
  "!": 278,
  '"': 355,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 667,
  "'": 191,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 556,
  "@": 1015,
  "[": 278,
  "]": 278,
  _: 556,
  "`": 333,
  "{": 334,
  "|": 260,
  "}": 334,
  "~": 584,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
};

/** Perkiraan lebar teks (pt) untuk ukuran & ketebalan tertentu. */
function lebarTeks(teks: string, ukuran: number, tebal: boolean): number {
  let total = 0;
  for (const karakter of teks) {
    const dasar = karakter >= "0" && karakter <= "9" ? 556 : (LEBAR_KARAKTER[karakter] ?? 611);
    total += tebal && karakter !== " " ? dasar * 1.09 : dasar;
  }
  return (total * ukuran) / 1000;
}

/** Memotong teks dengan elipsis bila melebihi lebar kotak kolom. */
function potongTeks(teks: string, lebarMaks: number, ukuran: number, tebal: boolean): string {
  if (lebarTeks(teks, ukuran, tebal) <= lebarMaks) return teks;
  let hasil = teks;
  while (hasil.length > 1 && lebarTeks(`${hasil}…`, ukuran, tebal) > lebarMaks) hasil = hasil.slice(0, -1);
  return `${hasil}…`;
}

type OpsiTeks = {
  ukuran?: number;
  tebal?: boolean;
  warna?: Warna;
  /** 'kiri' memakai x sebagai tepi kiri, 'kanan' tepi kanan, 'tengah' titik tengah. */
  rata?: "kiri" | "tengah" | "kanan";
  /** Bila diisi, teks dipotong otomatis agar tidak melewati lebar ini. */
  lebar?: number;
};

const angka = (n: number) => n.toFixed(2);

/** Penyusun operator gambar (content stream) satu halaman. */
class Tulis {
  readonly ops: string[] = [];

  /** yAtas = posisi garis dasar teks, dihitung dari sisi atas halaman. */
  teks(x: number, yAtas: number, isi: string, opsi: OpsiTeks = {}): void {
    const ukuran = opsi.ukuran ?? 9;
    const tebal = opsi.tebal ?? false;
    const warna = opsi.warna ?? HITAM;
    const isiTeks = opsi.lebar ? potongTeks(isi, opsi.lebar, ukuran, tebal) : isi;
    const lebar = lebarTeks(isiTeks, ukuran, tebal);
    const rata = opsi.rata ?? "kiri";
    const xAwal = rata === "tengah" ? x - lebar / 2 : rata === "kanan" ? x - lebar : x;

    this.ops.push(`BT /F${tebal ? 2 : 1} ${ukuran} Tf ${warna.map(angka).join(" ")} rg 1 0 0 1 ${angka(xAwal)} ${angka(TINGGI_HALAMAN - yAtas)} Tm <${keHex(isiTeks)}> Tj ET`);
  }

  /** Kotak berisi warna (tanpa garis tepi). */
  isiKotak(x: number, yAtas: number, lebar: number, tinggi: number, warna: Warna): void {
    this.ops.push(`${warna.map(angka).join(" ")} rg ${angka(x)} ${angka(TINGGI_HALAMAN - yAtas - tinggi)} ${angka(lebar)} ${angka(tinggi)} re f`);
  }

  /** Kotak bertepi. */
  bingkaiKotak(x: number, yAtas: number, lebar: number, tinggi: number, warna: Warna, tebalGaris = 0.8): void {
    this.ops.push(`${warna.map(angka).join(" ")} RG ${angka(tebalGaris)} w ${angka(x)} ${angka(TINGGI_HALAMAN - yAtas - tinggi)} ${angka(lebar)} ${angka(tinggi)} re S`);
  }

  /** Garis lurus antar dua titik (koordinat dari sisi atas). */
  garis(x1: number, yAtas1: number, x2: number, yAtas2: number, warna: Warna = ABU_GARIS, tebalGaris = 0.5): void {
    this.ops.push(`${warna.map(angka).join(" ")} RG ${angka(tebalGaris)} w ${angka(x1)} ${angka(TINGGI_HALAMAN - yAtas1)} m ${angka(x2)} ${angka(TINGGI_HALAMAN - yAtas2)} l S`);
  }
}

/** Merangkai halaman (content stream) menjadi berkas PDF lengkap. */
function susunPdf(halaman: string[]): Uint8Array {
  const potongan: Buffer[] = [];
  const offset: number[] = [];
  let panjang = 0;

  const tulis = (teks: string) => {
    const buf = Buffer.from(teks, "latin1");
    potongan.push(buf);
    panjang += buf.length;
  };
  const mulaiObjek = (nomor: number) => {
    offset[nomor] = panjang;
    tulis(`${nomor} 0 obj\n`);
  };

  const jumlahObjek = 4 + halaman.length * 2;
  tulis("%PDF-1.4\n");
  tulis("%\u00e2\u00e3\u00cf\u00d3\n");

  mulaiObjek(1);
  tulis("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  const rujukanHalaman = halaman.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  mulaiObjek(2);
  tulis(`<< /Type /Pages /Kids [${rujukanHalaman}] /Count ${halaman.length} /MediaBox [0 0 ${angka(LEBAR_HALAMAN)} ${angka(TINGGI_HALAMAN)}] >>\nendobj\n`);

  mulaiObjek(3);
  tulis("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");

  mulaiObjek(4);
  tulis("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n");

  halaman.forEach((isi, i) => {
    const nomorHalaman = 5 + i * 2;
    const nomorIsi = nomorHalaman + 1;
    const isiBuf = Buffer.from(isi, "latin1");

    mulaiObjek(nomorHalaman);
    tulis(`<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${nomorIsi} 0 R >>\nendobj\n`);

    mulaiObjek(nomorIsi);
    tulis(`<< /Length ${isiBuf.length} >>\nstream\n`);
    potongan.push(isiBuf);
    panjang += isiBuf.length;
    tulis("\nendstream\nendobj\n");
  });

  const posisiXref = panjang;
  tulis(`xref\n0 ${jumlahObjek + 1}\n`);
  tulis("0000000000 65535 f \n");
  for (let nomor = 1; nomor <= jumlahObjek; nomor += 1) {
    tulis(`${String(offset[nomor] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  tulis(`trailer\n<< /Size ${jumlahObjek + 1} /Root 1 0 R >>\nstartxref\n${posisiXref}\n%%EOF\n`);

  return new Uint8Array(Buffer.concat(potongan));
}

type Rata = "kiri" | "tengah" | "kanan";
type Kolom = { x: number; lebar: number; rata: Rata };

const TINGGI_HEADER = 17;
const TINGGI_BARIS = 15;
const TINGGI_TOTAL = 17;
/** Sisa ruang yang wajib tersedia untuk baris total + blok tanda tangan. */
const RUANG_FOOTER = 132;

/** Tata letak kolom tabel: total lebar tepat sama dengan lebar area cetak (523,28). */
const KOLOM: readonly Kolom[] = [
  { x: MARGIN, lebar: 28, rata: "tengah" },
  { x: MARGIN + 28, lebar: 56, rata: "tengah" },
  { x: MARGIN + 84, lebar: 246, rata: "kiri" },
  { x: MARGIN + 330, lebar: 70, rata: "kanan" },
  { x: MARGIN + 400, lebar: 62, rata: "kanan" },
  { x: MARGIN + 462, lebar: 61, rata: "kanan" },
];

const LABEL_KOLOM = ["No", "Tanggal", "Uraian / Keterangan Transaksi", "Masuk (Rp)", "Keluar (Rp)", "Saldo (Rp)"];

const BATAS_TABEL = BATAS_BAWAH - RUANG_FOOTER;

/** Lebar tiap kotak ringkasan: 4 kotak + 3 jeda 8pt pas memenuhi lebar isi (523,28). */
const LEBAR_KOTAK = (LEBAR_ISI - 24) / 4;
const JARAK_KOTAK = 8;

const KOTAK_RINGKASAN: readonly {
  x: number;
  lebar: number;
  label: string;
  warna: Warna;
  isian: Warna;
  nilai: (l: LaporanBulanan) => number;
}[] = [
  { x: MARGIN, lebar: LEBAR_KOTAK, label: "TOTAL PEMASUKAN", warna: HIJAU_TUA, isian: HIJAU_ISIAN, nilai: (l) => l.totalMasuk },
  { x: MARGIN + (LEBAR_KOTAK + JARAK_KOTAK) * 1, lebar: LEBAR_KOTAK, label: "TOTAL PENGELUARAN", warna: MERAH_TUA, isian: MERAH_ISIAN, nilai: (l) => l.totalKeluar },
  { x: MARGIN + (LEBAR_KOTAK + JARAK_KOTAK) * 2, lebar: LEBAR_KOTAK, label: "SURPLUS / (DEFISIT)", warna: KUNING_TUA, isian: KUNING_ISIAN, nilai: (l) => l.surplus },
  { x: MARGIN + (LEBAR_KOTAK + JARAK_KOTAK) * 3, lebar: LEBAR_KOTAK, label: "SALDO AKHIR BULAN", warna: BIRU_TUA, isian: BIRU_ISIAN, nilai: (l) => l.saldoAkhir },
];

type BarisTabel = {
  no: string;
  tanggal: string;
  uraian: string;
  masuk: number | null;
  keluar: number | null;
  saldo: number;
};

const duaDigit = (n: number) => String(n).padStart(2, "0");
const rupiah = (nilai: number) => `${nilai < 0 ? "-" : ""}Rp ${Math.abs(nilai).toLocaleString("id-ID")}`;
const angkaTabel = (nilai: number | null) => (nilai === null || nilai === 0 ? "-" : nilai.toLocaleString("id-ID"));
const tanggalPanjang = (tanggal: Date) => `${tanggal.getDate()} ${NAMA_BULAN[tanggal.getMonth()]} ${tanggal.getFullYear()}`;
const jamMenit = (tanggal: Date) => `${duaDigit(tanggal.getHours())}.${duaDigit(tanggal.getMinutes())}`;

/** Titik jangkar & perataan isi sel menurut aturan kolomnya. */
function titikSel(kolom: Kolom): { x: number; rata: Rata } {
  if (kolom.rata === "kiri") return { x: kolom.x + 5, rata: "kiri" };
  if (kolom.rata === "kanan") return { x: kolom.x + kolom.lebar - 5, rata: "kanan" };
  return { x: kolom.x + kolom.lebar / 2, rata: "tengah" };
}

/** Menulis isi satu sel tabel pada indeks kolom tertentu. */
function gambarSel(t: Tulis, yGarisDasar: number, indeksKolom: number, isi: string, opsi: OpsiTeks = {}): void {
  const kolom = KOLOM[indeksKolom];
  const titik = titikSel(kolom);
  t.teks(titik.x, yGarisDasar, isi, { ukuran: 8.5, ...opsi, rata: titik.rata, lebar: kolom.lebar - 10 });
}

/** Garis-garis pemisah kolom untuk satu baris tabel. */
function gambarGarisKolom(t: Tulis, yAtas: number, tinggi: number): void {
  for (const kolom of KOLOM) {
    t.garis(kolom.x, yAtas, kolom.x, yAtas + tinggi, ABU_GARIS, 0.4);
  }
  t.garis(MARGIN + LEBAR_ISI, yAtas, MARGIN + LEBAR_ISI, yAtas + tinggi, ABU_GARIS, 0.4);
}

/** Kop laporan: identitas takmir, judul, dan periode. Mengembalikan y berikutnya. */
function gambarKop(t: Tulis, laporan: LaporanBulanan): number {
  let y = 52;
  t.teks(LEBAR_HALAMAN / 2, y, NAMA_TAKMIR, { ukuran: 15, tebal: true, rata: "tengah", warna: HIJAU_TUA });
  y += 14;
  t.teks(LEBAR_HALAMAN / 2, y, ALAMAT_TAKMIR, { ukuran: 8, rata: "tengah", warna: ABU_TEKS });
  y += 21;
  t.teks(LEBAR_HALAMAN / 2, y, JUDUL_LAPORAN, { ukuran: 12.5, tebal: true, rata: "tengah", warna: HITAM });
  const lebarJudul = lebarTeks(JUDUL_LAPORAN, 12.5, true);
  t.garis(LEBAR_HALAMAN / 2 - lebarJudul / 2, y + 3, LEBAR_HALAMAN / 2 + lebarJudul / 2, y + 3, HITAM, 0.9);
  y += 15;
  t.teks(LEBAR_HALAMAN / 2, y, `Periode: ${laporan.periode}`, { ukuran: 8.5, rata: "tengah", warna: ABU_TEKS });
  return y + 17;
}

/** Empat kotak ringkasan (pemasukan, pengeluaran, surplus/(defisit), saldo akhir). */
function gambarRingkasan(t: Tulis, laporan: LaporanBulanan, yAtas: number): number {
  const tinggi = 36;

  for (const kotak of KOTAK_RINGKASAN) {
    const nilai = kotak.nilai(laporan);
    t.isiKotak(kotak.x, yAtas, kotak.lebar, tinggi, kotak.isian);
    t.bingkaiKotak(kotak.x, yAtas, kotak.lebar, tinggi, kotak.warna, 0.9);
    t.teks(kotak.x + 10, yAtas + 14, kotak.label, { ukuran: 8.5, tebal: true, warna: kotak.warna });
    t.teks(kotak.x + kotak.lebar - 10, yAtas + 29, rupiah(nilai), {
      ukuran: 12.5,
      tebal: true,
      rata: "kanan",
      warna: nilai < 0 ? MERAH_TUA : kotak.warna,
      lebar: kotak.lebar - 20,
    });
  }

  return yAtas + tinggi + 14;
}

/** Baris kepala tabel (berlatar hijau tua). */
function gambarKepalaTabel(t: Tulis, yAtas: number): number {
  t.isiKotak(MARGIN, yAtas, LEBAR_ISI, TINGGI_HEADER, HIJAU_TUA);
  LABEL_KOLOM.forEach((label, indeks) => {
    gambarSel(t, yAtas + 11.5, indeks, label, { tebal: true, warna: PUTIH });
  });
  gambarGarisKolom(t, yAtas, TINGGI_HEADER);
  return yAtas + TINGGI_HEADER;
}

/** Satu baris data tabel. */
function gambarBarisTabel(t: Tulis, yAtas: number, baris: BarisTabel, zebra: boolean): void {
  t.isiKotak(MARGIN, yAtas, LEBAR_ISI, TINGGI_BARIS, zebra ? ABU_BARIS : PUTIH);
  t.isiKotak(KOLOM[5].x, yAtas, KOLOM[5].lebar, TINGGI_BARIS, ABU_BARIS);
  gambarSel(t, yAtas + 10.5, 0, baris.no);
  gambarSel(t, yAtas + 10.5, 1, baris.tanggal);
  gambarSel(t, yAtas + 10.5, 2, baris.uraian);
  gambarSel(t, yAtas + 10.5, 3, angkaTabel(baris.masuk));
  gambarSel(t, yAtas + 10.5, 4, angkaTabel(baris.keluar));
  gambarSel(t, yAtas + 10.5, 5, baris.saldo.toLocaleString("id-ID"), { tebal: true });
  gambarGarisKolom(t, yAtas, TINGGI_BARIS);
  t.garis(MARGIN, yAtas + TINGGI_BARIS, MARGIN + LEBAR_ISI, yAtas + TINGGI_BARIS, ABU_GARIS, 0.4);
}

/** Baris total transaksi satu bulan. */
function gambarTotal(t: Tulis, yAtas: number, laporan: LaporanBulanan): number {
  const yGarisDasar = yAtas + 12;
  t.isiKotak(MARGIN, yAtas, LEBAR_ISI, TINGGI_TOTAL, PUTIH);
  t.garis(MARGIN, yAtas, MARGIN + LEBAR_ISI, yAtas, HIJAU_TUA, 1);
  t.garis(MARGIN, yAtas + TINGGI_TOTAL, MARGIN + LEBAR_ISI, yAtas + TINGGI_TOTAL, HIJAU_TUA, 1);

  const titikUraian = titikSel(KOLOM[2]);
  t.teks(titikUraian.x + KOLOM[2].lebar - 5, yGarisDasar, "TOTAL TRANSAKSI BULAN INI", {
    ukuran: 9,
    tebal: true,
    rata: "kanan",
  });
  gambarSel(t, yGarisDasar, 3, laporan.totalMasuk.toLocaleString("id-ID"), { tebal: true });
  gambarSel(t, yGarisDasar, 4, laporan.totalKeluar.toLocaleString("id-ID"), { tebal: true });
  gambarSel(t, yGarisDasar, 5, laporan.saldoAkhir.toLocaleString("id-ID"), { tebal: true });

  return yAtas + TINGGI_TOTAL;
}

/** Jumlah baris peran terbanyak; dipakai agar label peran sejajar di garis bawah yang sama. */
const MAKS_BARIS_PERAN = Math.max(...PENANDATANGAN.map((p) => p.peran.length));

/** Blok tanda tangan: tanggal unduh di kanan atas, tiga kolom penandatangan sejajar. */
function gambarTandaTangan(t: Tulis, yAtas: number, waktuUnduh: Date): void {
  let y = yAtas + 18;
  t.teks(MARGIN + LEBAR_ISI, y, `${KOTA_TANDA_TANGAN}, ${tanggalPanjang(waktuUnduh)}`, { ukuran: 9, rata: "kanan" });
  y += 20;

  PENANDATANGAN.forEach((penanda, indeks) => {
    const tengah = MARGIN + (LEBAR_ISI / 3) * (indeks + 0.5);
    // Rata-bawah: label 1 baris (Bendahara) turun agar sejajar dengan baris akhir Ketua.
    const yPeran = y + (MAKS_BARIS_PERAN - penanda.peran.length) * 11;
    penanda.peran.forEach((baris, urutan) => {
      t.teks(tengah, yPeran + urutan * 11, baris, { ukuran: 9.5, tebal: true, rata: "tengah" });
    });

    const yNama = y + 52;
    t.teks(tengah, yNama, penanda.nama, { ukuran: 9.5, tebal: true, rata: "tengah" });
    const lebarGaris = Math.max(lebarTeks(penanda.nama, 9.5, true) + 24, 96);
    t.garis(tengah - lebarGaris / 2, yNama + 3, tengah + lebarGaris / 2, yNama + 3, HITAM, 0.6);
  });
}

/** Footer tiap halaman: keterangan unduh di kiri, nomor halaman i/N mepet kanan. */
function gambarFooter(t: Tulis, waktuUnduh: Date, nomorHalaman: number, totalHalaman: number): void {
  const y = TINGGI_HALAMAN - 22;
  t.teks(MARGIN, y, `Didownload pada: ${tanggalPanjang(waktuUnduh)} pukul ${jamMenit(waktuUnduh)} WIB`, {
    ukuran: 7.5,
    warna: ABU_TEKS,
  });
  t.teks(MARGIN + LEBAR_ISI, y, `Halaman ${nomorHalaman}/${totalHalaman}`, {
    ukuran: 7.5,
    rata: "kanan",
    warna: ABU_TEKS,
  });
}

/**
 * Menyusun berkas PDF laporan satu bulan.
 * @param waktuUnduh waktu pembuatan berkas; dipakai pada tanggal tanda tangan dan keterangan unduh.
 */
export function buatPdfLaporan(laporan: LaporanBulanan, waktuUnduh: Date = new Date()): Uint8Array {
  const halaman: string[] = [];
  let t = new Tulis();
  let y = gambarRingkasan(t, laporan, gambarKop(t, laporan));
  y = gambarKepalaTabel(t, y);

  const barisTabel: BarisTabel[] = [
    {
      no: "-",
      tanggal: `01/${duaDigit(laporan.bulan)}/${laporan.tahun}`,
      uraian: `Saldo Awal Bulan ${laporan.namaBulan}`,
      masuk: null,
      keluar: null,
      saldo: laporan.saldoAwal,
    },
    ...laporan.baris.map((baris, indeks) => ({
      no: String(indeks + 1),
      tanggal: baris.tanggal,
      uraian: baris.uraian,
      masuk: baris.masuk,
      keluar: baris.keluar,
      saldo: baris.saldo,
    })),
  ];

  // Halaman lanjutan: ulangi judul ringkas + kepala tabel, tanpa kotak ringkasan.
  const halamanBaru = () => {
    halaman.push(t.ops.join("\n"));
    t = new Tulis();
    t.teks(LEBAR_HALAMAN / 2, 46, `${JUDUL_LAPORAN} — ${laporan.namaBulan} ${laporan.tahun}`, {
      ukuran: 10,
      tebal: true,
      rata: "tengah",
      warna: HIJAU_TUA,
    });
    t.teks(LEBAR_HALAMAN / 2, 60, `Periode: ${laporan.periode}`, { ukuran: 8, rata: "tengah", warna: ABU_TEKS });
    y = gambarKepalaTabel(t, 74);
  };

  barisTabel.forEach((baris, indeks) => {
    if (y + TINGGI_BARIS > BATAS_TABEL) halamanBaru();
    gambarBarisTabel(t, y, baris, indeks % 2 === 1);
    y += TINGGI_BARIS;
  });

  if (y + TINGGI_TOTAL > BATAS_TABEL) halamanBaru();
  y = gambarTotal(t, y, laporan);
  gambarTandaTangan(t, y, waktuUnduh);
  halaman.push(t.ops.join("\n"));

  // Tempel footer setelah total halaman diketahui agar format Halaman i/N benar.
  const berkas = halaman.map((isi, indeks) => {
    const f = new Tulis();
    f.ops.push(isi);
    gambarFooter(f, waktuUnduh, indeks + 1, halaman.length);
    return f.ops.join("\n");
  });

  return susunPdf(berkas);
}
