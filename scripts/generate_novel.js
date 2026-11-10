const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const SUPABASE_URL = 'https://faclnbenlcsuubxexxrx.supabase.co';
const SUPABASE_KEY = (process.env.SUPABASE_KEY || 'sb_publishable_TcuATihcZ7clQA3y7vL3IA_tik3MOuV').replace(/[^a-zA-Z0-9_\-\.]/g, '');

const TABLE_BOOKS = 'shella_books';
const TABLE_TASKS = 'shella_ai_tasks';

// Daftar urutan model Gemini jika model utama sedang sibuk 503
const GEMINI_FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-3.8-flash'
];

async function getPendingTask() {
  console.log('Mengecek antrean tugas di shella_ai_tasks...');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_TASKS}?status=eq.rencana&order=id.asc&limit=1`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (res.ok) {
    const rows = await res.json();
    return rows && rows[0] ? rows[0] : null;
  }
  return null;
}

function isTaskDue(task) {
  if (!task.scheduled_time) return true;

  const timeStr = String(task.scheduled_time).replace('.', ':').trim();
  const parts = timeStr.split(':');
  const planHour = parseInt(parts[0], 10);
  const planMinute = parts[1] ? parseInt(parts[1], 10) : 0;

  if (isNaN(planHour)) return true;

  const createdDate = task.created_at ? new Date(task.created_at) : new Date();
  const createdWIB = new Date(createdDate.getTime() + (7 * 60 * 60 * 1000));

  const targetWIB = new Date(createdWIB);
  targetWIB.setUTCHours(planHour, planMinute, 0, 0);

  const nowWIB = new Date(Date.now() + (7 * 60 * 60 * 1000));

  console.log(`Jadwal Rencana: ${task.scheduled_time} WIB`);
  console.log(`Target Penuh WIB : ${targetWIB.toISOString()}`);
  console.log(`Waktu Sekarang WIB: ${nowWIB.toISOString()}`);

  return nowWIB.getTime() >= targetWIB.getTime();
}

async function updateTaskStatus(taskId, status, extraData = {}) {
  await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_TASKS}?id=eq.${taskId}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status, ...extraData })
  });
}

async function callAI(requestedModel, prompt) {
  const isGPT = requestedModel && (requestedModel.toLowerCase().includes('gpt') || requestedModel.toLowerCase().includes('openai'));

  if (isGPT) {
    console.log(`Menggunakan OpenAI: ${requestedModel}...`);
    if (!OPENAI_API_KEY) {
      console.warn('OPENAI_API_KEY kosong! Dialihkan ke Gemini.');
      return await callGeminiWithRetry(prompt);
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: requestedModel,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    return data.choices[0].message.content;
  }

  // Pemanggilan Gemini dengan sistem anti-503
  return await callGeminiWithRetry(prompt, requestedModel);
}

async function callGeminiWithRetry(prompt, preferredModel) {
  // Susun daftar model dengan memprioritaskan pilihan user
  const modelQueue = preferredModel && preferredModel.startsWith('gemini')
    ? [preferredModel, ...GEMINI_FALLBACK_MODELS.filter(m => m !== preferredModel)]
    : GEMINI_FALLBACK_MODELS;

  for (const model of modelQueue) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`Mencoba model ${model} (Percobaan ke-${attempt})...`);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
          }
        }

        const errText = await response.text();
        console.warn(`Peringatan server (${response.status}): ${errText}`);

        // Jika kena 503 (sibuk) atau 429 (kuota padat), tunggu 10 detik lalu coba lagi
        if (response.status === 503 || response.status === 429) {
          console.log('Server Google sedang sibuk, menunggu 10 detik...');
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        break;
      } catch (e) {
        console.warn(`Gangguan jaringan: ${e.message}. Menunggu 5 detik...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    console.log(`Model ${model} masih sibuk, beralih otomatis ke model alternatif...`);
  }

  throw new Error('Semua model Gemini sedang kelebihan beban saat ini.');
}

function extractTag(text, tag) {
  const match = text.match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)(?=\\[[A-Z_]+\\]|$)`, 'i'));
  return match ? match[1].trim() : '';
}

async function main() {
  const task = await getPendingTask();

  if (!task) {
    console.log('Tidak ada tugas dengan status "rencana". Berhenti.');
    return;
  }

  if (!isTaskDue(task)) {
    console.log('Waktu jadwal belum tiba. Menunggu giliran berikutnya.');
    return;
  }

  console.log(`Memproses rencana #${task.id}: "${task.title || 'Novel Baru'}"...`);
  await updateTaskStatus(task.id, 'sedang_berjalan');

  try {
    const prompt = `
Bertindaklah sebagai novelis sastra profesional dan pendidik kreatif. Tulis bab cerita lengkap dan mandiri dalam bahasa Indonesia.

Aturan Penulisan:
- Target Pembaca: ${task.target_audience || 'Mudah dipahami anak SD/MI'}
- Gaya Cerita: ${task.writing_style || 'Petualangan hangat dan mendidik'}
- Target Panjang Bacaan: ${task.reading_time || '15 menit (sekitar 3000 kata)'}. Cerita harus tuntas, utuh, tanpa sub-bab.
- Tokoh Utama: "${task.main_character || 'Shella'}"
${task.supporting_characters ? `- Tokoh Sahabat/Pendukung: "${task.supporting_characters}" (Wajib aktif dalam dialog).` : ''}
${task.moral_message ? `- Nilai Moral: "${task.moral_message}" (Sisipkan secara halus di akhir).` : ''}
${task.title ? `- JUDUL BUKU WAJIB: "${task.title}"` : '- Tentukan judul yang memikat.'}
${task.story_premise ? `- PREMIS UTAMA: "${task.story_premise}"` : ''}
${task.extra_notes ? `- Catatan Khusus: ${task.extra_notes}` : ''}

Format Output WAJIB dengan penanda berikut:
[JUDUL]
${task.title || '(Judul buku di sini)'}

[TAGLINE]
(Satu kalimat kutipan puitis/dramatis)

[SINOPSIS]
(Ringkasan 2 paragraf)

[BAB_JUDUL]
Bab 1: (Judul bab di sini)

[CERITA]
(Isi cerita bab lengkap tanpa sub-bab)
`;

    const rawText = await callAI(task.ai_model || 'gemini-3.5-flash', prompt);

    const finalTitle = task.title || extractTag(rawText, 'JUDUL') || 'Kisah Petualangan Shella';
    const tagline = extractTag(rawText, 'TAGLINE') || 'Sebuah petualangan sarat makna.';
    const sinopsis = extractTag(rawText, 'SINOPSIS') || 'Kisah petualangan seru yang membawa pelajaran berharga.';
    const babJudul = extractTag(rawText, 'BAB_JUDUL') || 'Bab 1';
    let cerita = extractTag(rawText, 'CERITA');

    if (!cerita || cerita.length < 200) {
      cerita = rawText;
    }

    const coverPrompt = task.cover_idea || `${finalTitle}, storybook illustration, vibrant clean art`;
    const cleanCoverPrompt = encodeURIComponent(`digital novel book cover, ${coverPrompt}, beautiful soft lighting, clean masterpiece`);
    const coverUrl = `https://image.pollinations.ai/prompt/${cleanCoverPrompt}?width=720&height=1080&nologo=true&seed=${Date.now()}`;

    const bookPayload = {
      id: 'book_' + Date.now(),
      title: finalTitle,
      author: 'Shella Aurelia',
      desc: `---META---\nGENRE::${task.writing_style || 'Petualangan'}\nTAGLINE::${tagline}\nNUANSA::${task.writing_style || 'Edukatif'}\n---ENDMETA---\n${sinopsis}`,
      cover: coverUrl,
      chapters: [{ title: babJudul, content: cerita }]
    };

    console.log(`Mengirim novel "${bookPayload.title}" ke database...`);
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_BOOKS}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(bookPayload)
    });

    if (!insertRes.ok) {
      throw new Error(`Gagal menyimpan ke ${TABLE_BOOKS}: ${await insertRes.text()}`);
    }

    await updateTaskStatus(task.id, 'selesai', {
      result_book_title: finalTitle,
      executed_at: new Date().toISOString()
    });

    console.log(`Sukses! Novel "${finalTitle}" berhasil terbit.`);
  } catch (err) {
    console.error('Terjadi eror saat eksekusi:', err);
    // Kembalikan ke 'rencana' agar tidak hangus dan bisa dicoba ulang pada putaran berikutnya
    await updateTaskStatus(task.id, 'rencana');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
