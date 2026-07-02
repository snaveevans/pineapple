export type NotificationId = string & { readonly _brand: "NotificationId" };

export const NotificationId = {
  generate: (): NotificationId => crypto.randomUUID() as NotificationId,
  from: (raw: string): NotificationId => raw as NotificationId,
};
