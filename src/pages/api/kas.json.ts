import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';

// jalankan saat request masuk (bukan dibekukan saat build)
export const prerender = false;

const XLSX_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYRGdIJonG8O6PwF1ceNNwUMypxK7wju05pdQ39trRcwhv_bKzoKUMUJrfwB_svg/pub?output=xlsx';

// Fallback = data terakhir yang berhasil diambil dari spreadsheet
const DATA_TERAKHIR = { 'saldo-lalu': 1116900, pemasukan: 2418000, pengeluaran: 951500, saldo: 2583400 };

const angkaSel = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Cache server: sesuai ritme publish Google (±5 menit), spreadsheet diunduh ulang tiap 5 menit
const TTL_MS = 5 * 60_000;
let cache: { data: typeof DATA_TERAKHIR; sumber: string; waktu: string } | null = null;
let cacheDiambilPada = 0;

async function ambilDariSpreadsheet() {
  let data = { ...DATA_TERAKHIR };
  let sumber = 'cache-terakhir';
  try {
    const response = await fetch(XLSX_URL);
    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets['Dashboard & Ringkasan'];
    if (sheet) {
      data = {
        'saldo-lalu': angkaSel(sheet['B7']?.v) ?? DATA_TERAKHIR['saldo-lalu'],
        pemasukan: angkaSel(sheet['E7']?.v) ?? DATA_TERAKHIR.pemasukan,
        pengeluaran: angkaSel(sheet['H7']?.v) ?? DATA_TERAKHIR.pengeluaran,
        saldo: angkaSel(sheet['K7']?.v) ?? DATA_TERAKHIR.saldo,
      };
      sumber = 'spreadsheet';
    }
  } catch {
    // gunakan DATA_TERAKHIR saat spreadsheet tidak bisa diakses
  }
  return { data, sumber, waktu: new Date().toISOString() };
}

export const GET: APIRoute = async () => {
  const sekarang = Date.now();
  let diambilSegar = false;

  // unduh dari Google hanya bila cache belum ada / sudah kedaluwarsa
  if (!cache || sekarang - cacheDiambilPada >= TTL_MS) {
    const segar = await ambilDariSpreadsheet();
    if (segar.sumber === 'spreadsheet' || !cache) {
      cache = segar;
      cacheDiambilPada = sekarang;
    }
    diambilSegar = true;
  }

  const aktif = cache ?? { data: { ...DATA_TERAKHIR }, sumber: 'cache-terakhir', waktu: new Date().toISOString() };
  const umur = Math.max(0, Math.round((sekarang - cacheDiambilPada) / 1000));

  return new Response(
    JSON.stringify({
      ...aktif.data,
      sumber: aktif.sumber,
      waktu: aktif.waktu,
      diambilSegar,
      umurCacheDetik: umur,
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  );
};