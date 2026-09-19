import { TypeSafeClient, type Questions, type RequestOptions, type SystemOneRequest, type SystemOneResult } from "@typesafe-ai/sdk";
import { mockSystemOne } from "./mock";

export type JevRuntime = {
  demo: boolean;
  model: string;
  systemOne: <Q extends Questions>(request: SystemOneRequest<Q>, options?: RequestOptions) => Promise<SystemOneResult<Q>>;
};

export function getJevRuntime(): JevRuntime {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) {
    return {
      demo: true,
      model: "jev-mock",
      systemOne: mockSystemOne,
    };
  }
  const client = new TypeSafeClient({ apiKey, timeout: 60_000 });
  return {
    demo: false,
    model: client.defaultModel,
    systemOne: (request, options) => client.systemOne(request, options),
  };
}

export function isDemoMode(): boolean {
  return !process.env.TYPESAFE_API_KEY?.trim();
}
