const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const SUPABASE_URL = 'https://faclnbenlcsuubxexxrx.supabase.co';
const SUPABASE_KEY = (process.env.SUPABASE_KEY || 'sb_publishable_TcuATihcZ7clQA3y7vL3IA_tik3MOuV').replace(/[^a-zA-Z0-9_\-\.]/g, '');

const TABLE_NAME = 'shella_books';

const GENRES = [
  'Dark Fantasy',
  'Horor Murni Supranatural',
  'Romansa Emosional & Realistis',
  'Misteri Detektif',
  'Sci-Fi Petualangan Luar Angkasa',
  'Epik Silat Tradisional'
];

// Pustaka visual aman per genre (Menghindari penolakan / 'Image Refused')
const GENRE_PROMPTS = {
  'Dark Fantasy': 'mystic dark fantasy castle, glowing runes, cinematic purple and gold lighting, ethereal landscape, digital painting, elegant art cover',
  'Horor Murni Supranatural': 'abandoned vintage wooden mansion, mist in deep forest, cold moonlight, atmospheric shadows, spooky aesthetic art',
  'Romansa Emosional & Realistis': 'warm sunset over coastal town, two silhouettes standing by the train station, anime background style, melancholic romantic lighting',
  'Misteri Detektif': 'noir vintage detective office, dim street lamps through wet rain window, silhouette with coat, mysterious mood art',
  'Sci-Fi Petualangan Luar Angkasa': 'deep space nebula, futuristic cosmic spacecraft cruising near ringed planet, neon stars, epic galactic wallpaper',
  'Epik Silat Tradisional': 'ancient martial artist overlooking misty mountain peaks, waterfall, autumn leaves falling, traditional fantasy ink painting style'
};

async function callGemini(prompt) {
  const model = 'gemini-3.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`Memanggil model ${model} (Percobaan ke-${attempt})...`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
      }

      const errText = await response.text();
      console.warn(`Respon Google (${response.status}): ${errText}`);
      if (response.status === 503 || response.status === 429) {
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      break;
    } catch (e) {
      console.warn(`Jaringan terputus: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error('Gagal menghubungi Gemini API.');
}

function extractTag(text, tag) {
  const match = text.match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)(?=\\[[A-Z_]+\\]|$)`, 'i'));
  return match ? match[1].trim() : '';
}

async function main() {
  const selectedGenre = GENRES[Math.floor(Math.random() * GENRES.length)];
  console.log(`Membuat cerita baru dengan genre: ${selectedGenre}`);

  const prompt = `
Bertindaklah sebagai novelis sastra profesional. Tulis sebuah bab pembuka novel lengkap dan mandiri dalam bahasa Indonesia.
Genre: ${selectedGenre}

Aturan Penulisan:
1. Panjang Tulisan: Minimal 3.000 kata (estimasi membaca santai 15 menit). Cerita mengalir mendalam, sinematik, suasana latar kuat, tanpa alur terburu-buru.
2. Selesaikan konflik bab pembuka ini secara tuntas tanpa menggantung.
3. JANGAN gunakan sub-bab atau nomor adegan. Tulis paragraf narasi sastra mengalir.
4. Tuliskan persis menggunakan tag pemisah berikut:

[JUDUL]
(Tulis judul buku di sini)

[TAGLINE]
(Tulis 1 kalimat puitis/dramatis di sini)

[SINOPSIS]
(Tulis sinopsis ringkas 2 paragraf di sini)

[BAB_JUDUL]
Bab 1: (Judul bab di sini)

[CERITA]
(Isi bab lengkap minimal 3000 kata di sini)
`;

  const rawText = await callGemini(prompt);

  const judul = extractTag(rawText, 'JUDUL') || `Kisah ${selectedGenre}`;
  const tagline = extractTag(rawText, 'TAGLINE') || 'Sebuah kisah tentang pencarian dan takdir.';
  const sinopsis = extractTag(rawText, 'SINOPSIS') || 'Kisah yang membawa Anda ke dalam petualangan tak terduga.';
  const babJudul = extractTag(rawText, 'BAB_JUDUL') || 'Bab 1';
  let cerita = extractTag(rawText, 'CERITA');

  if (!cerita || cerita.length < 200) {
    cerita = rawText;
  }

  // Generate URL Sampul dengan prompt visual bersih bebas penolakan sensor
  const visualDesc = encodeURIComponent(GENRE_PROMPTS[selectedGenre] || 'fantasy novel book cover art masterpiece, no text');
  const coverUrl = `https://image.pollinations.ai/prompt/${visualDesc}?width=720&height=1080&nologo=true&seed=${Date.now()}`;

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
        content: cerita
      }
    ]
  };

  console.log(`Mengirim buku "${bookPayload.title}" ke database Supabase...`);

  const insertUrl = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}`;
  const res = await fetch(insertUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(bookPayload)
  });

  if (!res.ok) {
    throw new Error(`Gagal menyimpan ke Supabase (${res.status}): ${await res.text()}`);
  }

  console.log(`Sukses! Buku "${bookPayload.title}" berhasil diunggah.`);
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
