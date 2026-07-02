export type EmailBatchId = string & { readonly _brand: "EmailBatchId" };

export const EmailBatchId = {
  generate: (): EmailBatchId => crypto.randomUUID() as EmailBatchId,
  from: (raw: string): EmailBatchId => raw as EmailBatchId,
};
