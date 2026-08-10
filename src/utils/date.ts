// Data "hoje" no fuso local do navegador, no formato YYYY-MM-DD.
// new Date().toISOString() serializa em UTC e pode adiantar/atrasar o dia
// em relação ao horário local do usuário (ex: 23:xx em São Paulo já é o dia
// seguinte em UTC) — usar os getters locais evita esse desalinhamento.
export function getLocalTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Data N dias atrás (ou à frente, com N negativo) no fuso local, YYYY-MM-DD.
export function daysAgoLocalIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
