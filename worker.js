/**
 * 해시계 지구본 - Cloudflare Worker
 *
 * 정적 파일(index.html 등)은 그대로 서빙하고,
 * /api/vworld/* 로 오는 요청만 VWorld(브이월드) API로 프록시합니다.
 *
 * 사용 전 준비물:
 *  - Cloudflare 대시보드 > Workers & Pages > 프로젝트 > Settings
 *    > Variables and Secrets 에서 VWORLD_KEY 시크릿 등록
 */

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/vworld/")) {
        return await handleVWorldProxy(url, env);
      }

      return await env.ASSETS.fetch(request);
    } catch (err) {
      // 어떤 예외가 나든 원인을 알 수 있게 그대로 보여준다
      return jsonResponse(
        {
          error: "Worker 최상위 예외",
          name: err && err.name,
          message: err && err.message,
          stack: err && err.stack,
        },
        500
      );
    }
  },
};

async function handleVWorldProxy(url, env) {
  const key = env.VWORLD_KEY;

  if (!key) {
    return jsonResponse(
      {
        error: "VWORLD_KEY가 설정되지 않았습니다.",
        hint: "Cloudflare 대시보드 > Workers & Pages > 프로젝트 > Settings > Variables and Secrets 에서 VWORLD_KEY를 추가하세요.",
      },
      500
    );
  }

  // /api/vworld/req/search  ->  https://api.vworld.kr/req/search
  const vworldPath = url.pathname.replace(/^\/api\/vworld/, "");
  const vworldUrl = new URL("https://api.vworld.kr" + vworldPath);

  for (const [k, v] of url.searchParams) {
    vworldUrl.searchParams.set(k, v);
  }
  vworldUrl.searchParams.set("key", key);

  let upstream;
  try {
    upstream = await fetch(vworldUrl.toString());
  } catch (err) {
    // fetch() 자체가 실패한 경우 (네트워크/연결 문제) - 정확한 원인 표시
    return jsonResponse(
      {
        error: "VWorld로의 요청 자체가 실패했습니다 (네트워크 레벨)",
        name: err && err.name,
        message: err && err.message,
        cause: err && err.cause ? String(err.cause) : undefined,
        vworldUrl: vworldUrl.toString().replace(key, "***"),
      },
      502
    );
  }

  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
      "X-Debug-Upstream-Status": String(upstream.status),
    },
  });
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
