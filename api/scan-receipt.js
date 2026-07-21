import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Extrakce čistých base64 dat
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    
    // Zaručený model pro multimodalitu
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      Jsi asistent pro zpracování dokladů a výpisů z banky.
      Analyzuj přiložený obrázek.
      Pokud je tam více transakcí, vyber tu PRVNÍ ZHORA.
      Vrať POUZE čistý JSON (bez jakékoliv omáčky nebo markdownu):
      {
        "store": "Název obchodu",
        "amount": 100,
        "category": "Potraviny",
        "date": "2026-07-21"
      }
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg',
        },
      },
    ]);

    const responseText = result.response.text().trim();
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanJson);

    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Chyba při zpracování obrázku' });
  }
}
