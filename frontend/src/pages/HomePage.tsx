/** Home (Fase 1: esqueleto). El buscador funcional se implementa en las Fases 6–7. */
export function HomePage() {
  return (
    <section className="bg-gradient-to-br from-brand-700 to-brand-500 text-white">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <h1 className="max-w-2xl text-4xl font-bold leading-tight md:text-5xl">
          Alquila el auto ideal para tu próximo viaje
        </h1>
        <p className="mt-4 max-w-xl text-lg text-brand-100">
          Compara modelos, agencias y precios en un solo lugar. Recoge en el aeropuerto o en la ciudad.
        </p>
        <div className="mt-10 rounded-2xl bg-white p-6 text-slate-500 shadow-xl">
          El buscador estará disponible próximamente.
        </div>
      </div>
    </section>
  )
}
