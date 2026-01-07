export default {
  async fetch(request, env, ctx) {
    const incomingUrl = new URL(request.url);

    // Local health check (do NOT proxy to OpenAI)
    if (incomingUrl.pathname === "/health") {
      return new Response("ok", {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    // Build upstream URL
    const upstreamUrl = new URL(request.url);
    upstreamUrl.protocol = "https:";
    upstreamUrl.host = "api.openai.com";

    // Rebuild headers (avoid forwarding Host/CF/sec-* etc.)
    const headers = new Headers();

    // Required auth (prefer env var if you want)
    const auth = request.headers.get("authorization");
    if (auth) headers.set("authorization", auth);

    // Content negotiation
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);

    const accept = request.headers.get("accept");
    if (accept) headers.set("accept", accept);

    // Streaming support
    const acceptEncoding = request.headers.get("accept-encoding");
    if (acceptEncoding) headers.set("accept-encoding", acceptEncoding);

    // Optional: forward OpenAI-Organization / OpenAI-Project if you use them
    const org = request.headers.get("openai-organization");
    if (org) headers.set("openai-organization", org);

    const project = request.headers.get("openai-project");
    if (project) headers.set("openai-project", project);

    // Handle body safely: GET/HEAD must not include body
    const method = request.method.toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(method);

    const upstreamResp = await fetch(upstreamUrl.toString(), {
      method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "follow",
    });

    // Copy response headers, but drop set-cookie to avoid cookie leakage
    const respHeaders = new Headers(upstreamResp.headers);
    respHeaders.delete("set-cookie");
    respHeaders.set("access-control-allow-origin", "*");
    respHeaders.set("access-control-allow-headers", "*");
    respHeaders.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: respHeaders });
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders,
    });
  },
};
