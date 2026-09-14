/**
 * Los nombres de pasaporte que ya están cargados, pasados por el armador. Comprueba que
 * cada uno quede "Nombre Apellido" y que la lista ordene alfabéticamente por el nombre.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/probar-nombres.ts
 *
 * No toca la base: son los casos reales copiados a mano.
 */
import { armarNombreCompleto, nombreDesdeMrz, tituloDeNombre, compararNombres } from "@/lib/passport/nombres";

let fallos = 0;
const check = (ok: boolean, m: string) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${m}`);
  if (!ok) fallos++;
};

// Los 10 peregrinos que hoy tienen datos de pasaporte, tal como están guardados.
const CASOS: { full_name: string; mrz: string | null; espera: string }[] = [
  { full_name: "CALLE BUSTAMANTE ELCY LICET", mrz: "P<COLCALLE<BUSTAMANTE<<ELCY<LICET<<<<<<<<<<<<<<BG938099<9COL7712289F3508264CC43838301<<<<48", espera: "Elcy Licet Calle Bustamante" },
  { full_name: "DIANA ISABEL TOBON MONSALVE", mrz: "P<COLTOBON<MONSALVE<<DIANA<ISABEL<<<<<<<<<<BC995744<7COL730721F3310067CC21714986<<<66", espera: "Diana Isabel Tobon Monsalve" },
  { full_name: "EMILY ALVARADO GALEANO", mrz: "P<COLALVARADO<GALEANO<<EMILY<<<<<<<<<<<<<<<<<<<<<<\nAV691439<7COL0101044F2903172CC1010010323<<72", espera: "Emily Alvarado Galeano" },
  { full_name: "LUZ HELENA DEL SOCORRO GARCIA ECHEVERRY", mrz: "PPCOL<GARCIA<ECHEVERRY<<LUZ<HELENA<DEL<SOCORRO DA175526<3COL54102271F3606252CC32521054<<<<44", espera: "Luz Helena del Socorro Garcia Echeverry" },
  { full_name: "MADRIZ DE MENDEZ, PATRICIA ELENA", mrz: "P<COLMADRIZ<DE<MENDEZ<PATRICIA<ELENA<<<<<<<<<<PE171478<7COL7004063F3107162CC2000004596<4", espera: "Patricia Elena Madriz de Mendez" },
  { full_name: "MORENO UBATE DEICY JOHANA", mrz: "P<COLMORENO<UBATE<<DEICY<JOHANA<<<<<<<<<<<<<<<<< AX553483<7COL8101198F3109063CC52855971<<<<<40", espera: "Deicy Johana Moreno Ubate" },
  { full_name: "RESENDIZ GUERRERO JOSE IVAN", mrz: "P<MEXRESENDIZ<GUERRERO<<JOSE<IVAN<<<<<<<<<<<<<<<<N01300944<2MEX830630<6M3202193<<<<<<<<<<<<<<<<08", espera: "Jose Ivan Resendiz Guerrero" },
  { full_name: "RIOS GARATE RAMIRO", mrz: "P<MEXRIOS<GARATE<<RAMIRO<<<<<<<<<<<<<<<<<<<<<<\nN11900729 2MEX810620 7M3401125<<<<<<<<<<<<<<02", espera: "Ramiro Rios Garate" },
  { full_name: "SANTIAGO BOTERO MARIN", mrz: "P<COLBOTERO<MARIN<<SANTIAGO<<<<<<<<<<<<<<<<<<<<<<AU736264<2COL8502234M2804198CC75105424<<<<24", espera: "Santiago Botero Marin" },
  // MRZ que la OCR leyó mal (falta el `<<`): no se puede partir, se deja el nombre como está.
  { full_name: "Laura Lizcano", mrz: "P<COLLIZCANOJIMENEEZ<LAURA<ANDREA<<<<<<<<<<<<BH036250<4COL9010037F3509102CC1018438343<<30", espera: "Laura Lizcano" },
];

console.log("— Nombres de pasaporte ya cargados —");
for (const c of CASOS) {
  const salida = armarNombreCompleto({ full_name: c.full_name, mrz: c.mrz });
  check(salida === c.espera, `"${c.full_name}" → "${salida}"${salida === c.espera ? "" : ` (esperábamos "${c.espera}")`}`);
}

console.log("\n— Campos separados (lo que va a mandar Claude de ahora en más) —");
check(
  armarNombreCompleto({ given_names: "MARIA FERNANDA", surnames: "GOMEZ RIVERA" }) === "Maria Fernanda Gomez Rivera",
  "nombres + apellidos se componen en ese orden"
);
check(
  armarNombreCompleto({ given_names: "JOSE", surnames: "DE LA CRUZ SANTOS" }) === "Jose de la Cruz Santos",
  "las partículas quedan en minúscula"
);
check(
  armarNombreCompleto({ given_names: "ANA-MARIA", surnames: "O'BRIEN" }) === "Ana-Maria O'Brien",
  "guiones y apóstrofes llevan su propia mayúscula"
);

console.log("\n— Lo escrito a mano no se toca —");
for (const nombre of ["Beatriz del Carmen Ibáñez Pérez", "María de Jesús Lopez Villa", "Mussatye Elorza Parra"]) {
  check(tituloDeNombre(nombre) === nombre, `"${nombre}" queda igual`);
}

console.log("\n— MRZ ilegible —");
check(nombreDesdeMrz("P<COLMADRIZ<DE<MENDEZ<PATRICIA<ELENA<<<<<<<<<<PE171478<7COL") === null, "una MRZ sin `<<` entre apellido y nombre se descarta");
check(nombreDesdeMrz(null) === null, "sin MRZ devuelve null");

console.log("\n— Orden alfabético —");
const lista = [...CASOS.map((c) => armarNombreCompleto({ full_name: c.full_name, mrz: c.mrz })), "Ángela Ruiz", "Andrea Pérez", "Ñato Gómez", "Zoe Díaz"];
const ordenada = [...lista].sort(compararNombres);
console.log(ordenada.map((n) => `     ${n}`).join("\n"));
check(ordenada.indexOf("Andrea Pérez") < ordenada.indexOf("Ángela Ruiz"), "los acentos no rompen el orden (Andrea antes que Ángela)");
check(ordenada[0].startsWith("Andrea"), "arranca por la A del nombre de pila");
check(ordenada.indexOf("Deicy Johana Moreno Ubate") < ordenada.indexOf("Elcy Licet Calle Bustamante"), "Deicy (antes en la M) ahora cae en la D, antes que Elcy");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
