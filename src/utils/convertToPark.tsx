import type { OsmElement } from "../types/OSMElelement";
import type { Park } from "../types/park";
import polygonArea from "./polygonArea";

export default function convertToParkList(elements: OsmElement[]): Park[] {
    let nodeMap: Map<number, [number, number]> = new Map();
    elements.forEach((element) => {
        if (element.type == "node") {
            if (!element.lat || !element.lon) return;
            nodeMap.set(element.id, [element.lat, element.lon]);
        }
    });

    let parks: Park[] = [];
    elements.forEach((element) => {
        if (element.type == "way") {
            let coordinates: [number, number][] = [];
            let bbox: [number, number, number, number] = [-1, -1, -1, -1]; //north, east, south, west
            element.nodes?.forEach((node) => {
                let coords = nodeMap.get(node);
                if (!coords) return;
                coordinates.push(coords);
                if (bbox[0] == -1) bbox = [...coords, ...coords];
                bbox = [
                    Math.max(coords[0], bbox[0]),
                    Math.max(coords[1], bbox[1]),
                    Math.min(coords[0], bbox[2]),
                    Math.min(coords[1], bbox[3]),
                ];
            });
            let [area, centrLat, centerLon] = polygonArea(coordinates);
            parks.push({
                id: element.id,
                name: element.tags?.name,
                coordinates: coordinates,
                boundingBox: bbox,
                area: area,
                center: [centrLat,centerLon],
            });
        }
    });
    return parks;
}
