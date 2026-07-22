// api/generate-image.js
// Genera/edita fotos de producto usando Qwen-Image-Edit (Hugging Face Inference Providers, gratis).
// A diferencia de FLUX.1-schnell (solo texto), Qwen-Image-Edit SÍ toma una foto de referencia real
// de la zapatilla y la edita conservando su identidad — mucho más fiel que generar desde cero.
// La API key vive SOLO acá (variable de entorno HUGGINGFACE_API_KEY), nunca en el HTML del panel.

const { InferenceClient } = require("@huggingface/inference");

const ANGULOS = [
  "de frente sobre su caja",
  "desde atrás mostrando el talón",
  "de perfil lateral",
  "en ángulo de tres cuartos mostrando la suela"
];

const ESTILO_MARCA = "fondo de mármol oscuro pulido, iluminación de estudio con acentos de luz roja, fotografía de producto profesional, ultra realista, alta resolución, sombras suaves, estilo comercial premium. Mantén la zapatilla exactamente igual a la imagen original (mismo color, diseño y materiales), solo cambia el fondo, la iluminación y la composición.";

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
    return res.status(400).json({ ok: false, error: "Falta la foto de referencia de la zapatilla" });
  }

  const hfToken = process.env.HUGGINGFACE_API_KEY;
  if (!hfToken) {
    return res.status(500).json({ ok: false, error: "Falta configurar HUGGINGFACE_API_KEY en Vercel" });
  }

  let prompt;
  if (modo === "portada") {
    prompt = `Convierte esta foto de la zapatilla ${nombreModelo} en una foto publicitaria: una mano sosteniendo la zapatilla junto a su caja de zapatos, ${ESTILO_MARCA}`;
  } else {
    const angulo = ANGULOS[(anguloIndex || 0) % ANGULOS.length];
    prompt = `Convierte esta foto de la zapatilla ${nombreModelo} en una foto de producto profesional, vista ${angulo}, sobre su caja de zapatos, ${ESTILO_MARCA}`;
  }

  try {
    const client = new InferenceClient(hfToken);
    const imagenBuffer = Buffer.from(imagenBase64, "base64");
    const imagenBlob = new Blob([imagenBuffer], { type: imagenMimeType || "image/jpeg" });

    const resultado = await client.imageToImage({
      provider: "fal-ai",
      model: "Qwen/Qwen-Image-Edit",
      inputs: imagenBlob,
      parameters: { prompt }
    });

    const arrayBuffer = await resultado.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = resultado.type || "image/jpeg";

    return res.status(200).json({ ok: true, mimeType, base64 });
  } catch (e) {
    let mensaje = e.message || "Error al generar la imagen";
    if (mensaje.toLowerCase().includes("credit") || mensaje.toLowerCase().includes("quota") || mensaje.toLowerCase().includes("exceeded")) {
      mensaje = "Se acabó el crédito gratuito del mes en Hugging Face. " + mensaje;
    }
    return res.status(500).json({ ok: false, error: mensaje });
  }
};
