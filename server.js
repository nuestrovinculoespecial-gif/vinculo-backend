import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();
app.use(cors());

// Para recibir archivos (aunque en esta versión de prueba no los guardamos aún)
const upload = multer({ storage: multer.memoryStorage() });

// Nuestra “mini base de datos” en memoria,
// equivalente a tu cards.json de pruebas.
const URL_INICIAL_DEFECTO = "https://nuestrovinculoespecial-gif.github.io/nuestraweb/comunionvideo.mp4";

const cards = {
  "DEMO": {
    initialVideoUrl: URL_INICIAL_DEFECTO,
    finalVideoUrl: null
  },
  "FAMILIA-1": {
    initialVideoUrl: URL_INICIAL_DEFECTO,
    finalVideoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
  }
};

// GET /card/:cardId → devuelve la info de la tarjeta
app.get("/card/:cardId", (req, res) => {
  const { cardId } = req.params;
  const datos = cards[cardId];

  if (!datos) {
    // Si la tarjeta no existe, devolvemos algo razonable
    return res.json({
      cardId,
      initialVideoUrl: URL_INICIAL_DEFECTO,
      finalVideoUrl: null,
      registered: false
    });
  }

  res.json({
    cardId,
    initialVideoUrl: datos.initialVideoUrl || URL_INICIAL_DEFECTO,
    finalVideoUrl: datos.finalVideoUrl,
    registered: true
  });
});

// POST /card/:cardId/upload → de momento NO guarda el vídeo de verdad,
// solo simula que sube algo y devuelve una URL falsa.
app.post("/card/:cardId/upload", upload.single("video"), (req, res) => {
  const { cardId } = req.params;

  // En la versión real, aquí leeríamos req.file, lo subiríamos a Arweave
  // y obtendríamos una URL real. De momento, simulamos:
  const fakeUrl = "https://example.com/video/" + Date.now();

  // Si no existía la tarjeta, la creamos
  if (!cards[cardId]) {
    cards[cardId] = {
      initialVideoUrl: URL_INICIAL_DEFECTO,
      finalVideoUrl: fakeUrl
    };
  } else {
    cards[cardId].finalVideoUrl = fakeUrl;
  }

  console.log("Simulamos guardar vídeo para", cardId, "en", fakeUrl);

  res.json({ videoUrl: fakeUrl });
});

// Arrancar servidor (Render/Vercel usarán este puerto)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor Vínculo escuchando en el puerto", PORT);
});
