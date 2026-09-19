import { TypeSafeClient, type Questions, type SystemOneRequest, type SystemOneResult } from "@typesafe-ai/sdk";
import { mockSystemOne } from "./mock";

export type JevRuntime = {
  demo: boolean;
  model: string;
  systemOne: <Q extends Questions>(request: SystemOneRequest<Q>) => Promise<SystemOneResult<Q>>;
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
    systemOne: (request) => client.systemOne(request),
  };
}

export function isDemoMode(): boolean {
  return !process.env.TYPESAFE_API_KEY?.trim();
}
