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

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      Jsi asistent pro zpracování finančních dokladů a výpisů z účtu.
      Analyzuj přiložený obrázek. Může to být buď jedna papírová účtenka, NEBO screenshot z bankovní aplikace s více transakcemi.
      
      Pravidla:
      1. Pokud je na obrázku vice transakcí (např. výpis z banky), VŽDY vybral tu NEJNOVĚJŠÍ / PRVNÍ ZHORA (nejvýše položenou transakci v seznamu).
      2. Ignoruj znaménko mínus, částka musí být kladné číslo.
      3. Odhadni kategorii podle obchodníka (např. Potraviny, Lékárna, Bydlení, Elektronika, Zábava, Služby). Pokud si nejsi jistý, použi kategorii "Neočekávané výdaje".

      Vrať POUZE čistý JSON formát v tomto tvaru (bez žádného markdownu nebo kódu okolo):
      {
        "store": "Název obchodu nebo příjemce",
        "amount": 123.45,
        "category": "Kategorie",
        "date": "YYYY-MM-DD"
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
    console.error('Error processing receipt:', error);
    return res.status(500).json({ error: 'Failed to process image' });
  }
}
