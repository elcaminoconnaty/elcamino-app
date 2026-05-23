export type RoomType = "individual" | "doble" | "triple" | "cuadruple" | "quintuple" | "grupal" | "otro";

export type RoomInput = {
  room_type: RoomType;
  rooms_count: number;
  capacity_per_room: number;
  price_per_room_eur: number;
  includes_breakfast: boolean;
  breakfast_per_person_eur: number;
  includes_dinner: boolean;
  dinner_per_person_eur: number;
  extra_per_person_eur: number;
  notes?: string | null;
};

export const ROOM_TYPE_DEFAULTS: Record<RoomType, number> = {
  individual: 1,
  doble: 2,
  triple: 3,
  cuadruple: 4,
  quintuple: 5,
  grupal: 20,
  otro: 1,
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  individual: "Individual",
  doble: "Doble",
  triple: "Triple",
  cuadruple: "Cuádruple",
  quintuple: "Quíntuple",
  grupal: "Grupal (1 habitación todo el grupo)",
  otro: "Otro",
};
