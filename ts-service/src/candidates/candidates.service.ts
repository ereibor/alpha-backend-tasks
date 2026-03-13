import { randomUUID } from 'crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthUser } from '../auth/auth.types';
import { EnqueuedJob, QueueService } from '../queue/queue.service';
import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { SampleCandidate } from '../entities/sample-candidate.entity';
import { CreateCandidateDocumentDto } from './dto/create-candidate-document.dto';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectRepository(SampleCandidate)
    private readonly candidateRepository: Repository<SampleCandidate>,
    @InjectRepository(CandidateDocument)
    private readonly documentRepository: Repository<CandidateDocument>,
    @InjectRepository(CandidateSummary)
    private readonly summaryRepository: Repository<CandidateSummary>,
    private readonly queueService: QueueService,
  ) {}

  async uploadDocument(
    user: AuthUser,
    candidateId: string,
    dto: CreateCandidateDocumentDto,
  ): Promise<CandidateDocument> {
    const candidate = await this.ensureCandidateInWorkspace(user, candidateId);

    const document = this.documentRepository.create({
      id: randomUUID(),
      candidateId: candidate.id,
      workspaceId: user.workspaceId,
      documentType: dto.documentType,
      fileName: dto.fileName.trim(),
      storageKey: dto.storageKey.trim(),
      rawText: dto.rawText,
    });

    return this.documentRepository.save(document);
  }

  async listSummaries(user: AuthUser, candidateId: string): Promise<CandidateSummary[]> {
    const candidate = await this.ensureCandidateInWorkspace(user, candidateId);

    return this.summaryRepository.find({
      where: { candidateId: candidate.id, workspaceId: user.workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async getSummary(
    user: AuthUser,
    candidateId: string,
    summaryId: string,
  ): Promise<CandidateSummary> {
    await this.ensureCandidateInWorkspace(user, candidateId);

    const summary = await this.summaryRepository.findOne({
      where: { id: summaryId, candidateId, workspaceId: user.workspaceId },
    });

    if (!summary) {
      throw new NotFoundException('Summary not found');
    }

    return summary;
  }

  async requestSummaryGeneration(
    user: AuthUser,
    candidateId: string,
  ): Promise<{ summary: CandidateSummary; job: EnqueuedJob }> {
    const candidate = await this.ensureCandidateInWorkspace(user, candidateId);

    const summary = this.summaryRepository.create({
      id: randomUUID(),
      candidateId: candidate.id,
      workspaceId: user.workspaceId,
      status: 'pending',
      score: null,
      strengths: null,
      concerns: null,
      summary: null,
      recommendedDecision: null,
      provider: null,
      promptVersion: null,
      errorMessage: null,
    });

    const saved = await this.summaryRepository.save(summary);

    const job = this.queueService.enqueue('candidate.summary.generate', {
      summaryId: saved.id,
      candidateId: saved.candidateId,
      workspaceId: saved.workspaceId,
    });

    return { summary: saved, job };
  }

  private async ensureCandidateInWorkspace(
    user: AuthUser,
    candidateId: string,
  ): Promise<SampleCandidate> {
    const candidate = await this.candidateRepository.findOne({
      where: { id: candidateId, workspaceId: user.workspaceId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found in workspace');
    }

    return candidate;
  }
}

