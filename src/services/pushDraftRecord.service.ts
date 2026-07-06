import type { PushDraftRecord, PushDraftStatus } from "../templates/pushDraftTable.js";

export type PushDraftCoverImage = {
  fieldName: string;
  fieldId?: string;
  fileToken: string;
  name: string;
  size?: number;
};

export type NormalizedPushDraftRecord = PushDraftRecord & {
  fieldMap: Record<string, unknown>;
  fieldIdMap: Record<string, string>;
  coverImage?: PushDraftCoverImage;
};

export type PushDraftValidationResult = {
  missingFields: string[];
  warningFields: string[];
};

const COVER_FIELD_NAME = "cover_image_url";
const MAX_WECHAT_IMAGE_BYTES = 10 * 1024 * 1024;
const WECHAT_IMAGE_EXTENSIONS = new Set(["bmp", "png", "jpeg", "jpg", "gif"]);

export function normalizePushDraftRecord(raw: unknown): NormalizedPushDraftRecord {
  const payload = isRecord(raw) ? raw.data : undefined;
  const data = isRecord(payload) ? payload.data : undefined;
  const fields = isRecord(payload) && Array.isArray(payload.fields) ? payload.fields : [];
  const fieldIds = isRecord(payload) && Array.isArray(payload.field_id_list) ? payload.field_id_list : [];
  const firstRow = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];

  const fieldMap: Record<string, unknown> = {};
  const fieldIdMap: Record<string, string> = {};

  fields.forEach((field, index) => {
    if (typeof field !== "string") {
      return;
    }
    fieldMap[field] = firstRow[index];
    if (typeof fieldIds[index] === "string") {
      fieldIdMap[field] = fieldIds[index];
    }
  });

  const normalized: NormalizedPushDraftRecord = {
    fieldMap,
    fieldIdMap,
    article_id: getText(fieldMap.article_id),
    title: getText(fieldMap.title),
    author: getText(fieldMap.author),
    digest: getText(fieldMap.digest),
    column: getText(fieldMap.column) as NormalizedPushDraftRecord["column"],
    content_markdown: getText(fieldMap.content_markdown),
    content_html: getText(fieldMap.content_html),
    cover_image_url: getText(fieldMap.cover_image_url),
    status: getText(fieldMap.status) as PushDraftStatus | undefined,
    wechat_draft_media_id: getText(fieldMap.wechat_draft_media_id),
    wechat_upload_result: getText(fieldMap.wechat_upload_result),
    missing_fields: getText(fieldMap.missing_fields),
    warning_fields: getText(fieldMap.warning_fields),
    created_at: getText(fieldMap.created_at),
    updated_at: getText(fieldMap.updated_at),
    coverImage: getCoverImage(fieldMap[COVER_FIELD_NAME], fieldIdMap[COVER_FIELD_NAME])
  };

  return normalized;
}

export function validatePushDraftForWechat(record: NormalizedPushDraftRecord): PushDraftValidationResult {
  const missingFields: string[] = [];
  const warningFields: string[] = [];

  if (record.status !== "ready_to_upload") {
    missingFields.push("status 必须为 ready_to_upload");
  }
  if (!record.title) {
    missingFields.push("title");
  }
  if (!record.content_html) {
    missingFields.push("content_html");
  }
  if (!record.coverImage?.fileToken) {
    missingFields.push(`${COVER_FIELD_NAME}.file_token`);
  }

  if (record.title && Array.from(record.title).length > 32) {
    warningFields.push("title 超过微信 32 字限制，可能被微信接口拒绝");
  }
  if (record.author && Array.from(record.author).length > 16) {
    warningFields.push("author 超过微信 16 字限制，可能被微信接口拒绝");
  }
  if (record.digest && Array.from(record.digest).length > 128) {
    warningFields.push("digest 超过微信 128 字限制，可能被微信接口拒绝");
  }
  if (record.coverImage?.size && record.coverImage.size > MAX_WECHAT_IMAGE_BYTES) {
    missingFields.push(`${COVER_FIELD_NAME} 超过微信永久图片素材 10M 限制`);
  }
  if (record.coverImage?.name && !WECHAT_IMAGE_EXTENSIONS.has(getExtension(record.coverImage.name))) {
    missingFields.push(`${COVER_FIELD_NAME} 不是微信永久图片素材支持的格式`);
  }

  return {
    missingFields,
    warningFields
  };
}

function getCoverImage(value: unknown, fieldId?: string): PushDraftCoverImage | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const firstFile = value.find(isRecord);
  if (!firstFile) {
    return undefined;
  }

  const fileToken = getText(firstFile.file_token);
  if (!fileToken) {
    return undefined;
  }

  return {
    fieldName: COVER_FIELD_NAME,
    fieldId,
    fileToken,
    name: getText(firstFile.name) || "cover-image",
    size: typeof firstFile.size === "number" ? firstFile.size : undefined
  };
}

function getText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];
    return getText(firstValue);
  }

  return undefined;
}

function getExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension ? extension.toLowerCase() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
