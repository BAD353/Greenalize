export default function getParkColorByArea(area: number): string {
    return "green";
    let minArea = 100;
    let maxArea = 50000;
    // let factor:number = (Math.log(area)-Math.log(minArea)) / Math.log(maxArea); //expnonential
    let factor: number = (area - minArea) / maxArea; //linear
    factor = Math.max(Math.min(factor, 1), 0); //clamp
    // return `rgba(${Math.round(1-factor)*80+10}, 180, ${Math.round(1-factor)*80}, 1)`
    return `hsla(114, ${Math.round(factor) * 50 + 50}%, 68%, 1.00)`;
    //`hsla(114, 56%, 68%, 1.00)`
}
