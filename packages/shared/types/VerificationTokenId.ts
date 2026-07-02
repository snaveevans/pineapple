export type VerificationTokenId = string & { readonly _brand: "VerificationTokenId" };

export const VerificationTokenId = {
  generate: (): VerificationTokenId => crypto.randomUUID() as VerificationTokenId,
  from: (raw: string): VerificationTokenId => raw as VerificationTokenId,
};
