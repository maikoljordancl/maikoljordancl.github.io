// api/generate-image.js
// Función serverless de Vercel. La API key de Gemini vive SOLO acá (variable de entorno).
//
// Genera fotos de producto para Maikol Jordan usando 2 imágenes de referencia:
//  1) La foto real de la zapatilla que quieres vender (la subes cada vez)
//  2) Una plantilla fija de marca (portada o grilla de producto) para que el estilo
//     visual (logo, caja, mármol, luces) se mantenga siempre igual.

// ⚠️ Plantillas de estilo de marca (fijas, siempre las mismas):
const PLANTILLA_PORTADA_URL = "https://res.cloudinary.com/i1cyngly/image/upload/v1784163189/5D3C22D0-7803-42AE-8C54-6B9FDF9060E2_wsrevs.png";
const PLANTILLAS_PRODUCTO_URLS = [
  "https://res.cloudinary.com/i1cyngly/image/upload/v1784163189/B8A41B4D-4299-4B2D-866D-2D3BC808F4E6_tiypsq.jpg", // frontal
  "https://res.cloudinary.com/i1cyngly/image/upload/v1784163189/B8A41B4D-4299-4B2D-866D-2D3BC808F4E6_ippe9o.jpg", // trasera
  "https://res.cloudinary.com/i1cyngly/image/upload/v1784163189/B8A41B4D-4299-4B2D-866D-2D3BC808F4E6_kjkhpc.jpg", // lateral
  "https://res.cloudinary.com/i1cyngly/image/upload/v1784163188/IMG_0437_ekazda.jpg" // tres cuartos / suela
];

async function urlABase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo descargar la imagen de plantilla: " + url);
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  return { base64: Buffer.from(buffer).toString("base64"), mimeType };
}

const INSTRUCCION_MARCA = 'IMPORTANTE: la caja de zapatos y cualquier logo de marca en la caja deben corresponder a la marca REAL del modelo indicado (por ejemplo, si el modelo es una New Balance, genera una caja genérica de New Balance, NO una caja de Nike/Jordan). Solo replica el ESTILO FOTOGRÁFICO general de la imagen de referencia de marca (fondo de mármol, iluminación, ángulo, el logo circular "MAIKOL JORDAN" superpuesto), pero no copies el logo Nike/Jordan de la caja si el modelo no es Nike ni Jordan.';

const PROMPTS_POR_MODO = {
  portada: (nombreModelo) => `Genera UNA foto de portada publicitaria para una tienda de zapatillas llamada "Maikol Jordan", usando el mismo estilo visual, composición, logo circular "MAIKOL JORDAN" con las palabras "ESTILO · CALIDAD · EXCLUSIVIDAD", fondo de mármol oscuro, luces rojas de ambiente, la mano sosteniendo la zapatilla, y el texto "ENVIOS A TODO CHILE" que aparecen en la imagen de referencia de marca. Reemplaza el modelo de zapatilla por el que aparece en la otra imagen de referencia (el modelo real a vender: "${nombreModelo}"), manteniendo sus colores, materiales y diseño exactos. ${INSTRUCCION_MARCA}`,
  producto: (nombreModelo, angulo) => `Genera UNA foto de producto profesional de la zapatilla "${nombreModelo}" (usa el modelo exacto, colores y diseño de la imagen de referencia de la zapatilla), fotografiada ${angulo}, sobre su caja, con el mismo estilo de fondo, iluminación y el logo circular "MAIKOL JORDAN" en una esquina, igual que en la imagen de referencia de marca de este mismo ángulo. ${INSTRUCCION_MARCA}`
};

const ANGULOS = [
  "de frente sobre la caja",
  "desde atrás, mostrando el talón",
  "de perfil lateral",
  "en ángulo de tres cuartos mostrando la suela"
];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  const { modo, nombreModelo, anguloIndex, imagenBase64, imagenMimeType, password } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
  }
  if (!nombreModelo || !nombreModelo.trim()) {
    return res.status(400).json({ ok: false, error: "Falta el nombre del modelo" });
  }
  if (!imagenBase64) {
    return res.status(400).json({ ok: false, error: "Falta la imagen de referencia de la zapatilla" });
  }
  if (modo !== "portada" && modo !== "producto") {
    return res.status(400).json({ ok: false, error: "Modo inválido" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "Falta configurar GEMINI_API_KEY en Vercel" });
  }

  try {
    const urlPlantilla = modo === "portada" ? PLANTILLA_PORTADA_URL : PLANTILLAS_PRODUCTO_URLS[anguloIndex % PLANTILLAS_PRODUCTO_URLS.length];
    const plantilla = await urlABase64(urlPlantilla);

    const promptTexto = modo === "portada"
      ? PROMPTS_POR_MODO.portada(nombreModelo)
      : PROMPTS_POR_MODO.producto(nombreModelo, ANGULOS[anguloIndex % ANGULOS.length]);

    const respuesta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: promptTexto },
              { text: "Imagen de referencia de la ZAPATILLA real a vender (usa este modelo exacto):" },
              { inlineData: { mimeType: imagenMimeType || "image/jpeg", data: imagenBase64 } },
              { text: "Imagen de referencia del ESTILO DE MARCA a replicar (logo, caja, fondo, luces):" },
              { inlineData: { mimeType: plantilla.mimeType, data: plantilla.base64 } }
            ]
          }],
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
      return res.status(500).json({ ok: false, error: "Gemini no devolvió ninguna imagen. Intenta de nuevo." });
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
