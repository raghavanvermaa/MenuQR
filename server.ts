import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import {
  answerMenuAssistantQuestion,
  findRestaurantGooglePlace,
  generateAiMenuAnalytics,
  generateDishCopy,
  scanPaperMenuImage,
  translateMenuToHindi,
} from './server/gemini.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const DIST_DIR = path.resolve(process.cwd(), 'dist');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Sliding-window in-memory rate limiter for upload protection (30 req / 15 min per key)
const uploadRateMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_REQUESTS = 30;

function isRateLimited(key: string, maxRequests = RATE_MAX_REQUESTS): boolean {
  const now = Date.now();
  const timestamps = (uploadRateMap.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= maxRequests) {
    uploadRateMap.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  uploadRateMap.set(key, timestamps);
  return false;
}

function mapAiRouteError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : 'AI request failed.';
  if (msg.includes('GEMINI_API_KEY')) {
    return { status: 503, message: msg };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'AI quota reached for the moment. Please retry shortly or check your API key in Settings > Secrets.',
    };
  }
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Gemini API key permission issue. Please check your key in Settings > Secrets.',
    };
  }
  return { status: 500, message: 'AI assistant could not complete this request. Please try again.' };
}

function detectImageTypeFromMagicBytes(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!idToken || idToken.length > 4096) return null;
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: user.localId,
      email: user.email || '',
      emailVerified: Boolean(user.emailVerified),
    };
  } catch (err) {
    console.error('Firebase token verification failed:', err);
    return null;
  }
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'menuqr' });
  });

  // Authenticated, validated image upload endpoint
  app.post('/api/uploads', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required to upload images.' });
        return;
      }

      const idToken = authHeader.slice('Bearer '.length).trim();
      const user = await verifyFirebaseIdToken(idToken);
      if (!user) {
        res.status(401).json({ error: 'Invalid or expired authentication token.' });
        return;
      }

      const rateKey = `${user.uid}:${req.ip || 'unknown'}`;
      if (isRateLimited(rateKey)) {
        res.status(429).json({ error: 'Too many uploads. Please wait a few minutes and try again.' });
        return;
      }

      const body = req.body as { mimeType?: unknown; dataBase64?: unknown };
      if (typeof body?.mimeType !== 'string' || typeof body?.dataBase64 !== 'string') {
        res.status(400).json({ error: 'Invalid upload payload.' });
        return;
      }

      if (!ALLOWED_MIME_EXT[body.mimeType]) {
        res.status(400).json({ error: 'Only JPG, PNG, and WebP images are supported.' });
        return;
      }

      const cleanBase64 = body.dataBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
      const buffer = Buffer.from(cleanBase64, 'base64');

      if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
        res.status(413).json({ error: 'Image must be smaller than 5 MB.' });
        return;
      }

      const detectedMime = detectImageTypeFromMagicBytes(buffer);
      if (!detectedMime || !ALLOWED_MIME_EXT[detectedMime]) {
        res.status(400).json({ error: 'File content is not a valid JPG, PNG, or WebP image.' });
        return;
      }

      const ext = ALLOWED_MIME_EXT[detectedMime];
      const safeName = `${crypto.randomUUID()}${ext}`;
      const targetPath = path.resolve(UPLOADS_DIR, safeName);

      if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid destination path.' });
        return;
      }

      await fs.promises.writeFile(targetPath, buffer);
      res.status(201).json({
        url: `/uploads/${safeName}`,
        mimeType: detectedMime,
        size: buffer.length,
      });
    } catch (err) {
      console.error('Upload handler failed:', err);
      res.status(500).json({ error: 'Unable to save image right now. Please try again.' });
    }
  });

  // Safely serve uploaded images with strict filename allowlist and path confinement
  app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(filename)) {
      res.status(400).send('Invalid file name');
      return;
    }

    const targetPath = path.resolve(UPLOADS_DIR, filename);
    if (!targetPath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(targetPath)) {
      res.status(404).send('Image not found');
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(targetPath);
  });

  // --- Server-Side Gemini AI Routes ---

  // 1. Owner AI: Scan printed paper menu photo into structured categories & dishes
  app.post('/api/ai/scan-menu', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const user = await verifyFirebaseIdToken(authHeader.slice('Bearer '.length).trim());
      if (!user) {
        res.status(401).json({ error: 'Authentication required to scan menus.' });
        return;
      }
      if (isRateLimited(`ai_scan:${user.uid}`, 15)) {
        res.status(429).json({ error: 'Too many menu scans. Please wait a few minutes.' });
        return;
      }

      const body = req.body as { mimeType?: unknown; dataBase64?: unknown };
      if (typeof body?.mimeType !== 'string' || typeof body?.dataBase64 !== 'string') {
        res.status(400).json({ error: 'Invalid menu image payload.' });
        return;
      }
      const cleanBase64 = body.dataBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
        res.status(413).json({ error: 'Menu photo must be smaller than 5 MB.' });
        return;
      }
      const detectedMime = detectImageTypeFromMagicBytes(buffer);
      if (!detectedMime || !ALLOWED_MIME_EXT[detectedMime]) {
        res.status(400).json({ error: 'Upload a valid JPG, PNG, or WebP menu photo.' });
        return;
      }

      const result = await scanPaperMenuImage({
        mimeType: detectedMime,
        base64Data: cleanBase64,
      });
      res.json(result);
    } catch (err) {
      console.error('AI scan-menu failed:', err);
      const mapped = mapAiRouteError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 2. Owner AI: Write appetizing dish description & INR price suggestion
  app.post('/api/ai/dish-copy', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const user = await verifyFirebaseIdToken(authHeader.slice('Bearer '.length).trim());
      if (!user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      if (isRateLimited(`ai_copy:${user.uid}`, 40)) {
        res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const dishName = typeof body?.dishName === 'string' ? body.dishName.trim().slice(0, 100) : '';
      if (dishName.length < 2) {
        res.status(400).json({ error: 'Enter a dish name first.' });
        return;
      }

      const result = await generateDishCopy({
        dishName,
        categoryName: typeof body?.categoryName === 'string' ? body.categoryName.slice(0, 60) : 'Specials',
        foodType: typeof body?.foodType === 'string' ? body.foodType.slice(0, 20) : 'veg',
        restaurantName: typeof body?.restaurantName === 'string' ? body.restaurantName.slice(0, 100) : 'Restaurant',
        restaurantType: typeof body?.restaurantType === 'string' ? body.restaurantType.slice(0, 40) : 'restaurant',
        city: typeof body?.city === 'string' ? body.city.slice(0, 80) : 'New Delhi',
      });
      res.json(result);
    } catch (err) {
      console.error('AI dish-copy failed:', err);
      const mapped = mapAiRouteError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 3. Public Diner AI: Translate public menu into natural Hindi (cached)
  app.post('/api/ai/translate-menu', async (req, res) => {
    try {
      if (isRateLimited(`ai_tr:${req.ip || 'unknown'}`, 30)) {
        res.status(429).json({ error: 'Too many translation requests. Please wait a moment.' });
        return;
      }

      const body = req.body as {
        restaurantId?: unknown;
        restaurantName?: unknown;
        restaurantDescription?: unknown;
        promoBanner?: unknown;
        categories?: unknown;
        items?: unknown;
      };

      const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId.trim().slice(0, 80) : '';
      const restaurantName = typeof body?.restaurantName === 'string' ? body.restaurantName.trim().slice(0, 100) : '';
      const categories = Array.isArray(body?.categories)
        ? body.categories
            .slice(0, 40)
            .map((c: { id?: unknown; name?: unknown }) => ({
              id: String(c?.id || '').slice(0, 80),
              name: String(c?.name || '').slice(0, 80),
            }))
        : [];
      const items = Array.isArray(body?.items)
        ? body.items
            .slice(0, 60)
            .map((i: { id?: unknown; name?: unknown; description?: unknown }) => ({
              id: String(i?.id || '').slice(0, 80),
              name: String(i?.name || '').slice(0, 100),
              description: String(i?.description || '').slice(0, 400),
            }))
        : [];

      const restaurantDescription =
        typeof body?.restaurantDescription === 'string' ? body.restaurantDescription.slice(0, 500) : '';
      const promoBanner =
        typeof body?.promoBanner === 'string' ? body.promoBanner.slice(0, 160) : '';

      if (!restaurantName) {
        res.status(400).json({ error: 'Provide a restaurant name to translate.' });
        return;
      }

      if (
        categories.length === 0 &&
        items.length === 0 &&
        !restaurantDescription.trim() &&
        !promoBanner.trim()
      ) {
        res.json({
          restaurantDescription: '',
          promoBanner: '',
          categories: [],
          items: [],
        });
        return;
      }

      const hash = crypto
        .createHash('sha1')
        .update(
          JSON.stringify({
            restaurantId: restaurantId || 'menu',
            restaurantDescription,
            promoBanner,
            categories,
            items,
          })
        )
        .digest('hex');

      const translated = await translateMenuToHindi({
        cacheKey: `${restaurantId}:${hash}`,
        restaurantName,
        restaurantDescription,
        promoBanner,
        categories,
        items,
      });

      res.json(translated);
    } catch (err) {
      console.error('AI translate-menu failed:', err);
      const mapped = mapAiRouteError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 4. Public Diner AI: Menu Assistant grounded strictly in live available dishes
  app.post('/api/ai/menu-assistant', async (req, res) => {
    try {
      if (isRateLimited(`ai_chat:${req.ip || 'unknown'}`, 40)) {
        res.status(429).json({ error: 'Too many questions right now. Please pause a moment.' });
        return;
      }

      const body = req.body as {
        restaurantName?: unknown;
        restaurantType?: unknown;
        city?: unknown;
        language?: unknown;
        question?: unknown;
        menuSummary?: unknown;
      };

      const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 300) : '';
      if (question.length < 2) {
        res.status(400).json({ error: 'Please ask a question about the menu.' });
        return;
      }

      const menuSummary = Array.isArray(body?.menuSummary)
        ? body.menuSummary.slice(0, 80).map((d: Record<string, unknown>) => ({
            name: String(d?.name || '').slice(0, 100),
            category: String(d?.category || '').slice(0, 60),
            price: Number.isFinite(Number(d?.price)) ? Number(d.price) : 0,
            foodType: String(d?.foodType || 'veg').slice(0, 20),
            description: String(d?.description || '').slice(0, 300),
            isAvailable: Boolean(d?.isAvailable),
            isFeatured: Boolean(d?.isFeatured),
          }))
        : [];

      const reply = await answerMenuAssistantQuestion({
        restaurantName: typeof body?.restaurantName === 'string' ? body.restaurantName.slice(0, 100) : 'Restaurant',
        restaurantType: typeof body?.restaurantType === 'string' ? body.restaurantType.slice(0, 40) : 'restaurant',
        city: typeof body?.city === 'string' ? body.city.slice(0, 80) : 'New Delhi',
        language: body?.language === 'hi' ? 'hi' : 'en',
        question,
        menuSummary,
      });

      res.json(reply);
    } catch (err) {
      console.error('AI menu-assistant failed:', err);
      const mapped = mapAiRouteError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 5. Owner AI: Google Maps Grounding to locate restaurant's Google Maps / Reviews link
  app.post('/api/ai/find-google-place', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const user = await verifyFirebaseIdToken(authHeader.slice('Bearer '.length).trim());
      if (!user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      if (isRateLimited(`ai_maps:${user.uid}`, 20)) {
        res.status(429).json({ error: 'Too many lookup requests. Please wait a moment.' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const restaurantName =
        typeof body?.restaurantName === 'string' ? body.restaurantName.trim().slice(0, 100) : '';
      const city = typeof body?.city === 'string' ? body.city.trim().slice(0, 80) : '';
      const address = typeof body?.address === 'string' ? body.address.trim().slice(0, 250) : '';

      if (restaurantName.length < 2) {
        res.status(400).json({ error: 'Enter your restaurant name first.' });
        return;
      }

      const result = await findRestaurantGooglePlace({
        restaurantName,
        city: city || 'New Delhi',
        address,
      });
      res.json(result);
    } catch (err) {
      console.error('AI find-google-place failed:', err);
      const mapped = mapAiRouteError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 6. Premium Owner AI: Deep Tracking Analytics & Menu Engineering Report
  app.post('/api/ai/analytics', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const user = await verifyFirebaseIdToken(authHeader.slice('Bearer '.length).trim());
      if (!user) {
        res.status(401).json({ error: 'Invalid or expired authentication token.' });
        return;
      }
      if (isRateLimited(`ai_analytics:${user.uid}`, 25)) {
        res.status(429).json({ error: 'Too many analytics runs. Please wait a couple of minutes.' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const restaurantName =
        typeof body?.restaurantName === 'string' ? body.restaurantName.trim().slice(0, 100) : '';
      if (!restaurantName) {
        res.status(400).json({ error: 'Missing restaurant context for analytics.' });
        return;
      }

      const rawMetrics = (body?.metrics && typeof body.metrics === 'object'
        ? body.metrics
        : {}) as Record<string, unknown>;

      const safeNum = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

      const result = await generateAiMenuAnalytics({
        restaurantName,
        restaurantType:
          typeof body?.restaurantType === 'string' ? body.restaurantType.slice(0, 40) : 'cafe',
        city: typeof body?.city === 'string' ? body.city.slice(0, 80) : 'New Delhi',
        plan: typeof body?.plan === 'string' ? body.plan.slice(0, 20) : 'pro',
        rangeLabel:
          typeof body?.rangeLabel === 'string' ? body.rangeLabel.slice(0, 60) : 'Last 7 days',
        metrics: {
          totalEvents: safeNum(rawMetrics.totalEvents),
          menuViews: safeNum(rawMetrics.menuViews),
          qrScans: safeNum(rawMetrics.qrScans),
          dishViews: safeNum(rawMetrics.dishViews),
          cartAdds: safeNum(rawMetrics.cartAdds),
          upiPayClicks: safeNum(rawMetrics.upiPayClicks),
          reviewClicks: safeNum(rawMetrics.reviewClicks),
          cartIntentValueInr: safeNum(rawMetrics.cartIntentValueInr),
          upiIntentValueInr: safeNum(rawMetrics.upiIntentValueInr),
          hasPaymentQrOrUpi: Boolean(rawMetrics.hasPaymentQrOrUpi),
          hasGoogleReviewUrl: Boolean(rawMetrics.hasGoogleReviewUrl),
          isPublished: Boolean(rawMetrics.isPublished),
          totalDishes: safeNum(rawMetrics.totalDishes),
          availableDishes: safeNum(rawMetrics.availableDishes),
          discountedDishes: safeNum(rawMetrics.discountedDishes),
          avgDishPriceInr: safeNum(rawMetrics.avgDishPriceInr),
          peakBandLabel:
            typeof rawMetrics.peakBandLabel === 'string'
              ? rawMetrics.peakBandLabel.slice(0, 60)
              : 'No traffic yet',
          serviceBands: Array.isArray(rawMetrics.serviceBands)
            ? rawMetrics.serviceBands.slice(0, 8).map((b: Record<string, unknown>) => ({
                label: String(b?.label || '').slice(0, 40),
                count: safeNum(b?.count),
              }))
            : [],
          topSources: Array.isArray(rawMetrics.topSources)
            ? rawMetrics.topSources.slice(0, 10).map((s: Record<string, unknown>) => ({
                source: String(s?.source || '').slice(0, 40),
                count: safeNum(s?.count),
              }))
            : [],
          topDishes: Array.isArray(rawMetrics.topDishes)
            ? rawMetrics.topDishes.slice(0, 10).map((d: Record<string, unknown>) => ({
                name: String(d?.name || '').slice(0, 100),
                views: safeNum(d?.views),
                cartAdds: safeNum(d?.cartAdds),
                price: safeNum(d?.price),
              }))
            : [],
          zeroEngagementDishes: Array.isArray(rawMetrics.zeroEngagementDishes)
            ? rawMetrics.zeroEngagementDishes.slice(0, 8).map((d: Record<string, unknown>) => ({
                name: String(d?.name || '').slice(0, 100),
                price: safeNum(d?.price),
                category: String(d?.category || '').slice(0, 60),
              }))
            : [],
          upiAppBreakdown: Array.isArray(rawMetrics.upiAppBreakdown)
            ? rawMetrics.upiAppBreakdown.slice(0, 6).map((u: Record<string, unknown>) => ({
                app: String(u?.app || '').slice(0, 30),
                count: safeNum(u?.count),
              }))
            : [],
        },
      });

      res.json(result);
    } catch (err) {
      console.error('AI analytics failed:', err);
      const mapped = mapAiRouteError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR, { maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(DIST_DIR, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MENUQR server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
