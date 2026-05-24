export type UserId = string & { _brand: "UserId" };

export const UserId = {
  generate: (): UserId => crypto.randomUUID() as UserId,
  from: (raw: string): UserId => raw as UserId,
};
