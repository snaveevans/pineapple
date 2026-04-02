export type Bindings = CloudflareBindings;

export type Variables = {
  requestId: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
