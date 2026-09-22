/** Las claves de escenario ya vienen "A_...", "B_...", etc. — el código de
 * una letra es un hecho del dominio (el artículo los llama A-F), no una
 * convención decorativa inventada para la interfaz. */
export function scenarioCode(key: string): string {
  const prefix = key.split("_")[0];
  return prefix.length === 1 ? prefix : "Base";
}
