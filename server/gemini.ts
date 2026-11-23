import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const MODEL = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface ExtractedMenuDish {
  name: string;
  category: string;
  description: string;
  price: number;
  foodType: 'veg' | 'non_veg' | 'egg' | 'other';
}

export interface ScanMenuResult {
  categories: string[];
  dishes: ExtractedMenuDish[];
}

export async function scanPaperMenuImage(params: {
  mimeType: string;
  base64Data: string;
}): Promise<ScanMenuResult> {
  const ai = getAiClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: params.base64Data,
          },
        },
        {
          text: [
            'Extract all readable menu categories and dishes from this restaurant menu image.',
            'Return prices as numbers in INR (strip currency symbols like ₹ or Rs.). If a price is unclear, use 0.',
            'Classify each dish foodType accurately as one of: veg, non_veg, egg, other.',
            'Write a brief appetizing 1-sentence description if the menu does not print one (max 180 chars).',
            'Limit output to at most 40 dishes so it imports cleanly.',
          ].join(' '),
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          categories: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Unique ordered menu category names found in the image.',
          },
          dishes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING },
                description: { type: Type.STRING },
                price: { type: Type.NUMBER },
                foodType: {
                  type: Type.STRING,
                  enum: ['veg', 'non_veg', 'egg', 'other'],
                },
              },
              required: ['name', 'category', 'description', 'price', 'foodType'],
            },
          },
        },
        required: ['categories', 'dishes'],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as Partial<ScanMenuResult>;
  const dishes = Array.isArray(parsed.dishes)
    ? parsed.dishes
        .filter((d) => d && typeof d.name === 'string' && d.name.trim())
        .slice(0, 40)
        .map((d) => ({
          name: String(d.name).trim().slice(0, 100),
          category: String(d.category || 'Specials').trim().slice(0, 60),
          description: String(d.description || '').trim().slice(0, 300),
          price: Number.isFinite(Number(d.price)) && Number(d.price) >= 0 ? Math.min(100000, Math.round(Number(d.price))) : 0,
          foodType: (['veg', 'non_veg', 'egg', 'other'].includes(String(d.foodType))
            ? d.foodType
            : 'veg') as ExtractedMenuDish['foodType'],
        }))
    : [];

  const categorySet = new Set<string>(
    Array.isArray(parsed.categories)
      ? parsed.categories.map((c) => String(c).trim().slice(0, 60)).filter(Boolean)
      : []
  );
  dishes.forEach((d) => categorySet.add(d.category));

  return {
    categories: Array.from(categorySet),
    dishes,
  };
}

export interface DishCopyResult {
  description: string;
  suggestedPriceInr: number;
  foodType: 'veg' | 'non_veg' | 'egg' | 'other';
  pairingTip: string;
}

export async function generateDishCopy(params: {
  dishName: string;
  categoryName: string;
  foodType: string;
  restaurantName: string;
  restaurantType: string;
  city: string;
}): Promise<DishCopyResult> {
  const ai = getAiClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Create concise, appetizing hospitality menu copy for this dish:
Restaurant: ${params.restaurantName} (${params.restaurantType} in ${params.city})
Category: ${params.categoryName}
Dish Name: ${params.dishName}
Current Food Type Hint: ${params.foodType}`,
    config: {
      systemInstruction:
        'You are a menu copywriter for premium Indian cafes, restaurants, bakeries, and dhabas. Write natural, mouth-watering 1–2 sentence dish descriptions under 220 characters with zero cliches or hype. Suggest a realistic Delhi NCR menu price in INR.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          description: {
            type: Type.STRING,
            description: 'Appetizing 1–2 sentence dish description under 220 characters.',
          },
          suggestedPriceInr: {
            type: Type.NUMBER,
            description: 'Realistic INR price for this dish in Indian restaurants.',
          },
          foodType: {
            type: Type.STRING,
            enum: ['veg', 'non_veg', 'egg', 'other'],
          },
          pairingTip: {
            type: Type.STRING,
            description: 'Short optional pairing idea (under 80 characters).',
          },
        },
        required: ['description', 'suggestedPriceInr', 'foodType', 'pairingTip'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<DishCopyResult>;
  return {
    description: String(parsed.description || '').trim().slice(0, 350),
    suggestedPriceInr:
      Number.isFinite(Number(parsed.suggestedPriceInr)) && Number(parsed.suggestedPriceInr) >= 0
        ? Math.round(Number(parsed.suggestedPriceInr))
        : 199,
    foodType: (['veg', 'non_veg', 'egg', 'other'].includes(String(parsed.foodType))
      ? parsed.foodType
      : 'veg') as DishCopyResult['foodType'],
    pairingTip: String(parsed.pairingTip || '').trim().slice(0, 120),
  };
}

const FAST_TRANSLATE_MODEL = 'gemini-3.1-flash-lite';

function safeParseJson<T>(rawText: string | undefined, fallback: T): T {
  const cleaned = (rawText ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) return fallback;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export interface MenuTranslationPayload {
  restaurantDescription: string;
  promoBanner: string;
  categories: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string; description: string }>;
}

const translationCache = new Map<string, { value: MenuTranslationPayload; expiresAt: number }>();

export async function translateMenuToHindi(params: {
  cacheKey: string;
  restaurantName: string;
  restaurantDescription: string;
  promoBanner: string;
  categories: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string; description: string }>;
}): Promise<MenuTranslationPayload> {
  const cached = translationCache.get(params.cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const ai = getAiClient();

  const inputPayload = {
    restaurantDescription: params.restaurantDescription.slice(0, 500),
    promoBanner: params.promoBanner.slice(0, 160),
    categories: params.categories.slice(0, 40),
    items: params.items.slice(0, 60),
  };

  const response = await ai.models.generateContent({
    model: FAST_TRANSLATE_MODEL,
    contents: `Translate this restaurant menu for "${params.restaurantName}" into natural, readable Hindi (Devanagari script) suitable for Indian restaurant diners. Keep every exact "id" unchanged. For well-known café/international dish names like Cappuccino, Cold Coffee, or Margherita Pizza, use natural Hindi transliteration (e.g., "कैपुचीनो", "कोल्ड कॉफ़ी", "मार्गरीटा पिज़्ज़ा"). Return valid JSON matching the schema.\n\nInput JSON:\n${JSON.stringify(inputPayload)}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          restaurantDescription: { type: Type.STRING },
          promoBanner: { type: Type.STRING },
          categories: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
              },
              required: ['id', 'name'],
            },
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ['id', 'name', 'description'],
            },
          },
        },
        required: ['restaurantDescription', 'promoBanner', 'categories', 'items'],
      },
    },
  });

  const parsed = safeParseJson<Partial<MenuTranslationPayload>>(response.text, {});
  const result: MenuTranslationPayload = {
    restaurantDescription: String(parsed.restaurantDescription || params.restaurantDescription),
    promoBanner: String(parsed.promoBanner || params.promoBanner),
    categories:
      Array.isArray(parsed.categories) && parsed.categories.length > 0
        ? parsed.categories
        : params.categories,
    items:
      Array.isArray(parsed.items) && parsed.items.length > 0 ? parsed.items : params.items,
  };

  translationCache.set(params.cacheKey, {
    value: result,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });

  return result;
}

export interface AssistantReply {
  answer: string;
  recommendedDishNames: string[];
}

export async function answerMenuAssistantQuestion(params: {
  restaurantName: string;
  restaurantType: string;
  city: string;
  language: 'en' | 'hi';
  question: string;
  menuSummary: Array<{
    name: string;
    category: string;
    price: number;
    foodType: string;
    description: string;
    isAvailable: boolean;
    isFeatured: boolean;
  }>;
}): Promise<AssistantReply> {
  const ai = getAiClient();

  const availableOnly = params.menuSummary.filter((d) => d.isAvailable);
  const unavailableNames = params.menuSummary.filter((d) => !d.isAvailable).map((d) => d.name);

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Diner Question: "${params.question.trim().slice(0, 300)}"

Restaurant: ${params.restaurantName} (${params.restaurantType}, ${params.city})
Available Dishes (INR):
${JSON.stringify(availableOnly.slice(0, 80))}

Currently Unavailable Dishes (do NOT recommend these): ${unavailableNames.join(', ') || 'None'}`,
    config: {
      systemInstruction:
        params.language === 'hi'
          ? 'You are a warm, concise digital menu host for this Indian restaurant. Respond in natural Hindi (Devanagari). ONLY recommend dishes present in the Available Dishes list with their exact ₹ prices. Never invent dishes. Keep answers under 110 words.'
          : 'You are a warm, concise digital menu host for this restaurant. Respond in clear, friendly English. ONLY recommend dishes present in the Available Dishes list with their exact ₹ prices. Calculate exact combo totals when asked for a budget. Never invent dishes. Keep answers under 110 words.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: {
            type: Type.STRING,
            description: 'Helpful, concise answer grounded strictly in the available menu.',
          },
          recommendedDishNames: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exact names of up to 4 recommended dishes from the menu.',
          },
        },
        required: ['answer', 'recommendedDishNames'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<AssistantReply>;
  return {
    answer: String(parsed.answer || '').trim(),
    recommendedDishNames: Array.isArray(parsed.recommendedDishNames)
      ? parsed.recommendedDishNames.map((n) => String(n)).slice(0, 4)
      : [],
  };
}

export interface GroundedGooglePlace {
  title: string;
  uri: string;
  reviewSnippet?: string;
}

export interface FindGooglePlaceResult {
  summary: string;
  places: GroundedGooglePlace[];
}

export async function findRestaurantGooglePlace(params: {
  restaurantName: string;
  city: string;
  address?: string;
}): Promise<FindGooglePlaceResult> {
  const ai = getAiClient();
  const queryText = [params.restaurantName, params.address, params.city]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(', ');

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Find the official Google Maps listing for this restaurant in India so the owner can link their Google Reviews page: ${queryText}. Provide a brief 1-sentence confirmation of the best matching place.`,
    config: {
      tools: [{ googleMaps: {} }],
    },
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const places: GroundedGooglePlace[] = [];
  const seenUris = new Set<string>();

  for (const chunk of chunks) {
    const mapsChunk = chunk as {
      maps?: {
        uri?: string;
        title?: string;
        placeAnswerSources?: {
          reviewSnippets?: Array<{ content?: string }>;
        };
      };
    };
    const uri = mapsChunk.maps?.uri?.trim();
    const title = mapsChunk.maps?.title?.trim();
    if (uri && (uri.startsWith('https://') || uri.startsWith('http://')) && !seenUris.has(uri)) {
      seenUris.add(uri);
      const snippet = mapsChunk.maps?.placeAnswerSources?.reviewSnippets?.[0]?.content?.trim();
      places.push({
        title: title || params.restaurantName,
        uri,
        reviewSnippet: snippet ? snippet.slice(0, 180) : undefined,
      });
    }
  }

  return {
    summary: (response.text || '').trim().slice(0, 320),
    places: places.slice(0, 5),
  };
}

export interface AiMenuEngineeringItem {
  dishName: string;
  tag: 'Star' | 'Hidden Gem' | 'Price Opportunity' | 'Needs Boost';
  insight: string;
  recommendedAction: string;
}

export interface AiAnalyticsReport {
  executiveSummary: string;
  healthScore: number;
  healthGrade: 'A+' | 'A' | 'B+' | 'B' | 'C';
  healthLabel: string;
  peakTrafficInsight: string;
  menuEngineering: AiMenuEngineeringItem[];
  conversionFunnelAdvice: string[];
  growthForecast: string;
}

export async function generateAiMenuAnalytics(params: {
  restaurantName: string;
  restaurantType: string;
  city: string;
  plan: string;
  rangeLabel: string;
  metrics: {
    totalEvents: number;
    menuViews: number;
    qrScans: number;
    dishViews: number;
    cartAdds: number;
    upiPayClicks: number;
    reviewClicks: number;
    cartIntentValueInr: number;
    upiIntentValueInr: number;
    hasPaymentQrOrUpi: boolean;
    hasGoogleReviewUrl: boolean;
    isPublished: boolean;
    totalDishes: number;
    availableDishes: number;
    discountedDishes: number;
    avgDishPriceInr: number;
    peakBandLabel: string;
    serviceBands: Array<{ label: string; count: number }>;
    topSources: Array<{ source: string; count: number }>;
    topDishes: Array<{ name: string; views: number; cartAdds: number; price: number }>;
    zeroEngagementDishes: Array<{ name: string; price: number; category: string }>;
    upiAppBreakdown: Array<{ app: string; count: number }>;
  };
}): Promise<AiAnalyticsReport> {
  const ai = getAiClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Analyze live QR menu tracking telemetry for this Indian hospitality business and produce an actionable owner intelligence report.

Restaurant: ${params.restaurantName} (${params.restaurantType} in ${params.city})
Plan: ${params.plan.toUpperCase()}
Date Window: ${params.rangeLabel}

Live Telemetry Snapshot:
${JSON.stringify(params.metrics)}`,
    config: {
      systemInstruction:
        'You are a senior hospitality revenue and menu-engineering strategist for Indian cafes, restaurants, bakeries, and cloud kitchens. Ground every observation strictly in the provided telemetry numbers and INR prices — never invent fake statistics. If event counts are low or zero, honestly acknowledge early traffic and focus recommendations on menu pricing, featured dishes, QR placement, direct UPI checkout, and Google Review setup. Keep copy crisp, specific, and scannable.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: {
            type: Type.STRING,
            description: 'Concise 2-sentence executive summary grounded in the live telemetry.',
          },
          healthScore: {
            type: Type.INTEGER,
            description: 'Overall digital menu performance & readiness score from 0 to 100.',
          },
          healthGrade: {
            type: Type.STRING,
            enum: ['A+', 'A', 'B+', 'B', 'C'],
          },
          healthLabel: {
            type: Type.STRING,
            description: 'Short 2–4 word status label like "High Conversion Momentum" or "Ready to Scale".',
          },
          peakTrafficInsight: {
            type: Type.STRING,
            description: 'Specific insight on peak dining hours, QR scan sources, and staffing/promo timing.',
          },
          menuEngineering: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dishName: { type: Type.STRING },
                tag: {
                  type: Type.STRING,
                  enum: ['Star', 'Hidden Gem', 'Price Opportunity', 'Needs Boost'],
                },
                insight: { type: Type.STRING },
                recommendedAction: { type: Type.STRING },
              },
              required: ['dishName', 'tag', 'insight', 'recommendedAction'],
            },
            description: 'Up to 4 dish-level menu engineering recommendations from the actual catalog.',
          },
          conversionFunnelAdvice: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 4 concrete tactics to lift Menu Open -> Dish View -> Cart -> UPI Pay -> Google Review conversion.',
          },
          growthForecast: {
            type: Type.STRING,
            description: 'Clear next-7-day target and single highest-ROI move for the owner.',
          },
        },
        required: [
          'executiveSummary',
          'healthScore',
          'healthGrade',
          'healthLabel',
          'peakTrafficInsight',
          'menuEngineering',
          'conversionFunnelAdvice',
          'growthForecast',
        ],
      },
    },
  });

  const parsed = safeParseJson<Partial<AiAnalyticsReport>>(response.text, {});
  const score = Number.isFinite(Number(parsed.healthScore))
    ? Math.max(0, Math.min(100, Math.round(Number(parsed.healthScore))))
    : 72;
  const validGrades: AiAnalyticsReport['healthGrade'][] = ['A+', 'A', 'B+', 'B', 'C'];
  const grade = validGrades.includes(parsed.healthGrade as AiAnalyticsReport['healthGrade'])
    ? (parsed.healthGrade as AiAnalyticsReport['healthGrade'])
    : score >= 90
      ? 'A+'
      : score >= 80
        ? 'A'
        : score >= 70
          ? 'B+'
          : score >= 60
            ? 'B'
            : 'C';

  const validTags: AiMenuEngineeringItem['tag'][] = [
    'Star',
    'Hidden Gem',
    'Price Opportunity',
    'Needs Boost',
  ];

  return {
    executiveSummary: String(parsed.executiveSummary || '').trim().slice(0, 600),
    healthScore: score,
    healthGrade: grade,
    healthLabel: String(parsed.healthLabel || 'Analytics Ready').trim().slice(0, 60),
    peakTrafficInsight: String(parsed.peakTrafficInsight || '').trim().slice(0, 450),
    menuEngineering: Array.isArray(parsed.menuEngineering)
      ? parsed.menuEngineering.slice(0, 4).map((item) => ({
          dishName: String(item?.dishName || 'Menu Item').trim().slice(0, 100),
          tag: validTags.includes(item?.tag as AiMenuEngineeringItem['tag'])
            ? (item.tag as AiMenuEngineeringItem['tag'])
            : 'Hidden Gem',
          insight: String(item?.insight || '').trim().slice(0, 260),
          recommendedAction: String(item?.recommendedAction || '').trim().slice(0, 260),
        }))
      : [],
    conversionFunnelAdvice: Array.isArray(parsed.conversionFunnelAdvice)
      ? parsed.conversionFunnelAdvice.slice(0, 4).map((s) => String(s).trim().slice(0, 260)).filter(Boolean)
      : [],
    growthForecast: String(parsed.growthForecast || '').trim().slice(0, 400),
  };
}
