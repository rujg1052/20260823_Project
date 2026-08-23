/**
 * 해시계 지구본 - Cloudflare Worker
 *
 * /api/ping          -> VWorld와 무관한 외부 사이트(example.com)로 프록시 (진단용)
 * /api/vworld/*       -> VWorld(브이월드) API로 프록시
 * 그 외 모든 요청     -> 정적 파일(index.html 등)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/ping") {
        return await proxyMinimal("https://example.com/");
      }

      if (url.pathname.startsWith("/api/vworld/")) {
        const key = env.VWORLD_KEY;
        if (!key) {
          return textResponse("VWORLD_KEY_NOT_SET", 500);
        }
        const vworldPath = url.pathname.replace(/^\/api\/vworld/, "");
        const target = new URL("https://api.vworld.kr" + vworldPath);
        for (const [k, v] of url.searchParams) target.searchParams.set(k, v);
        target.searchParams.set("key", key);
        return await proxyMinimal(target.toString());
      }

      return await env.ASSETS.fetch(request);
    } catch (err) {
      return textResponse("TOP_LEVEL_EXCEPTION: " + (err && err.stack ? err.stack : String(err)), 500);
    }
  },
};

// 최대한 단순하게: 상태코드 + 본문 앞부분만 텍스트로 그대로 반환.
// 헤더 복사, JSON 파싱 등 실패할 수 있는 요소를 전부 제거해서
// 정확히 어느 단계에서 실패하는지 알 수 있게 한다.
async function proxyMinimal(targetUrl) {
  let upstream;
  try {
    upstream = await fetch(targetUrl);
  } catch (err) {
    return textResponse("FETCH_THREW: " + (err && err.stack ? err.stack : String(err)), 502);
  }

  let body;
  try {
    body = await upstream.text();
  } catch (err) {
    return textResponse("TEXT_THREW: status=" + upstream.status + " " + (err && err.stack ? err.stack : String(err)), 502);
  }

  return textResponse("STATUS=" + upstream.status + "\n\n" + body.slice(0, 3000), 200);
}

function textResponse(text, status) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}
