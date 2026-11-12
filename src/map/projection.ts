const radians = Math.PI / 180;
const radius = 1737400;

export function polar(lat: number, lon: number) {
  const distance = 2 * radius * Math.tan(Math.PI / 4 + lat * radians / 2);
  return [distance * Math.sin(lon * radians), -distance * Math.cos(lon * radians)];
}

export function globe(lat: number, lon: number, rotation: number) {
  const latitude = lat * radians;
  const longitude = (lon - rotation) * radians;
  const tilt = -55 * radians;
  const x = Math.cos(latitude) * Math.sin(longitude);
  const y = Math.sin(latitude);
  const z = Math.cos(latitude) * Math.cos(longitude);
  return { x: x * 170, y: -(y * Math.cos(tilt) - z * Math.sin(tilt)) * 170,
    visible: y * Math.sin(tilt) + z * Math.cos(tilt) > 0 };
}
