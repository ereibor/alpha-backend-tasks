import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

const ALLOWED_DOCUMENT_TYPES = ['resume', 'cover_letter', 'other'] as const;
export type CandidateDocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];

export class CreateCandidateDocumentDto {
  @IsString()
  @IsIn(ALLOWED_DOCUMENT_TYPES)
  documentType!: CandidateDocumentType;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  storageKey!: string;

  @IsString()
  @MinLength(1)
  rawText!: string;
}

