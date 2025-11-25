// index.js  (backend Vinculo)

import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs/promises";
import dotenv from "dotenv";
import BundlrImport from "@bundlr-network/client";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Bundlr (el paquete es CommonJS; sacamos el default bien en ESM)
const Bundlr = BundlrImport.default ?? BundlrImport;

// -------------------------
// CONFIG BÁSICA
// -------------------------
const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

const URL_INICIAL_DEFECTO =
  "https://nuestrovinculoespecial-gif.github.io/nuestraweb/comunionvideo.mp4";

// -------------------------
// SUPABASE
// -------------------------
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("⚠️ Falta SUPABASE_URL o SUPABASE_SERVICE_KEY en las variables de entorno");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// -------------------------
// BUNDLR NODE
// -------------------------

let bundlrPromise = null;

async function getBundlr() {
  if (bundlrPromise) return bundlrPromise;

  bundlrPromise = (async () => {
    const privateKey = process.env.PRIVATE_KEY;
    const rpcUrl = process.env.POLYGON_RPC_URL;

    if (!privateKey) {
      console.error("⚠️ Falta PRIVATE_KEY en las variables de entorno");
      throw new Error("PRIVATE_KEY no configurada");
    }

    const nodeUrl = "https://node1.bundlr.network";
    const currency = "matic";

    const config = {};
    if (rpcUrl) {
      config.providerUrl = rpcUrl;
    }

    const bundlr = new Bundlr(nodeUrl, currency, privateKey, config);

    await bundlr.ready();
    console.log("✅ Bundlr listo. Dirección:", bundlr.address);
    return bundlr;
  })();

  return bundlrPromise;
}

// -------------------------
// RUTA: GET /card/:cardId
// -------------------------
app.get("/card/:cardId", async (req, res) => {
  const cardId = req.params.cardId;

  try {
    const { data, error } = await supabase
      .from("cards")
      .select("video_url")
      .eq("card_id", cardId)
      .maybeSingle();

    if (error) {
      console.error("Error leyendo Supabase:", error);
      return res.status(500).json({ error: "Error leyendo Supabase" });
    }

    const finalVideoUrl = data?.video_url || "";

    res.json({
      cardId,
      initialVideoUrl: URL_INICIAL_DEFECTO,
      finalVideoUrl,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error interno en /card" });
  }
});

// -------------------------
// RUTA: POST /card/:cardId/upload
// -------------------------
app.post("/card/:cardId/upload", upload.single("video"), async (req, res) => {
  const cardId = req.params.cardId;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "No se ha enviado archivo" });
  }

  try {
   const bundlr = await getBundlr();

    // Leer archivo
    const data = await fs.readFile(file.path);

    // Precio y balance en Bundlr
    const price = await bundlr.getPrice(data.length);
     const balance = await bundlr.getLoadedBalance();

   console.log("💰 Precio (base units):", price.toString());
    console.log("💰 Balance cargado:", balance.toString());

    if (balance.lt(price)) {
       const diff = price.minus(balance).multipliedBy(1.1); // 10% margen
      console.log("⚡ Financiando Bundlr con:", diff.toString());
       await bundlr.fund(diff);
    }

     console.log("⬆️ Subiendo a Arweave...");
   const tx = await bundlr.upload(data, {
      tags: [{ name: "Content-Type", value: "video/mp4" }],
   });

     const videoUrl = `https://arweave.net/${tx.id}`;
     console.log("✅ Vídeo subido a Arweave:", videoUrl);

    // Guardar en Supabase (upsert por card_id)
    const { error } = await supabase
      .from("cards")
      .upsert(
        { card_id: cardId, video_url: videoUrl },
         { onConflict: "card_id" }
     );
 //! const videoUrl = "https://nuestrovinculoespecial-gif.github.io/nuestraweb/comunionvideo.mp4";

 //! const { data, error } = await supabase
 //!   .from("cards")
 //!   .upsert(
 //!     { card_id: cardId, video_url: videoUrl },
 //!     { onConflict: "card_id" }
 //!   )
 //!   .select();
    if (error) {
      console.error("Error guardando en Supabase:", error);
      return res.status(500).json({
        error: "Subido a Arweave, pero error guardando en Supabase",
      });
    }

    res.json({ videoUrl });
  } catch (e) {
    console.error("Error en subida a Arweave:", e);
    res.status(500).json({ error: "Error subiendo a Arweave" });
  } finally {
    // Borrar archivo temporal
    if (file?.path) {
      await fs.unlink(file.path).catch(() => {});
    }
  }
});

// -------------------------
// ARRANCAR SERVIDOR
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Backend Vinculo escuchando en puerto", PORT);
});
