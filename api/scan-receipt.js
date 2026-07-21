export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Chybí GEMINI_API_KEY ve Vercelu!' });
    }

    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Nebyl poslán žádný obrázek.' });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const promptText = `
      Jsi asistent pro zpracování dokladů a výpisů z banky.
      Analyzuj přiložený obrázek.
      Pokud je tam více transakcí, vyber tu PRVNÍ ZHORA (nejnovější).
      Vrať POUZE čistý JSON (bez jakékoliv omáčky nebo markdownu):
      {
        "store": "Název obchodu",
        "amount": 100,
        "category": "Potraviny",
        "date": "2026-07-21"
      }
    `;

    // Přímé volání REST API bez knihoven
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const apiData = await response.json();

    if (!response.ok) {
      throw new Error(apiData.error?.message || 'Chyba při komunikaci s Google API');
    }

    const rawText = apiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return res.status(200).json(parsedData);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Detail chyby: ' + (error.message || 'Neznámá chyba') });
  }
}
