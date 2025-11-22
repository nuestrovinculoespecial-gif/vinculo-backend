// server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import Bundlr from "@bundlr-network/client";
import { ethers } from "ethers";

const app = express();
app.use(cors());

// Para recibir archivos de vídeo
const upload = multer({ storage: multer.memoryStorage() });

// Vídeo inicial por defecto (el de la niña en tu GitHub)
const URL_INICIAL_DEFECTO =
  "https://nuestrovinculoespecial-gif.github.io/nuestraweb/comunionvideo.mp4";

// “Mini base de datos” en memoria (para pruebas)
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

// Inicializar Bundlr al arrancar

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

    // Nodo Bundlr (ejemplo mainnet)
    const bundlrNode = "https://node1.bundlr.network";
    const currency = "matic"; // moneda con la que pagas (por ejemplo, MATIC en Polygon)

    bundlr = new Bundlr(bundlrNode, currency, wallet, {
      providerUrl: rpcUrl,
    });

    await bundlr.ready();
    console.log("✅ Bundlr inicializado correctamente");
  } catch (err) {
    console.error("❌ Error al inicializar Bundlr:", err);
    bundlr = null;
  }
}

// GET /card/:cardId → info de la tarjeta
app.get("/card/:cardId", (req, res) => {
  const { cardId } = req.params;
  const datos = cards[cardId];

  if (!datos) {
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

// POST /card/:cardId/upload → recibe vídeo y lo sube a Arweave
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
      "📹 Recibido vídeo para",
      cardId,
      "tamaño",
      data.length,
      "bytes"
    );

    // Precio estimado (opcional)
    const price = await bundlr.getPrice(data.length);
    console.log("💰 Precio aproximado:", price.toString());

    // Si es necesario, fundear Bundlr una vez:
    // await bundlr.fund(price);

    // Subir a Arweave
    const tx = await bundlr.upload(data, {
      tags: [{ name: "Content-Type", value: "video/mp4" }],
    });

    const videoUrl = `https://arweave.net/${tx.id}`;
    console.log("✅ Vídeo subido a Arweave:", videoUrl);

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
