import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AuthUser } from "../auth/auth.types";
import { CandidateDocument } from "../entities/candidate-document.entity";
import { CandidateSummary } from "../entities/candidate-summary.entity";
import { SampleCandidate } from "../entities/sample-candidate.entity";
import { QueueService } from "../queue/queue.service";
import { CandidatesService } from "./candidates.service";

describe("CandidatesService", () => {
  let service: CandidatesService;

  const candidateRepository = {
    findOne: jest.fn(),
  };

  const documentRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const summaryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const queueService: Pick<QueueService, "enqueue" | "getQueuedJobs"> = {
    enqueue: jest.fn().mockImplementation((name: string, payload: unknown) => ({
      id: "job-1",
      name,
      payload,
      enqueuedAt: new Date().toISOString(),
    })),
    getQueuedJobs: jest.fn().mockReturnValue([]),
  };

  const user: AuthUser = {
    userId: "user-1",
    workspaceId: "workspace-1",
  };

  const candidate: SampleCandidate = {
    id: "candidate-1",
    workspaceId: "workspace-1",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    createdAt: new Date(),
    workspace: {} as any,
  };

  const mockSummary: CandidateSummary = {
    id: "summary-1",
    candidateId: "candidate-1",
    workspaceId: "workspace-1",
    status: "completed",
    score: 85,
    strengths: '["Strong TypeScript skills"]',
    concerns: '["Limited backend experience"]',
    summary: "A strong candidate with relevant experience.",
    recommendedDecision: "advance",
    provider: "gemini",
    promptVersion: "v1",
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    candidate: {} as any,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        {
          provide: getRepositoryToken(SampleCandidate),
          useValue: candidateRepository,
        },
        {
          provide: getRepositoryToken(CandidateDocument),
          useValue: documentRepository,
        },
        {
          provide: getRepositoryToken(CandidateSummary),
          useValue: summaryRepository,
        },
        {
          provide: QueueService,
          useValue: queueService,
        },
      ],
    }).compile();

    service = module.get<CandidatesService>(CandidatesService);
  });

  // ─── uploadDocument ───────────────────────────────────────────────────────

  describe("uploadDocument", () => {
    it("uploads a document for a candidate in the current workspace", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      documentRepository.create.mockImplementation((value: unknown) => value);
      documentRepository.save.mockImplementation(
        async (value: unknown) => value,
      );

      const result = await service.uploadDocument(user, "candidate-1", {
        documentType: "resume",
        fileName: "ada-resume.pdf",
        storageKey: "local/ada-resume.pdf",
        rawText: "Sample resume text",
      });

      expect(candidateRepository.findOne).toHaveBeenCalledWith({
        where: { id: "candidate-1", workspaceId: "workspace-1" },
      });
      expect(documentRepository.create).toHaveBeenCalled();
      expect(result.candidateId).toBe("candidate-1");
      expect(result.workspaceId).toBe("workspace-1");
    });

    it("trims fileName and storageKey whitespace", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      documentRepository.create.mockImplementation((value: unknown) => value);
      documentRepository.save.mockImplementation(
        async (value: unknown) => value,
      );

      const result = await service.uploadDocument(user, "candidate-1", {
        documentType: "cover_letter",
        fileName: "  ada-cover.pdf  ",
        storageKey: "  local/ada-cover.pdf  ",
        rawText: "Cover letter text",
      });

      expect(result.fileName).toBe("ada-cover.pdf");
      expect(result.storageKey).toBe("local/ada-cover.pdf");
    });

    it("throws NotFoundException when candidate does not belong to workspace", async () => {
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.uploadDocument(user, "other-candidate", {
          documentType: "resume",
          fileName: "file.pdf",
          storageKey: "local/file.pdf",
          rawText: "text",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when candidate does not exist", async () => {
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.uploadDocument(user, "nonexistent-id", {
          documentType: "resume",
          fileName: "file.pdf",
          storageKey: "local/file.pdf",
          rawText: "text",
        }),
      ).rejects.toThrow("Candidate not found in workspace");
    });
  });

  // ─── requestSummaryGeneration ─────────────────────────────────────────────

  describe("requestSummaryGeneration", () => {
    it("enqueues a summary generation job and creates a pending summary", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.create.mockImplementation((value: unknown) => value);
      summaryRepository.save.mockImplementation(async (value: any) => ({
        ...value,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const { summary, job } = await service.requestSummaryGeneration(
        user,
        "candidate-1",
      );

      expect(summary.status).toBe("pending");
      expect(job.name).toBe("candidate.summary.generate");
      expect(queueService.enqueue).toHaveBeenCalled();
    });

    it("creates summary with correct candidateId and workspaceId", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.create.mockImplementation((value: unknown) => value);
      summaryRepository.save.mockImplementation(async (value: any) => ({
        ...value,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const { summary } = await service.requestSummaryGeneration(
        user,
        "candidate-1",
      );

      expect(summary.candidateId).toBe("candidate-1");
      expect(summary.workspaceId).toBe("workspace-1");
    });

    it("enqueues job with correct payload", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.create.mockImplementation((value: unknown) => value);
      summaryRepository.save.mockImplementation(async (value: any) => ({
        ...value,
        id: "summary-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const { job } = await service.requestSummaryGeneration(
        user,
        "candidate-1",
      );

      expect(queueService.enqueue).toHaveBeenCalledWith(
        "candidate.summary.generate",
        expect.objectContaining({
          candidateId: "candidate-1",
          workspaceId: "workspace-1",
        }),
      );
      expect(job.name).toBe("candidate.summary.generate");
    });

    it("initialises summary fields as null except status", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.create.mockImplementation((value: unknown) => value);
      summaryRepository.save.mockImplementation(async (value: any) => ({
        ...value,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const { summary } = await service.requestSummaryGeneration(
        user,
        "candidate-1",
      );

      expect(summary.score).toBeNull();
      expect(summary.strengths).toBeNull();
      expect(summary.concerns).toBeNull();
      expect(summary.summary).toBeNull();
      expect(summary.recommendedDecision).toBeNull();
      expect(summary.provider).toBeNull();
      expect(summary.errorMessage).toBeNull();
    });

    it("throws NotFoundException when candidate not in workspace", async () => {
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.requestSummaryGeneration(user, "candidate-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listSummaries ────────────────────────────────────────────────────────

  describe("listSummaries", () => {
    it("returns summaries for a candidate in the workspace", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.find.mockResolvedValue([mockSummary]);

      const result = await service.listSummaries(user, "candidate-1");

      expect(summaryRepository.find).toHaveBeenCalledWith({
        where: { candidateId: "candidate-1", workspaceId: "workspace-1" },
        order: { createdAt: "DESC" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("summary-1");
    });

    it("returns empty array when no summaries exist", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.find.mockResolvedValue([]);

      const result = await service.listSummaries(user, "candidate-1");

      expect(result).toHaveLength(0);
    });

    it("throws NotFoundException when candidate not in workspace", async () => {
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(service.listSummaries(user, "candidate-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getSummary ───────────────────────────────────────────────────────────

  describe("getSummary", () => {
    it("returns a single summary by id", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.findOne.mockResolvedValue(mockSummary);

      const result = await service.getSummary(user, "candidate-1", "summary-1");

      expect(summaryRepository.findOne).toHaveBeenCalledWith({
        where: {
          id: "summary-1",
          candidateId: "candidate-1",
          workspaceId: "workspace-1",
        },
      });
      expect(result.id).toBe("summary-1");
      expect(result.provider).toBe("gemini");
    });

    it("throws NotFoundException when summary does not exist", async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getSummary(user, "candidate-1", "nonexistent-summary"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when candidate not in workspace", async () => {
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getSummary(user, "candidate-1", "summary-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("enforces workspace isolation - cannot access summary from another workspace", async () => {
      const otherUser: AuthUser = {
        userId: "user-2",
        workspaceId: "workspace-2",
      };
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getSummary(otherUser, "candidate-1", "summary-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
