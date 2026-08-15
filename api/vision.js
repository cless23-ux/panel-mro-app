export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 가능합니다.",
    });
  }

  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({
        error: "이미지가 없습니다.",
      });
    }

    // data:image/...;base64, 부분 제거
    const base64Image = image.replace(
      /^data:image\/\w+;base64,/,
      ""
    );

    // Vercel 환경변수에서 Google 서비스 계정 정보 읽기
    const credentials = JSON.parse(
      process.env.GOOGLE_VISION_CREDENTIALS
    );

    // Google 인증 토큰 생성
    const jwt = await getAccessToken(credentials);

    // Google Cloud Vision API 호출
    const visionResponse = await fetch(
      "https://vision.googleapis.com/v1/images:annotate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: "DOCUMENT_TEXT_DETECTION",
                  maxResults: 1,
                },
              ],
            },
          ],
        }),
      }
    );

    const result = await visionResponse.json();

    if (!visionResponse.ok) {
      console.error("Vision HTTP 오류:", result);
      return res.status(500).json({
        success: false,
        error: "Google Vision OCR 오류",
        details: result,
      });
    }

    // HTTP 상태는 200이지만 Vision이 내부적으로 에러를 반환하는 경우
    // (예: code 4 = DEADLINE_EXCEEDED, 타임아웃)
    const innerError = result?.responses?.[0]?.error;
    if (innerError) {
      console.error("Vision 내부 오류:", innerError);
      return res.status(502).json({
        success: false,
        error: innerError.message || "Vision API 내부 오류",
        code: innerError.code,
        raw: result,
      });
    }

    const text =
      result?.responses?.[0]?.fullTextAnnotation?.text || "";

    return res.status(200).json({
      success: true,
      text,
      raw: result,
    });

  } catch (error) {
    console.error("Vision API Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "OCR 처리 중 오류가 발생했습니다.",
    });
  }
}


// Google 서비스 계정 JWT 생성
async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const base64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsignedToken =
    `${base64url(header)}.${base64url(payload)}`;

  const crypto = await import("crypto");

  const signer = crypto.createSign("RSA-SHA256");

  signer.update(unsignedToken);
  signer.end();

  const signature = signer
    .sign(credentials.private_key)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signature}`;

  const tokenResponse = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type:
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    throw new Error(
      tokenData.error_description ||
      "Google 인증 토큰 생성 실패"
    );
  }

  return tokenData.access_token;
}