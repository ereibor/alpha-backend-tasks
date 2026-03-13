import { Inject, Injectable, Logger } from "@nestjs/common";
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
import { EnqueuedJob, QueueService } from "../queue/queue.service";

interface SummaryJobPayload {
  summaryId: string;
  candidateId: string;
  workspaceId: string;
}

@Injectable()
export class CandidateSummaryWorker {
  private readonly logger = new Logger(CandidateSummaryWorker.name);
  private readonly processedJobIds = new Set<string>();

  constructor(
    private readonly queueService: QueueService,
    @InjectRepository(CandidateSummary)
    private readonly summaryRepository: Repository<CandidateSummary>,
    @InjectRepository(CandidateDocument)
    private readonly documentRepository: Repository<CandidateDocument>,
    @Inject(SUMMARIZATION_PROVIDER)
    private readonly summarizationProvider: SummarizationProvider,
  ) {}

  async processQueuedJobs(): Promise<void> {
    const jobs = this.queueService.getQueuedJobs();

    for (const job of jobs) {
      if (job.name !== "candidate.summary.generate") {
        continue;
      }

      if (this.processedJobIds.has(job.id)) {
        continue;
      }

      this.processedJobIds.add(job.id);

      await this.handleSummaryJob(job as EnqueuedJob<SummaryJobPayload>).catch(
        (error) => {
          this.logger.error(`Failed to handle job ${job.id}`, error as Error);
        },
      );
    }
  }

  private async handleSummaryJob(
    job: EnqueuedJob<SummaryJobPayload>,
  ): Promise<void> {
    const { summaryId, candidateId, workspaceId } = job.payload;

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
