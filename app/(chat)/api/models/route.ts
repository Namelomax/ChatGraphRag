import {
  getAllGatewayModels,
  getCapabilities,
  getActiveModels,
  isDemo,
  isLocalProviderEnabled,
} from "@/lib/ai/models";

export async function GET() {
  const headers = {
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
  };

  const curatedCapabilities = await getCapabilities();
  const models = getActiveModels();

  if (isLocalProviderEnabled) {
    return Response.json({ capabilities: curatedCapabilities, models }, { headers });
  }

  if (isDemo) {
    const gatewayModels = await getAllGatewayModels();
    const capabilities = Object.fromEntries(
      gatewayModels.map((m) => [m.id, curatedCapabilities[m.id] ?? m.capabilities])
    );

    return Response.json({ capabilities, models: gatewayModels }, { headers });
  }

  return Response.json(curatedCapabilities, { headers });
}
