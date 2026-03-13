import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CandidateDocument } from "../entities/candidate-document.entity";
import { CandidateSummary } from "../entities/candidate-summary.entity";
import {
  CandidateSummaryInput,
  CandidateSummaryResult,
  SUMMARIZATION_PROVIDER,
  SummarizationProvider,
} from "../llm/summarization-provider.interface";
import { Inject } from "@nestjs/common";

interface SummaryJobPayload {
  summaryId: string;
  candidateId: string;
  workspaceId: string;
}

@Injectable()
export class CandidateSummaryWorker {
  private readonly logger = new Logger(CandidateSummaryWorker.name);

  constructor(
    @InjectRepository(CandidateSummary)
    private readonly summaryRepository: Repository<CandidateSummary>,
    @InjectRepository(CandidateDocument)
    private readonly documentRepository: Repository<CandidateDocument>,
    @Inject(SUMMARIZATION_PROVIDER)
    private readonly summarizationProvider: SummarizationProvider,
  ) {}

  @RabbitSubscribe({
    exchange: "candidate_summaries",
    routingKey: "summary.generate",
    queue: "summary_queue",
  })
  async handleSummaryJob(payload: SummaryJobPayload): Promise<void> {
    this.logger.log(`Processing summary job for ${payload.summaryId}`);

    const { summaryId, candidateId, workspaceId } = payload;

    const summary = await this.summaryRepository.findOne({
      where: { id: summaryId, candidateId, workspaceId },
    });

    if (!summary || summary.status !== "pending") {
      return;
    }

    const documents = await this.documentRepository.find({
      where: { candidateId, workspaceId },
      order: { uploadedAt: "ASC" },
    });

    const input: CandidateSummaryInput = {
      candidateId,
      documents: documents.map((doc) => doc.rawText),
    };

    try {
      const result =
        await this.summarizationProvider.generateCandidateSummary(input);
      this.applyResult(summary, result);
    } catch (error) {
      summary.status = "failed";
      summary.errorMessage =
        (error as Error).message ?? "Summary generation failed";
    }

    await this.summaryRepository.save(summary);
  }

  private applyResult(
    summary: CandidateSummary,
    result: CandidateSummaryResult,
  ): void {
    if (
      typeof result.score !== "number" ||
      !Array.isArray(result.strengths) ||
      !Array.isArray(result.concerns) ||
      typeof result.summary !== "string" ||
      typeof result.recommendedDecision !== "string"
    ) {
      summary.status = "failed";
      summary.errorMessage = "Summarization provider returned malformed result";
      return;
    }

    summary.status = "completed";
    summary.score = Math.round(result.score);
    summary.strengths = JSON.stringify(result.strengths);
    summary.concerns = JSON.stringify(result.concerns);
    summary.summary = result.summary;
    summary.recommendedDecision = result.recommendedDecision;
    summary.provider = process.env.GEMINI_API_KEY ? "gemini" : "fake";
    summary.promptVersion = "v1";
    summary.errorMessage = null;
  }
}
