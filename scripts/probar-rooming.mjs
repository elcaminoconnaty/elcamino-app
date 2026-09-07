/**
 * Pruebas de la lógica de reparto de habitaciones (lib/data/rooming.ts).
 * Es todo puro, así que no toca la base ni necesita el servidor levantado.
 *
 *   node scripts/probar-rooming.mjs
 */
import {
  expandSlots, slotKey, emptyBeds, bedsFromAssignments, assignmentsFromBeds,
  groupsFromBeds, placeGroups, fillSequentially, validateAssignments,
} from "../lib/data/rooming.ts";

let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "✓" : "✗"} ${m}`); if (!ok) fallos++; };
const eq = (a, b, m) => check(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? "" : ` — dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)}`}`);

// El caso real de Portomarín: 5 dobles + 1 cuádruple + 1 doble
const rooms = [
  { id: "A", room_type: "doble", rooms_count: 5, capacity_per_room: 2, position: 0 },
  { id: "B", room_type: "cuadruple", rooms_count: 1, capacity_per_room: 4, position: 1 },
  { id: "C", room_type: "doble", rooms_count: 1, capacity_per_room: 2, position: 2 },
];
const slots = expandSlots(rooms);
check(slots.length === 7, `expandSlots: 7 habitaciones físicas de 3 filas (dio ${slots.length})`);
check(slots.filter((s) => s.reservation_room_id === "A").map((s) => s.room_index).join() === "1,2,3,4,5", "room_index va de 1 a rooms_count");
check(slots.reduce((n, s) => n + s.capacity, 0) === 16, "16 plazas en total");

// Una fila con rooms_count 0 no genera habitaciones
check(expandSlots([{ id: "X", room_type: "doble", rooms_count: 0, capacity_per_room: 2, position: 0 }]).length === 0, "rooms_count 0 no genera habitaciones");

// Ida y vuelta camas ↔ asignaciones
const gente = ["p1","p2","p3","p4","p5","p6","p7","p8","p9","p10","p11","p12","p13","p14","p15"];
const lleno = fillSequentially(gente, slots);
check(lleno.sinCupo.length === 0, `fillSequentially acomoda a los 15 (sobraron ${lleno.sinCupo.length})`);
check(assignmentsFromBeds(lleno.beds).length === 15, "15 asignaciones generadas");
const ida = assignmentsFromBeds(lleno.beds);
eq(bedsFromAssignments(slots, ida), lleno.beds, "camas → asignaciones → camas da lo mismo");

// La cuádruple se llena primero, que es lo que hace fillSequentially
check(lleno.beds[slotKey({ reservation_room_id: "B", room_index: 1 })].filter(Boolean).length === 4, "la cuádruple queda con 4");

// Con más gente que plazas, lo que sobra se reporta
const desborde = fillSequentially([...gente, "p16", "p17"], slots);
check(desborde.sinCupo.length === 1, `17 personas en 16 plazas deja 1 sin cupo (dio ${desborde.sinCupo.length})`);

// placeGroups: los grupos grandes toman la habitación más ajustada
const grupos = [["a","b"], ["c","d","e","f"], ["g"], ["h","i"]];
const puestos = placeGroups(grupos, slots);
check(puestos.sinCupo.length === 0, "placeGroups acomoda los 4 grupos");
const cuadruple = puestos.beds[slotKey({ reservation_room_id: "B", room_index: 1 })].filter(Boolean);
eq(cuadruple, ["c","d","e","f"], "el grupo de 4 va a la cuádruple");
const solo = Object.entries(puestos.beds).find(([, arr]) => arr.includes("g"));
check(solo[1].filter(Boolean).length === 1, "el que va solo no arrastra a nadie más");
check(groupsFromBeds(puestos.beds).length === 4, "groupsFromBeds recupera los 4 grupos");

// Un trío no cabe en un hotel de puras dobles
const soloDobles = expandSlots([{ id: "D", room_type: "doble", rooms_count: 2, capacity_per_room: 2, position: 0 }]);
const apretado = placeGroups([["x","y","z"], ["w"]], soloDobles);
eq(apretado.sinCupo, ["x","y","z"], "un trío no entra en una doble y se reporta entero");
check(Object.values(apretado.beds).flat().filter(Boolean).length === 1, "el resto sí se acomoda");

// Validación
check(validateAssignments(ida, slots) === null, "una distribución sana pasa la validación");
check(
  validateAssignments([{ reservation_room_id: "Z", room_index: 1, pilgrim_id: "p1" }], slots) ===
    "Hay una habitación que ya no existe en esta reserva",
  "rechaza una habitación inexistente"
);
check(
  validateAssignments([
    { reservation_room_id: "A", room_index: 1, pilgrim_id: "p1" },
    { reservation_room_id: "A", room_index: 2, pilgrim_id: "p1" },
  ], slots) === "Un peregrino quedó en dos habitaciones de la misma noche",
  "rechaza al mismo peregrino en dos camas"
);
check(
  (validateAssignments([
    { reservation_room_id: "A", room_index: 1, pilgrim_id: "p1" },
    { reservation_room_id: "A", room_index: 1, pilgrim_id: "p2" },
    { reservation_room_id: "A", room_index: 1, pilgrim_id: "p3" },
  ], slots) ?? "").includes("más gente que plazas"),
  "rechaza tres personas en una doble"
);
check(validateAssignments([], slots) === null, "vaciar una noche es válido");

// Asignación huérfana: se recortó rooms_count y quedó gente en la habitación 5
const recortado = expandSlots([{ id: "A", room_type: "doble", rooms_count: 2, capacity_per_room: 2, position: 0 }]);
const camas = bedsFromAssignments(recortado, [
  { reservation_room_id: "A", room_index: 1, pilgrim_id: "p1" },
  { reservation_room_id: "A", room_index: 5, pilgrim_id: "p9" },
]);
check(Object.values(camas).flat().filter(Boolean).join() === "p1", "la asignación huérfana se ignora al pintar, no rompe");
check(Object.keys(emptyBeds(recortado)).length === 2, "emptyBeds respeta el recorte");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
