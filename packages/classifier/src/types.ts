import type { ChangedFile } from "@asyncs/core";
import type { FILE_CLASSIFICATION_KINDS } from "./constants";

export type FileClassificationKind = (typeof FILE_CLASSIFICATION_KINDS)[number];

export type FileClassification = {
  file: ChangedFile;
  kinds: FileClassificationKind[];
};

export type ClassificationSummary = Record<FileClassificationKind, number>;

export type ClassificationResult = {
  files: FileClassification[];
  summary: ClassificationSummary;
};
