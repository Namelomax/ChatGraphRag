import {
  getActiveModels,
  getAllGatewayModels,
  getCapabilities,
  isDemo,
  isLocalProviderEnabled,
} from "@/lib/ai/models";

export async function GET() {
  const headers = {
    // Короткий TTL: после деплоя клиент должен получить актуальный список и флаги (например localCurated).
    "Cache-Control": "private, max-age=120, must-revalidate",
  };

  const curatedCapabilities = await getCapabilities();
  const models = getActiveModels();

  if (isLocalProviderEnabled) {
    return Response.json(
      {
        capabilities: curatedCapabilities,
        models,
        /** Клиентский бандл при Docker-build часто без NEXT_PUBLIC_* — список брать только отсюда, без слияния с устаревшим chatModels. */
        localCurated: true,
      },
      { headers }
    );
  }

  if (isDemo) {
    const gatewayModels = await getAllGatewayModels();
    const capabilities = Object.fromEntries(
      gatewayModels.map((m) => [
        m.id,
        curatedCapabilities[m.id] ?? m.capabilities,
      ])
    );

    return Response.json(
      {
        capabilities,
        models: gatewayModels,
        localCurated: false,
      },
      { headers }
    );
  }

  return Response.json(curatedCapabilities, { headers });
}
