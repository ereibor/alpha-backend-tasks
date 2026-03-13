import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";

import {
  CandidateSummaryInput,
  CandidateSummaryResult,
  RecommendedDecision,
  SummarizationProvider,
} from "./summarization-provider.interface";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

interface GeminiCandidateSummary {
  score: number;
  strengths: string[];
  concerns: string[];
  summary: string;
  recommendedDecision: RecommendedDecision;
}

@Injectable()
export class GeminiSummarizationProvider implements SummarizationProvider {
  private readonly logger = new Logger(GeminiSummarizationProvider.name);

  async generateCandidateSummary(
    input: CandidateSummaryInput,
  ): Promise<CandidateSummaryResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        "GEMINI_API_KEY is not configured",
      );
    }

    const prompt = this.buildPrompt(input);

    const response = await fetch(
      `${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(
        `Gemini API error: ${response.status} ${response.statusText} - ${text}`,
      );
      throw new InternalServerErrorException("Gemini API call failed");
    }

    const data = (await response.json()) as any;
    const parsed = this.extractJsonPayload(data);

    this.validatePayload(parsed);

    return {
      score: parsed.score,
      strengths: parsed.strengths,
      concerns: parsed.concerns,
      summary: parsed.summary,
      recommendedDecision: parsed.recommendedDecision,
    };
  }

  private buildPrompt(input: CandidateSummaryInput): string {
    const joinedDocs =
      input.documents.length > 0
        ? input.documents.join("\n\n---\n\n")
        : "No documents were provided.";

    return [
      "You are an assistant that summarizes candidate resumes and related documents for recruiters.",
      "Given the following candidate documents, produce a JSON object with this exact TypeScript shape:",
      "",
      'type RecommendedDecision = "advance" | "hold" | "reject";',
      "interface CandidateSummary {",
      "  score: number; // 0–100",
      "  strengths: string[];",
      "  concerns: string[];",
      "  summary: string;",
      "  recommendedDecision: RecommendedDecision;",
      "}",
      "",
      "Rules:",
      "- Respond with JSON only, no markdown.",
      "- Ensure the JSON is syntactically valid.",
      '- "score" must be a number between 0 and 100.',
      '- "recommendedDecision" must be one of: "advance", "hold", "reject".',
      "",
      "Candidate documents:",
      joinedDocs,
    ].join("\n");
  }

  private extractJsonPayload(raw: any): GeminiCandidateSummary {
    try {
      const text: string | undefined =
        raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? undefined;

      if (!text) {
        throw new Error("Missing text content from Gemini response");
      }

      const parsed = JSON.parse(text) as GeminiCandidateSummary;
      return parsed;
    } catch (error) {
      this.logger.error("Failed to parse Gemini JSON payload", error as Error);
      throw new InternalServerErrorException(
        "Gemini returned an invalid JSON payload",
      );
    }
  }

  private validatePayload(payload: GeminiCandidateSummary): void {
    if (
      typeof payload.score !== "number" ||
      !Array.isArray(payload.strengths) ||
      !Array.isArray(payload.concerns) ||
      typeof payload.summary !== "string" ||
      typeof payload.recommendedDecision !== "string"
    ) {
      throw new InternalServerErrorException(
        "Gemini payload is missing required fields",
      );
    }

    if (payload.score < 0 || payload.score > 100) {
      throw new InternalServerErrorException("Gemini score is out of range");
    }

    const allowedDecisions: RecommendedDecision[] = [
      "advance",
      "hold",
      "reject",
    ];
    if (!allowedDecisions.includes(payload.recommendedDecision)) {
      throw new InternalServerErrorException(
        "Gemini recommendedDecision is invalid",
      );
    }
  }
}
