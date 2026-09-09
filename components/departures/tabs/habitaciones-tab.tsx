import { getRoomingBoard } from "@/lib/actions/room-assignments";
import { RoomingBoard } from "@/components/departures/rooming-board";

export async function HabitacionesTab({ departureId }: { departureId: string }) {
  const { nights, pilgrims } = await getRoomingBoard(departureId);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Acá se arma el rooming list de toda la ruta: quién duerme en cuál habitación, noche por noche.
        Lo normal es repartir la primera noche y después usar <strong>Replicar una noche a todas</strong>,
        que copia las parejas y las reacomoda en las habitaciones de cada hotel. Si alguien no duerme
        una noche, marcalo con <strong>no duerme acá</strong> y esa noche cuenta como completa sin esa
        persona. El Excel sale con una pestaña por hotel, lista para enviar.
      </p>
      <RoomingBoard departureId={departureId} nights={nights} pilgrims={pilgrims} />
    </div>
  );
}
