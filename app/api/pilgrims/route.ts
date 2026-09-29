import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizarCelular } from "@/lib/telefono";

export async function POST(request: Request) {
  const body = await request.json();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pilgrims")
    .insert({
      full_name: body.full_name,
      email: body.email ?? null,
      phone: normalizarCelular(body.phone),
      country: body.country ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
