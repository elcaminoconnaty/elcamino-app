/**
 * Pruebas de la lógica de elección de menú (lib/data/menus.ts).
 * Es todo puro, así que no toca la base ni necesita el servidor levantado.
 *
 *   node scripts/probar-menus.mjs
 */
import {
  menuFromRows, courseTitle, menuIsEmpty, emptyGrid, gridFromChoices, choicesFromGrid,
  reconcileGrid, menuSignature, validateChoices, dinnerProgress, countByOption, copyMenu,
  menuNeedsChoice, courseApplies, requiredCoursesFor, applyChoice, fixedDishes, dependentsOf,
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

// ── Modos y condicionales: O Pedrouzo ────────────────────────────────────────
// Menú (elige): Pizza | Menú completo. Primero y Segundo solo si eligió Menú completo.
// Sabor de pizza: se elige en el restaurante, solo si eligió Pizza. Postre fijo.
const ped = menuFromRows(
  [
    { id: "cM", reservation_id: "R2", course: "otro", label: "Menú", position: 0, required: true, mode: "peregrino" },
    { id: "c1", reservation_id: "R2", course: "entrada", label: "Primero", position: 1, required: true, mode: "peregrino", depends_on_option_id: "oMC" },
    { id: "c2", reservation_id: "R2", course: "fuerte", label: "Segundo", position: 2, required: true, mode: "peregrino", depends_on_option_id: "oMC" },
    { id: "cS", reservation_id: "R2", course: "otro", label: "Sabor de pizza", position: 3, required: false, mode: "en_sitio", depends_on_option_id: "oMP" },
    { id: "cD", reservation_id: "R2", course: "postre", label: null, position: 4, required: false, mode: "fijo" },
  ],
  [
    { id: "oMP", course_id: "cM", name: "Pizza 32cm", position: 0 },
    { id: "oMC", course_id: "cM", name: "Menú completo", position: 1 },
    { id: "o11", course_id: "c1", name: "Ensalada mixta", position: 0 },
    { id: "o12", course_id: "c1", name: "Carbonara", position: 1 },
    { id: "o21", course_id: "c2", name: "Codillo", position: 0 },
    { id: "o22", course_id: "c2", name: "Merluza", position: 1 },
    { id: "oD", course_id: "cD", name: "Helado o natillas", position: 0 },
  ]
);
check(ped[0].mode === "peregrino" && ped[3].mode === "en_sitio" && ped[4].mode === "fijo", "menuFromRows lee el modo");
check(menuNeedsChoice(ped) && !menuNeedsChoice([ped[4]]) && !menuIsEmpty([ped[3]]), "menuNeedsChoice / una sección en el restaurante cuenta como menú cargado");
check(!courseApplies(ped[1], {}, ped) && courseApplies(ped[1], { cM: "oMC" }, ped) && !courseApplies(ped[1], { cM: "oMP" }, ped), "courseApplies según lo elegido en la sección padre");
check(courseApplies(ped[0], {}, ped), "una sección sin dependencia siempre aplica");
eq(requiredCoursesFor(ped, {}).map((c) => c.id), ["cM"], "sin elegir menú, solo el menú es obligatorio");
eq(requiredCoursesFor(ped, { cM: "oMC" }).map((c) => c.id), ["cM", "c1", "c2"], "con menú completo, primero y segundo son obligatorios");
eq(requiredCoursesFor(ped, { cM: "oMP" }).map((c) => c.id), ["cM"], "con pizza no hay más que elegir (el sabor va en el restaurante)");
eq(fixedDishes(ped).map((x) => x.option.name), ["Helado o natillas"], "fixedDishes");
eq(dependentsOf(ped[0], ped).map((c) => c.id), ["c1", "c2", "cS"], "dependentsOf");

const filaPed = applyChoice(applyChoice({ cM: "oMC" }, "c1", "o11", ped), "c2", "o21", ped);
eq(filaPed, { cM: "oMC", c1: "o11", c2: "o21" }, "applyChoice acumula");
eq(applyChoice(filaPed, "cM", "oMP", ped), { cM: "oMP", c1: "", c2: "" }, "cambiar a pizza vacía primero y segundo");

const gPed = { p1: { ...filaPed, cS: "", cD: "" }, p2: { cM: "oMP", c1: "o12", c2: "", cS: "", cD: "" }, p3: { cM: "", c1: "", c2: "", cS: "", cD: "" } };
const chPed = choicesFromGrid(gPed, ped);
eq(chPed.map((c) => `${c.pilgrim_id}:${c.course_id}`), ["p1:cM", "p1:c1", "p1:c2", "p2:cM"], "choicesFromGrid descarta lo que no aplica (p2 eligió pizza) y lo fijo");
const progPed = dinnerProgress(["p1", "p2", "p3"], gPed, ped, []);
eq(progPed.completos, ["p1", "p2"], "p1 (menú completo con dos platos) y p2 (pizza) están completos");
eq(progPed.pendientes, ["p3"], "p3 no eligió nada");
const cPed = countByOption(gPed, ped, []);
eq(cPed.map((x) => `${x.option.name}=${x.n}${x.todos ? "*" : ""}`), ["Pizza 32cm=1", "Menú completo=1", "Ensalada mixta=1", "Codillo=1", "Helado o natillas=3*"], "countByOption: el postre fijo va para los 3 y la ensalada de p2 (pizza) no cuenta");
check(validateChoices([{ pilgrim_id: "p1", course_id: "cD", option_id: "oD" }], ped) === "Hay una elección en una sección que no elige el peregrino", "validateChoices rechaza elegir en una sección fija");
check(validateChoices([{ pilgrim_id: "p1", course_id: "c1", option_id: "o11" }], ped)?.includes("no aplica"), "validateChoices rechaza un primero sin menú completo");
check(validateChoices([{ pilgrim_id: "p1", course_id: "cM", option_id: "oMC" }, { pilgrim_id: "p1", course_id: "c1", option_id: "o11" }], ped) === null, "y acepta el primero con menú completo");
const soloFijo = dinnerProgress(["p1", "p2"], emptyGrid(["p1", "p2"], [ped[4]]), [ped[4]], ["p2"]);
check(soloFijo.completa && soloFijo.completos.length === 1 && !soloFijo.hayQueElegir, "un menú todo fijo está completo sin que nadie elija");
const copiaPed = copyMenu(ped);
eq(copiaPed[1].depends_on, { course_index: 0, option_index: 1 }, "copyMenu traduce la dependencia a índices");
eq(copiaPed[3].mode, "en_sitio", "y conserva el modo");
check(menuSignature([{ id: "R2", courses: ped, choices: [] }]) !== menuSignature([{ id: "R2", courses: ped.map((c) => (c.id === "cD" ? { ...c, mode: "peregrino" } : c)), choices: [] }]), "la firma cambia si cambia un modo");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
