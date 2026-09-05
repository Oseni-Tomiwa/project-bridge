export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type SampleId = Brand<string, "SampleId">;
export type RunId = Brand<string, "RunId">;
export type ConversationId = Brand<string, "ConversationId">;
export type ActionId = Brand<string, "ActionId">;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface Clock {
  now(): Date;
  monotonicMilliseconds(): number;
}

export interface OperationFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}
