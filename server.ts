import path from "path";
import express from "express";
import app from "./api/server";

const PORT = 3000;

// Configuração do Vite / Estáticos
if (process.env.NODE_ENV !== "production") {
  console.log("Configurando Vite para desenvolvimento local...");
  import("vite").then(({ createServer: createViteServer }) => {
    createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    }).then((vite) => {
      app.use(vite.middlewares);
      console.log("Vite pronto.");
      
      const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`>>> Servidor dev ouvindo na porta ${PORT}.`);
      });

      server.on('error', (err: any) => {
        console.error('Erro crítico no servidor dev:', err);
      });
    }).catch(err => {
      console.error("Erro ao inicializar Vite:", err);
    });
  }).catch(err => {
    console.error("Erro ao importar dinamicamente Vite:", err);
  });
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  if (!process.env.VERCEL) {
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`>>> Servidor prod ouvindo na porta ${PORT}. Pronto para receber requisições.`);
    });

    server.on('error', (err: any) => {
      console.error('Erro crítico no servidor prod:', err);
    });
  }
}

export { app };
