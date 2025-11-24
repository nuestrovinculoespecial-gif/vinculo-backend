import express from "express";
import cors from "cors";
import multer from "multer";
import pkg from "@bundlr-network/client";
import { JsonRpcProvider, Wallet } from "ethers";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs/promises";

const { WebBundlr } = pkg;

dotenv.config();

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

// Supabase (usa la SERVICE KEY, no la anon)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Crear instancia de Bundlr con wallet del servidor
async function getBundlr() {
  const rpcUrl = process.env.POLYGON_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    console.warn("Falta PRIVATE_KEY o POLYGON_RPC_URL en las variables de entorno.");
    throw new Error("Config incompleta para Bundlr");
  }

  // Ethers v6: usamos JsonRpcProvider y Wallet directamente
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);

  const bundlr = new WebBundlr(
    "https://node1.bundlr.network",
    "matic",
    wallet
  );

  await bundlr.ready();
  return bundlr;
}
// GET /card/:cardId  → info para index1.html
app.get("/card/:cardId", async (req, res) => {
  const cardId = req.params.cardId;

  const { data, error } = await supabase
    .from("cards")
    .select("video_url")
    .eq("card_id", cardId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Error leyendo Supabase" });
  }

  const finalVideoUrl = data?.video_url || "";
  const initialVideoUrl =
    "https://nuestrovinculoespecial-gif.github.io/nuestraweb/comunionvideo.mp4";

  res.json({
    cardId,
    initialVideoUrl,
    finalVideoUrl,
  });
});

// POST /card/:cardId/upload  → subir vídeo a Arweave y guardar URL
app.post("/card/:cardId/upload", upload.single("video"), async (req, res) => {
  const cardId = req.params.cardId;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "No se ha enviado archivo" });
  }

  try {
    const bundlr = await getBundlr();

    // Leer archivo en memoria
    const data = await fs.readFile(file.path);

    const price = await bundlr.getPrice(data.length);
    const balance = await bundlr.getLoadedBalance();

    if (balance.lt(price)) {
      const diff = price.minus(balance).multipliedBy(1.1);
      await bundlr.fund(diff);
    }

    const tx = await bundlr.upload(data, {
      tags: [{ name: "Content-Type", value: "video/mp4" }],
    });

    const videoUrl = `https://arweave.net/${tx.id}`;

    // Guardar en Supabase (upsert por card_id)
    const { error } = await supabase
      .from("cards")
      .upsert(
        { card_id: cardId, video_url: videoUrl },
        { onConflict: "card_id" }
      );

    if (error) {
      console.error(error);
      return res
        .status(500)
        .json({ error: "Subido a Arweave, pero error guardando en Supabase" });
    }

    res.json({ videoUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error subiendo a Arweave" });
  } finally {
    // borrar archivo temporal
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Backend Vinculo escuchando en puerto", PORT);
});
