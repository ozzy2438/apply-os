const handler = async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:3000";
  const response = await fetch(`${base}/api/briefing/refresh`);
  const body = await response.text();
  return new Response(body, { status: response.status });
};

export default handler;

export const config = {
  schedule: "0 21 * * *",
};
