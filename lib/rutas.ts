/**
 * Rutas internas de la app, en un solo lugar para que el menú, las pestañas de un
 * camino y la ficha del peregrino apunten siempre al mismo sitio.
 *
 * El parámetro `camino` en la ficha de un peregrino guarda "desde qué camino llegué":
 * así el enlace de volver regresa a los peregrinos de ese camino y no a la lista general.
 */
export const rutaCamino = (departureId: string, tab?: string) =>
  tab ? `/caminos/${departureId}?tab=${tab}` : `/caminos/${departureId}`;

export const rutaPeregrinosDeCamino = (departureId: string) => rutaCamino(departureId, "peregrinos");

export const rutaPeregrino = (pilgrimId: string, departureId?: string | null) =>
  departureId ? `/peregrinos/${pilgrimId}?camino=${departureId}` : `/peregrinos/${pilgrimId}`;
