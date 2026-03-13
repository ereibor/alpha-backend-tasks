import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CandidateDocument } from "../entities/candidate-document.entity";
import { CandidateSummary } from "../entities/candidate-summary.entity";
import { SampleCandidate } from "../entities/sample-candidate.entity";
import { QueueModule } from "../queue/queue.module";
import { LlmModule } from "../llm/llm.module";
import { CandidatesController } from "./candidates.controller";
import { CandidatesService } from "./candidates.service";
import { CandidateSummaryWorker } from "./candidate-summary.worker";

@Module({
  imports: [
    AuthModule,
    QueueModule,
    LlmModule,
    TypeOrmModule.forFeature([
      SampleCandidate,
      CandidateDocument,
      CandidateSummary,
    ]),
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService, CandidateSummaryWorker],
  exports: [CandidatesService, CandidateSummaryWorker],
})
export class CandidatesModule {}
