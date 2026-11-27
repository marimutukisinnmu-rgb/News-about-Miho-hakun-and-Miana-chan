import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.0";

const ALLOWED_ORIGINS = new Set([
  "https://marimutukisinnmu-rgb.github.io",
]);
const MAX_BODY_BYTES = 10_000;

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

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fingerprintIp(ip: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(ip));
  return hex(new Uint8Array(signature));
}

async function readBodyLimited(req: Request, maxBytes: number): Promise<string | null> {
  const header = req.headers.get("content-length");
  if (header !== null) {
    const declaredLength = Number(header);
    if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > maxBytes) {
      return null;
    }
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
      if (total > maxBytes) {
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

function hasForbiddenNicknameControl(value: string) {
  return /[\u0000-\u001f\u007f]/u.test(value);
}

function hasForbiddenMessageControl(value: string) {
  // Newlines, carriage returns, and tabs are allowed in message text.
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function getClientIp(req: Request): string | null {
  // Supabase forwards the client address in X-Forwarded-For. Use the right-most
  // address, so a caller-supplied prefix is not preferred over the proxy-added
  // address. This is a rate-limit key only; the raw address is never persisted.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const candidates = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    const candidate = candidates[candidates.length - 1];
    if (candidate && candidate.length <= 64 && /^[0-9a-fA-F:.]+$/.test(candidate)) {
      return candidate.toLowerCase();
    }
  }

  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp && cfIp.length <= 64 && /^[0-9a-fA-F:.]+$/.test(cfIp)) {
    return cfIp.toLowerCase();
  }

  return null;
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
  if (req.method !== "POST") {
    return jsonResponse(origin, { error: "method_not_allowed" }, 405);
  }

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse(origin, { error: "content_type_must_be_json" }, 415);
  }

  const rawBody = await readBodyLimited(req, MAX_BODY_BYTES);
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

  // Honeypot: reply as accepted, but never store a submission that fills it.
  if (body.website !== undefined && body.website !== null &&
      (typeof body.website !== "string" || body.website.trim() !== "")) {
    return jsonResponse(origin, { ok: true }, 202);
  }

  const nicknameInput = body.nickname == null ? "" : body.nickname;
  if (typeof nicknameInput !== "string") {
    return jsonResponse(origin, { error: "nickname_invalid" }, 400);
  }
  const nickname = nicknameInput.normalize("NFC").trim();
  if (Array.from(nickname).length > 40 || hasForbiddenNicknameControl(nickname)) {
    return jsonResponse(origin, { error: "nickname_invalid" }, 400);
  }

  const emailInput = body.email == null ? "" : body.email;
  if (typeof emailInput !== "string") {
    return jsonResponse(origin, { error: "email_invalid" }, 400);
  }
  const contactEmail = emailInput.trim();
  if (
    contactEmail.length > 254 ||
    (contactEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
  ) {
    return jsonResponse(origin, { error: "email_invalid" }, 400);
  }

  if (typeof body.message !== "string") {
    return jsonResponse(origin, { error: "message_invalid" }, 400);
  }
  const message = body.message.normalize("NFC").trim();
  const messageLength = Array.from(message).length;
  if (
    messageLength < 1 ||
    messageLength > 2000 ||
    hasForbiddenMessageControl(message)
  ) {
    return jsonResponse(origin, { error: "message_invalid" }, 400);
  }

  const isHtmlRequest = message.startsWith("[HTML制作依頼]");
  // HTML requests must explicitly identify their originating page.
  if (isHtmlRequest &&
      (typeof body.pagePath !== "string" || body.pagePath.trim() === "")) {
    return jsonResponse(origin, { error: "page_invalid" }, 400);
  }
  if (body.pagePath !== undefined && typeof body.pagePath !== "string") {
    return jsonResponse(origin, { error: "page_invalid" }, 400);
  }
  const pagePathInput = typeof body.pagePath === "string" ? body.pagePath.trim() : "/";
  let sourcePage = "/";
  try {
    const parsedPage = new URL(pagePathInput, origin);
    if (parsedPage.origin !== origin || parsedPage.pathname.length > 250) {
      return jsonResponse(origin, { error: "page_invalid" }, 400);
    }
    sourcePage = parsedPage.pathname;
  } catch {
    return jsonResponse(origin, { error: "page_invalid" }, 400);
  }

  let requesterUserId: string | null = null;

  if (isHtmlRequest) {
    const authorization = req.headers.get("authorization") ?? "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      return jsonResponse(origin, { error: "login_required" }, 401);
    }

    const supabaseUrlForAuth = Deno.env.get("SUPABASE_URL");
    const serviceRoleKeyForAuth = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrlForAuth || !serviceRoleKeyForAuth) {
      return jsonResponse(origin, { error: "temporarily_unavailable" }, 503);
    }

    const authClient = createClient(supabaseUrlForAuth, serviceRoleKeyForAuth, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(tokenMatch[1]);
    if (authError || !authData.user) {
      return jsonResponse(origin, { error: "login_required" }, 401);
    }
    requesterUserId = authData.user.id;
  }

  const ip = getClientIp(req);
  if (!ip) {
    return jsonResponse(origin, { error: "temporarily_unavailable" }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(origin, { error: "temporarily_unavailable" }, 503);
  }

  try {
    // Only a keyed HMAC is stored; raw IP addresses are never written to the database.
    const fingerprint = await fingerprintIp(ip, serviceRoleKey);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clientAllowed, error: clientLimitError } = await admin.rpc(
      "mhn_take_comment_rate_limit",
      {
        p_client_fingerprint: fingerprint,
        p_limit: 100,
        p_window_minutes: 10,
      },
    );
    if (clientLimitError) {
      console.error("[mhn-comment-submit] client rate-limit check failed");
      return jsonResponse(origin, { error: "temporarily_unavailable" }, 503);
    }
    if (clientAllowed !== true) {
      return jsonResponse(origin, { error: "rate_limited" }, 429);
    }

    // A separate, very high global ceiling acts as a safety fuse against a
    // distributed flood. The derived key is not a real IP address.
    const globalFingerprint = await fingerprintIp("mhn-global-comment-limit", serviceRoleKey);
    const { data: globallyAllowed, error: globalLimitError } = await admin.rpc(
      "mhn_take_comment_rate_limit",
      {
        p_client_fingerprint: globalFingerprint,
        p_limit: 1000,
        p_window_minutes: 10,
      },
    );
    if (globalLimitError) {
      console.error("[mhn-comment-submit] global rate-limit check failed");
      return jsonResponse(origin, { error: "temporarily_unavailable" }, 503);
    }
    if (globallyAllowed !== true) {
      return jsonResponse(origin, { error: "global_rate_limited" }, 429);
    }

    const { error: insertError } = await admin.from("mhn_private_comments").insert({
      nickname: nickname || null,
      requester_user_id: requesterUserId,
      contact_email: contactEmail || null,
      message,
      source_page: sourcePage,
    });
    if (insertError) {
      console.error("[mhn-comment-submit] comment insert failed");
      return jsonResponse(origin, { error: "submit_failed" }, 500);
    }

    return jsonResponse(origin, { ok: true }, 201);
  } catch {
    console.error("[mhn-comment-submit] unexpected error");
    return jsonResponse(origin, { error: "temporarily_unavailable" }, 503);
  }
});
