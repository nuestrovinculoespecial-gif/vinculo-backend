import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs/promises";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { WebBundlr } from "@bundlr-network/client";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

// ----------------------
// SUPABASE
// ----------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ----------------------
// BUNDLR: crear conexión correcta
// ----------------------
async function getBundlr() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.POLYGON_RPC_URL
  );

  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const bundlr = new WebBundlr(
    "https://node1.bundlr.network",
    "matic",
    wallet
  );

  await bundlr.ready();
  return bundlr;
}

// ----------------------
// GET card → devuelve urls
// ----------------------
app.get("/card/:cardId", async (req, res) => {
  const cardId = req.params.cardId;

  const { data, error } = await supabase
    .from("cards")
    .select("video_url")
    .eq("card_id", cardId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: "Error leyendo Supabase" });

  res.json({
    cardId,
    initialVideoUrl:
      "https://nuestrovinculoespecial-gif.github.io/nuestraweb/comunionvideo.mp4",
    finalVideoUrl: data?.video_url || "",
  });
});

// ----------------------
// POST subir vídeo
// ----------------------
app.post("/card/:cardId/upload", upload.single("video"), async (req, res) => {
  const cardId = req.params.cardId;
  const file = req.file;

  if (!file) return res.status(400).json({ error: "No se ha enviado archivo" });

  try {
    const bundlr = await getBundlr();

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

    await supabase
      .from("cards")
      .upsert({ card_id: cardId, video_url: videoUrl }, { onConflict: "card_id" });

    res.json({ videoUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error subiendo a Arweave" });
  } finally {
    if (file?.path) await fs.unlink(file.path).catch(() => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Backend Vinculo escuchando en puerto", PORT));
