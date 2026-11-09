const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const SUPABASE_URL = 'https://faclnbenlcsuubxexxrx.supabase.co';
const SUPABASE_KEY = (process.env.SUPABASE_KEY || 'sb_publishable_TcuATihcZ7clQA3y7vL3IA_tik3MOuV').replace(/[^a-zA-Z0-9_\-\.]/g, '');

const TABLE_NAME = 'shella_books'; 

const GENRES = [
  'Dark Fantasy', 'Horor Murni Supranatural', 'Romansa Emosional & Realistis', 
  'Misteri Pembunuhan / Detektif', 'Sci-Fi Petualangan Luar Angkasa', 'Epik Silat Tradisional'
];

// Khusus menggunakan model 3.5 yang cepat dan stabil
const CANDIDATE_MODELS = [
  'gemini-3.5-flash',
  'gemini-flash-latest'
];

async function callGeminiWithRetry(prompt) {
  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`Memanggil model ${model} (Percobaan ke-${attempt})...`);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        if (response.ok) {
          const resultData = await response.json();
          if (resultData.candidates && resultData.candidates[0]?.content?.parts?.[0]?.text) {
            return resultData.candidates[0].content.parts[0].text;
          }
        }

        const errorText = await response.text();
        console.warn(`Respon Google (${response.status}): ${errorText}`);

        if (response.status === 503 || response.status === 429) {
          console.log('Server sibuk, menunggu 10 detik...');
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        break;
      } catch (err) {
        console.warn(`Jaringan terputus: ${err.message}. Mencoba lagi...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  throw new Error('Gagal menghubungi Gemini API.');
}

function extractTag(text, tag) {
  const regex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)(?=\\[[A-Z_]+\\]|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

async function main() {
  const selectedGenre = GENRES[Math.floor(Math.random() * GENRES.length)];
  console.log(`Memulai pembuatan cerita bergenre: ${selectedGenre}`);

  const prompt = `
Bertindaklah sebagai novelis sastra profesional. Tulis sebuah bab cerita lengkap dan mandiri dalam bahasa Indonesia.
Genre: ${selectedGenre}

Aturan Penulisan:
1. Panjang Tulisan: Minimal 3.000 kata (estimasi membaca 15 menit). Alur mengalir rapi, sinematik, kaya deskripsi suasana latar dan emosi tokoh, tanpa sub-bab terputus.
2. Format Output: Tuliskan persis menggunakan tag pemisah berikut:

[JUDUL]
(Judul buku/novel)

[TAGLINE]
(Satu kalimat kutipan dramatis/puitis)

[SINOPSIS]
(Ringkasan cerita 2-3 paragraf)

[COVER]
(Deskripsi visual sampul buku dalam bahasa Inggris untuk image generator)

[BAB_JUDUL]
Bab 1: (Judul bab cerita)

[CERITA]
(Seluruh isi cerita bab 1 lengkap minimal 3000 kata tanpa sub-bab)
`;

  const rawText = await callGeminiWithRetry(prompt);
  
  const judul = extractTag(rawText, 'JUDUL') || `Kisah ${selectedGenre}`;
  const tagline = extractTag(rawText, 'TAGLINE') || '';
  const sinopsis = extractTag(rawText, 'SINOPSIS') || '';
  const coverPrompt = extractTag(rawText, 'COVER') || `book cover art ${selectedGenre}`;
  const babJudul = extractTag(rawText, 'BAB_JUDUL') || 'Bab 1';
  let isiCerita = extractTag(rawText, 'CERITA');

  if (!isiCerita || isiCerita.length < 100) {
    isiCerita = rawText;
  }

  const coverUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(coverPrompt)}?width=720&height=1080&nologo=true&seed=${Date.now()}`;
  const bookId = 'book_' + Date.now();
  const safeDesc = `---META---\nGENRE::${selectedGenre}\nTAGLINE::${tagline}\nNUANSA::${selectedGenre}\n---ENDMETA---\n${sinopsis}`;

  const bookPayload = {
    id: bookId,
    title: judul,
    author: 'Shella Aurelia',
    desc: safeDesc,
    cover: coverUrl,
    chapters: [
      {
        title: babJudul,
        content: isiCerita
      }
    ]
  };

  console.log(`Mengirim buku "${bookPayload.title}" ke Supabase...`);

  const insertUrl = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}`;
  const supabaseRes = await fetch(insertUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(bookPayload)
  });

  if (!supabaseRes.ok) {
    const errorBody = await supabaseRes.text();
    throw new Error(`Gagal menyimpan ke Supabase (${supabaseRes.status}): ${errorBody}`);
  }

  console.log(`Sukses! Novel "${bookPayload.title}" karya Shella Aurelia telah masuk ke Shella Reader.`);
}

main().catch(err => {
  console.error('Terjadi kesalahan fatal:', err);
  process.exit(1);
});
