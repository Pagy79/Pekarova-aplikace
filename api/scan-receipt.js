import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Chybí fotka' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    
    const prompt = `Analizuj tuto účtenku a vrať POUZE čistý JSON v tomto formátu bez jakéhokoliv dalšího textu nebo Markdownu:
    {
      "store": "Název obchodu",
      "amount": číslo_celková_částka_v_CZK,
      "category": "Potraviny"
    }`;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/jpeg"
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text().trim();
    
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Chyba při skenování:", error);
    return res.status(500).json({ error: 'Účtenku se nepodařilo přečíst' });
  }
}
