import React, { Suspense } from "react";

const Map = React.lazy(() => import("../../components/Map/Map"));

export default function HomePage() {
  return (
    <div style={{ height: "100vh", width: "100vw", margin: 0 }}>
      <Suspense fallback={<div>Loading map...</div>}>
        <Map />
      </Suspense>
    </div>
  );
}
