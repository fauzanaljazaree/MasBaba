/**
 * Sumber data laporan keuangan bulanan (sisi server).
 *
 * Mengambil spreadsheet resmi (Google Sheets publish-to-xlsx), membaca sheet
 * "Pemasukan"/"Pengeluaran" dan tabel "RINGKASAN BULANAN" pada sheet Dashboard,
 * lalu menyusun model laporan untuk satu bulan: saldo awal, rincian transaksi
 * beserta saldo berjalan, serta total masuk/keluar.
 *
 * Penting: sel tanggal pada spreadsheet berbentuk serial angka Excel. Opsi
 * `cellDates: true` milik SheetJS menggeser tanggal mengikuti zona waktu mesin
 * (di WIB hasilnya meleset ±1 hari), sehingga serial di sini dikonversi manual
 * lewat `tanggalDariSerial` agar hasilnya sama di server mana pun.
 */
import * as XLSX from 'xlsx';

const XLSX_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYRGdIJonG8O6PwF1ceNNwUMypxK7wju05pdQ39trRcwhv_bKzoKUMUJrfwB_svg/pub?output=xlsx';

const SHEET = {
  dashboard: 'Dashboard & Ringkasan',
  pemasukan: 'Pemasukan',
  pengeluaran: 'Pengeluaran',
} as const;

/** Baris Januari pada tabel "RINGKASAN BULANAN" di sheet Dashboard. */
const BARIS_JANUARI_RINGKASAN = 11;
/** Kolom "Saldo Akhir" pada tabel ringkasan bulanan. */
const KOLOM_SALDO_AKHIR = 'M';
/** Tahun pertama yang punya tabel ringkasan bulanan (tahun lain diasumsikan menyusul di bawahnya). */
const TAHUN_RINGKASAN_AWAL = 2026;
/** Sel saldo kas dasar pada sheet Dashboard. */
const SEL_SALDO_DASAR = 'B7';
/** Cadangan bila sel saldo dasar tidak terbaca. */
const SALDO_DASAR_CADANGAN = 4_750_600;
/** Batas pencarian baris transaksi agar perulangan tidak berjalan tanpa henti. */
const BARIS_TRANSAKSI_MAKS = 400;

const EPOK_EXCEL = Date.UTC(1899, 11, 30);
const MS_PER_HARI = 86_400_000;

export const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export type BarisLaporan = {
  /** Tanggal transaksi, format dd/mm/yyyy. */
  tanggal: string;
  uraian: string;
  masuk: number | null;
  keluar: number | null;
  /** Saldo kas setelah transaksi ini dibukukan. */
  saldo: number;
};

export type LaporanBulanan = {
  /** 1 = Januari ... 12 = Desember. */
  bulan: number;
  tahun: number;
  namaBulan: string;
  /** Contoh: "1 Oktober 2026 – 31 Oktober 2026". */
  periode: string;
  saldoAwal: number;
  totalMasuk: number;
  totalKeluar: number;
  /** Selisih pemasukan − pengeluaran bulan ini; negatif berarti defisit. */
  surplus: number;
  saldoAkhir: number;
  baris: BarisLaporan[];
};

export type OpsiBulan = { bulan: number; tahun: number; label: string };

/** Transaksi mentah hasil pembacaan sheet, sebelum difilter per bulan. */
type TransaksiMentah = {
  serial: number;
  tanggal: string;
  uraian: string;
  masuk: number;
  keluar: number;
};

const angkaSel = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const teksSel = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const duaDigit = (n: number) => String(n).padStart(2, '0');

/** Serial tanggal Excel -> komponen tahun/bulan/hari (tanpa pengaruh zona waktu). */
function tanggalDariSerial(serial: number): { tahun: number; bulan: number; hari: number } {
  const d = new Date(EPOK_EXCEL + Math.round(serial * MS_PER_HARI));
  return { tahun: d.getUTCFullYear(), bulan: d.getUTCMonth() + 1, hari: d.getUTCDate() };
}

/** Komponen tanggal -> serial Excel. */
function serialDariTanggal(tahun: number, bulan: number, hari: number): number {
  return (Date.UTC(tahun, bulan - 1, hari) - EPOK_EXCEL) / MS_PER_HARI;
}

/** Jumlah hari pada satu bulan (1-12). */
function jumlahHariBulan(tahun: number, bulan: number): number {
  return new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
}

/** Serial Excel -> label dd/mm/yyyy. */
function labelTanggal(serial: number): string {
  const { tahun, bulan, hari } = tanggalDariSerial(serial);
  return `${duaDigit(hari)}/${duaDigit(bulan)}/${tahun}`;
}

/**
 * Membaca baris transaksi bernomor pada sheet Pemasukan/Pengeluaran.
 * Baris tanpa nomor, tanpa tanggal, atau bernilai nol (baris kosong template)
 * dilewati; baris "TOTAL ..." menghentikan pembacaan.
 */
function bacaTransaksi(sheet: XLSX.WorkSheet, jenis: 'masuk' | 'keluar'): TransaksiMentah[] {
  const hasil: TransaksiMentah[] = [];

  for (let baris = 4; baris <= BARIS_TRANSAKSI_MAKS; baris += 1) {
    const keterangan = teksSel(sheet[`E${baris}`]?.v);
    if (keterangan.toUpperCase().startsWith('TOTAL')) break;

    const nomor = angkaSel(sheet[`A${baris}`]?.v);
    const serial = angkaSel(sheet[`B${baris}`]?.v);
    const nilai = angkaSel(sheet[`F${baris}`]?.v);
    if (nomor === null || serial === null || nilai === null || nilai === 0) continue;

    const kategori = teksSel(sheet[`C${baris}`]?.v);
    const sumber = teksSel(sheet[`D${baris}`]?.v);
    const uraian = keterangan || [kategori, sumber].filter(Boolean).join(' - ');

    hasil.push({
      serial,
      tanggal: labelTanggal(serial),
      uraian: uraian || '-',
      masuk: jenis === 'masuk' ? nilai : 0,
      keluar: jenis === 'keluar' ? nilai : 0,
    });
  }

  return hasil.sort((a, b) => a.serial - b.serial);
}


/** Baris tabel ringkasan bulanan untuk satu bulan, mengikuti pola 12 baris per tahun. */
function barisRingkasan(bulan: number, tahun: number): number | null {
  if (tahun < TAHUN_RINGKASAN_AWAL) return null;
  return BARIS_JANUARI_RINGKASAN + (tahun - TAHUN_RINGKASAN_AWAL) * 12 + (bulan - 1);
}

/** Pencarian cadangan: baris pertama tabel ringkasan yang kolom B-nya sama dengan nama bulan. */
function cariBarisNamaBulan(sheet: XLSX.WorkSheet, namaBulan: string): number | null {
  for (let baris = BARIS_JANUARI_RINGKASAN; baris <= BARIS_JANUARI_RINGKASAN + 60; baris += 1) {
    if (teksSel(sheet[`B${baris}`]?.v).toLowerCase() === namaBulan) return baris;
  }
  return null;
}

/**
 * Saldo akhir satu bulan menurut tabel "RINGKASAN BULANAN".
 * Nama bulan pada kolom B diperiksa agar baris tidak tertukar.
 */
function saldoAkhirRingkasan(sheet: XLSX.WorkSheet, bulan: number, tahun: number): number | null {
  const barisTaksiran = barisRingkasan(bulan, tahun);
  if (barisTaksiran === null) return null;

  const namaDicari = NAMA_BULAN[bulan - 1].toLowerCase();
  const namaBaris = teksSel(sheet[`B${barisTaksiran}`]?.v).toLowerCase();
  const baris = namaBaris === namaDicari ? barisTaksiran : cariBarisNamaBulan(sheet, namaDicari);
  if (baris === null) return null;

  return angkaSel(sheet[`${KOLOM_SALDO_AKHIR}${baris}`]?.v);
}

/**
 * Saldo awal laporan = saldo akhir bulan sebelumnya pada tabel ringkasan bulanan.
 * Khusus Januari (tidak ada bulan sebelumnya) dipakai saldo kas dasar di sel B7.
 */
function saldoAwalLaporan(sheet: XLSX.WorkSheet, bulan: number, tahun: number): number | null {
  if (bulan === 1) {
    return saldoAkhirRingkasan(sheet, 12, tahun - 1) ?? angkaSel(sheet[SEL_SALDO_DASAR]?.v) ?? SALDO_DASAR_CADANGAN;
  }
  return saldoAkhirRingkasan(sheet, bulan - 1, tahun);
}

/** Mengunduh dan membaca spreadsheet resmi. */
async function ambilWorkbook(): Promise<XLSX.WorkBook> {
  const response = await fetch(XLSX_URL);
  if (!response.ok) throw new Error(`Spreadsheet tidak dapat diunduh (HTTP ${response.status}).`);
  return XLSX.read(await response.arrayBuffer(), { type: 'array' });
}



/** Apakah bulan tersebut sudah terlewati penuh? (dipakai untuk membatasi pilihan bulan) */
export function bulanSudahLewat(bulan: number, tahun: number, sekarang: Date = new Date()): boolean {
  const tahunIni = sekarang.getFullYear();
  const bulanIni = sekarang.getMonth() + 1;
  return tahun < tahunIni || (tahun === tahunIni && bulan < bulanIni);
}

/** Daftar bulan yang boleh diekspor (hanya bulan yang sudah lewat penuh), terbaru lebih dulu. */
export function opsiBulanTersedia(sekarang: Date = new Date()): OpsiBulan[] {
  const tahunIni = sekarang.getFullYear();
  const bulanIni = sekarang.getMonth() + 1;
  const daftar: OpsiBulan[] = [];

  for (let tahun = tahunIni; tahun >= TAHUN_RINGKASAN_AWAL; tahun -= 1) {
    const bulanTerakhir = tahun === tahunIni ? bulanIni - 1 : 12;
    for (let bulan = bulanTerakhir; bulan >= 1; bulan -= 1) {
      daftar.push({ bulan, tahun, label: `${NAMA_BULAN[bulan - 1]} ${tahun}` });
    }
  }

  return daftar;
}

/**
 * Menyusun laporan keuangan satu bulan dari spreadsheet resmi.
 * @throws Error bila saldo awal bulan tersebut belum ada di tabel ringkasan.
 */
export async function ambilLaporanBulanan(bulan: number, tahun: number): Promise<LaporanBulanan> {
  const workbook = await ambilWorkbook();
  const dashboard = workbook.Sheets[SHEET.dashboard];
  const sheetPemasukan = workbook.Sheets[SHEET.pemasukan];
  const sheetPengeluaran = workbook.Sheets[SHEET.pengeluaran];
  if (!dashboard || !sheetPemasukan || !sheetPengeluaran) throw new Error('Sheet laporan keuangan tidak lengkap.');

  const saldoAwal = saldoAwalLaporan(dashboard, bulan, tahun);
  if (saldoAwal === null) {
    const sebelumnya = bulan === 1 ? `Desember ${tahun - 1}` : `${NAMA_BULAN[bulan - 2]} ${tahun}`;
    throw new Error(`Saldo akhir ${sebelumnya} belum ada di tabel ringkasan bulanan spreadsheet.`);
  }

  const serialAwal = serialDariTanggal(tahun, bulan, 1);
  const serialAkhir = serialDariTanggal(tahun, bulan, jumlahHariBulan(tahun, bulan));

  const transaksi = [...bacaTransaksi(sheetPemasukan, 'masuk'), ...bacaTransaksi(sheetPengeluaran, 'keluar')]
    .filter((t) => t.serial >= serialAwal && t.serial <= serialAkhir)
    .sort((a, b) => a.serial - b.serial);

  let saldo = saldoAwal;
  const baris: BarisLaporan[] = transaksi.map((t) => {
    saldo += t.masuk - t.keluar;
    return { tanggal: t.tanggal, uraian: t.uraian, masuk: t.masuk || null, keluar: t.keluar || null, saldo };
  });

  const totalMasuk = transaksi.reduce((total, t) => total + t.masuk, 0);
  const totalKeluar = transaksi.reduce((total, t) => total + t.keluar, 0);
  const namaBulan = NAMA_BULAN[bulan - 1];
  const hariTerakhir = jumlahHariBulan(tahun, bulan);

  return {
    bulan,
    tahun,
    namaBulan,
    periode: `1 ${namaBulan} ${tahun} – ${hariTerakhir} ${namaBulan} ${tahun}`,
    saldoAwal,
    totalMasuk,
    totalKeluar,
    surplus: totalMasuk - totalKeluar,
    saldoAkhir: saldoAwal + totalMasuk - totalKeluar,
    baris,
  };
}
