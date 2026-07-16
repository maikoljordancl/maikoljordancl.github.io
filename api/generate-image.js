// api/generate-image.js
// Función serverless de Vercel. La API key de Gemini vive SOLO acá (variable de entorno),
// nunca en el HTML del panel, para que no quede expuesta en el código fuente público.

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  const { prompt, password } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
  }

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ ok: false, error: "Falta la descripción de la imagen" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "Falta configurar GEMINI_API_KEY en Vercel" });
  }

  try {
    const respuesta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
        })
      }
    );

    const data = await respuesta.json();

    if (!respuesta.ok) {
      return res.status(500).json({ ok: false, error: data.error?.message || "Error al llamar a Gemini" });
    }

    const partes = data.candidates?.[0]?.content?.parts || [];
    const parteImagen = partes.find(p => p.inlineData);

    if (!parteImagen) {
      return res.status(500).json({ ok: false, error: "Gemini no devolvió ninguna imagen. Intenta con otra descripción." });
    }

    return res.status(200).json({
      ok: true,
      mimeType: parteImagen.inlineData.mimeType,
      base64: parteImagen.inlineData.data
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
