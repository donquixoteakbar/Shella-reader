const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const SUPABASE_URL = 'https://faclnbenlcsuubxexxrx.supabase.co';
const SUPABASE_KEY = (process.env.SUPABASE_KEY || 'sb_publishable_TcuATihcZ7clQA3y7vL3IA_tik3MOuV').replace(/[^a-zA-Z0-9_\-\.]/g, '');

const TABLE_NAME = 'novels'; 

const GENRES = [
  'Dark Fantasy', 'Horor Murni Supranatural', 'Romansa Emosional & Realistis', 
  'Misteri Pembunuhan / Detektif', 'Sci-Fi Petualangan Luar Angkasa', 'Epik Silat Tradisional'
];

// Daftar model alternatif jika salah satu server sedang sibuk (503)
const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash-lite'
];

async function callGeminiWithRetry(prompt) {
  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`Mencoba memanggil model ${model} (Percobaan ke-${attempt})...`);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        if (response.ok) {
          const resultData = await response.json();
          return resultData.candidates[0].content.parts[0].text;
        }

        const errorText = await response.text();
        console.warn(`Peringatan server Google (${response.status}): ${errorText}`);

        // Jika server sibuk (503) atau dibatasi (429), tunggu sebentar lalu coba lagi
        if (response.status === 503 || response.status === 429) {
          console.log('Server sedang sibuk, menunggu 10 detik...');
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        // Jika model tidak ditemukan (404), langsung lewati ke model berikutnya
        break;
      } catch (err) {
        console.warn(`Jaringan terputus sementara: ${err.message}. Mencoba lagi...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    console.log(`Beralih ke model cadangan berikutnya...`);
  }
  throw new Error('Semua model Gemini sedang sibuk atau tidak merespons.');
}

async function main() {
  const selectedGenre = GENRES[Math.floor(Math.random() * GENRES.length)];
  console.log(`Memulai pembuatan cerita bergenre: ${selectedGenre}`);

  const prompt = `
Bertindaklah sebagai novelis sastra profesional. Tulis sebuah bab cerita lengkap dan mandiri dalam bahasa Indonesia.
Genre: ${selectedGenre}

Aturan Penulisan Wajib:
1. Panjang Tulisan: Minimal 3.000 hingga 4.000 kata (estimasi membaca santai 15 menit). Jangan potong narasi di tengah jalan.
2. Kedalaman Narasi: Sangat sinematik, kaya akan deskripsi latar suasana tempat, dinamika emosi karakter, serta adegan aksi/konflik yang detail. Hindari alur yang terburu-buru.
3. Struktur: Selesaikan konflik bab tersebut dengan tuntas. Jangan biarkan cerita menggantung tanpa resolusi yang jelas.
4. Format Teks: Hanya cantumkan satu Judul Bab di awal baris. JANGAN gunakan sub-bab, bab lanjutan, atau label adegan (seperti "Bagian 1", "Adegan 2", atau tanda pemisah bintang/pagar).
5. Output: Wajib berupa JSON murni tanpa format markdown codeblock seperti \`\`\`json.

Format JSON yang dibutuhkan:
{
  "judul": "Judul Bab Yang Menarik",
  "genre": "${selectedGenre}",
  "cover_prompt_en": "Deskripsi visual sampul buku dalam bahasa Inggris untuk image generator, gaya art cover buku, fokus visual utama, pencahayaan dramatis",
  "isi_cerita": "Teks lengkap bab minimal 3000 kata..."
}
`;

  const rawText = await callGeminiWithRetry(prompt);
  
  let novelData;
  try {
    novelData = JSON.parse(rawText);
  } catch (e) {
    novelData = JSON.parse(rawText.replace(/```json\n?|```/g, '').trim());
  }

  const coverUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(novelData.cover_prompt_en)}?width=720&height=1080&nologo=true&seed=${Date.now()}`;

  const payload = {
    title: novelData.judul,
    content: novelData.isi_cerita,
    genre: novelData.genre,
    cover_url: coverUrl,
    author: 'Shella Aurelia',
    created_at: new Date().toISOString()
  };

  console.log(`Mengirim novel "${payload.title}" ke Supabase...`);

  const insertUrl = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}`;
  const supabaseRes = await fetch(insertUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (!supabaseRes.ok) {
    const errorBody = await supabaseRes.text();
    throw new Error(`Gagal menyimpan ke Supabase (${supabaseRes.status}): ${errorBody}`);
  }

  console.log('Sukses! Novel berhasil diunggah ke Shella Reader.');
}

main().catch(err => {
  console.error('Terjadi kesalahan fatal:', err);
  process.exit(1);
});
