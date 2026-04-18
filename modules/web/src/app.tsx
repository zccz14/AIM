import { getHealthErrorMessage } from "./features/health/queries.js";
import { useHealthQuery } from "./features/health/use-health-query.js";

export const App = () => {
  const healthQuery = useHealthQuery();
  let healthContent = null;

  if (healthQuery.isPending) {
    healthContent = <p>Loading health status…</p>;
  } else if (healthQuery.isError) {
    healthContent = <p>{getHealthErrorMessage(healthQuery.error)}</p>;
  } else if (healthQuery.isSuccess) {
    healthContent = <p>API health: {healthQuery.data.status}</p>;
  }

  return (
    <main>
      <h1>CZ-Stack Web</h1>
      <p>Contract-driven health check</p>
      {healthContent}
    </main>
  );
};
