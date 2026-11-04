export const PALETA_PROYECTOS = [
  "#D97757",
  "#5B5DD6",
  "#22A06B",
  "#D6517D",
  "#3A7EBF",
  "#B0842A",
  "#7A5AC4",
  "#2F9C95",
];

export function colorParaNombre(nombre: string): string {
  let hash = 0;
  for (let i = 0; i < nombre.length; i += 1) {
    hash = (hash * 31 + nombre.charCodeAt(i)) % 100000;
  }
  return PALETA_PROYECTOS[hash % PALETA_PROYECTOS.length];
}
