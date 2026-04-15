import { api, APIError } from "@/lib/api-client";

export type TargetLang = "en" | "zh" | "ja" | "ko";

export interface TranslateResult {
  targetLang: TargetLang;
  translated: string;
  provider: string;
  model: string;
  latencyMs: number;
  cached: boolean;
  charged: number;
  freeRemaining: number;
}

interface ServerResp {
  translated: string;
  target_lang: TargetLang;
  provider: string;
  model: string;
  latency_ms: number;
  cached: boolean;
  charged: number;
  free_remaining: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  insufficient_credits: "余额不足，等明日免费额度刷新或赚取更多积分",
  translation_unavailable: "管理员尚未配置翻译服务",
  invalid_lang: "目标语言不支持",
  unauthorized: "请先登录后再翻译",
  translation_failed: "翻译失败，请稍后再试",
};

export async function translateContent(
  source: string,
  targetLang: TargetLang = "en",
): Promise<TranslateResult> {
  try {
    const r = await api<ServerResp>("/api/translate", {
      method: "POST",
      body: { source, target_lang: targetLang },
    });
    return {
      targetLang: r.target_lang,
      translated: r.translated,
      provider: r.provider,
      model: r.model,
      latencyMs: r.latency_ms,
      cached: r.cached,
      charged: r.charged,
      freeRemaining: r.free_remaining,
    };
  } catch (err) {
    if (err instanceof APIError) {
      throw new Error(ERROR_MESSAGES[err.code] ?? err.message);
    }
    throw new Error("翻译请求失败");
  }
}
