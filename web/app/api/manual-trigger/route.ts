import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TriggerBody = {
  targetUrl: string;
};

function badRequest(message: string, status = 400): Response {
  return Response.json({ ok: false, message }, { status });
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function signPayload(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function POST(request: Request): Promise<Response> {
  const receiverUrl = process.env.OPENCLAW_TRIGGER_URL;
  const sharedSecret = process.env.OPENCLAW_SHARED_SECRET;

  if (!receiverUrl || !sharedSecret) {
    return badRequest('Manual trigger is not configured. Set OPENCLAW_TRIGGER_URL and OPENCLAW_SHARED_SECRET.', 500);
  }

  let body: TriggerBody;
  try {
    body = (await request.json()) as TriggerBody;
  } catch {
    return badRequest('Invalid JSON body.');
  }

  const targetUrl = (body.targetUrl || '').trim();
  if (!targetUrl || !isHttpUrl(targetUrl)) {
    return badRequest('targetUrl must be a valid http(s) URL.');
  }

  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = JSON.stringify({ target_url: targetUrl, timestamp, nonce });
  const signature = signPayload(sharedSecret, payload);

  try {
    const response = await fetch(receiverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenClaw-Signature': signature
      },
      body: payload
    });

    if (!response.ok) {
      const text = await response.text();
      return badRequest(`Receiver rejected trigger (${response.status}): ${text}`, 502);
    }

    return Response.json({ ok: true, message: 'Manual trigger accepted by local receiver.' });
  } catch {
    return badRequest('Unable to reach local receiver. Verify tunnel and OPENCLAW_TRIGGER_URL.', 502);
  }
}
