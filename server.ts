import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes for Meta Ads Proxy ---
  
  // Example: Get Ads Insights
  app.get("/api/meta/insights", async (req, res) => {
    const { accessToken, adAccountId } = req.query;
    if (!accessToken || !adAccountId) {
      return res.status(400).json({ error: "Missing tokens" });
    }
    // Real Meta Graph API call would go here
    res.json({
      spend: 1250.40,
      impressions: 45000,
      clicks: 890,
      conversions: 12,
      roas: 4.8
    });
  });

  // Example: Create Campaign
  app.post("/api/meta/campaigns", async (req, res) => {
    // In a real app, you'd use the access token from the request header/env
    res.json({ id: "camp_" + Date.now(), status: "CREATED" });
  });

  // Example: Payments status
  app.get("/api/meta/billing", async (req, res) => {
    res.json({
      balance: 150.00,
      limit: 5000,
      methods: [
        { id: "1", type: "VISA", last4: "4242", expiry: "12/28", status: "PRIMARY" }
      ]
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
