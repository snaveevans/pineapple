export type TeamId = string & { readonly _brand: "TeamId" };

export const TeamId = {
  generate: (): TeamId => crypto.randomUUID() as TeamId,
  from: (raw: string): TeamId => raw as TeamId,
};
