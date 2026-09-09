/**
 * Pruebas de la lógica de elección de menú (lib/data/menus.ts).
 * Es todo puro, así que no toca la base ni necesita el servidor levantado.
 *
 *   node scripts/probar-menus.mjs
 */
import {
  menuFromRows, courseTitle, menuIsEmpty, emptyGrid, gridFromChoices, choicesFromGrid,
  reconcileGrid, menuSignature, validateChoices, dinnerProgress, countByOption, copyMenu,
} from "../lib/data/menus.ts";

let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "✓" : "✗"} ${m}`); if (!ok) fallos++; };
const eq = (a, b, m) => check(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? "" : ` — dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)}`}`);

// El menú de Casa Camiño: entrada, fuerte, postre y bebida (la bebida no es obligatoria)
const courses = menuFromRows(
  [
    { id: "cB", reservation_id: "R", course: "bebida", label: null, position: 3, required: false },
    { id: "cE", reservation_id: "R", course: "entrada", label: null, position: 0, required: true },
    { id: "cF", reservation_id: "R", course: "fuerte", label: "Principal", position: 1, required: true },
    { id: "cP", reservation_id: "R", course: "postre", label: null, position: 2, required: true },
  ],
  [
    { id: "oE1", course_id: "cE", name: "Caldo gallego", position: 0 },
    { id: "oE2", course_id: "cE", name: "Ensalada", position: 1 },
    { id: "oF2", course_id: "cF", name: "Merluza", position: 1 },
    { id: "oF1", course_id: "cF", name: "Pulpo", position: 0 },
    { id: "oP1", course_id: "cP", name: "Tarta de Santiago", position: 0 },
    { id: "oB1", course_id: "cB", name: "Agua", position: 0 },
    { id: "oB2", course_id: "cB", name: "Vino", position: 1 },
  ]
);
eq(courses.map((c) => c.id), ["cE", "cF", "cP", "cB"], "menuFromRows ordena las secciones por posición");
eq(courses[1].options.map((o) => o.name), ["Pulpo", "Merluza"], "y los platos por posición");
check(courseTitle(courses[0]) === "Entrada" && courseTitle(courses[1]) === "Principal", "courseTitle usa el rótulo propio si lo hay");
check(!menuIsEmpty(courses) && menuIsEmpty([]) && menuIsEmpty([{ ...courses[0], options: [] }]), "menuIsEmpty");

const gente = ["p1", "p2", "p3"];
const vacia = emptyGrid(gente, courses);
check(Object.keys(vacia).length === 3 && Object.keys(vacia.p1).length === 4 && vacia.p1.cE === "", "emptyGrid: 3 personas × 4 secciones vacías");

// Ida y vuelta grilla ↔ elecciones
const guardadas = [
  { pilgrim_id: "p1", course_id: "cE", option_id: "oE1" },
  { pilgrim_id: "p1", course_id: "cF", option_id: "oF1" },
  { pilgrim_id: "p1", course_id: "cP", option_id: "oP1" },
  { pilgrim_id: "p2", course_id: "cF", option_id: "oF2" },
  { pilgrim_id: "p9", course_id: "cF", option_id: "oF2" },   // no está inscrito
  { pilgrim_id: "p3", course_id: "cF", option_id: "oZZ" },   // plato borrado
  { pilgrim_id: "p3", course_id: "cX", option_id: "oF1" },   // sección borrada
];
const grid = gridFromChoices(gente, courses, guardadas);
check(grid.p1.cE === "oE1" && grid.p2.cF === "oF2", "gridFromChoices acomoda lo válido");
check(!grid.p9 && grid.p3.cF === "" && !("cX" in grid.p3), "e ignora al no inscrito, el plato borrado y la sección borrada");
eq(choicesFromGrid(grid, courses).length, 4, "choicesFromGrid devuelve solo las 4 válidas");
eq(gridFromChoices(gente, courses, choicesFromGrid(grid, courses)), grid, "grilla → elecciones → grilla da lo mismo");

// Validación
check(validateChoices(choicesFromGrid(grid, courses), courses) === null, "un conjunto sano pasa");
check(validateChoices([{ pilgrim_id: "p1", course_id: "cX", option_id: "oF1" }], courses) === "Hay una sección que ya no está en el menú", "rechaza sección inexistente");
check(validateChoices([{ pilgrim_id: "p1", course_id: "cF", option_id: "oE1" }], courses) === "Hay un plato que ya no está en el menú", "rechaza un plato de otra sección");
check(
  validateChoices([{ pilgrim_id: "p1", course_id: "cF", option_id: "oF1" }, { pilgrim_id: "p1", course_id: "cF", option_id: "oF2" }], courses) ===
    "Un peregrino quedó con dos platos en la misma sección",
  "rechaza dos platos en la misma sección"
);
check(validateChoices([{ pilgrim_id: "p1", course_id: "cF", option_id: "oF1" }], courses, ["p1"]) === "Alguien eligió menú y a la vez está marcado como que no cena", "rechaza elección + no cena");
check(validateChoices([], courses) === null, "vaciar es válido");

// Progreso: p1 completo (bebida no cuenta), p2 le falta, p3 no cena
const prog = dinnerProgress(gente, grid, courses, ["p3"]);
eq(prog.completos, ["p1"], "p1 está completo sin elegir bebida (no es obligatoria)");
eq(prog.pendientes, ["p2"], "p2 está pendiente");
eq(prog.noCenan, ["p3"], "p3 no cena");
check(!prog.completa, "la cena no está completa");
const grid2 = { ...grid, p2: { ...grid.p2, cE: "oE2", cP: "oP1" } };
check(dinnerProgress(gente, grid2, courses, ["p3"]).completa, "con p2 completo y p3 sin cenar, la cena está completa");
check(!dinnerProgress(gente, grid2, [], []).completa, "sin menú nunca está completa");
check(!dinnerProgress([], {}, courses, []).completa, "sin inscritos nunca está completa");

// Conteo por plato para el restaurante
const conteo = countByOption(grid2, courses, ["p3"]);
eq(conteo.map((x) => `${x.option.name}=${x.n}`), ["Caldo gallego=1", "Ensalada=1", "Pulpo=1", "Merluza=1", "Tarta de Santiago=2"], "countByOption en el orden del menú");
const grid3 = { ...grid2, p3: { cE: "oE1", cF: "oF1", cP: "", cB: "" } };
check(countByOption(grid3, courses, ["p3"]).find((x) => x.option.id === "oE1").n === 1, "quien no cena no se cuenta aunque tenga algo en la grilla");

// El menú cambió: se borró la merluza
const sinMerluza = courses.map((c) => (c.id === "cF" ? { ...c, options: c.options.filter((o) => o.id !== "oF2") } : c));
const r = reconcileGrid(grid2, gente, sinMerluza);
check(r.perdidas === 1 && r.grid.p2.cF === "" && r.grid.p1.cF === "oF1", "reconcileGrid conserva lo que sigue y cuenta lo perdido");
check(reconcileGrid(grid2, gente, courses).perdidas === 0, "sin cambios no se pierde nada");

// Copiar el menú a otra reserva: sin ids
const copia = copyMenu(courses);
check(copia.length === 4 && copia.every((c) => !("id" in c) && c.options.every((o) => !("id" in o))), "copyMenu quita los ids");
check(copia[1].label === "Principal" && copia[3].required === false, "y conserva rótulos y obligatoriedad");

// Firma estable
const d1 = { id: "R", courses, choices: guardadas.slice(0, 2), optOuts: ["p3", "p2"] };
const d2 = { ...d1, choices: [...d1.choices].reverse(), optOuts: ["p2", "p3"] };
check(menuSignature([d1]) === menuSignature([d2]), "la firma no depende del orden");
check(menuSignature([d1]) !== menuSignature([{ ...d1, courses: sinMerluza }]), "la firma cambia si cambia el menú");
check(menuSignature([d1]) !== menuSignature([{ ...d1, optOuts: ["p3"] }]), "la firma cambia si cambia un opt-out");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
