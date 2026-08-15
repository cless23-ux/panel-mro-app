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
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      ""
    );

    // Google 서비스 계정 정보
    if (!process.env.GOOGLE_VISION_CREDENTIALS) {
      throw new Error(
        "GOOGLE_VISION_CREDENTIALS 환경변수가 설정되지 않았습니다."
      );
    }

    const credentials = JSON.parse(
      process.env.GOOGLE_VISION_CREDENTIALS
    );

    // 인증 토큰 생성
    const accessToken = await getAccessToken(credentials);

    /*
      OCR 재시도 설정

      총 3번 시도

      1차 즉시
      2차 1초 후
      3차 2초 후
    */
    const MAX_RETRIES = 3;

    let lastError = null;
    let lastResult = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(
          `=== GOOGLE VISION OCR 시도 ${attempt}/${MAX_RETRIES} ===`
        );

        const visionResponse = await fetch(
          "https://vision.googleapis.com/v1/images:annotate",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
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

        lastResult = result;

        // HTTP 오류
        if (!visionResponse.ok) {
          const errorMessage =
            result?.error?.message ||
            result?.error?.status ||
            `HTTP ${visionResponse.status}`;

          console.error(
            `Google Vision HTTP 오류 (${attempt}/${MAX_RETRIES}):`,
            errorMessage
          );

          lastError = new Error(errorMessage);

          // 재시도 가능한 오류
          const retryableStatus = [
            429,
            500,
            502,
            503,
            504,
          ];

          if (
            retryableStatus.includes(visionResponse.status) &&
            attempt < MAX_RETRIES
          ) {
            const waitTime = attempt * 1000;

            console.log(
              `${waitTime}ms 후 OCR 재시도...`
            );

            await sleep(waitTime);

            continue;
          }

          throw lastError;
        }

        const visionResult =
          result?.responses?.[0] || {};

        /*
          Vision 내부 오류 확인

          예:
          Backend deadline exceeded
        */
        if (visionResult?.error) {
          const errorMessage =
            visionResult.error.message ||
            "Google Vision OCR 처리 중 오류가 발생했습니다.";

          console.error(
            `Google Vision 내부 오류 (${attempt}/${MAX_RETRIES}):`,
            errorMessage
          );

          lastError = new Error(errorMessage);

          const retryableError =
            /deadline|timeout|backend|internal|unavailable|temporarily/i.test(
              errorMessage
            );

          if (
            retryableError &&
            attempt < MAX_RETRIES
          ) {
            const waitTime = attempt * 1000;

            console.log(
              `${waitTime}ms 후 OCR 재시도...`
            );

            await sleep(waitTime);

            continue;
          }

          throw lastError;
        }

        /*
          OCR 결과 추출

          1순위:
          DOCUMENT_TEXT_DETECTION

          2순위:
          TEXT_DETECTION
        */
        const text =
          visionResult?.fullTextAnnotation?.text ||
          visionResult?.textAnnotations?.[0]?.description ||
          "";

        /*
          OCR 성공 여부

          빈 문자열이면 성공으로 처리하지 않음
        */
        if (!text.trim()) {
          console.warn(
            `OCR 텍스트 없음 (${attempt}/${MAX_RETRIES})`
          );

          lastError = new Error(
            "이미지에서 텍스트를 인식하지 못했습니다."
          );

          // 빈 결과도 재시도
          if (attempt < MAX_RETRIES) {
            const waitTime = attempt * 1000;

            console.log(
              `${waitTime}ms 후 OCR 재시도...`
            );

            await sleep(waitTime);

            continue;
          }

          throw lastError;
        }

        /*
          OCR 성공
        */
        console.log(
          `=== GOOGLE VISION OCR 성공 (${attempt}/${MAX_RETRIES}) ===`
        );

        console.log(
          "=== GOOGLE VISION OCR TEXT ==="
        );

        console.log(text);

        return res.status(200).json({
          success: true,
          text,
          raw: result,
          attempt,
        });

      } catch (error) {
        lastError = error;

        console.error(
          `OCR 시도 ${attempt} 실패:`,
          error.message
        );

        if (attempt < MAX_RETRIES) {
          const waitTime = attempt * 1000;

          console.log(
            `${waitTime}ms 후 다시 시도합니다...`
          );

          await sleep(waitTime);

          continue;
        }
      }
    }

    /*
      모든 OCR 재시도 실패
    */
    console.error(
      "=== GOOGLE VISION OCR 최종 실패 ===",
      lastError
    );

    return res.status(500).json({
      success: false,
      error:
        lastError?.message ||
        "OCR 처리에 실패했습니다.",
      raw: lastResult,
    });

  } catch (error) {
    console.error(
      "Vision API Error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "OCR 처리 중 오류가 발생했습니다.",
    });
  }
}


/*
  대기 함수
*/
function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}


/*
  Google 서비스 계정 JWT 생성
*/
async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: credentials.client_email,
    scope:
      "https://www.googleapis.com/auth/cloud-platform",
    aud:
      "https://oauth2.googleapis.com/token",
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

  const jwt =
    `${unsignedToken}.${signature}`;

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

  const tokenData =
    await tokenResponse.json();

  if (!tokenResponse.ok) {
    throw new Error(
      tokenData.error_description ||
      "Google 인증 토큰 생성 실패"
    );
  }

  return tokenData.access_token;
}