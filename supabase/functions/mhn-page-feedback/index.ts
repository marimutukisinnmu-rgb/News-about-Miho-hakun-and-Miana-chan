import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.0";

const ALLOWED_ORIGINS = new Set([
  "https://marimutukisinnmu-rgb.github.io",
]);
const MAX_BODY_BYTES = 10_000;
const REQUEST_FIELDS = "id, message, source_page, submitted_at";

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readBodyLimited(req: Request): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isFinite(size) || size < 0 || size > MAX_BODY_BYTES) return null;
  }
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizePagePath(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 1_000) return null;
  try {
    const parsed = new URL(value, origin);
    if (
      parsed.origin !== origin ||
      !parsed.pathname.startsWith("/") ||
      parsed.pathname.length > 250
    ) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

function titleFromMessage(message: string): string {
  const match = message.match(/^制作したいもの:\s*(.*)$/m);
  const title = match?.[1]?.trim();
  return title ? Array.from(title).slice(0, 80).join("") : "HTML制作依頼";
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function userRateLimitFingerprint(userId: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode("mhn-page-feedback:" + userId),
  );
  return hex(new Uint8Array(signature));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return jsonResponse(origin, { error: "method_not_allowed" }, 405);

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse(origin, { error: "content_type_must_be_json" }, 415);
  }

  const tokenMatch = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return jsonResponse(origin, { error: "unauthorized" }, 401);

  const rawBody = await readBodyLimited(req);
  if (rawBody === null) {
    return jsonResponse(origin, { error: "request_too_large_or_invalid_encoding" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse(origin, { error: "invalid_request" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(origin, { error: "invalid_json" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(origin, { error: "temporarily_unavailable" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The gateway JWT check is disabled for publishable-key clients. Verify the
  // actual user access token with Supabase Auth before any private-table access.
  const { data: authData, error: authError } = await admin.auth.getUser(tokenMatch[1]);
  if (authError || !authData.user) return jsonResponse(origin, { error: "unauthorized" }, 401);
  const userId = authData.user.id;

  const pagePath = normalizePagePath(body.pagePath, origin);
  if (!pagePath) return jsonResponse(origin, { error: "invalid_page" }, 400);

  if (body.action === "list") {
    const { data, error } = await admin
      .from("mhn_private_comments")
      .select(REQUEST_FIELDS)
      .eq("requester_user_id", userId)
      .eq("source_page", pagePath)
      .like("message", "[HTML制作依頼]%")
      .order("submitted_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[mhn-page-feedback] request lookup failed");
      return jsonResponse(origin, { error: "database_read_failed" }, 503);
    }

    const requests = (data ?? []).map((row) => ({
      id: row.id,
      title: titleFromMessage(row.message),
      submitted_at: row.submitted_at,
    }));
    return jsonResponse(origin, { ok: true, requests });
  }

  if (body.action === "submit") {
    if (!isUuid(body.requestId)) {
      return jsonResponse(origin, { error: "invalid_request_id" }, 400);
    }
    if (typeof body.suggestion !== "string") {
      return jsonResponse(origin, { error: "invalid_suggestion" }, 400);
    }
    const suggestion = body.suggestion.normalize("NFC").trim();
    const suggestionLength = Array.from(suggestion).length;
    if (suggestionLength < 1 || suggestionLength > 1_500 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(suggestion)) {
      return jsonResponse(origin, { error: "invalid_suggestion" }, 400);
    }

    // Re-check ownership and page binding on the server for every submission.
    const { data: request, error: requestError } = await admin
      .from("mhn_private_comments")
      .select("id, message, source_page")
      .eq("id", body.requestId)
      .eq("requester_user_id", userId)
      .maybeSingle();

    if (requestError) {
      return jsonResponse(origin, { error: "authorization_check_failed" }, 503);
    }
    if (!request ||
        typeof request.message !== "string" ||
        !request.message.startsWith("[HTML制作依頼]") ||
        request.source_page !== pagePath) {
      return jsonResponse(origin, { error: "request_not_available" }, 404);
    }

    const fingerprint = await userRateLimitFingerprint(userId, serviceRoleKey);
    const { data: allowed, error: rateError } = await admin.rpc(
      "mhn_take_comment_rate_limit",
      {
        p_client_fingerprint: fingerprint,
        p_limit: 5,
        p_window_minutes: 10,
      },
    );
    if (rateError) {
      console.error("[mhn-page-feedback] rate-limit check failed");
      return jsonResponse(origin, { error: "temporarily_unavailable" }, 503);
    }
    if (allowed !== true) return jsonResponse(origin, { error: "rate_limited" }, 429);

    const message = [
      "[修正案]",
      "元依頼ID: " + request.id,
      "対象ページ: " + pagePath,
      "",
      suggestion,
    ].join("\n");

    const { error: insertError } = await admin.from("mhn_private_comments").insert({
      requester_user_id: userId,
      source_page: pagePath,
      message,
      nickname: null,
      contact_email: null,
    });
    if (insertError) {
      console.error("[mhn-page-feedback] private feedback insert failed");
      return jsonResponse(origin, { error: "submit_failed" }, 500);
    }

    return jsonResponse(origin, { ok: true }, 201);
  }

  return jsonResponse(origin, { error: "unknown_action" }, 400);
});
