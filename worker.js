/**
 * 해시계 지구본 - Cloudflare Worker
 *
 * 정적 파일(index.html 등)은 그대로 서빙하고,
 * /api/vworld/* 로 오는 요청만 VWorld(브이월드) API로 프록시합니다.
 *
 * 이렇게 서버(Worker) 쪽에서 대신 호출하는 이유:
 *  1) VWorld 인증키(VWORLD_KEY)를 브라우저에 노출하지 않기 위해
 *  2) VWorld API의 도메인 화이트리스트 정책을 이 Worker의 배포 도메인
 *     하나로만 등록하면 되도록 하기 위해
 *
 * 사용 전 준비물:
 *  - Cloudflare 대시보드 > Workers & Pages > 20260823-project > Settings
 *    > Variables and Secrets 에서 VWORLD_KEY 시크릿 등록
 *  - vworld.kr에서 발급받은 인증키를 그 값으로 넣기
 *  - 인증키 신청 시 "사용 도메인"에 이 Worker의 배포 주소
 *    (예: 20260823-project.rujg1052.workers.dev)를 등록
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/vworld/")) {
      return handleVWorldProxy(request, env, url);
    }

    // 그 외 모든 요청은 정적 파일(index.html 등)로 서빙
    return env.ASSETS.fetch(request);
  },
};

async function handleVWorldProxy(request, env, url) {
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

  // /api/vworld/req/address  ->  https://api.vworld.kr/req/address
  const vworldPath = url.pathname.replace(/^\/api\/vworld/, "");
  const vworldUrl = new URL("https://api.vworld.kr" + vworldPath);

  for (const [k, v] of url.searchParams) {
    vworldUrl.searchParams.set(k, v);
  }
  vworldUrl.searchParams.set("key", key);

  try {
    const upstream = await fetch(vworldUrl.toString(), {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return jsonResponse({ error: "VWorld 요청 실패", detail: String(err) }, 502);
  }
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
