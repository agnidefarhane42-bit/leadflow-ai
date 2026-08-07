// Mistral AI integration for LeadFlow AI agents
// Docs: https://docs.mistralai.com/

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";

interface MistralMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface MistralResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callMistral(
  systemPrompt: string,
  userMessage: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not set");
  }

  const messages: MistralMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const response = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mistral API error (${response.status}): ${errorText}`);
  }

  const data: MistralResponse = await response.json();

  return {
    content: data.choices[0]?.message?.content || "",
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

// Try to parse JSON from the AI response (agents may return structured data)
export function parseAIResponse(content: string): { json: any | null; text: string } {
  // Try to find JSON in the response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return { json: JSON.parse(jsonMatch[1].trim()), text: content };
    } catch {}
  }

  // Try direct JSON parse
  try {
    return { json: JSON.parse(content), text: content };
  } catch {}

  return { json: null, text: content };
}
