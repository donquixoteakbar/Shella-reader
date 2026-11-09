const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const SUPABASE_URL = 'https://faclnbenlcsuubxexxrx.supabase.co';
const SUPABASE_KEY = (process.env.SUPABASE_KEY || 'sb_publishable_TcuATihcZ7clQA3y7vL3IA_tik3MOuV').replace(/[^a-zA-Z0-9_\-\.]/g, '');

const TABLE_NAME = 'shella_books';

const CANDIDATE_MODELS = [
  'gemini-3.5-flash',
  'gemini-flash-latest'
];

async function loadAIConfig() {
  console.log('Membaca konfigurasi dari tabel shella_ai_config...');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/shella_ai_config?id=eq.main_config`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows && rows[0]) {
        const row = rows[0];
        let extra = {};
        try { extra = JSON.parse(row.custom_instruction || '{}'); } catch(e){}
        return {
          main_character: row.main_character || extra.main_character || 'Shella',
          writing_style: row.writing_style || extra.writing_style || 'Petualangan Hangat & Penuh Nilai Kebaikan',
          active_genres: row.active_genres || ['Fantasi & Petualangan Ajaib'],
          target_audience: extra.target_audience || 'sd_mi',
          moral_message: extra.moral_message || '',
          custom_title: extra.custom_title || '',
          story_premise: extra.story_premise || '',
          supporting_characters: extra.supporting_characters || '',
          reading_time: parseInt(extra.reading_time) || 15,
          cover_idea: extra.cover_idea || '',
          extra_notes: extra.extra_notes || ''
        };
      }
    }
  } catch (err) {
    console.warn('Gagal membaca shella_ai_config, menggunakan konfigurasi cadangan:', err.message);
  }

  return {
    main_character: 'Shella',
    writing_style: 'Petualangan Hangat & Penuh Nilai Kebaikan',
    active_genres: ['Fantasi & Petualangan Ajaib', 'Misteri Detektif Sekolah'],
    target_audience: 'sd_mi',
    moral_message: 'Kejujuran dan tolong menolong',
    custom_title: '',
    story_premise: '',
    supporting_characters: '',
    reading_time: 15,
    cover_idea: '',
    extra_notes: ''
  };
}

async function callGemini(prompt) {
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

        const errText = await response.text();
        console.warn(`Respon Google (${response.status}): ${errText}`);
        if (response.status === 503 || response.status === 429) {
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
  const match = text.match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)(?=\\[[A-Z_]+\\]|$)`, 'i'));
  return match ? match[1].trim() : '';
}

async function main() {
  const config = await loadAIConfig();
  
  const genres = Array.isArray(config.active_genres) && config.active_genres.length > 0 
    ? config.active_genres 
    : ['Fantasi & Petualangan Ajaib'];
  const selectedGenre = genres[Math.floor(Math.random() * genres.length)];
  
  const targetWords = config.reading_time * 200; // 15 menit = ~3.000 kata

  let audienceGuide = '';
  if (config.target_audience === 'sd_mi') {
    audienceGuide = `
- TARGET PEMBACA: Siswa tingkat SD/MI.
- ATURAN BAHASA: Gunakan bahasa Indonesia yang mudah dipahami, lugas, mengalir ceria, kalimat tidak berbelit-belit. Hindari kata-kata yang terlalu berat atau membingungkan anak-anak.
- NILAI EDUKATIF: Aman, inspiratif, penuh petualangan mendidik, dan tidak mengandung unsur negatif/kasar.`;
  } else if (config.target_audience === 'remaja') {
    audienceGuide = `
- TARGET PEMBACA: Remaja tingkat SMP/SMA.
- ATURAN BAHASA: Mengalir santai, dialog emosional, pergaulan sehat, penuh semangat muda.`;
  } else {
    audienceGuide = `
- TARGET PEMBACA: Umum / Pecinta sastra.
- ATURAN BAHASA: Kosakata kaya, metafora puitis, dan suasana sinematik mendalam.`;
  }

  const prompt = `
Bertindaklah sebagai novelis sastra profesional sekaligus pendidik kreatif. Tulis sebuah bab cerita lengkap dan mandiri dalam bahasa Indonesia.
Genre Terpilih: ${selectedGenre}

Aturan Penulisan Utama:
1. Target Panjang Tulisan: Minimal ${targetWords} kata (estimasi membaca santai ${config.reading_time} menit). Cerita harus lengkap dari awal, konflik, hingga penyelesaian tuntas tanpa menggantung.
2. Gaya Penulisan: ${config.writing_style}
${audienceGuide}
3. Tokoh Utama: "${config.main_character}"
${config.supporting_characters ? `4. Tokoh Pendukung/Kawan: "${config.supporting_characters}" (Wajib diikutsertakan secara aktif dalam dialog dan adegan cerita).` : ''}
${config.moral_message ? `5. Pesan Moral Wajib: "${config.moral_message}" (Sisipkan pesan ini secara halus dan menyentuh di akhir cerita).` : ''}
${config.custom_title ? `6. JUDUL BUKU WAJIB: "${config.custom_title}"` : '6. Buat judul buku yang memikat dan sesuai dengan genre.'}
${config.story_premise ? `7. PREMIS / INTI CERITA WAJIB: "${config.story_premise}" (Kembangkan narasi berdasarkan ide utama ini).` : ''}
${config.extra_notes ? `8. Instruksi Khusus Tambahan: ${config.extra_notes}` : ''}
9. Format Teks: JANGAN gunakan sub-bab atau nomor adegan. Tulis langsung paragraf narasi dan dialog yang hidup.

Format Output WAJIB menggunakan penanda berikut:

[JUDUL]
${config.custom_title || '(Judul buku di sini)'}

[TAGLINE]
(Satu kalimat kutipan dramatis/puitis yang cocok untuk buku ini)

[SINOPSIS]
(Ringkasan sinopsis 2 paragraf di sini)

[BAB_JUDUL]
Bab 1: (Judul bab cerita di sini)

[CERITA]
(Isi bab lengkap minimal ${targetWords} kata di sini)
`;

  console.log(`Membuat buku baru (${selectedGenre}) untuk target pembaca: ${config.target_audience}...`);
  const rawText = await callGemini(prompt);

  const judul = config.custom_title || extractTag(rawText, 'JUDUL') || `Kisah ${selectedGenre}`;
  const tagline = extractTag(rawText, 'TAGLINE') || 'Sebuah petualangan sarat makna.';
  const sinopsis = extractTag(rawText, 'SINOPSIS') || 'Kisah petualangan seru yang penuh nilai persahabatan.';
  const babJudul = extractTag(rawText, 'BAB_JUDUL') || 'Bab 1';
  let isiCerita = extractTag(rawText, 'CERITA');

  if (!isiCerita || isiCerita.length < 200) {
    isiCerita = rawText;
  }

  // Visual prompt cover yang aman dan bebas penolakan
  const baseVisual = config.cover_idea || `beautiful storybook illustration, ${selectedGenre}, clean art, magical atmosphere, no text`;
  const cleanCoverPrompt = encodeURIComponent(`digital novel book cover, ${baseVisual}, vibrant lighting, masterpiece`);
  const coverUrl = `https://image.pollinations.ai/prompt/${cleanCoverPrompt}?width=720&height=1080&nologo=true&seed=${Date.now()}`;

  const bookId = 'book_' + Date.now();
  const safeDesc = `---META---\nGENRE::${selectedGenre}\nTAGLINE::${tagline}\nNUANSA::${config.writing_style}\n---ENDMETA---\n${sinopsis}`;

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

  console.log(`Mengunggah novel "${bookPayload.title}" ke Supabase...`);

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
    throw new Error(`Gagal menyimpan ke Supabase (${supabaseRes.status}): ${await supabaseRes.text()}`);
  }

  console.log(`Sukses! Buku "${bookPayload.title}" berhasil diterbitkan.`);
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
