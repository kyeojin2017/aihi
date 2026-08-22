// Proxies prescription photo OCR through Google Cloud Vision so the API key
// never ships in the client bundle. Deploy with:
//   npx supabase functions deploy ocr-prescription
// and set the key once with:
//   npx supabase secrets set GOOGLE_VISION_API_KEY=your-key-here
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const GOOGLE_VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (!GOOGLE_VISION_API_KEY) {
    return new Response(JSON.stringify({ error: "OCR API key not configured on the server" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  let image;
  try {
    ({ image } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: jsonHeaders });
  }
  if (!image || typeof image !== "string") {
    return new Response(JSON.stringify({ error: "image (base64, no data: prefix) is required" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  try {
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image },
              features: [{ type: "TEXT_DETECTION" }],
              imageContext: { languageHints: ["ko", "en"] },
            },
          ],
        }),
      }
    );

    const visionData = await visionRes.json();
    const visionError = visionData?.responses?.[0]?.error || visionData?.error;
    if (visionError) {
      return new Response(JSON.stringify({ error: visionError.message || "Vision API error" }), {
        status: 502,
        headers: jsonHeaders,
      });
    }

    const text = visionData?.responses?.[0]?.fullTextAnnotation?.text || "";
    return new Response(JSON.stringify({ text }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: jsonHeaders });
  }
});
