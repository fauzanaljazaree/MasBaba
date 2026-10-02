/**
 * Endpoint unduh laporan keuangan bulanan (PDF).
 *
 * PIN diverifikasi di sisi server supaya tidak terbaca dari kode halaman.
 * PIN diambil dari env `LAPORAN_PIN` (default "123456" bila belum diisi).
 */
import type { APIRoute } from 'astro';
import { ambilLaporanBulanan, bulanSudahLewat, NAMA_BULAN } from '../../lib/laporan-keuangan';
import { buatPdfLaporan } from '../../lib/pdf-laporan';

export const prerender = false;

const PIN_CADANGAN = '123456';
const TAHUN_TERAKHIR = 2100;

const kirimPesan = (pesan: string, status: number) =>
  new Response(JSON.stringify({ pesan }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const ambilPin = () => import.meta.env.LAPORAN_PIN || process.env.LAPORAN_PIN || PIN_CADANGAN;

export const POST: APIRoute = async ({ request }) => {
  let isi: { bulan?: unknown; tahun?: unknown; pin?: unknown };
  try {
    isi = await request.json();
  } catch {
    return kirimPesan('Permintaan tidak valid.', 400);
  }

  const pin = typeof isi.pin === 'string' ? isi.pin : '';
  if (!/^\d{6}$/.test(pin)) return kirimPesan('PIN harus terdiri dari 6 angka.', 400);
  if (pin !== ambilPin()) return kirimPesan('PIN salah. Silakan coba lagi.', 401);

  const bulan = Number(isi.bulan);
  const tahun = Number(isi.tahun);
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return kirimPesan('Bulan laporan tidak valid.', 400);
  if (!Number.isInteger(tahun) || tahun < 2026 || tahun > TAHUN_TERAKHIR) return kirimPesan('Tahun laporan tidak valid.', 400);
  if (!bulanSudahLewat(bulan, tahun)) {
    return kirimPesan('Bulan tersebut belum selesai, laporan belum bisa diunduh.', 400);
  }

  try {
    const laporan = await ambilLaporanBulanan(bulan, tahun);
    const pdf = buatPdfLaporan(laporan, new Date());
    const namaBerkas = `Laporan-Keuangan-Masjid-${laporan.namaBulan}-${laporan.tahun}.pdf`;

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${namaBerkas}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const pesan = error instanceof Error ? error.message : 'Gagal menyusun laporan.';
    console.error(`Gagal menyusun laporan ${NAMA_BULAN[bulan - 1]} ${tahun}:`, pesan);
    return kirimPesan(pesan, 502);
  }
};
