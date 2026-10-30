// Picture for each crop. Exact emoji exist for wheat, maize, potato, beans, sunflower and rice;
// the others use the closest widely supported one.
export const CROP_EMOJI = {
  wheat: "🌾", barley: "🌿", maize: "🌽", potato: "🥔", beans: "🫘", sugar_beet: "🍠",
  sunflower: "🌻", cotton: "☁️", alfalfa: "☘️", rice: "🍚", none: "➖",
};

export const cropEmoji = (id) => CROP_EMOJI[id] || "🌱";

export function cropLabel(t, id) {
  return `${cropEmoji(id)} ${t(`crop.${id}`)}`;
}
