const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const TABLE_NAME = 'novels'; 

const GENRES = [
  'Dark Fantasy', 'Horor Murni Supranatural', 'Romansa Emosional & Realistis', 
  'Misteri Pembunuhan / Detektif', 'Sci-Fi Petualangan Luar Angkasa', 'Epik Silat Tradisional'
];

async function main() {
  const selectedGenre = GENRES[Math.floor(Math.random() * GENRES.length)];
  console.log(`Memulai pembuatan cerita bergenre: ${selectedGenre}`);

  // 1. Deteksi otomatis model yang aktif di akun Google Anda
  console.log('Mengecek daftar model aktif dari Google API...');
  const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
  if (!listRes.ok) {
    throw new Error(`Gagal cek model (${listRes.status}): ${await listRes.text()}`);
  }
  const listData = await listRes.json();
  const models = listData.models || [];
  
  // Tampilkan semua model yang tersedia ke log Actions
  console.log('Model yang tersedia:', models.map(m => m.name).join(', '));

  // Filter model yang bisa generate konten
  const validModels = models.filter(m => 
    m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
  );

  if (validModels.length === 0) {
    throw new Error('Tidak ada model yang mendukung generateContent pada API key ini.');
  }

  // Pilih otomatis model flash, atau ambil model pertama yang tersedia
  const chosenModel = validModels.find(m => m.name.includes('flash')) || 
                      validModels.find(m => m.name.includes('gemini')) || 
                      validModels[0];

  console.log(`Menggunakan model otomatis: ${chosenModel.name}`);

  // 2. Prompt instruksi cerita
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

  // 3. Panggil endpoint sesuai model yang dideteksi otomatis
  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/${chosenModel.name}:generateContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(geminiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API Error: ${response.status} - ${await response.text()}`);
  }

  const resultData = await response.json();
  const rawText = resultData.candidates[0].content.parts[0].text;
  
  let novelData;
  try {
    novelData = JSON.parse(rawText);
  } catch (e) {
    novelData = JSON.parse(rawText.replace(/```json\n?|```/g, '').trim());
  }

  // 4. Buat URL Sampul Otomatis
  const coverUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(novelData.cover_prompt_en)}?width=720&height=1080&nologo=true&seed=${Date.now()}`;

  // 5. Susun payload database
  const payload = {
    title: novelData.judul,
    content: novelData.isi_cerita,
    genre: novelData.genre,
    cover_url: coverUrl,
    author: 'Shella Aurelia',
    created_at: new Date().toISOString()
  };

  console.log(`Mengirim novel "${payload.title}" ke Supabase...`);

  // 6. Simpan ke Supabase
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

  console.log('Novel berhasil diunggah ke Shella Reader!');
}

main().catch(err => {
  console.error('Terjadi kesalahan:', err);
  process.exit(1);
});
