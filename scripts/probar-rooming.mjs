/**
 * Pruebas de la lógica de reparto de habitaciones (lib/data/rooming.ts).
 * Es todo puro, así que no toca la base ni necesita el servidor levantado.
 *
 *   node scripts/probar-rooming.mjs
 */
import {
  expandSlots, slotKey, emptyBeds, bedsFromAssignments, assignmentsFromBeds,
  groupsFromBeds, placeGroups, fillSequentially, validateAssignments,
  sinPeregrinos, nightProgress, reconcileBeds, nightsSignature,
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

// assignmentsFromBeds con las habitaciones vigentes descarta lo que ya no existe
const viejas = { "A:1": ["p1", "p2"], "A:5": ["p9", ""], "Z:1": ["p3", ""] };
const limpias = assignmentsFromBeds(viejas, recortado);
eq(limpias.map((a) => a.pilgrim_id), ["p1", "p2"], "assignmentsFromBeds(slots) descarta la habitación recortada y la inexistente");
check(assignmentsFromBeds(viejas).length === 4, "sin slots sigue mandando todo (retrocompatible)");

// "No duerme acá"
check(
  validateAssignments([{ reservation_room_id: "A", room_index: 1, pilgrim_id: "p1" }], slots, ["p1"]) ===
    "Alguien quedó con cama y marcado como que no duerme acá",
  "rechaza cama + no duerme del mismo peregrino"
);
check(validateAssignments([{ reservation_room_id: "A", room_index: 1, pilgrim_id: "p1" }], slots, ["p2"]) === null, "el opt-out de otro no molesta");
eq(sinPeregrinos([["a", "b"], ["c"], ["d", "e"]], ["c", "d"]), [["a", "b"], ["e"]], "sinPeregrinos saca a los excluidos y tira los grupos vacíos");

// El caso del Araguaney: 15 inscritos, 13 plazas, la pareja no duerme
const araguaney = expandSlots([
  { id: "D", room_type: "doble", rooms_count: 5, capacity_per_room: 2, position: 0 },
  { id: "T", room_type: "triple", rooms_count: 1, capacity_per_room: 3, position: 1 },
]);
const trece = fillSequentially(gente.slice(0, 13), araguaney);
const progreso = nightProgress(gente, trece.beds, ["p14", "p15"]);
check(progreso.completa, "13 con cama + 2 que no duermen = noche completa");
check(progreso.asignados.size === 13, "cuenta 13 asignados");
eq(nightProgress(gente, trece.beds, []).sinHabitacion, ["p14", "p15"], "sin el opt-out faltan los dos");
check(!nightProgress(gente, trece.beds, []).completa, "y la noche no está completa");
check(!nightProgress([], {}, []).completa, "sin inscritos nunca está completa");

// reconcileBeds: alguien editó la reserva mientras el tablero estaba abierto
const antes = fillSequentially(gente, slots).beds; // 5 dobles + 1 cuádruple + 1 doble, 15 personas
// (a) Se agregó una fila nueva: nadie se mueve
const conNueva = expandSlots([...rooms, { id: "N", room_type: "doble", rooms_count: 1, capacity_per_room: 2, position: 3 }]);
const r1 = reconcileBeds(antes, conNueva);
check(!r1.cambio && r1.sinCupo.length === 0, "fila agregada: nadie se mueve y no se marca cambio");
check(Object.keys(r1.beds).length === 8 && r1.beds["N:1"].every((x) => x === ""), "la habitación nueva aparece vacía");
// (b) Se recortaron las dobles de 5 a 4: la pareja de la doble 5 se reacomoda junta en lo libre
const recortadas = expandSlots([{ ...rooms[0], rooms_count: 4 }, rooms[1], rooms[2], { id: "N", room_type: "doble", rooms_count: 1, capacity_per_room: 2, position: 3 }]);
const r2 = reconcileBeds(antes, recortadas);
const parejaVieja = antes["A:5"].filter(Boolean);
check(r2.cambio && r2.sinCupo.length === 0, "fila recortada: hay cambio y todos entran");
eq(r2.beds["N:1"].filter(Boolean), parejaVieja, "la pareja desplazada sigue junta en la doble libre");
check(Object.values(r2.beds).flat().filter(Boolean).length === 15, "siguen los 15");
// (c) Cambió el tipo: la fila B pasó a ser doble → el grupo de 4 no cabe en ningún lado
const cambioTipo = expandSlots([rooms[0], { ...rooms[1], room_type: "doble", capacity_per_room: 2 }, rooms[2]]);
const r3 = reconcileBeds(antes, cambioTipo);
check(r3.sinCupo.length === 4, `cambio de tipo: el grupo de 4 queda sin cupo (dio ${r3.sinCupo.length})`);
// (d) Nada cambió
check(!reconcileBeds(antes, slots).cambio, "sin cambios en la reserva no se marca cambio");

// nightsSignature es estable ante el orden
const n1 = { id: "x", slots, assignments: [{ reservation_room_id: "A", room_index: 1, pilgrim_id: "p1" }, { reservation_room_id: "A", room_index: 2, pilgrim_id: "p2" }], optOuts: ["p9", "p8"] };
const n2 = { ...n1, assignments: [...n1.assignments].reverse(), optOuts: ["p8", "p9"] };
check(nightsSignature([n1]) === nightsSignature([n2]), "la firma no depende del orden");
check(nightsSignature([n1]) !== nightsSignature([{ ...n1, optOuts: ["p8"] }]), "la firma cambia si cambia un opt-out");
check(nightsSignature([n1]) !== nightsSignature([{ ...n1, slots: conNueva }]), "la firma cambia si cambian las habitaciones");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
