import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBoundedParkData, updateParkData } from "../../backend/mapData/mapData";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import getParkColorByArea from "../../utils/parkColor";
import "leaflet.heat";
import metersToPixels from "../../utils/metersToPixel";

let mapView: [[number, number], number] = [[41.38, 2.17], 14];

export default function Map({
    showHeatmap,
    showParks,
}: {
    showHeatmap: boolean;
    showParks: boolean;
}) {
    const mapRef = useRef<L.Map | null>(null);
    const parksLayerRef = useRef<L.GeoJSON | null>(null);
    const heatLayerRef = useRef<L.Layer | null>(null);
    let lastUpdate = performance.now();

    useEffect(() => {
        if (mapRef.current) return;

        mapRef.current = L.map("map").setView(mapView[0], mapView[1]);
        mapRef.current.setMinZoom(13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
        }).addTo(mapRef.current);

        loadParks(showParks, showHeatmap);

        mapRef.current.on("moveend", () => {
            if (performance.now() - lastUpdate > 500) {
                lastUpdate = performance.now();
                loadParks(showParks, showHeatmap);
            }
            mapView = [[mapRef.current?.getCenter().lat!,mapRef.current?.getCenter().lng!], mapRef.current?.getZoom()!];
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [showParks, showHeatmap]);

    async function loadParks(showParks: boolean, showHeatmap: boolean) {
        if (!mapRef.current) return;
        const bounds = mapRef.current.getBounds();
        const south = bounds.getSouth();
        const west = bounds.getWest();
        const north = bounds.getNorth();
        const east = bounds.getEast();

        try {
            const latDist = north - south;
            const lonDist = east - west;
            const factor = 0;
            await updateParkData([
                north + latDist * factor,
                east + lonDist * factor,
                south - latDist * factor,
                west - lonDist * factor,
            ]);

            // let startTime = performance.now();

            let parks = getBoundedParkData(north, east, south, west);

            const geojson: FeatureCollection<Polygon, { id: number; name: string; area: number }> =
                {
                    type: "FeatureCollection",
                    features: parks.map((park) => {
                        const feature: Feature<
                            Polygon,
                            { id: number; name: string; area: number; bbox: any }
                        > = {
                            type: "Feature",
                            geometry: {
                                type: "Polygon",
                                coordinates: [park.coordinates.map(([lat, lng]) => [lng, lat])],
                            },
                            properties: {
                                id: park.id,
                                name: park.name ?? "",
                                area: park.area ?? -1,
                                bbox: park.boundingBox,
                            },
                        };
                        return feature;
                    }),
                };

            if (parksLayerRef.current) {
                mapRef.current!.removeLayer(parksLayerRef.current);
            }

            // let midTime = performance.now();
            // console.log(`process ${midTime - startTime}`);
            if (showParks) {
                parksLayerRef.current = L.geoJSON(geojson, {
                    style: (feature) => ({
                        color: "green",
                        fillColor: getParkColorByArea(feature?.properties?.area),
                        weight: 1,
                        fillOpacity: 0.5,
                    }),
                    onEachFeature: (feature, layer) => {
                        let id:string = `<strong>ID:</strong> ${feature.properties?.id}<br>`;
                        let name: string =
                            feature.properties?.name.length > 3
                                ? `<strong>Name:</strong> ${feature.properties?.name}<br>`
                                : "";
                        let area: string = `<strong>Area:</strong> ${Math.round(
                            feature.properties?.area
                        )} m²<br>`;
                        let color: string = getParkColorByArea(feature.properties?.area);
                        layer.bindPopup(id+name + area);
                    },
                }).addTo(mapRef.current);
            }

            const heatPoints: [number, number, number][] = parks.flatMap(
                (park) => [
                    [
                        park.center[0],
                        park.center[1],
                        park.area < 100 ? 0.1 : Math.pow(park.area, 0.3),
                    ],
                ]
                // park.coordinates.map(
                //     (coord) =>
                //         [
                //             coord[0],
                //             coord[1],
                //             Math.sqrt(park.area) / 10 / park.coordinates.length,
                //         ] as [number, number, number]
                // )
            );

            if ((mapRef.current as any)._heatLayer) {
                mapRef.current.removeLayer((mapRef.current as any)._heatLayer);
            }
            console.log(
                mapRef.current.getZoom(),
                (10 / Math.pow(1.5, 14)) * Math.pow(1.5, mapRef.current.getZoom())
            );
            if (showHeatmap) {
                const heat = (L as any)
                    .heatLayer(heatPoints, {
                        radius: 20 * Math.pow(1.5, mapRef.current.getZoom() - 14),
                        blur: 20 * Math.pow(1.2, mapRef.current.getZoom() - 14),
                        gradient: {
                            0.1: "#461010ff",
                            0.3: "#ff0000ff",
                            0.5: "#ff8800ff",
                            0.7: "#f6ff00ff",
                            0.9: "#8cff00ff",
                        },
                    })
                    .addTo(mapRef.current);

                (mapRef.current as any)._heatLayer = heat;
            }
            let endTime = performance.now();
            // console.log(`draw ${endTime - midTime}`);
        } catch (error) {
            console.error("Error drawing parks:", error);
        }
    }

    return (
        <div
            id="map"
            style={{ height: "100vh", width: "100vw", margin: 0, padding: 0, zIndex: "0" }}
        />
    );
}
