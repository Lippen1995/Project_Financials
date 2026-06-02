import { buildNodeMappingModel } from "@/server/services/presentation-node-service";

import MetricMappingView from "./MetricMappingView";

export const dynamic = "force-dynamic";

export default async function MetricMappingPage() {
  const model = await buildNodeMappingModel();
  return <MetricMappingView initialModel={model} />;
}
