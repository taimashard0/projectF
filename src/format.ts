export const percent = (value?: number) => value == null ? "Unavailable" : `${value.toFixed(1)}%`;
export const hours = (value?: number) => value == null ? "Unavailable" : `${(Math.round(value * 2) / 2).toFixed(1)} h`;
