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
// server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import { WebBundlr } from "@bundlr-network/client";
import { ethers } from "ethers";

const app = express();
app.use(cors());

// Para recibir archivos de vídeo
const upload = multer({ storage: multer.memoryStorage() });

// Vídeo inicial por defecto (el de la niña en tu GitHub)
const URL_INICIAL_DEFECTO =
  "https://nuestrovinculoespecial-gif.github.io/nuestraweb/comunionvideo.mp4";

// “Mini base de datos” en memoria (para pruebas)
// Más adelante esto debería ir a una base de datos real.
const cards = {
  DEMO: {
    initialVideoUrl: URL_INICIAL_DEFECTO,
    finalVideoUrl: null,
  },
  "FAMILIA-1": {
    initialVideoUrl: URL_INICIAL_DEFECTO,
    finalVideoUrl:
      "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  },
};

let bundlr;

// Inicializar Bundlr al arrancar el servidor
async function initBundlr() {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    const rpcUrl = process.env.RPC_URL;

    if (!privateKey || !rpcUrl) {
      console.warn(
        "⚠️ Falta PRIVATE_KEY o RPC_URL en las variables de entorno. Bundlr no se inicializará."
      );
      return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Nodo de Bundlr:
    // - Para PRUEBAS podrías usar "https://devnet.bundlr.network" (ejemplo)
    // - Para PRODUCCIÓN, un nodo mainnet, por ejemplo:
    const bundlrNode = "https://node1.bundlr.network"; // mainnet

    const currency = "matic"; // o la moneda que uses para pagar (matic en Polygon)

    bundlr = new WebBundlr(bundlrNode, currency, wallet, {
      providerUrl: rpcUrl,
    });

    await bundlr.ready();
    console.log("✅ Bundlr inicializado correctamente");
  } catch (err) {
    console.error("❌ Error al inicializar Bundlr:", err);
    bundlr = null;
  }
}

// GET /card/:cardId → devuelve info de la tarjeta
app.get("/card/:cardId", (req, res) => {
  const { cardId } = req.params;
  const datos = cards[cardId];

  if (!datos) {
    // Tarjeta no registrada aún
    return res.json({
      cardId,
      initialVideoUrl: URL_INICIAL_DEFECTO,
      finalVideoUrl: null,
      registered: false,
    });
  }

  res.json({
    cardId,
    initialVideoUrl: datos.initialVideoUrl || URL_INICIAL_DEFECTO,
    finalVideoUrl: datos.finalVideoUrl,
    registered: true,
  });
});

// POST /card/:cardId/upload → recibe un vídeo y lo sube a Arweave
app.post("/card/:cardId/upload", upload.single("video"), async (req, res) => {
  try {
    const { cardId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ningún vídeo" });
    }

    if (!bundlr) {
      return res.status(500).json({
        error:
          "Bundlr no está inicializado. Revisa PRIVATE_KEY y RPC_URL en las variables de entorno.",
      });
    }

    const data = req.file.buffer;

    console.log(
      "📹 Recibido vídeo para cardId:",
      cardId,
      "Tamaño:",
      data.length,
      "bytes"
    );

    // OPCIONAL: ver precio estimado
    const price = await bundlr.getPrice(data.length);
    console.log("💰 Precio aproximado del almacenamiento:", price.toString());

    // Aquí podrías comprobar que tienes suficiente saldo en Bundlr.
    // Si no, deberías fundear la cuenta una vez:
    // await bundlr.fund(price);

    // Subimos el vídeo a Bundlr/Arweave
    const tx = await bundlr.upload(data, {
      tags: [{ name: "Content-Type", value: "video/mp4" }],
    });

    const videoUrl = `https://arweave.net/${tx.id}`;
    console.log("✅ Vídeo subido a Arweave:", videoUrl);

    // Guardamos la URL en nuestra “base de datos” en memoria
    if (!cards[cardId]) {
      cards[cardId] = {
        initialVideoUrl: URL_INICIAL_DEFECTO,
        finalVideoUrl: videoUrl,
      };
    } else {
      cards[cardId].finalVideoUrl = videoUrl;
    }

    res.json({ videoUrl });
  } catch (err) {
    console.error("❌ Error al subir el vídeo:", err);
    res.status(500).json({ error: "Error al subir el vídeo" });
  }
});

// Arrancar servidor
const PORT = process.env.PORT || 3000;

initBundlr().then(() => {
  app.listen(PORT, () => {
    console.log("🚀 Servidor Vínculo escuchando en el puerto", PORT);
  });
});
