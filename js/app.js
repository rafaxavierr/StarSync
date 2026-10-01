/* MULTIPERFIL - protótipo. Camadas: DB (LocalStorage) · Sensores (simulados) · IA (regras/histórico) · UI
   NOVAS FUNÇÕES: (1) OEE + alertas Telegram/WhatsApp · (2) Balanço de Massa Digital · (3) Eco-Eficiência (R$/balde)
   NOVO FLUXO DE MISTURADORES: lista de OPs → checklist → cronômetro → conclusão → teste de qualidade */
const K = 'multipERFIL_DB_v2'
let DB,
  U,
  V = 'dash',
  stream,
  RQ = '',
  EXP = null,
  EXPERR = '',
  scanStream = null,
  scanTimer = null,
  SEL = null,
  FT = [],
  TOUCH = 0
const ST = [
  'PEDIDO RECEBIDO',
  'OP GERADA',
  'AGUARDANDO PRODUÇÃO',
  'EM MISTURA',
  'AGUARDANDO LABORATÓRIO',
  'AGUARDANDO ENVASE',
  'EM ENVASE',
  'PRODUÇÃO CONCLUÍDA',
  'EM ESTOQUE',
  'EM EXPEDIÇÃO',
  'ENTREGUE',
  'CONCLUÍDA',
]
const PROD = [
  'Massa Drywall Premium',
  'Massa Drywall Standard',
  'Tinta Acrílica Premium',
  'Tinta Acrílica Standard',
]
const CLI = [
  'Construtora ABC',
  'Obras Norte',
  'Decor Casa',
  'Grupo Vértice',
  'Reforma Fácil',
]
const MOT = [
  'Limpeza da linha',
  'Parada da bomba',
  'Falha do equipamento',
  'Ajuste de pressão',
  'Produto fora de especificação',
  'Erro operacional',
  'Troca de produto',
  'Outro',
]
/* NOVO: motivos de parada de linha (justificativa na IHM) */
const MOT_PARADA = [
  'Troca de produto',
  'Limpeza da linha',
  'Manutenção preventiva',
  'Falha do equipamento',
  'Falta de matéria-prima',
  'Falta de embalagem (baldes)',
  'Aguardando operador',
  'Intervalo / refeição',
  'Outro',
]
/* NOVO: parâmetros padrão (editáveis em Configurações) */
const CFG0 = {
  rpmMin: 800,
  rpmMax: 1500,
  minParada: 15, // min de parada sem justificativa até disparar alerta
  tol: 2, // tolerância de perda invisível (%)
  pesoBalde: 5, // peso padrão da receita (kg/balde)
  custoKg: 4.5, // custo do produto (R$/kg)
  tarifa: 0.92, // tarifa de energia (R$/kWh)
  kwBomba: 15, // potência nominal do inversor da bomba (kW)
  kwMix: 37, // potência do motor do misturador (kW)
  vazNom: 38, // vazão nominal da bomba (L/min)
  acel: 1, // aceleração de tempo (1 = tempo real; use 60 para demonstração)
  tgToken: '',
  tgChat: '',
  waFone: '',
  waKey: '',
}
const DENS = 1.42 // densidade da massa (kg/L)
const R = (a, b) => a + Math.random() * (b - a),
  avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1),
  pick = (a) => a[Math.floor(Math.random() * a.length)]
const f = (n, d = 0) =>
  Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })
const now = () => new Date().toLocaleString('pt-BR')
const $ = (s) => document.querySelector(s)
const MENU = {
  dash: 'Dashboard',
  ped: 'Pedidos',
  ops: 'Ordens de Produção',
  mix: 'Misturadores',
  lab: 'Qualidade',
  env: 'Envase',
  bom: 'Bombas',
  oee: 'OEE / Alertas',
  bal: 'Balanço de Massa',
  ene: 'Eco-Eficiência',
  est: 'Estoque',
  exp: 'Expedição',
  rast: 'Rastreabilidade',
  ia: 'IA Industrial',
  analise: 'Análise',
  log: 'Auditoria',
  cfg: 'Configurações',
}
const ANALISE = ['bom', 'oee', 'bal', 'ene']
const ROLE = {
  admin: Object.keys(MENU),
  supervisor: [
    'dash',
    'ped',
    'ops',
    'mix',
    'lab',
    'env',
    'bom',
    'oee',
    'bal',
    'ene',
    'est',
    'exp',
    'rast',
    'ia',
    'analise',
    'log',
  ],
  pcp: ['dash', 'ped', 'ops', 'analise', 'oee', 'bal', 'rast'],
  tecnico: ['dash', 'ops', 'mix', 'ia', 'analise', 'oee', 'bal', 'rast'],
  laboratorio: ['dash', 'lab', 'ia', 'analise', 'bal', 'rast'],
  producao: ['dash', 'env', 'ia', 'analise', 'bom', 'oee', 'ene', 'rast'],
  estoque: ['dash', 'est', 'exp', 'rast'],
}
const TELA_INICIAL = {
  estoque: 'est',
  laboratorio: 'lab',
  tecnico: 'mix',
  producao: 'env',
  pcp: 'ped',
  supervisor: 'ops',
  admin: 'dash',
}
const save = () => (localStorage[K] = JSON.stringify(DB))
const log = (m) => {
  DB.historico.unshift({ t: now(), u: U ? U.nome : 'Sistema', m })
  DB.historico = DB.historico.slice(0, 200)
  save()
}
const alerta = (n, m) => {
  DB.alertasIA.unshift({ t: now(), n, m })
  DB.alertasIA = DB.alertasIA.slice(0, 40)
  save()
}
const op = (id) => DB.ordensProducao.find((o) => o.id == id)
const pb = () => DB.configuracoes.pesoBalde || 5
const nLote = () => {
  const d = new Date(),
    p = (n) => String(n).padStart(2, '0')
  return `MP-${p(d.getDate())}${p(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}-${p(DB.lseq++)}`
}
function mkOp(p, status) {
  const o = {
    id: DB.seq++,
    pedido: p.id,
    cliente: p.cliente,
    produto: p.produto,
    plan: p.qtd,
    prod: 0,
    lote: nLote(),
    mix: null,
    bomba: null,
    status,
    prio: 'Normal',
    prazo: p.entrega,
    lab: null,
    perdas: [],
    rpm: null,
    operador: null,
  }
  DB.ordensProducao.push(o)
  return o
}
function initializeDatabase(force) {
  if (!force && localStorage[K]) {
    DB = JSON.parse(localStorage[K])
    migrate()
    return
  }
  const P = [
    ['Carlos Oliveira', 'Técnico de Produção', 'Produção', 'tecnico'],
    ['Mariana Santos', 'Qualidade', 'Qualidade', 'laboratorio'],
    ['João Pereira', 'Operador de Produção', 'Produção', 'producao'],
    ['Ana Costa', 'PCP', 'PCP', 'pcp'],
    ['Rafael Almeida', 'Supervisor de Produção', 'Produção', 'supervisor'],
    ['Juliana Martins', 'Estoque / Expedição', 'Logística', 'estoque'],
    ['Administrador do Sistema', 'Administrador', 'TI', 'admin'],
  ]
  DB = {
    seq: 181,
    lseq: 1,
    usuarios: P.map((p, i) => ({
      id: i + 1,
      nome: p[0],
      cargo: p[1],
      setor: p[2],
      permissao: p[3],
      rosto: 'perfil-demo-0' + (i + 1),
    })),
    pedidos: [],
    ordensProducao: [],
    misturadores: [1, 2, 3].map((i) => ({
      id: 'MIX 0' + i,
      status: 'DISPONÍVEL',
      op: null,
      temp: 26.4,
      rpm: 0,
      carga: 0,
      t0: 0,
      kw: 0,
      kwh: 0,
    })),
    bombas: [1, 2].map((i) => ({
      id: 'Bomba 0' + i,
      status: 'DISPONÍVEL',
      rpm: 0,
      vaz: 0,
      pres: 0,
      temp: 24,
      min: 0,
      litros: 0,
      ef: 95,
      op: null,
      anom: 0,
      nAnom: 0,
      hist: [94, 95, 93, 96, 95],
      kw: 0,
      kwh: 0,
      enAlert: false,
    })),
    estoque: [],
    entregas: [],
    historico: [],
    alertasIA: [],
    hist: [],
    configuracoes: { ...CFG0 },
    mega: { sync: now(), pedidos: 24, ops: 18, pend: 0 },
  }
  PROD.forEach((pr) => {
    for (let i = 0; i < 10; i++) {
      const v = R(3600, 5400)
      DB.hist.push({
        produto: pr,
        visc: v,
        temp: R(23, 30),
        rpm: 1050 + (v - 4000) * 0.25 + R(-40, 40),
        perda: R(1.2, 3),
        vaz: R(37, 42),
      })
    }
  })
  ;[
    [45818, 'Obras Norte', PROD[2], 1800],
    [45819, 'Decor Casa', PROD[0], 2400],
    [45820, 'Reforma Fácil', PROD[3], 1500],
  ].forEach((d, i) => {
    DB.pedidos.push({
      id: d[0],
      cliente: d[1],
      produto: d[2],
      qtd: d[3],
      entrega: '03/10/2026',
      status: 'OP GERADA',
    })
    const o = mkOp(
      DB.pedidos[i],
      ['AGUARDANDO LABORATÓRIO', 'AGUARDANDO ENVASE', 'AGUARDANDO PRODUÇÃO'][i]
    )
    if (i < 2) {
      o.prod = Math.round(d[3] * 0.99)
      o.mpKg = o.prod
      o.mix = 'MIX 0' + (i + 1)
      o.operador = 'Carlos Oliveira'
    }
    if (i == 1) {
      o.jaAnalisado = true
      o.lab = {
        status: 'aprovado',
        visc: R(4300, 5000),
        dens1: 1.42,
        dens2: 1.41,
        ph: 8.1,
        temp: 25.8,
        placas: 'APROVADO',
        obs: '',
        por: 'Mariana Santos',
      }
    }
  })
  ;[
    [45821, 'Construtora ABC', PROD[0], 2000],
    [45822, pick(CLI), PROD[2], 1600],
    [45823, pick(CLI), PROD[1], 2200],
  ].forEach((d) =>
    DB.pedidos.push({
      id: d[0],
      cliente: d[1],
      produto: d[2],
      qtd: d[3],
      entrega: '05/10/2026',
      status: 'PEDIDO RECEBIDO',
    })
  )
  alerta('y', 'Lote aguardando laboratório')
  migrate()
  save()
}
/* NOVO: garante campos das novas funções (também em bancos já salvos no navegador) */
function migrate() {
  DB.avisoPed = DB.avisoPed || []
  DB.cseq = DB.cseq || 1
  DB.configuracoes = Object.assign({}, CFG0, DB.configuracoes)
  DB.oee = DB.oee || {
    tRun: 25200,
    tParada: 3000,
    vazSoma: 25200 * 38 * 0.96,
    aprov: 1150,
    retrab: 40,
  }
  DB.parada = DB.parada || {
    ativa: false,
    seg: 0,
    motivo: null,
    alertou: false,
    ini: null,
  }
  DB.paradas = DB.paradas || [
    { ini: '29/09/2026 10:12:00', min: 22, motivo: 'Troca de produto' },
    { ini: '29/09/2026 14:40:00', min: 9, motivo: 'Limpeza da linha' },
  ]
  DB.notif = DB.notif || []
  DB.balanco =
    DB.balanco ||
    [
      ['MP-250926-01', 0, 2000, 394, 12, 'Misturador 01', 0],
      ['MP-250926-02', 2, 1600, 312, 8, 'Misturador 02', 0],
      ['MP-260926-01', 1, 2200, 421, 15, 'Misturador 02', 1],
      ['MP-280926-01', 0, 2000, 397, 5, 'Misturador 01', 0],
      ['MP-290926-01', 3, 1500, 282, 10, 'Misturador 02', 2],
    ].map((s) => ({
      op: null,
      lote: s[0],
      produto: PROD[s[1]],
      entrada: s[2],
      baldes: s[3],
      saida: s[3] * 5,
      pk: s[4],
      bomba: s[5],
      nAnom: s[6],
    }))
  DB.energiaHist =
    DB.energiaHist ||
    [
      ['MP-250926-01', 0, 38, 11.2, 394],
      ['MP-250926-02', 2, 31, 9.1, 312],
      ['MP-260926-01', 1, 42, 13, 421],
      ['MP-280926-01', 0, 38.5, 11.8, 397],
      ['MP-290926-01', 3, 36, 12.7, 282],
    ].map((s) => ({
      op: null,
      lote: s[0],
      produto: PROD[s[1]],
      kwhM: s[2],
      kwhP: s[3],
      baldes: s[4],
      custo: (s[2] + s[3]) * 0.92,
    }))
  // Mantém somente duas bombas no envase e corrige bancos antigos
  // que foram salvos com os nomes Misturador 01/02/03.
  DB.bombas = (DB.bombas || []).slice(0, 2)
  DB.bombas.forEach((b, i) => {
    b.id = 'Bomba 0' + (i + 1)
    b.kw = b.kw || 0
    b.kwh = b.kwh || 0
    b.enAlert = !!b.enAlert
  })
  while (DB.bombas.length < 2) {
    DB.bombas.push({
      id: 'Bomba 0' + (DB.bombas.length + 1),
      status: 'DISPONÍVEL',
      rpm: 0,
      vaz: 0,
      pres: 0,
      temp: 24,
      min: 0,
      litros: 0,
      ef: 95,
      op: null,
      anom: 0,
      nAnom: 0,
      hist: [94, 95, 93, 96, 95],
      kw: 0,
      kwh: 0,
      enAlert: false,
    })
  }
  DB.ordensProducao.forEach((o) => {
    if (o.bomba === 'Misturador 01') o.bomba = 'Bomba 01'
    if (o.bomba === 'Misturador 02') o.bomba = 'Bomba 02'
  })
  DB.misturadores.forEach((m) => {
    m.kw = m.kw || 0
    m.kwh = m.kwh || 0
  })
  DB.ordensProducao.forEach((o) => {
    o.kwhM = o.kwhM || 0
    o.kwhP = o.kwhP || 0
    o.bLive = o.bLive || 0
  })
  save()
}
/* ---------- NOVO: OEE, PARADAS E ALERTAS (Telegram / WhatsApp) ---------- */
function linhaStatus() {
  const run = DB.bombas.some((b) => b.status === 'OPERANDO')
  const dem = DB.ordensProducao.some(
    (o) =>
      o.status === 'EM ENVASE' ||
      (o.status === 'AGUARDANDO ENVASE' && o.lab?.status === 'aprovado')
  )
  return run ? 'run' : dem ? 'stop' : 'idle'
}
function oeeCalc() {
  const O = DB.oee,
    c = DB.configuracoes
  const A = O.tRun + O.tParada > 0 ? O.tRun / (O.tRun + O.tParada) : 0
  const P = O.tRun > 0 ? Math.min(1, O.vazSoma / (O.tRun * c.vazNom)) : 0
  const tq = O.aprov + O.retrab
  const Q = tq ? O.aprov / tq : 0
  return { A, P, Q, E: A * P * Q }
}
async function enviarBot(msg) {
  const c = DB.configuracoes,
    r = []
  if (c.tgToken && c.tgChat) {
    try {
      const x = await fetch(
        `https://api.telegram.org/bot${c.tgToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: c.tgChat, text: msg }),
        }
      )
      const j = await x.json()
      r.push([
        'Telegram',
        j.ok ? 'enviado' : 'erro: ' + (j.description || x.status),
      ])
    } catch (e) {
      r.push(['Telegram', 'falha de rede'])
    }
  }
  if (c.waFone && c.waKey) {
    try {
      await fetch(
        `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(c.waFone)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(c.waKey)}`,
        { mode: 'no-cors' }
      )
      r.push(['WhatsApp', 'enviado (CallMeBot)'])
    } catch (e) {
      r.push(['WhatsApp', 'falha de rede'])
    }
  }
  if (!r.length)
    r.push(['Simulado', 'canal não configurado (modo demonstração)'])
  return r
}
function notificar(msg) {
  const n = { t: now(), msg, canais: [['…', 'enviando']] }
  DB.notif.unshift(n)
  DB.notif = DB.notif.slice(0, 30)
  alerta('r', msg)
  save()
  enviarBot(msg).then((r) => {
    n.canais = r
    save()
    if (U && V === 'oee') draw()
  })
}
function justificarParada() {
  const P = DB.parada
  if (!P.ativa) return
  P.motivo = $('#mpj').value
  log('Justificou parada de linha: ' + P.motivo)
  draw()
}
function simParada() {
  if (linhaStatus() !== 'stop')
    return alert(
      'A linha precisa estar parada (OP liberada aguardando envase ou envase pausado).'
    )
  DB.parada.seg += 960
  log('Simulou 16 min de parada de linha')
  draw()
}
function testarAlerta() {
  notificar(
    '✅ MULTIPERFIL — mensagem de teste do sistema de alertas (' + now() + ')'
  )
  draw()
}
/* ---------- NOVO: energia ---------- */
const refBalde = () => {
  const c = DB.configuracoes,
    rpm = c.vazNom / 0.0304,
    pr = 3.6 + ((rpm - 900) / 600) * 0.5,
    kw = c.kwBomba * (0.3 + 0.7 * ((rpm / 1500) * (pr / 4))),
    bph = (c.vazNom * 60 * DENS) / pb()
  return (kw * c.tarifa) / bph
}
const custoBalde = (b) => {
  const bph = (b.vaz * 60 * DENS) / pb()
  return bph > 0 ? (b.kw * DB.configuracoes.tarifa) / bph : 0
}
const custoMedio = () => {
  const h = DB.energiaHist,
    bl = h.reduce((a, x) => a + x.baldes, 0)
  return bl ? h.reduce((a, x) => a + x.custo, 0) / bl : 0
}
/* ---------- SENSORES ---------- */
function tick() {
  const c = DB.configuracoes,
    dt = 2.5 * (c.acel || 1),
    p = pb()
  DB.bombas.forEach((b) => {
    if (b.status !== 'OPERANDO') {
      b.rpm = b.vaz = b.pres = 0
      b.kw = 0
      return
    }
    const o = op(b.op),
      tgt = o.rpm || 1200
    if (!b.anom && Math.random() < 0.04) {
      b.anom = 6
      b.nAnom++
      alerta('y', b.id + ' apresenta queda de vazão e aumento de pressão')
      if (b.nAnom === 1)
        notificar(
          `⚠️ MULTIPERFIL — ${b.id} com queda de vazão e aumento de pressão (OP ${pad(o.id)}, lote ${o.lote}). Verificar equipamento.`
        )
    }
    const vt = tgt * 0.0304 * (b.anom ? 0.68 : 1),
      pt = 3.6 + ((tgt - 900) / 600) * 0.5 + (b.anom ? 1 : 0)
    b.rpm += (tgt - b.rpm) * 0.4 + R(-15, 15)
    b.vaz += (vt - b.vaz) * 0.35 + R(-0.5, 0.5)
    b.pres += (pt - b.pres) * 0.35 + R(-0.05, 0.05)
    b.temp += (28 - b.temp) * 0.05 + R(-0.2, 0.3)
    if (b.anom) b.anom--
    b.min += 2.5 / 60
    b.litros += (b.vaz * 2.5) / 60
    b.ef = Math.round(
      Math.max(60, Math.min(99, 97 - b.nAnom * 1.5 - Math.max(0, 38 - b.vaz)))
    )
    if (Math.random() < 0.15) {
      b.hist.push(b.ef)
      b.hist = b.hist.slice(-12)
    }
    /* energia (inversor de frequência simulado) + baldes contados pelo sensor óptico */
    const load = Math.min(1.2, (b.rpm / 1500) * (Math.max(b.pres, 0.1) / 4))
    b.kw = c.kwBomba * (0.3 + 0.7 * load)
    b.kwh = (b.kwh || 0) + (b.kw * dt) / 3600
    o.kwhP = (o.kwhP || 0) + (b.kw * dt) / 3600
    o.bLive = Math.min(
      Math.floor(o.prod / p),
      (o.bLive || 0) + (b.vaz * (dt / 60) * DENS) / p
    )
    if (b.min > 1) {
      const cur = custoBalde(b),
        ref = refBalde()
      if (cur > ref * 1.15 && !b.enAlert) {
        b.enAlert = true
        alerta(
          'y',
          `${b.id}: custo energético de R$ ${f(cur, 4)}/balde, ${f((cur / ref - 1) * 100, 0)}% acima do ideal`
        )
      } else if (cur < ref * 1.05) b.enAlert = false
    }
  })
  DB.misturadores.forEach((m) => {
    if (m.status === 'PRODUZINDO') {
      m.temp += (29 - m.temp) * 0.05 + R(-0.1, 0.2)
      m.rpm = Math.round(48 + R(-2, 2))
      m.kw = c.kwMix * (0.85 + R(-0.03, 0.03))
      m.kwh = (m.kwh || 0) + (m.kw * dt) / 3600
      const o = op(m.op)
      if (o) o.kwhM = (o.kwhM || 0) + (m.kw * dt) / 3600
    } else {
      m.rpm = 0
      m.kw = 0
    }
  })
  /* OEE + controle de parada de linha */
  const st = linhaStatus(),
    O = DB.oee,
    P = DB.parada,
    rod = DB.bombas.filter((b) => b.status === 'OPERANDO')
  if (st === 'run') {
    O.tRun += dt
    O.vazSoma += Math.min(avg(rod.map((b) => b.vaz)), c.vazNom) * dt
  }
  if (st === 'stop') {
    O.tParada += dt
    if (!P.ativa)
      Object.assign(P, {
        ativa: true,
        seg: 0,
        motivo: null,
        alertou: false,
        ini: now(),
      })
    P.seg += dt
    if (!P.motivo && !P.alertou && P.seg >= c.minParada * 60) {
      P.alertou = true
      const o = DB.ordensProducao.find(
        (x) => x.status === 'EM ENVASE' || x.status === 'AGUARDANDO ENVASE'
      )
      notificar(
        `⚠️ MULTIPERFIL — Linha de envase parada há ${f(P.seg / 60, 0)} min SEM justificativa na IHM${o ? ` (OP ${pad(o.id)}, lote ${o.lote})` : ''}. Acesse o sistema e aponte o motivo.`
      )
      log('Alerta automático: linha parada sem justificativa')
    }
  } else if (P.ativa) {
    DB.paradas.unshift({
      ini: P.ini,
      min: P.seg / 60,
      motivo: P.motivo || 'Sem justificativa',
    })
    DB.paradas = DB.paradas.slice(0, 30)
    P.ativa = false
    P.seg = 0
  }
  save()
  /* a tela de misturadores NÃO é redesenhada aqui: ela tem formulários e o cronômetro se atualiza sozinho */
  if (
    U &&
    ['bom', 'dash', 'oee', 'ene'].includes(V) &&
    Date.now() - TOUCH > 4000
  )
    draw()
}
setInterval(tick, 2500)
;['touchstart', 'touchmove', 'wheel', 'scroll'].forEach((ev) =>
  document.addEventListener(ev, () => (TOUCH = Date.now()), {
    passive: true,
    capture: true,
  })
)
/* ---------- IA ---------- */
function rec(o) {
  const v = o.lab?.visc || 4850,
    h = DB.hist.filter((x) => x.produto === o.produto)
  let s = h.filter((x) => Math.abs(x.visc - v) < v * 0.12)
  if (s.length < 5) s = h
  const rp = s.map((x) => x.rpm),
    m = Math.round(avg(rp)),
    c = DB.configuracoes
  return {
    rpm: m,
    min: Math.round(Math.min(...rp)),
    max: Math.round(Math.max(...rp)),
    vaz: avg(s.map((x) => x.vaz)),
    perda: avg(s.map((x) => x.perda)),
    n: s.length,
    v,
    bloq: m < c.rpmMin || m > c.rpmMax,
    lim: m > c.rpmMax ? c.rpmMax : c.rpmMin,
  }
}
function resp(q) {
  q = q.toLowerCase()
  const os = DB.ordensProducao,
    B = DB.bombas
  if (/\boee\b|efici[eê]ncia global/.test(q)) {
    const k = oeeCalc()
    return `OEE atual: ${f(k.E * 100, 1)}% — Disponibilidade ${f(k.A * 100, 1)}%, Desempenho ${f(k.P * 100, 1)}%, Qualidade ${f(k.Q * 100, 1)}%.`
  }
  if (/energia|custo|r\$|kwh/.test(q)) {
    const ref = refBalde(),
      op_ = B.filter((b) => b.status === 'OPERANDO')
    return op_.length
      ? op_
          .map(
            (b) =>
              `${b.id}: R$ ${f(custoBalde(b), 4)}/balde (ideal R$ ${f(ref, 4)})`
          )
          .join('; ') + '.'
      : `Nenhuma bomba operando. Custo energético médio histórico: R$ ${f(custoMedio(), 4)}/balde.`
  }
  if (/balan[çc]o|rendimento|invis|desperd/.test(q)) {
    const b = DB.balanco[DB.balanco.length - 1]
    if (!b) return 'Ainda não há lotes no balanço de massa.'
    const inv = b.entrada - b.saida - b.pk
    return `${b.lote}: entraram ${f(b.entrada)} kg e foram envasados ${f(b.saida)} kg (${f(b.baldes)} baldes). Perda declarada ${f(b.pk)} kg e perda invisível ${f(inv)} kg (${f((inv / b.entrada) * 100, 1)}%).`
  }
  if (/velocidade|rpm/.test(q)) {
    const o = os.find((x) => x.status === 'AGUARDANDO ENVASE' && x.lab)
    if (!o) return 'Nenhum lote liberado aguardando envase.'
    const r = rec(o)
    return `Para ${o.lote} (${o.produto}), sugiro ${f(r.rpm)} RPM (faixa ${f(r.min)}–${f(r.max)}), com base em ${r.n} lotes semelhantes.${r.bloq ? ' A sugestão está fora dos limites e foi bloqueada.' : ''}`
  }
  if (/anomal|ineficien|bomba/.test(q)) {
    const a = B.filter((b) => b.anom || b.nAnom)
    const w = [...B]
      .filter((b) => b.status === 'OPERANDO')
      .sort((x, y) => x.ef - y.ef)[0]
    return a.length
      ? `Bombas com anomalias registradas: ${a.map((b) => `${b.id} (${b.nAnom} ocorrência(s), eficiência ${b.ef}%, vazão atual ${f(b.vaz, 1)} L/min)`).join('; ')}. Possíveis causas: obstrução, variação de viscosidade ou entrada de ar — recomenda-se verificar o equipamento.`
      : w
        ? `Nenhuma anomalia ativa. Menor eficiência: ${w.id} com ${w.ef}%.`
        : 'Nenhuma bomba operando no momento.'
  }
  if (/perda/.test(q)) {
    const o = [...os].reverse().find((x) => x.perdas.length)
    return o
      ? `${o.lote}: ${f(o.perdas.reduce((a, p) => a + p.kg, 0))} kg de perda. Motivos: ${o.perdas.map((p) => p.motivo).join(', ')}.`
      : 'Ainda não há perdas registradas.'
  }
  if (/compar/.test(q)) {
    const o = [...os].reverse().find((x) => x.lab)
    if (!o) return 'Sem lote analisado.'
    const r = rec(o)
    return `${o.lote} tem viscosidade ${f(o.lab.visc)} cP. Lotes semelhantes: ${r.n}, perda média ${f(r.perda, 1)}%, RPM médio ${f(r.rpm)}.`
  }
  if (/misturador/.test(q)) {
    const l = DB.misturadores.filter((m) => m.status === 'DISPONÍVEL')
    return l.length
      ? 'Disponível(is): ' + l.map((m) => m.id).join(', ') + '.'
      : 'Nenhum misturador disponível.'
  }
  if (/parada|op /.test(q)) {
    const p = os.filter(
      (x) =>
        ['AGUARDANDO PRODUÇÃO', 'AGUARDANDO LABORATÓRIO'].includes(x.status) ||
        x.lab?.status === 'reprovado'
    )
    return p.length
      ? p
          .map(
            (x) =>
              `OP #${String(x.id).padStart(6, '0')}: ${x.lab?.status === 'reprovado' ? 'lote reprovado no laboratório' : x.status}`
          )
          .join('; ')
      : 'Nenhuma OP parada.'
  }
  if (/aprovado/.test(q)) {
    const o = [...os].reverse().find((x) => x.lab?.status === 'aprovado')
    return o
      ? `Último lote aprovado: ${o.lote} por ${o.lab.por}.`
      : 'Nenhum lote aprovado ainda.'
  }
  return 'Posso responder sobre velocidade recomendada, bombas/anomalias, perdas, comparação de lotes, misturadores, OPs paradas, último lote aprovado, OEE, balanço de massa e custo de energia.'
}
function pergunta(q) {
  q = q || $('#q').value
  if (!q) return
  window.chatLog = window.chatLog || []
  chatLog.push(['u', q], ['a', resp(q)])
  draw()
}
/* ---------- AÇÕES ---------- */
const pad = (n) => '#' + String(n).padStart(6, '0')
function gerarOP(pid) {
  const p = DB.pedidos.find((x) => x.id == pid),
    o = mkOp(p, 'AGUARDANDO PRODUÇÃO')
  p.status = 'OP GERADA'
  o.prio = $('#pr' + pid)?.value || 'Normal'
  DB.mega.ops++
  log(`Gerou OP ${pad(o.id)} (pedido #${pid})`)
  alerta('g', 'OP ' + pad(o.id) + ' gerada')
  ir('ops')
}
const unEst = (o) => o.baldes ?? Math.floor((o.envasado || o.prod || 0) / pb())

/* Código de barras Code 39 (A-Z, 0-9 e hífen), gerado em SVG sem biblioteca */
const C39 = {
  0: 'nnnwwnwnn',
  1: 'wnnwnnnnw',
  2: 'nnwwnnnnw',
  3: 'wnwwnnnnn',
  4: 'nnnwwnnnw',
  5: 'wnnwwnnnn',
  6: 'nnwwwnnnn',
  7: 'nnnwnnwnw',
  8: 'wnnwnnwnn',
  9: 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '*': 'nwnnwnwnn',
}
function barcodeSVG(txt, h = 70) {
  const s = '*' + String(txt).toUpperCase() + '*',
    n = 2,
    w = 6
  let x = 20,
    out = ''
  for (const ch of s) {
    const p = C39[ch]
    if (!p) continue
    for (let i = 0; i < 9; i++) {
      const d = p[i] === 'w' ? w : n
      if (i % 2 === 0)
        out += `<rect x="${x}" y="0" width="${d}" height="${h}" fill="#000"/>`
      x += d
    }
    x += n
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 20} ${h}" style="width:100%;max-width:480px;height:auto;background:#fff">${out}</svg>`
}
function gerarCodigo(id) {
  const o = op(id)
  if (!o.codigo) {
    o.codigo = `${o.lote}-${String(DB.cseq++).padStart(4, '0')}`
    o.codEm = new Date().toLocaleDateString('pt-BR')
    log(`Gerou código de barras ${o.codigo} (OP ${pad(id)})`)
    save()
  }
  verCodigo(id)
  draw(true)
}
function verCodigo(id) {
  const o = op(id)
  modal(
    `<h3>Código de barras · Lote ${o.lote}</h3><p>${o.produto} · ${f(unEst(o))} un</p><div class="cod">${barcodeSVG(o.codigo)}<div><b>${o.codigo}</b></div></div><div><button class="btn ok" onclick="imprimirEtiqueta(${id})">🖨 IMPRIMIR ETIQUETA</button><button class="btn gr" onclick="modal()">FECHAR</button></div>`
  )
}
function imprimirEtiqueta(id) {
  const o = op(id)
  if (!o || !o.codigo) return
  let e = $('#etiqueta')
  if (!e) {
    e = document.createElement('div')
    e.id = 'etiqueta'
    document.body.appendChild(e)
  }
  e.innerHTML = `<div class="etq"><b style="font-size:14pt">MULTIPERFIL</b><div style="font-size:11pt;margin:1mm 0"><b>${o.produto}</b></div><div style="font-size:9pt">Lote: <b>${o.lote}</b> · OP ${pad(o.id)} · Qtd: <b>${f(unEst(o))} un</b><br>Etiqueta emitida em: ${o.codEm || ''}</div><div style="margin-top:2mm">${barcodeSVG(o.codigo, 60)}</div><div style="text-align:center;font-size:9pt;letter-spacing:1px">${o.codigo}</div></div>`
  log(`Imprimiu etiqueta ${o.codigo}`)
  setTimeout(() => window.print(), 150)
}
/* ----- Expedição: leitura do código ----- */
function lerCodigo(v) {
  v = String(v || $('#cb')?.value || '')
    .trim()
    .toUpperCase()
  if (!v) return
  const o = DB.ordensProducao.find((x) => (x.codigo || '').toUpperCase() === v)
  EXP = o ? o.id : null
  EXPERR = o ? '' : v
  fecharLeitor()
  draw(true)
}
async function abrirLeitor() {
  modal(
    `<h3>Aponte a câmera para a etiqueta</h3><video id="scv" autoplay playsinline muted style="width:100%;border-radius:10px;background:#111"></video><p id="scmsg"><small>Procurando código…</small></p><button class="btn gr" onclick="fecharLeitor()">CANCELAR</button>`
  )
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })
    const v = $('#scv')
    v.srcObject = scanStream
    if (!('BarcodeDetector' in window)) {
      $('#scmsg').textContent =
        'Este navegador não lê código de barras pela câmera. Use um leitor USB/Bluetooth ou digite o código.'
      return
    }
    const det = new BarcodeDetector({
      formats: ['code_39', 'code_128', 'qr_code'],
    })
    scanTimer = setInterval(async () => {
      try {
        const r = await det.detect(v)
        if (r.length) lerCodigo(r[0].rawValue)
      } catch (e) {}
    }, 400)
  } catch (e) {
    $('#scmsg').textContent = 'Câmera indisponível — digite o código no campo.'
  }
}
function fecharLeitor() {
  clearInterval(scanTimer)
  scanStream && scanStream.getTracks().forEach((t) => t.stop())
  scanStream = null
  modal()
}
function avisoSaida(o) {
  let el = $('#saida')
  if (!el) {
    el = document.createElement('div')
    el.id = 'saida'
    el.onclick = () => el.remove()
    document.body.appendChild(el)
  }
  el.innerHTML = `<div class="aviso-box"><div class="aviso-ico">📦</div><h1>PRODUTO SAIU DO ESTOQUE!</h1><p><b>Pedido #${o.pedido}</b> · ${o.cliente}</p><p>${o.produto} · Lote <b>${o.lote}</b> · ${f(unEst(o))} un</p><p>✓ Saiu do estoque e foi para entrega</p><button class="btn ok">OK</button></div>`
}
const isGestor = () => U && ['supervisor', 'admin'].includes(U.permissao)
function ir(v) {
  if (ROLE[U.permissao].includes(v)) V = v
  draw(true)
}
function modal(h) {
  let e = $('#modal')
  if (!e) {
    e = document.createElement('div')
    e.id = 'modal'
    document.body.appendChild(e)
  }
  e.innerHTML = h ? `<div class="mbox">${h}</div>` : ''
  e.style.display = h ? 'flex' : 'none'
}
/* aviso grande de novo pedido (qualquer tela) */
function avisoPedido() {
  let el = $('#aviso')
  const q = DB.avisoPed || []
  if (!U || !q.length || !ROLE[U.permissao].includes('ped')) {
    el && el.remove()
    return
  }
  const p = DB.pedidos.find((x) => x.id == q[q.length - 1])
  if (!p) return
  if (!el) {
    el = document.createElement('div')
    el.id = 'aviso'
    el.onclick = abrirPedidos
    document.body.appendChild(el)
  }
  el.innerHTML = `<div class="aviso-box"><div class="aviso-ico">🔔</div><h1>NOVO PEDIDO RECEBIDO!</h1><p><b>Pedido #${p.id}</b> · ${p.cliente}</p><p>${p.produto} · ${f(p.qtd)} kg · entrega ${p.entrega}</p>${q.length > 1 ? `<p>+${q.length - 1} outro(s) pedido(s) aguardando</p>` : ''}<button class="btn ok">VER PEDIDOS</button></div>`
}
function abrirPedidos() {
  DB.avisoPed = []
  save()
  avisoPedido()
  ir('ped')
}
const MOT_MIX = [
  'Falha no motor / redutor',
  'Temperatura fora da faixa',
  'Falta de matéria-prima',
  'Viscosidade fora do esperado',
  'Acúmulo de material nas pás',
  'Queda de energia',
  'Intervalo / troca de operador',
  'Outro',
]
function sugMix(v, m) {
  const o = op(m.op),
    ref = o ? `OP ${pad(o.id)}, lote ${o.lote}` : ''
  const S = {
    'Falha no motor / redutor': `Desligue e bloqueie o painel (LOTO) antes de mexer. Verifique ruído, vibração, aquecimento do motor, nível de óleo do redutor e o relé térmico. Se não normalizar, acione a manutenção e avise o PCP: a ${ref} pode atrasar.`,
    'Temperatura fora da faixa': `Temperatura atual: ${f(m.temp, 1)} °C (faixa usual 26–30 °C). Se estiver alta, reduza a velocidade, confira a refrigeração da camisa e aguarde estabilizar antes de retomar. Se estiver baixa, verifique o ambiente e a água de processo.`,
    'Falta de matéria-prima': `Confira no estoque o insumo em falta e solicite reposição ao estoque/PCP. Retome só após pesar a carga completa, para não desequilibrar a formulação do lote ${o ? o.lote : ''}.`,
    'Viscosidade fora do esperado': `Colete amostra e avise a qualidade. Ajuste pequenas adições de água/aditivo conforme a receita e registre cada dose. Misture mais 5–10 min e reavalie antes de finalizar.`,
    'Acúmulo de material nas pás': `Pause com o equipamento desligado e bloqueado, raspe as pás e a parede da cuba e devolva o material ao lote. Se for recorrente, reveja o tempo de mistura e a ordem de adição.`,
    'Queda de energia': `Aguarde a energia estabilizar, verifique se o painel desarmou e religue em velocidade baixa. Mistura parada pode decantar: aumente o tempo de homogeneização antes da liberação ao laboratório.`,
    'Intervalo / troca de operador': `Registre a carga, o tempo e a temperatura atuais para o próximo operador. Se a pausa passar de 15 min, confira sedimentação antes de retomar.`,
    Outro: `Descreva a ocorrência na auditoria e avise o supervisor. Se houver risco a pessoas ou ao equipamento, mantenha a máquina desligada até a liberação.`,
  }
  return S[v]
}
/* fecha uma pausa em andamento e volta a contar o tempo */
function mxFechaPausa(m) {
  const o = op(m.op)
  if (o)
    (o.pausasMix = o.pausasMix || []).push({
      motivo: m.motivo,
      seg: Math.round((Date.now() - (m.pIni || Date.now())) / 1000),
    })
  m.motivo = null
  m.t0 = Date.now()
  m.status = 'PRODUZINDO'
}
function pausarMix(mid) {
  const m = DB.misturadores.find((x) => x.id === mid)
  if (m.status === 'PAUSADO') {
    mxFechaPausa(m)
    log(`${m.id}: mistura retomada`)
    return draw(true)
  }
  modal(
    `<h3>Pausar ${m.id}</h3><p>Qual o motivo da pausa?</p><select id="mpm" onchange="sugerirMix('${mid}')"><option value="">Selecione o motivo…</option>${MOT_MIX.map((x) => `<option>${x}</option>`).join('')}</select><div id="mpsug"></div><div><button class="btn no" id="mpok" style="display:none" onclick="confirmarPausaMix('${mid}')">CONFIRMAR PAUSA</button><button class="btn gr" onclick="modal()">CANCELAR</button></div>`
  )
}
function sugerirMix(mid) {
  const m = DB.misturadores.find((x) => x.id === mid),
    v = $('#mpm').value
  $('#mpsug').innerHTML = v
    ? `<div class="ia"><b>🤖 Sugestão da IA</b><br>${sugMix(v, m)}</div>`
    : ''
  $('#mpok').style.display = v ? '' : 'none'
}
function confirmarPausaMix(mid) {
  const m = DB.misturadores.find((x) => x.id === mid),
    v = $('#mpm').value
  m.acum = (m.acum || 0) + (Date.now() - m.t0)
  m.pIni = Date.now()
  m.status = 'PAUSADO'
  m.motivo = v
  log(`${m.id} pausado: ${v}`)
  alerta('y', `${m.id} pausado: ${v}`)
  modal()
  draw(true)
}
function novoPedido() {
  const id = 45821 + DB.pedidos.length,
    p = {
      id,
      cliente: pick(CLI),
      produto: pick(PROD),
      qtd: Math.round(R(10, 30)) * 100,
      entrega: '10/10/2026',
      status: 'PEDIDO RECEBIDO',
    }
  DB.pedidos.push(p)
  DB.avisoPed = DB.avisoPed || []
  DB.avisoPed.push(id)
  DB.mega.pedidos++
  log('Mega ERP: novo pedido #' + id)
  save()
  draw()
  avisoPedido()
}
/* NOVO: pausar/retomar bomba (alimenta o controle de parada de linha) */
function pausarBomba(bid) {
  if (DB.bombas.find((x) => x.id === bid).status === 'PARADA') return
  const b = DB.bombas.find((x) => x.id === bid)
  if (b.status === 'OPERANDO') b.status = 'PAUSADO'
  else if (b.status === 'PAUSADO') b.status = 'OPERANDO'
  log(
    `${b.id}: ${b.status === 'PAUSADO' ? 'envase pausado' : 'envase retomado'}`
  )
  draw()
}
function pararBomba(bid) {
  if (!isGestor()) return alert('Somente o gestor pode parar a bomba.')
  const b = DB.bombas.find((x) => x.id === bid),
    o = op(b.op)
  if (
    !confirm(
      `Parar ${b.id}? O envase será interrompido e todo o sistema será avisado.`
    )
  )
    return
  b.status = 'PARADA'
  b.paradaPor = U.nome
  b.paradaEm = now()
  log(`${b.id} parada pelo gestor`)
  notificar(
    `🛑 MULTIPERFIL — ${b.id} parou de funcionar: interrompida pelo gestor ${U.nome}${o ? ` (OP ${pad(o.id)}, lote ${o.lote})` : ''}.`
  )
  draw(true)
}
function religarBomba(bid) {
  if (!isGestor()) return
  const b = DB.bombas.find((x) => x.id === bid)
  b.status = 'OPERANDO'
  b.paradaPor = null
  log(`${b.id} religada pelo gestor`)
  alerta('g', `${b.id} voltou a operar`)
  draw(true)
}
/* ---------- MISTURADORES: novo fluxo (lista → checklist → cronômetro → conclusão → teste) ---------- */
const MATS = [
  ['QMI01A', 'Intermediário pré-mix'],
  ['QS007', 'Água'],
  ['QR002', 'Resina acrílica 50%'],
  ['QA007', 'Dolomita #325'],
  ['QD012', 'Alcalinizante (soda cáustica líquida)'],
  ['QD011', 'Reológico (Rheolate / Rheotech / Euroflow)'],
]
/* faixas da folha de OP */
const ESPEC = [
  { k: 'd1', n: 'Densidade inicial', un: 'g/cm³', min: 1.76, max: 1.8, d: 3 },
  { k: 'd2', n: 'Densidade final', un: 'g/cm³', min: 1.73, max: 1.75, d: 3 },
  { k: 'ph', n: 'pH', un: '', min: 8, max: 9, d: 2 },
  { k: 'placas', n: 'Placas', un: 'cm', min: 2.3, max: 2.4, d: 2 },
  { k: 'balde', n: 'Peso do balde', un: 'kg', min: 0.53, max: 0.568, d: 3 },
]
const dentro = (v, e) => v >= e.min - 1e-9 && v <= e.max + 1e-9
const escAttr = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
const mxNovo = () => ({
  tela: 'lista',
  op: null,
  mix: '',
  mats: [],
  t: { fita: 'OK' },
})
let MX = mxNovo()
const mxFmt = (ms) => {
  const s = Math.floor(ms / 1000),
    p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
}
const mxTempo = () => {
  const m = DB.misturadores.find((x) => x.id === MX.mix)
  return m && m.op === MX.op
    ? (m.acum || 0) + (m.status === 'PRODUZINDO' ? Date.now() - m.t0 : 0)
    : 0
}
/* atualiza só o cronômetro (sem redesenhar a tela) */
setInterval(() => {
  const e = $('#mxt')
  if (e) e.textContent = mxFmt(mxTempo())
}, 500)

function mxIA(o) {
  return o.retrabalho && o.sugestaoIA
    ? `<div class="al y" style="margin:10px 0"><b>🤖 ${o.sugestaoIA.titulo}</b><br><b>Motivo:</b> ${o.sugestaoIA.motivo}<br><b>Melhoria:</b> ${o.sugestaoIA.melhoria}</div>`
    : ''
}
function mxResumoTeste(o) {
  const t = o.teste
  if (!t) return ''
  return `<div class="al g"><b>🧪 Teste realizado no misturador</b> · ${t.por} · ${t.em}${o.tempoMix ? ` · mistura: ${mxFmt(o.tempoMix * 1000)}` : ''}</div><div class="grid">${ESPEC.map(
    (e) => {
      const ok = dentro(t[e.k], e)
      return `<div>${e.n}<br><b>${f(t[e.k], e.d)} ${e.un}</b> <span class="bd ${ok ? 'g' : 'r'}">${ok ? 'OK' : 'FORA'}</span><br><small>Faixa ${f(e.min, e.d)} – ${f(e.max, e.d)}</small></div>`
    }
  ).join(
    ''
  )}<div>Adesão de fita<br><span class="bd ${t.fita === 'OK' ? 'g' : 'r'}">${t.fita}</span></div></div>${t.obs ? `<p><small>Obs.: ${t.obs}</small></p>` : ''}`
}

/* 1) lista */
function mxLista() {
  const and = DB.ordensProducao.filter((o) => o.status === 'EM MISTURA'),
    fila = DB.ordensProducao
      .filter((o) => o.status === 'AGUARDANDO PRODUÇÃO')
      .sort((a, b) => (b.prio === 'Alta') - (a.prio === 'Alta'))
  return (
    (and.length
      ? `<h3>Em andamento</h3>${and.map((o) => `<div class="card"><div class="top"><h3>OP ${pad(o.id)} · ${o.produto}</h3>${bd(o.mixConcluida ? 'MISTURA CONCLUÍDA' : 'EM MISTURA')}</div><p>${f(o.plan)} kg · Lote ${o.lote} · ${o.mix || '—'}</p><button class="btn" onclick="mxContinuar(${o.id})">CONTINUAR</button></div>`).join('')}`
      : '') +
    `<h3>OPs aguardando produção</h3>` +
    (fila
      .map(
        (o) =>
          `<div class="card"><div class="top"><h3>OP ${pad(o.id)} · ${o.produto}</h3><div>${o.prio === 'Alta' ? '<span class="bd y">PRIORIDADE ALTA</span> ' : ''}${o.retrabalho ? `<span class="bd r">RETRABALHO #${o.retrabalho}</span>` : ''}</div></div><p>${f(o.plan)} kg · Lote ${o.lote} · Prazo ${o.prazo}</p>${mxIA(o)}<button class="btn ok" onclick="realizarOP(${o.id})">REALIZAR OP</button></div>`
      )
      .join('') || '<div class="card">Nenhuma OP na fila.</div>')
  )
}
function realizarOP(id) {
  const o = op(id),
    liv = DB.misturadores.find((m) => m.status === 'DISPONÍVEL')
  MX = {
    tela: 'check',
    op: id,
    mix: liv ? liv.id : '',
    mats: o.checklist
      ? JSON.parse(JSON.stringify(o.checklist))
      : MATS.map(([cod, nome]) => ({
          cod,
          nome,
          on: false,
          lote: '',
          qtd: '',
        })),
    t: { fita: 'OK' },
  }
  draw(true)
}
function mxContinuar(id) {
  const o = op(id)
  MX = {
    ...mxNovo(),
    op: id,
    mix: o.mix,
    tela: o.mixConcluida ? 'conc' : 'cron',
  }
  draw(true)
}
function mxVoltar() {
  MX = mxNovo()
  draw(true)
}

/* 2) checklist de matérias-primas */
function matOn(i, v) {
  MX.mats[i].on = v
  draw(true)
}
function addMat() {
  MX.mats.push({ cod: '', nome: '', custom: true, on: true, lote: '', qtd: '' })
  draw(true)
}
function mxCheck(o) {
  const liv = DB.misturadores.filter((m) => m.status === 'DISPONÍVEL')
  if (!liv.some((m) => m.id === MX.mix)) MX.mix = liv[0] ? liv[0].id : ''
  const linhas = MX.mats
    .map(
      (m, i) =>
        `<div class="mat ${m.on ? 'on' : ''}"><label class="mat-ck"><input type="checkbox" ${m.on ? 'checked' : ''} onchange="matOn(${i},this.checked)"><span>${m.custom ? `<input type="text" placeholder="Nome da matéria-prima" value="${escAttr(m.nome)}" oninput="MX.mats[${i}].nome=this.value">` : `<b>${m.nome}</b>`}<small>${m.cod || 'Adicionada manualmente'}</small></span></label><input type="text" placeholder="Lote / fornecedor" value="${escAttr(m.lote)}" ${m.on ? '' : 'disabled'} oninput="MX.mats[${i}].lote=this.value"><input type="text" inputmode="decimal" placeholder="Quantidade (kg)" value="${escAttr(m.qtd)}" ${m.on ? '' : 'disabled'} oninput="MX.mats[${i}].qtd=this.value"></div>`
    )
    .join('')
  return `<div class="card"><h3>OP ${pad(o.id)} · ${o.produto}</h3><p>${f(o.plan)} kg · Lote ${o.lote} ${o.retrabalho ? `<span class="bd r">RETRABALHO #${o.retrabalho}</span>` : ''}</p>${mxIA(o)}<label>Misturador<select onchange="MX.mix=this.value">${liv.length ? liv.map((m) => `<option ${m.id === MX.mix ? 'selected' : ''}>${m.id}</option>`).join('') : '<option value="">Nenhum disponível</option>'}</select></label></div><div class="card"><h3>Matérias-primas utilizadas</h3><small>Marque o que foi usado e anote lote e quantidade.</small>${linhas}<button class="btn gr" onclick="addMat()">+ ADICIONAR MATÉRIA-PRIMA</button></div><div class="mx-foot"><button class="btn gr" onclick="mxVoltar()">VOLTAR</button><button class="btn ok" onclick="irCronometro()">INICIAR OP</button></div>`
}
function irCronometro() {
  const o = op(MX.op),
    sel = MX.mats.filter((x) => x.on),
    n = (x) => parseFloat(String(x.qtd).replace(',', '.'))
  if (!sel.length) return alert('Selecione ao menos uma matéria-prima.')
  if (sel.some((x) => !(n(x) > 0) || (x.custom && !x.nome.trim())))
    return alert(
      'Informe nome (se adicionada) e quantidade de cada matéria-prima marcada.'
    )
  const m = DB.misturadores.find((x) => x.id === MX.mix)
  if (!m || m.status !== 'DISPONÍVEL')
    return alert('Selecione um misturador disponível.')
  o.checklist = JSON.parse(JSON.stringify(MX.mats))
  save()
  MX.tela = 'cron'
  draw(true)
}

/* 3) cronômetro */
function mxCron(o) {
  const m = DB.misturadores.find((x) => x.id === MX.mix) || {},
    ini = o.status === 'EM MISTURA',
    pausado = m.status === 'PAUSADO'
  const btns = !ini
    ? `<button class="btn gr" onclick="MX.tela='check';draw(true)">VOLTAR</button><button class="btn ok" onclick="iniciarOP()">▶ INICIAR OP</button>`
    : `<button class="btn" onclick="pausarMix('${m.id}')">${pausado ? '▶ Retomar' : '❚❚ Pausar'}</button><button class="btn ok" onclick="concluirMix()">✓ Concluir</button>`
  return `<div class="cronbox"><div class="cron-h"><span class="cron-ic">⏱</span>Cronômetro</div><div class="cron-sub">OP ${pad(o.id)} · ${o.produto} · ${MX.mix}</div><div class="cron-t" id="mxt">${mxFmt(mxTempo())}</div><div class="cron-l"><span>h</span><span>min</span><span>seg</span></div>${ini ? `<div class="cron-st ${pausado ? 'p' : ''}">${pausado ? '⏸ Pausado: ' + (m.motivo || '') : '● Em produção'}</div>` : ''}<div class="cron-btns">${btns}</div></div>`
}
function iniciarOP() {
  const o = op(MX.op),
    m = DB.misturadores.find((x) => x.id === MX.mix)
  if (!m || m.status !== 'DISPONÍVEL') return alert('Misturador ocupado')
  m.status = 'PRODUZINDO'
  m.op = o.id
  m.t0 = Date.now()
  m.acum = 0
  m.motivo = null
  m.carga = o.retrabalho && o.prod ? o.prod : Math.round(o.plan * 0.99)
  if (!o.retrabalho) o.mpKg = m.carga
  o.mix = m.id
  o.operador = U.nome
  o.status = 'EM MISTURA'
  o.mixIni = now()
  o.mixConcluida = false
  o.pausasMix = []
  o.tempoMix = 0
  o.teste = null
  log(`Iniciou mistura no ${m.id} (OP ${pad(o.id)})`)
  draw(true)
}
function concluirMix() {
  const m = DB.misturadores.find((x) => x.id === MX.mix),
    o = op(MX.op)
  if (!m || m.op !== o.id) return
  if (!confirm('Concluir a mistura desta OP?')) return
  if (m.status === 'PAUSADO') mxFechaPausa(m)
  m.acum = (m.acum || 0) + (Date.now() - m.t0)
  o.tempoMix = Math.round(m.acum / 1000)
  o.prod = m.carga
  o.mixConcluida = true
  o.mixFim = now()
  m.status = 'DISPONÍVEL'
  m.op = null
  m.carga = 0
  m.t0 = 0
  m.acum = 0
  m.motivo = null
  log(`Concluiu mistura ${o.lote} em ${mxFmt(o.tempoMix * 1000)}`)
  MX.tela = 'conc'
  draw(true)
}

/* 4) tempo total */
function mxConc(o) {
  const ps = o.pausasMix || [],
    par = ps.reduce((a, p) => a + p.seg, 0)
  return `<div class="card" style="text-align:center"><h3>Mistura concluída · OP ${pad(o.id)}</h3><p>${o.produto} · Lote ${o.lote} · ${o.mix}</p><small>Tempo total de produção</small><div class="big" style="font-size:64px">${mxFmt(o.tempoMix * 1000)}</div>${ps.length ? `<p><small>${ps.length} pausa(s) · ${f(par / 60, 1)} min parado (não entra no tempo acima)</small></p>` : ''}<button class="btn ok" style="min-height:72px;font-size:22px" onclick="MX.tela='qual';draw(true)">ANÁLISE DE QUALIDADE</button></div>`
}

/* 5) formulário do teste (igual à folha de OP) */
function mxQual(o) {
  const t = MX.t
  return `<div class="card"><h3>Teste de qualidade · OP ${pad(o.id)}</h3><p>${o.produto} · Lote ${o.lote} · Operador: ${U.nome}</p><div class="row">${ESPEC.map((e) => `<label>${e.n}${e.un ? ' (' + e.un + ')' : ''}<input type="text" inputmode="decimal" value="${escAttr(t[e.k])}" oninput="MX.t.${e.k}=this.value"><small class="espec">Faixa: ${f(e.min, e.d)} – ${f(e.max, e.d)}</small></label>`).join('')}<label>Teste de adesão de fita<select onchange="MX.t.fita=this.value"><option ${t.fita === 'OK' ? 'selected' : ''}>OK</option><option ${t.fita === 'NÃO OK' ? 'selected' : ''}>NÃO OK</option></select></label></div><label>Observações<textarea placeholder="Observações" oninput="MX.t.obs=this.value">${escAttr(t.obs || '')}</textarea></label></div><div class="mx-foot"><button class="btn gr" onclick="MX.tela='conc';draw(true)">VOLTAR</button><button class="btn ok" onclick="fazerAnalise()">FAZER ANÁLISE</button></div>`
}
function fazerAnalise() {
  const o = op(MX.op),
    t = MX.t,
    n = (k) => parseFloat(String(t[k] || '').replace(',', '.'))
  if (ESPEC.some((e) => isNaN(n(e.k))))
    return alert('Preencha todos os campos numéricos do teste.')
  o.teste = {
    d1: n('d1'),
    d2: n('d2'),
    ph: n('ph'),
    placas: n('placas'),
    balde: n('balde'),
    fita: t.fita || 'OK',
    obs: t.obs || '',
    por: U.nome,
    em: now(),
  }
  o.mixConcluida = false
  o.status = 'AGUARDANDO LABORATÓRIO'
  log(`Enviou lote ${o.lote} à qualidade (teste do misturador preenchido)`)
  alerta('y', 'Lote ' + o.lote + ' aguardando qualidade')
  MX = mxNovo()
  if (ROLE[U.permissao].includes('lab')) ir('lab')
  else {
    alert('Lote enviado à qualidade.')
    draw(true)
  }
}
function sugestaoQualidade(lab, o) {
  const motivos = [],
    melhorias = []
  const difDens = Math.abs((lab.dens1 || 0) - (lab.dens2 || 0))
  const visc = lab.visc || 0
  const ph = lab.ph || 0

  /* teste preenchido no misturador (faixas da folha de OP) */
  if (o.teste) {
    ESPEC.forEach((e) => {
      const v = o.teste[e.k]
      if (!dentro(v, e))
        motivos.push(
          `${e.n} (${f(v, e.d)} ${e.un}) fora da faixa de ${f(e.min, e.d)}–${f(e.max, e.d)}.`
        )
    })
    if (o.teste.fita !== 'OK')
      motivos.push('O teste de adesão de fita não foi OK.')
    if (motivos.length)
      melhorias.push(
        'Revisar a ordem de adição e a homogeneização e repetir o teste após o retrabalho.'
      )
  }
  if (lab.placas === 'REPROVADO')
    motivos.push('O ensaio de placas foi marcado como REPROVADO.')
  if (!o.teste && difDens > 0.03) {
    motivos.push(`A densidade variou ${f(difDens, 2)} g/mL entre as medições.`)
    melhorias.push(
      'Conferir a pesagem dos componentes e homogeneizar melhor o lote antes de retirar a nova amostra.'
    )
  }
  if (visc && (visc < 4000 || visc > 5400)) {
    motivos.push(
      `A viscosidade medida (${f(visc)} cP) está fora da faixa de referência de 4.000–5.400 cP.`
    )
    melhorias.push(
      'Ajustar água ou aditivo somente conforme a receita, em pequenas doses, e misturar por mais 5–10 minutos antes de repetir o ensaio.'
    )
  }
  if (!o.teste && ph && (ph < 7.5 || ph > 8.5)) {
    motivos.push(
      `O pH medido (${f(ph, 1)}) está fora da faixa de referência de 7,5–8,5.`
    )
    melhorias.push(
      'Verificar a matéria-prima e corrigir o pH conforme a formulação aprovada, registrando cada adição.'
    )
  }
  if (lab.temp && (lab.temp < 23 || lab.temp > 30)) {
    motivos.push(
      `A temperatura da amostra (${f(lab.temp, 1)} °C) está fora da faixa usual de 23–30 °C.`
    )
    melhorias.push(
      'Aguardar a estabilização térmica e confirmar a temperatura do processo antes da próxima coleta.'
    )
  }
  if (lab.obs) motivos.push(`Observação do analista: ${lab.obs}`)
  if (!motivos.length)
    motivos.push(
      'O lote foi reprovado pelo resultado geral da análise, sem um único indicador isolado informado.'
    )
  if (!melhorias.length)
    melhorias.push(
      'Revisar a ordem de adição, garantir homogeneização completa e repetir a coleta de amostra após o retrabalho.'
    )

  return {
    titulo: `Sugestão da IA para o retrabalho da OP ${pad(o.id)}`,
    motivo: motivos.join(' '),
    melhoria: melhorias.join(' '),
    geradaEm: now(),
  }
}
function analisar(id, ok) {
  const g = (k) => parseFloat(($('#' + k + id).value || '0').replace(',', '.')),
    o = op(id)
  o.lab = {
    status: ok ? 'aprovado' : 'reprovado',
    dens1: g('d1'),
    dens2: g('d2'),
    ph: g('ph'),
    visc: g('vi'),
    temp: g('tp'),
    placas: $('#pl' + id).value,
    obs: $('#ob' + id).value,
    por: U.nome,
  }
  /* OEE - Qualidade: só a 1ª análise conta (aprovado de primeira x retrabalho) */
  if (!o.jaAnalisado) {
    const n = Math.floor((o.prod || 0) / pb())
    if (ok) DB.oee.aprov += n
    else DB.oee.retrab += n
    o.jaAnalisado = true
  }
  if (ok) {
    o.status = 'AGUARDANDO ENVASE'
    alerta('g', 'Lote ' + o.lote + ' aprovado')
    log(`Aprovou lote ${o.lote}`)
  } else {
    o.labAnterior = o.lab
    o.sugestaoIA = sugestaoQualidade(o.lab, o)
    o.lab = null
    o.retrabalho = (o.retrabalho || 0) + 1
    o.status = 'AGUARDANDO PRODUÇÃO'
    alerta(
      'r',
      `Lote ${o.lote} reprovado: voltou para a fila da OP (retrabalho #${o.retrabalho})`
    )
    log(`Reprovou lote ${o.lote}; OP ${pad(o.id)} voltou para retrabalho`)
  }
  draw(true)
}
function iniciarEnvase(id) {
  const o = op(id),
    r = rec(o)
  if (r.bloq) return alert('Recomendação bloqueada: fora dos limites')
  const b = DB.bombas.find((x) => x.id === $('#bb' + id).value)
  if (b.status !== 'DISPONÍVEL') return alert('Bomba ocupada')
  b.status = 'OPERANDO'
  b.op = id
  b.min = 0
  b.litros = 0
  b.nAnom = 0
  b.kwh = 0
  b.kw = 0
  b.enAlert = false
  o.bLive = 0
  b.rpm = r.rpm * 0.8
  o.bomba = b.id
  o.rpm = r.rpm
  o.status = 'EM ENVASE'
  log(`Iniciou envase na ${b.id} a ${r.rpm} RPM (OP ${pad(id)})`)
  draw()
}
function perda(id) {
  const kg = parseFloat($('#pk' + id).value)
  if (!kg) return
  op(id).perdas.push({ kg, motivo: $('#pm' + id).value })
  log(`Registrou perda de ${kg} kg (OP ${pad(id)})`)
  draw()
}
function buscarRast(v) {
  RQ = v !== undefined ? v : $('#rq').value
  draw(true)
}
function fimEnvase(id) {
  const o = op(id),
    b = DB.bombas.find((x) => x.id === o.bomba),
    c = DB.configuracoes,
    p = pb(),
    pk = o.perdas.reduce((a, x) => a + x.kg, 0),
    entrada = o.mpKg || o.prod
  if (b.status === 'PARADA')
    return alert('Bomba parada pelo gestor. Religue-a antes de finalizar.')
  /* Sensor óptico simulado: vazamento oculto (pior com anomalias da bomba) e
     overfilling reduzem a quantidade de baldes contados */
  const vazOculto = R(0.3, 1.2) + b.nAnom * 0.9,
    sobre = R(0.3, 1.5),
    util = Math.max(0, o.prod - pk) * (1 - vazOculto / 100)
  o.baldes = Math.floor(util / (p * (1 + sobre / 100)))
  o.envasado = o.baldes * p /* baldes × peso padrão da receita */
  DB.hist.push({
    produto: o.produto,
    visc: o.lab.visc,
    temp: o.lab.temp,
    rpm: o.rpm,
    perda: (pk / o.prod) * 100,
    vaz: b.vaz || 38,
  })
  /* Balanço de massa digital */
  DB.balanco.push({
    op: id,
    lote: o.lote,
    produto: o.produto,
    entrada,
    baldes: o.baldes,
    saida: o.envasado,
    pk,
    bomba: b.id,
    nAnom: b.nAnom,
  })
  const inv = entrada - o.envasado - pk,
    pct = (inv / entrada) * 100
  if (pct > c.tol) {
    const m = `Lote ${o.lote}: perda invisível de ${f(pct, 1)}% (${f(inv)} kg) no balanço de massa`
    alerta(pct > 2 * c.tol ? 'r' : 'y', m)
    if (pct > 2 * c.tol)
      notificar(
        `⚠️ MULTIPERFIL — ${m}. Verificar vazamentos na ${b.id} e calibração dos bicos de envase.`
      )
  }
  /* Energia do lote */
  const kwh = (o.kwhM || 0) + (o.kwhP || 0)
  DB.energiaHist.push({
    op: id,
    lote: o.lote,
    produto: o.produto,
    kwhM: o.kwhM || 0,
    kwhP: o.kwhP || 0,
    baldes: o.baldes,
    custo: kwh * c.tarifa,
  })
  b.status = 'DISPONÍVEL'
  b.op = null
  b.kw = 0
  DB.estoque.push({
    op: id,
    lote: o.lote,
    produto: o.produto,
    un: o.baldes,
    status: 'DISPONÍVEL',
  })
  o.status = 'EM ESTOQUE'
  log(`Finalizou envase ${o.lote}; estoque atualizado`)
  alerta('g', 'Produção concluída: ' + pad(id))
  draw()
}
function entregar(id) {
  const o = op(id)
  if (o.status !== 'EM ESTOQUE') return
  o.status = 'CONCLUÍDA'
  o.entrega = now()
  DB.entregas.push({ op: id, t: now() })
  const p = DB.pedidos.find((x) => x.id == o.pedido)
  if (p) p.status = 'ENTREGUE'
  const e = DB.estoque.find((x) => x.op == id)
  if (e) e.status = 'BAIXADO'
  DB.mega.pend++
  log(`Baixa no estoque e entrega do lote ${o.lote} (OP ${pad(id)})`)
  EXP = null
  draw(true)
  avisoSaida(o)
}

function megaAct(a) {
  const m = DB.mega
  if (a === 'sync') {
    m.sync = now()
    m.pend = 0
  }
  if (a === 'ped') return novoPedido()
  log('Mega ERP: ' + a)
  m.sync = now()
  draw()
}
function reset() {
  if (confirm('Apagar e recriar dados demonstrativos?')) {
    initializeDatabase(true)
    draw()
  }
}
function setLim() {
  DB.configuracoes.rpmMin = +$('#lmin').value
  DB.configuracoes.rpmMax = +$('#lmax').value
  log('Alterou limites de RPM')
  draw()
}
/* NOVO: salvar parâmetros de indicadores, custos e canais de alerta */
const CFG_NUM = [
  ['minParada', 'Alerta de parada sem justificativa (min)'],
  ['tol', 'Tolerância de perda invisível (%)'],
  ['pesoBalde', 'Peso padrão do balde (kg)'],
  ['custoKg', 'Custo do produto (R$/kg)'],
  ['tarifa', 'Tarifa de energia (R$/kWh)'],
  ['kwBomba', 'Potência nominal da bomba (kW)'],
  ['kwMix', 'Potência do misturador (kW)'],
  ['vazNom', 'Vazão nominal da bomba (L/min)'],
  ['acel', 'Aceleração de tempo – demonstração (×)'],
]
const CFG_TXT = [
  ['tgToken', 'Telegram – token do bot'],
  ['tgChat', 'Telegram – chat ID do encarregado'],
  ['waFone', 'WhatsApp – telefone (ex.: +5511999999999)'],
  ['waKey', 'WhatsApp – API key (CallMeBot)'],
]
function salvarCfg() {
  const c = DB.configuracoes
  CFG_NUM.forEach(([k]) => {
    const v = parseFloat(String($('#cf_' + k).value).replace(',', '.'))
    if (v > 0) c[k] = v
  })
  CFG_TXT.forEach(([k]) => (c[k] = $('#cf_' + k).value.trim()))
  log('Alterou parâmetros de indicadores, custos e alertas')
  draw()
}
/* ---------- VIEWS ---------- */
const bd = (s) => {
  const c = /APROV|CONCL|ENTREG|DISPON|ESTOQUE|OPERANDO|PRODUZINDO/.test(s)
    ? 'g'
    : /AGUARD|PAUS/.test(s)
      ? 'y'
      : /REPROV|BLOQ|PARAD/.test(s)
        ? 'r'
        : ''
  return `<span class="bd ${c}">${s}</span>`
}
function tl(o) {
  const S = [
      ['Pedido recebido', 0],
      ['OP criada', 1],
      ['Mistura iniciada', 3],
      ['Mistura concluída', 4],
      ['Qualidade aprovada', 5],
      ['Envase concluído', 7],
      ['Estoque', 8],
      ['Expedição', 9],
      ['Entrega', 10],
    ],
    i = ST.indexOf(o.status)
  let cur = false
  return (
    `<div class="tl">` +
    S.map((s) => {
      if (i >= s[1] && !(s[1] >= 5 && !o.lab)) {
        return `<div class="d">✓ ${s[0]}</div>`
      }
      if (!cur) {
        cur = true
        return `<div class="c">● ${s[0]}</div>`
      }
      return `<div>○ ${s[0]}</div>`
    }).join('') +
    '</div>'
  )
}
const bars = (a, c) =>
  a
    .map(
      (x) =>
        `<div>${x[0]} <b>${x[1]}</b><div class="bar"><i style="width:${Math.min(100, (x[1] / (c || Math.max(1, ...a.map((y) => y[1])))) * 100)}%"></i></div></div>`
    )
    .join('')
const V_ = {
  dash() {
    const os = DB.ordensProducao,
      n = (s) => os.filter((o) => o.status === s).length,
      fin = os.filter((o) => o.envasado),
      tp = fin.reduce((a, o) => a + o.perdas.reduce((x, p) => x + p.kg, 0), 0),
      tprod = fin.reduce((a, o) => a + o.envasado, 0)
    return `<div class="grid"><div class="card"><h3>OPs em produção</h3><div class="big">${n('EM MISTURA') + n('EM ENVASE')}</div></div><div class="card"><h3>Aguardando qualidade</h3><div class="big">${n('AGUARDANDO LABORATÓRIO')}</div></div><div class="card"><h3>Aguardando envase</h3><div class="big">${n('AGUARDANDO ENVASE')}</div></div><div class="card"><h3>Concluídas</h3><div class="big">${n('CONCLUÍDA')}</div></div>
 <div class="card"><h3>Produzido (kg)</h3><div class="big">${f(tprod)}</div></div><div class="card"><h3>Perdas</h3><div class="big">${tprod ? f((tp / (tprod + tp)) * 100, 1) : '0,0'}%</div></div><div class="card"><h3>Equipamentos de envase ativos</h3><div class="big">${DB.bombas.filter((b) => b.status === 'OPERANDO').length}/${DB.bombas.length}</div></div><div class="card"><h3>Misturadores ativos</h3><div class="big">${DB.misturadores.filter((m) => m.status === 'PRODUZINDO').length}/${DB.misturadores.length}</div></div>
 <div class="card"><h3>OEE global</h3><div class="big">${f(oeeCalc().E * 100, 1)}%</div></div><div class="card"><h3>Energia (R$/balde)</h3><div class="big">${f(custoMedio(), 4)}</div></div></div>
 <div class="grid"><div class="card"><h3>OPs por status</h3>${bars(ST.map((s) => [s, n(s)]).filter((x) => x[1]))}</div><div class="card"><h3>Eficiência dos equipamentos de envase</h3>${bars(
   DB.bombas.map((b) => [b.id, b.ef]),
   100
 )}</div><div class="card"><h3>Alertas</h3>${
   DB.alertasIA
     .slice(0, 6)
     .map((a) => `<div class="al ${a.n}">${a.m}<br><small>${a.t}</small></div>`)
     .join('') || '—'
 }</div></div>`
  },
  ped() {
    const L = [...DB.pedidos].sort(
      (a, b) =>
        (b.status === 'PEDIDO RECEBIDO') - (a.status === 'PEDIDO RECEBIDO')
    )
    return `<button class="btn" onclick="novoPedido()">Simular recebimento de pedido (Mega)</button><div class="ped-list">${L.map((p) => `<div class="ped ${p.status === 'PEDIDO RECEBIDO' ? 'novo' : ''}"><div class="ped-h"><b>#${p.id}</b>${bd(p.status)}</div><div class="ped-b"><div><small>Cliente</small><br><b>${p.cliente}</b></div><div><small>Produto</small><br><b>${p.produto}</b></div><div><small>Quantidade</small><br><b>${f(p.qtd)} kg</b></div><div><small>Entrega</small><br><b>${p.entrega}</b></div></div>${p.status === 'PEDIDO RECEBIDO' ? `<div class="acao"><select id="pr${p.id}"><option>Normal</option><option>Alta</option></select><button class="btn" onclick="gerarOP(${p.id})">GERAR OP</button></div>` : ''}</div>`).join('')}</div>`
  },
  ops() {
    return [...DB.ordensProducao]
      .reverse()
      .map(
        (o) =>
          `<div class="card"><div class="top"><h3>OP ${pad(o.id)} · Pedido #${o.pedido}</h3><div>${o.retrabalho ? `<span class="bd r">RETRABALHO #${o.retrabalho}</span> ` : ''}${bd(o.status)}</div></div><div class="grid"><div>Cliente<br><b>${o.cliente}</b></div><div>Produto<br><b>${o.produto}</b></div><div>Planejado / produzido<br><b>${f(o.plan)} / ${f(o.envasado || o.prod)} kg</b></div><div>Lote<br><b>${o.lote}</b></div><div>Misturador / Bomba<br><b>${o.mix || '—'} / ${o.bomba || '—'}</b></div><div>Prioridade / prazo<br><b>${o.prio} · ${o.prazo}</b></div></div>${o.retrabalho && o.sugestaoIA ? `<div class="al y" style="margin-top:14px"><b>🤖 ${o.sugestaoIA.titulo}</b><br><b>Motivo provável:</b> ${o.sugestaoIA.motivo}<br><b>Como melhorar:</b> ${o.sugestaoIA.melhoria}<br><small>Gerada em ${o.sugestaoIA.geradaEm}</small></div>` : ''}${tl(o)}</div>`
      )
      .join('')
  },
  /* NOVO FLUXO: lista → checklist → cronômetro → conclusão → teste de qualidade */
  mix() {
    if (MX.tela !== 'lista' && !op(MX.op)) MX = mxNovo()
    const o = op(MX.op)
    return {
      lista: () => mxLista(),
      check: () => mxCheck(o),
      cron: () => mxCron(o),
      conc: () => mxConc(o),
      qual: () => mxQual(o),
    }[MX.tela]()
  },
  lab() {
    const l = DB.ordensProducao.filter(
      (o) => o.status === 'AGUARDANDO LABORATÓRIO'
    )
    const vv = (x) => String(x).replace('.', ',')
    return (
      l
        .map((o) => {
          const t = o.teste,
            pl = t && !dentro(t.placas, ESPEC[3]) ? 'REPROVADO' : 'APROVADO'
          return `<div class="card"><h3>OP ${pad(o.id)} · Lote ${o.lote}</h3>${o.produto} ${o.lab ? bd('REPROVADO') : ''}${mxResumoTeste(o)}<div class="row"><label>Densidade inicial<input id="d1${o.id}" value="${t ? vv(t.d1) : '1,42'}"></label><label>Densidade final<input id="d2${o.id}" value="${t ? vv(t.d2) : '1,41'}"></label><label>pH<input id="ph${o.id}" value="${t ? vv(t.ph) : '8,1'}"></label><label>Viscosidade (cP)<input id="vi${o.id}" value="${Math.round(R(4300, 5000))}"></label><label>Temperatura (°C)<input id="tp${o.id}" value="25,8"></label><label>Placas<select id="pl${o.id}"><option ${pl === 'APROVADO' ? 'selected' : ''}>APROVADO</option><option ${pl === 'REPROVADO' ? 'selected' : ''}>REPROVADO</option></select></label></div><textarea id="ob${o.id}" placeholder="Observações">${t ? escAttr(t.obs) : ''}</textarea><button class="btn ok" onclick="analisar(${o.id},true)">APROVAR LOTE</button><button class="btn no" onclick="analisar(${o.id},false)">REPROVAR LOTE</button></div>`
        })
        .join('') || '<div class="card">Nenhum lote aguardando análise.</div>'
    )
  },
  env() {
    const l = DB.ordensProducao.filter((o) =>
      ['AGUARDANDO LABORATÓRIO', 'AGUARDANDO ENVASE', 'EM ENVASE'].includes(
        o.status
      )
    )
    return (
      l
        .map((o) => {
          const h = `<div class="card"><h3>OP ${pad(o.id)} · ${o.lote}</h3>${o.produto} · ${f(o.prod)} kg disponíveis ${bd(o.status)}`
          if (o.lab?.status !== 'aprovado')
            return (
              h +
              `<div class="warn">❌ <b>ENVASE BLOQUEADO</b><br>Este lote ainda não foi liberado pela qualidade.</div></div>`
            )
          if (o.status === 'EM ENVASE') {
            const b = DB.bombas.find((x) => x.id === o.bomba)
            return (
              h +
              `<p>${b.id} · ${Math.round(b.rpm)} RPM · ${f(b.vaz, 1)} L/min · Eficiência ${b.ef}%</p><div class="row"><input id="pk${o.id}" type="number" placeholder="Perda (kg)"><select id="pm${o.id}">${MOT.map((m) => `<option>${m}</option>`).join('')}</select><button class="btn gr" onclick="perda(${o.id})">REGISTRAR PERDA</button></div>${o.perdas.map((p) => `<div class="al y">${p.kg} kg · ${p.motivo}</div>`).join('')}<button class="btn ok" onclick="fimEnvase(${o.id})">FINALIZAR ENVASE</button></div>`
            )
          }
          const r = rec(o),
            liv = DB.bombas.filter((b) => b.status === 'DISPONÍVEL')
          return (
            h +
            `<div class="card" style="background:#eef5ff"><b>🤖 RECOMENDAÇÃO</b><br>Velocidade sugerida: <b>${f(r.rpm)} RPM</b> · Faixa histórica: ${f(r.min)}–${f(r.max)} RPM<br>Vazão estimada: ${f(r.vaz, 1)} L/min · Perda histórica média: ${f(r.perda, 1)}%<br>Base: ${r.n} lotes semelhantes<details><summary>Por que essa recomendação?</summary>Média de RPM dos lotes de "${o.produto}" com viscosidade próxima de ${f(r.v)} cP (±12%) no histórico do banco.</details></div>${r.bloq ? `<div class="warn">⚠️ <b>RECOMENDAÇÃO BLOQUEADA</b><br>Valor sugerido: ${f(r.rpm)} RPM · Limite: ${f(r.lim)} RPM</div>` : `<select id="bb${o.id}">${liv.map((b) => `<option>${b.id}</option>`).join('')}</select><button class="btn ok" onclick="iniciarEnvase(${o.id})">APROVAR RECOMENDAÇÃO E INICIAR ENVASE</button>`}</div>`
          )
        })
        .join('') || '<div class="card">Nenhuma OP para envase.</div>'
    )
  },
  bom() {
    return `<div class="grid">${DB.bombas.map((b) => `<div class="card"><h3>${b.id}</h3>${bd(b.anom ? 'ANOMALIA' : b.status)}<p>RPM: <b>${Math.round(b.rpm)}</b> · Vazão: <b>${f(b.vaz, 1)} L/min</b><br>Pressão: <b>${f(b.pres, 1)} bar</b> · Temp: <b>${f(b.temp, 1)} °C</b><br>Tempo ligada: <b>${f(b.min, 0)} min</b> · Bombeado: <b>${f(b.litros)} L</b><br>OP: <b>${b.op ? pad(b.op) : '—'}</b> · Eficiência: <b>${b.ef}%</b></p>${b.op && b.status !== 'PARADA' ? `<button class="btn gr" onclick="pausarBomba('${b.id}')">PAUSAR/RETOMAR ENVASE</button>` : ''}${isGestor() && b.op ? (b.status === 'PARADA' ? `<button class="btn ok" onclick="religarBomba('${b.id}')">RELIGAR BOMBA</button>` : `<button class="btn no" onclick="pararBomba('${b.id}')">🛑 PARAR BOMBA</button>`) : ''}${b.status === 'PARADA' ? `<div class="warn">🛑 <b>Parada pelo gestor</b> ${b.paradaPor} em ${b.paradaEm}.</div>` : ''}${b.anom ? `<div class="warn">⚠️ <b>ANOMALIA DETECTADA</b><br>Vazão abaixo do histórico (38–42 L/min). Possíveis causas: obstrução na linha, alteração da viscosidade, pressão anormal, problema na bomba, entrada de ar. Recomenda-se verificar o equipamento.</div>` : ''}${b.hist.map((h) => `<div class="bar" style="height:8px"><i style="width:${h}%"></i></div>`).join('')}</div>`).join('')}</div>`
  },
  /* ===== NOVO: OEE + PARADAS + ALERTAS ===== */
  oee() {
    const k = oeeCalc(),
      O = DB.oee,
      P = DB.parada,
      c = DB.configuracoes,
      st = linhaStatus(),
      rod = DB.bombas.filter((b) => b.status === 'OPERANDO')
    const cd = (t, v, s) =>
      `<div class="card"><h3>${t}</h3><div class="big">${f(v * 100, 1)}%</div><div class="bar"><i style="width:${Math.min(100, v * 100)}%"></i></div><small>${s}</small></div>`
    const cls =
      k.E >= 0.85
        ? 'Classe mundial (≥ 85%)'
        : k.E >= 0.6
          ? 'Aceitável (60–85%)'
          : 'Abaixo do esperado (< 60%)'
    const stBd =
      st === 'run'
        ? bd('LINHA OPERANDO')
        : st === 'stop'
          ? bd('LINHA PARADA')
          : bd('SEM DEMANDA DE ENVASE')
    const stop =
      st === 'stop'
        ? `<div class="warn">⏱ Linha de envase parada há <b>${f(P.seg / 60, 1)} min</b>.${P.motivo ? ` Motivo apontado: <b>${P.motivo}</b>.` : ` <b>Sem justificativa</b> — o alerta automático é enviado aos ${c.minParada} min.${P.alertou ? ' 🔔 Alerta já enviado.' : ''}`}</div>${P.motivo ? '' : `<div class="row"><select id="mpj">${MOT_PARADA.map((m) => `<option>${m}</option>`).join('')}</select><button class="btn" onclick="justificarParada()">JUSTIFICAR PARADA</button></div>`}`
        : ''
    return `<div class="grid">${cd('OEE global', k.E, cls)}${cd('Disponibilidade', k.A, `Rodando ${f(O.tRun / 3600, 1)} h · parada ${f(O.tParada / 3600, 1)} h`)}${cd('Desempenho', k.P, `Vazão atual ${rod.length ? f(avg(rod.map((b) => b.vaz)), 1) : '—'} L/min · nominal ${f(c.vazNom, 0)} L/min`)}${cd('Qualidade', k.Q, `${f(O.aprov)} baldes aprovados · ${f(O.retrab)} retrabalhados`)}</div>
 <div class="card"><div class="top"><h3>Linha de envase</h3>${stBd}</div>${stop}<p><small>OEE = Disponibilidade × Desempenho × Qualidade. Alerta automático (Telegram/WhatsApp) quando a linha fica parada por mais de ${c.minParada} min sem justificativa.</small></p><button class="btn gr" onclick="simParada()">SIMULAR +16 MIN DE PARADA</button><button class="btn gr" onclick="testarAlerta()">TESTAR ALERTA</button></div>
 <div class="grid"><div class="card"><h3>Histórico de paradas</h3>${
   DB.paradas
     .slice(0, 8)
     .map(
       (x) =>
         `<div class="al ${x.motivo === 'Sem justificativa' ? 'r' : ''}"><b>${x.ini}</b> · ${f(x.min, 1)} min<br>${x.motivo}</div>`
     )
     .join('') || '—'
 }</div><div class="card"><h3>Alertas enviados</h3>${
   DB.notif
     .slice(0, 8)
     .map(
       (n) =>
         `<div class="al r"><b>${n.t}</b> · ${n.canais.map((x) => x[0] + ': ' + x[1]).join(' | ')}<br>${n.msg}</div>`
     )
     .join('') || 'Nenhum alerta disparado ainda.'
 }</div></div>`
  },
  /* ===== NOVO: BALANÇO DE MASSA DIGITAL ===== */
  bal() {
    const c = DB.configuracoes,
      t = c.tol,
      L = DB.balanco.map((x) => {
        const inv = x.entrada - x.saida - x.pk
        return {
          ...x,
          inv,
          pct: (inv / x.entrada) * 100,
          rend: (x.saida / x.entrada) * 100,
        }
      }),
      sb = (p) =>
        p <= t
          ? ['g', 'DENTRO DO LIMITE']
          : p <= 2 * t
            ? ['y', 'ATENÇÃO']
            : ['r', 'CRÍTICO'],
      col = { g: '#2e9d57', y: '#e0a800', r: '#d13b3b' },
      tot = L.reduce((a, x) => a + x.inv, 0),
      ent = L.reduce((a, x) => a + x.entrada, 0),
      u = L[L.length - 1]
    const sbU = u ? sb(u.pct) : null
    const diag = u
      ? u.pct > t
        ? `Desvio de <b>${f(u.pct, 1)}%</b> sem explicação nos registros de perda. Verifique vazamentos nas conexões e vedações da bomba/tubulação, calibre os bicos injetores (overfilling) e confira resíduos no misturador.${u.nAnom ? ` A ${u.bomba} registrou <b>${u.nAnom}</b> anomalia(s) neste lote — forte indício de vazamento ou entrada de ar.` : ''} Produto "dado de graça"/perdido: <b>R$ ${f(u.inv * c.custoKg, 2)}</b>.`
        : 'Balanço dentro da tolerância. Nenhuma ação necessária.'
      : ''
    const seg = (v, cor, r) =>
      `<div style="width:${Math.max(0, (v / u.entrada) * 100)}%;background:${cor};color:#fff;font-size:11px;text-align:center;overflow:hidden;white-space:nowrap">${r}</div>`
    return `<div class="grid"><div class="card"><h3>Lotes auditados</h3><div class="big">${L.length}</div></div><div class="card"><h3>Rendimento médio</h3><div class="big">${f(avg(L.map((x) => x.rend)), 1)}%</div></div><div class="card"><h3>Perda invisível total</h3><div class="big">${f(tot)} kg</div><small>${f((tot / (ent || 1)) * 100, 1)}% da matéria-prima</small></div><div class="card"><h3>Impacto estimado</h3><div class="big">R$ ${f(tot * c.custoKg, 2)}</div></div></div>
 ${
   u
     ? `<div class="card"><div class="top"><h3>Último lote · ${u.lote}</h3><span class="bd ${sbU[0]}">${sbU[1]}</span></div><p>${u.produto} · Entrada (mistura): <b>${f(u.entrada)} kg</b> → ${f(u.baldes)} baldes × ${f(pb(), 1)} kg = <b>${f(u.saida)} kg</b> envasados · Perda declarada: <b>${f(u.pk)} kg</b> · Perda invisível: <b>${f(u.inv)} kg (${f(u.pct, 1)}%)</b></p><div style="display:flex;height:22px;border-radius:4px;overflow:hidden;background:#ddd">${seg(u.saida, '#2e9d57', 'Envasado')}${seg(u.pk, '#e0a800', '')}${seg(Math.max(0, u.inv), '#d13b3b', '')}</div><small>🟩 envasado · 🟨 perda declarada · 🟥 perda invisível</small><p>${diag}</p></div>`
     : ''
 }
 <div class="card"><h3>Gráfico de Rendimento Volumétrico por lote</h3><small>Rendimento = peso envasado ÷ matéria-prima pesada (escala 90–100%). Linha tracejada = limite de tolerância (${f(100 - t, 1)}%).</small>${L.slice(
   -10
 )
   .map((x) => {
     const s = sb(x.pct),
       w = Math.max(0, Math.min(100, ((x.rend - 90) / 10) * 100)),
       tw = Math.max(0, Math.min(100, ((100 - t - 90) / 10) * 100))
     return `<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="width:115px;font-size:12px">${x.lote}</span><div style="flex:1;background:#e5e9f0;height:16px;border-radius:4px;position:relative"><div style="width:${w}%;height:100%;background:${col[s[0]]};border-radius:4px"></div><div style="position:absolute;left:${tw}%;top:-3px;bottom:-3px;border-left:2px dashed #0B2A5B"></div></div><b style="width:56px;text-align:right">${f(x.rend, 1)}%</b></div>`
   })
   .join('')}</div>
 <div class="card"><table><tr><th>Lote</th><th>Produto</th><th>Entrada (kg)</th><th>Baldes</th><th>Envasado (kg)</th><th>Perda declarada</th><th>Perda invisível</th><th>Status</th></tr>${[
   ...L,
 ]
   .reverse()
   .map((x) => {
     const s = sb(x.pct)
     return `<tr><td>${x.lote}</td><td>${x.produto}</td><td>${f(x.entrada)}</td><td>${f(x.baldes)}</td><td>${f(x.saida)}</td><td>${f(x.pk)} kg</td><td>${f(x.inv)} kg (${f(x.pct, 1)}%)</td><td><span class="bd ${s[0]}">${s[1]}</span></td></tr>`
   })
   .join('')}</table></div>`
  },
  /* ===== NOVO: ECO-EFICIÊNCIA (R$/BALDE) ===== */
  ene() {
    const c = DB.configuracoes,
      ref = refBalde(),
      ops = DB.bombas.filter((b) => b.status === 'OPERANDO'),
      H = DB.energiaHist,
      kwhT = H.reduce((a, x) => a + x.kwhM + x.kwhP, 0),
      cm = custoMedio()
    const cards = ops.length
      ? ops
          .map((b) => {
            const o = op(b.op),
              cur = custoBalde(b),
              d = ref ? (cur / ref - 1) * 100 : 0,
              bph = (b.vaz * 60 * DENS) / pb(),
              est = Math.floor(o.prod / pb()),
              rest = Math.max(0, est - (o.bLive || 0)),
              impH = Math.max(0, b.kw * c.tarifa - ref * bph),
              impL = Math.max(0, cur - ref) * rest
            return `<div class="card"><h3>${b.id} · OP ${pad(o.id)}</h3>${bd(b.anom ? 'ANOMALIA' : b.status)}<p>Potência: <b>${f(b.kw, 1)} kW</b> · Consumo no lote: <b>${f(b.kwh, 2)} kWh</b><br>Produção: <b>${f(bph, 0)} baldes/h</b> · Contados: <b>${f(o.bLive || 0, 0)}</b> de ~${f(est)}<br>Custo atual: <b>R$ ${f(cur, 4)}/balde</b> · Ideal: R$ ${f(ref, 4)}/balde</p>${d > 10 ? `<div class="warn">⚠️ <b>Custo energético ${f(d, 0)}% acima do ideal</b><br>Impacto financeiro: <b>+R$ ${f(impH, 2)}/hora</b> e <b>+R$ ${f(impL, 2)}</b> até o fim do lote (${f(rest, 0)} baldes restantes). Causa provável: perda de eficiência da bomba (queda de vazão / pressão alta).</div>` : `<small>✓ Dentro do esperado (${d >= 0 ? '+' : ''}${f(d, 1)}% vs. ideal)</small>`}</div>`
          })
          .join('')
      : '<div class="card">Nenhuma bomba em envase no momento.</div>'
    return `<div class="grid"><div class="card"><h3>Tarifa</h3><div class="big">R$ ${f(c.tarifa, 2)}</div><small>por kWh</small></div><div class="card"><h3>Consumo (lotes concluídos)</h3><div class="big">${f(kwhT, 0)} kWh</div></div><div class="card"><h3>Custo médio</h3><div class="big">R$ ${f(cm, 4)}</div><small>por balde (mistura + bombeamento)</small></div><div class="card"><h3>Custo ideal da bomba</h3><div class="big">R$ ${f(ref, 4)}</div><small>por balde (só envase)</small></div></div>
 <h3>Envase em andamento (tempo real)</h3><div class="grid">${cards}</div>
 <h3>Misturadores</h3><div class="grid">${DB.misturadores.map((m) => `<div class="card"><h3>${m.id}</h3>${bd(m.status)}<p>Potência: <b>${f(m.kw, 1)} kW</b><br>Consumo acumulado: <b>${f(m.kwh, 2)} kWh</b> · Custo: <b>R$ ${f(m.kwh * c.tarifa, 2)}</b></p></div>`).join('')}</div>
 <div class="card"><h3>Custo energético por lote</h3><table><tr><th>Lote</th><th>Produto</th><th>kWh misturador</th><th>kWh bombas</th><th>Custo (R$)</th><th>Baldes</th><th>R$/balde</th></tr>${[
   ...H,
 ]
   .reverse()
   .map((x) => {
     const v = x.baldes ? x.custo / x.baldes : 0
     return `<tr><td>${x.lote}</td><td>${x.produto}</td><td>${f(x.kwhM, 1)}</td><td>${f(x.kwhP, 1)}</td><td>R$ ${f(x.custo, 2)}</td><td>${f(x.baldes)}</td><td><b${cm && v > cm * 1.15 ? ' style="color:#d13b3b"' : ''}>R$ ${f(v, 4)}</b></td></tr>`
   })
   .join(
     ''
   )}</table><small>Consumo medido só enquanto o sistema está aberto. Em vermelho: lotes com custo 15% acima da média.</small></div>`
  },
  est() {
    const e = DB.ordensProducao.filter((o) => o.status === 'EM ESTOQUE')
    if (!e.length)
      return '<div class="card">Nenhum lote em estoque. Os lotes aparecem aqui quando o envase é finalizado.</div>'

    const acao = (o) =>
      o.codigo
        ? `<button class="btn estoque-action" onclick="verCodigo(${o.id})">VER ETIQUETA</button>`
        : `<button class="btn estoque-action" onclick="gerarCodigo(${o.id})">GERAR CÓDIGO</button>`
    const linhas = e
      .map(
        (o) =>
          `<tr><td><b>#${pad(o.id)}</b></td><td>#${o.pedido}<br>${o.cliente}</td><td>${o.produto}<br><small>Lote: ${o.lote}</small></td><td><b>${f(unEst(o))}</b></td><td>${bd(o.status)}<br><small>Código: ${o.codigo || '—'}</small></td><td>${acao(o)}</td></tr>`
      )
      .join('')
    return `<style>
      #estoque-view { width:100%; max-width:100%; overflow:hidden; }
      #estoque-view .estoque-table-card { width:100%; max-width:100%; box-sizing:border-box; overflow:hidden; }
      #estoque-view table { width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; }
      #estoque-view th, #estoque-view td { overflow-wrap:anywhere; word-break:break-word; white-space:normal !important; vertical-align:middle; }
      #estoque-view th { font-size:14px; padding:12px 8px; line-height:1.2; }
      #estoque-view td { font-size:14px; padding:16px 8px; line-height:1.3; }
      #estoque-view td small { display:inline-block; margin-top:4px; color:#5d6b7c; font-size:12px; line-height:1.2; }
      #estoque-view th:nth-child(1), #estoque-view td:nth-child(1) { width:11%; }
      #estoque-view th:nth-child(2), #estoque-view td:nth-child(2) { width:18%; }
      #estoque-view th:nth-child(3), #estoque-view td:nth-child(3) { width:27%; }
      #estoque-view th:nth-child(4), #estoque-view td:nth-child(4) { width:9%; text-align:center; }
      #estoque-view th:nth-child(5), #estoque-view td:nth-child(5) { width:19%; }
      #estoque-view th:nth-child(6), #estoque-view td:nth-child(6) { width:16%; }
      #estoque-view .estoque-action { width:100%; max-width:100%; min-height:48px; padding:10px 6px; font-size:13px; line-height:1.15; white-space:normal; }
      @media screen and (max-width:560px) {
        #estoque-view th { font-size:12px; padding:10px 5px; }
        #estoque-view td { font-size:12px; padding:14px 5px; }
        #estoque-view td small { font-size:10px; }
        #estoque-view .estoque-action { min-height:42px; font-size:11px; padding:8px 4px; }
      }
    </style><div id="estoque-view"><div class="card estoque-table-card"><table><tr><th>OP</th><th>Pedido / Cliente</th><th>Produto / Lote</th><th>Unid.</th><th>Status / Código</th><th>Ação</th></tr>${linhas}</table></div></div>`
  },
  exp() {
    const o = EXP ? op(EXP) : null,
      ent = DB.ordensProducao.filter((x) => x.status === 'CONCLUÍDA')
    let det = ''
    if (o)
      det = `<div class="card"><h3>Produto identificado</h3><div class="grid"><div>Produto<br><b>${o.produto}</b></div><div>Lote<br><b>${o.lote}</b></div><div>OP<br><b>${pad(o.id)}</b></div><div>Pedido / Cliente<br><b>#${o.pedido} · ${o.cliente}</b></div><div>Unidades<br><b>${f(unEst(o))}</b></div><div>Código<br><b>${o.codigo}</b></div><div>Prazo de entrega<br><b>${o.prazo}</b></div><div>Status<br>${bd(o.status)}</div></div>${o.status === 'EM ESTOQUE' ? `<button class="btn ok" style="font-size:20px;padding:18px 32px" onclick="entregar(${o.id})">REALIZAR ENTREGA</button>` : `<div class="warn">Este lote já saiu do estoque${o.entrega ? ` (entregue em ${o.entrega})` : ''}.</div>`}</div>`
    else if (EXPERR)
      det = `<div class="warn">❌ Código <b>${EXPERR}</b> não encontrado no sistema.</div>`
    return `<div class="card"><h3>Ler código de barras</h3><div class="row"><input id="cb" placeholder="Use o leitor ou digite o código" onkeydown="if(event.key==='Enter')lerCodigo()"><button class="btn" onclick="lerCodigo()">BUSCAR</button><button class="btn ok" onclick="abrirLeitor()">📷 LER COM A CÂMERA</button></div></div>${det}<div class="card"><h3>Entregas realizadas</h3>${
      ent.length
        ? `<table><tr><th>Lote</th><th>Produto</th><th>Cliente</th><th>Unidades</th><th>Entregue em</th></tr>${[
            ...ent,
          ]
            .reverse()
            .map(
              (x) =>
                `<tr><td>${x.lote}</td><td>${x.produto}</td><td>${x.cliente}</td><td>${f(unEst(x))}</td><td>${x.entrega || '—'}</td></tr>`
            )
            .join('')}</table>`
        : 'Nenhuma entrega ainda.'
    }</div>`
  },
  rast() {
    const q = (RQ || '').toLowerCase().replace(/#/g, '').trim(),
      all = DB.ordensProducao,
      r = q
        ? all.filter((o) =>
            [
              o.codigo || '',
              o.lote,
              String(o.id),
              pad(o.id),
              String(o.pedido),
              o.produto,
              o.cliente,
            ]
              .join(' ')
              .toLowerCase()
              .includes(q)
          )
        : []
    const un = (o) =>
      o.envasado
        ? (o.baldes ?? Math.floor(o.envasado / pb())) + ' unidades'
        : '—'
    const lista = `<div class="card"><table><tr><th>Lote</th><th>OP</th><th>Produto</th><th>Status</th><th></th></tr>${all.map((o) => `<tr><td>${o.lote}</td><td>${pad(o.id)}</td><td>${o.produto}</td><td>${bd(o.status)}</td><td><button class="btn" onclick="buscarRast('${o.lote}')">RASTREAR</button></td></tr>`).join('')}</table></div>`
    const det = (o) =>
      `<div class="card"><h3>Lote ${o.lote}</h3>${['PEDIDO #' + o.pedido, 'OP ' + pad(o.id), 'MISTURADOR: ' + (o.mix || '—'), 'PRODUÇÃO: ' + f(o.prod) + ' kg', 'LABORATÓRIO: ' + (o.lab ? o.lab.status.toUpperCase() : '—'), 'RETRABALHOS: ' + (o.retrabalho || 0), 'BOMBA: ' + (o.bomba || '—'), 'ENVASE: ' + (o.envasado ? f(o.envasado) + ' kg' : '—'), 'PERDA: ' + f((o.perdas || []).reduce((a, p) => a + p.kg, 0)) + ' kg', 'ESTOQUE: ' + un(o), 'EXPEDIÇÃO: ' + (o.status === 'CONCLUÍDA' ? 'ENTREGUE em ' + o.entrega : o.status)].map((s) => `<div style="text-align:center">${s}<br>↓</div>`).join('')}${tl(o)}</div>`
    return (
      `<div class="card"><input id="rq" placeholder="Pesquisar OP, lote, pedido, produto ou cliente" value="${RQ}" onkeydown="if(event.key==='Enter')buscarRast()"><button class="btn" onclick="buscarRast()">PESQUISAR</button><button class="btn gr" onclick="buscarRast('')">LIMPAR</button></div>` +
      (q
        ? r.map(det).join('') || '<div class="card">Nenhum resultado.</div>'
        : lista)
    )
  },
  ia() {
    const c = window.chatLog || []
    return `<div class="card"><h3>🤖 Assistente da Produção</h3><div class="chat">${c.map((m) => `<p class="${m[0]}">${m[0] === 'u' ? 'Usuário' : 'IA'}: ${m[1]}</p>`).join('')}</div><div>${['Qual a velocidade recomendada?', 'Por que a bomba está ineficiente?', 'Quais foram as perdas deste lote?', 'Compare este lote com os anteriores.', 'Qual misturador está disponível?', 'Por que esta OP está parada?', 'Qual foi o último lote aprovado?', 'Quais bombas apresentam anomalias?', 'Qual o OEE atual?', 'Qual o balanço de massa do último lote?', 'Qual o custo de energia por balde?'].map((q) => `<button class="btn gr" style="font-size:13px" onclick="pergunta('${q}')">${q}</button>`).join('')}</div><input id="q" placeholder="Digite uma pergunta..." onkeydown="if(event.key==='Enter')pergunta()"></div>`
  },
  mega() {
    const m = DB.mega
    return `<div class="card"><h3>Integração Mega ERP</h3>${bd('● CONECTADO')}<p>Última sincronização: <b>${m.sync}</b><br>Pedidos sincronizados: <b>${m.pedidos}</b> · OPs enviadas: <b>${m.ops}</b> · Atualizações pendentes: <b>${m.pend}</b></p><button class="btn" onclick="megaAct('ped')">SIMULAR RECEBIMENTO DE PEDIDO</button><button class="btn" onclick="megaAct('sync')">SINCRONIZAR MEGA</button><button class="btn" onclick="megaAct('OP enviada ao Mega')">ENVIAR OP AO MEGA</button><button class="btn" onclick="megaAct('status atualizado')">ATUALIZAR STATUS</button></div>`
  },
  log() {
    return `<div class="card">${DB.historico.map((h) => `<div class="al"><b>${h.t}</b> · ${h.u}: ${h.m}</div>`).join('') || 'Sem registros.'}</div>`
  },
  cfg() {
    const c = DB.configuracoes
    return `<div class="card"><h3>Limites operacionais da bomba (RPM)</h3><div class="row"><input id="lmin" type="number" value="${c.rpmMin}"><input id="lmax" type="number" value="${c.rpmMax}"><button class="btn" onclick="setLim()">SALVAR</button></div></div>
 <div class="card"><h3>Indicadores, custos e energia</h3><div class="row">${CFG_NUM.map(([k, l]) => `<label>${l}<input id="cf_${k}" type="number" step="any" value="${c[k]}"></label>`).join('')}</div></div>
 <div class="card"><h3>Canais de alerta (Telegram / WhatsApp)</h3><div class="row">${CFG_TXT.map(([k, l]) => `<label>${l}<input id="cf_${k}" type="text" value="${c[k] || ''}"></label>`).join('')}</div><small>Sem token/telefone, os alertas ficam em modo demonstração (aparecem só na tela OEE). Em produção, envie pelo servidor para não expor o token no navegador.</small><br><button class="btn" onclick="salvarCfg()">SALVAR PARÂMETROS</button><button class="btn gr" onclick="testarAlerta()">TESTAR ALERTA</button></div>
 <button class="btn no" onclick="reset()">RESETAR DADOS DEMONSTRATIVOS</button>`
  },
  perfil() {
    return `<div class="card"><h3>${U.nome}</h3>Cargo: ${U.cargo}<br>Setor: ${U.setor}<br>Permissões: ${ROLE[U.permissao].map((k) => MENU[k]).join(' / ')}</div>`
  },
}
/* ---------- TELAS / LOGIN ---------- */
function toggleAnalysisMenu() {
  const box = $('#analise-submenu')
  const btn = $('#analise-toggle')
  if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none'
  if (btn) btn.classList.toggle('on')
}
function renderMenu() {
  const keys = ROLE[U.permissao] || []
  return keys
    .filter((k) => !ANALISE.includes(k) || k === 'analise')
    .map((k) => {
      if (k !== 'analise')
        return `<a data-k="${k}" class="${V === k ? 'on' : ''}" onclick="go('${k}')">${MENU[k]}</a>`
      const sub = ANALISE.filter((item) => keys.includes(item))
      if (!sub.length) return ''
      const open = ANALISE.includes(V)
      return `<a id="analise-toggle" data-k="analise" class="${open ? 'on' : ''}" onclick="toggleAnalysisMenu()">${MENU[k]} <span style="float:right">▾</span></a><div id="analise-submenu" style="display:${open ? 'block' : 'none'};padding:0 0 6px 12px;border-left:2px solid var(--az);margin-left:14px">${sub.map((item) => `<a data-k="${item}" class="${V === item ? 'on' : ''}" style="font-size:13px;padding:8px 10px" onclick="go('${item}')">${MENU[item]}</a>`).join('')}</div>`
    })
    .join('')
}
function go(k) {
  V = k
  document.body.classList.remove('nav-open')
  draw(true)
  const m = $('main')
  if (m) m.scrollTop = 0
}
function draw(force) {
  if (!U) return
  const fo = document.activeElement
  if (
    !force &&
    fo &&
    /INPUT|TEXTAREA|SELECT/.test(fo.tagName) &&
    fo.id !== 'rq' &&
    fo.id !== 'q' &&
    V !== 'rast'
  )
    return
  const mn = $('main'),
    sy = mn ? mn.scrollTop : 0
  const faixa = DB.bombas
    .filter((b) => b.status === 'PARADA')
    .map(
      (b) =>
        `<div class="faixa">🛑 <b>${b.id} PAROU DE FUNCIONAR</b> — interrompida pelo gestor ${b.paradaPor} em ${b.paradaEm}. Envase nesta bomba suspenso.</div>`
    )
    .join('')
  const topo = `<div class="top"><div class="tt"><button class="menu-btn" onclick="document.body.classList.toggle('nav-open')">☰</button><h2>${MENU[V] || 'Meu Perfil'}</h2></div><div class="usr"><b>${U.nome}</b> · ${U.cargo} <span class="bd g">● Online</span></div></div>${V_[V]()}`
  document.body.classList.add('logged')
  const A = $('#app')
  if (A && A.dataset.u == U.id) {
    $('#faixas').innerHTML = faixa
    document
      .querySelectorAll('nav a[data-k]')
      .forEach((a) => a.classList.toggle('on', a.dataset.k === V))
    $('main').innerHTML = topo
  } else {
    $('#root').innerHTML =
      `<div id="faixas">${faixa}</div><div id="app" data-u="${U.id}"><div id="navbg" onclick="document.body.classList.remove('nav-open')"></div><nav><h2>MULTIPERFIL</h2>${renderMenu()}<hr><a data-k="perfil" class="${V === 'perfil' ? 'on' : ''}" onclick="go('perfil')">Meu Perfil</a><a onclick="sair()">Sair</a></nav><main>${topo}</main></div>`
  }
  const m2 = $('main')
  if (m2) m2.scrollTop = sy
  avisoPedido()
}
function sair() {
  U = null
  MX = mxNovo()
  sessionStorage.clear()
  stopCam()
  document.body.classList.remove('nav-open', 'logged')
  $('#aviso')?.remove()
  $('#saida')?.remove()
  fecharLeitor()
  home()
}
function stopCam() {
  stream && stream.getTracks().forEach((t) => t.stop())
  stream = null
}
function home() {
  stopCam()
  FT.forEach(clearTimeout)
  FT = []
  const ini = (n) =>
    n
      .split(' ')
      .filter(Boolean)
      .map((x) => x[0])
      .slice(0, 2)
      .join('')
  $('#root').innerHTML =
    `<div class="home"><h1>MULTIPERFIL</h1><p>Gestão Inteligente da Produção</p><p class="home-t">Selecione o funcionário</p><div class="emp-list">${DB.usuarios.map((u) => `<div class="emp ${SEL === u.id ? 'sel' : ''}" onclick="SEL=${u.id};home()"><span class="av">${ini(u.nome)}</span><div><b>${u.nome}</b><small>${u.cargo}</small></div></div>`).join('')}</div><div class="enter-bar"><button class="btn" style="${SEL ? '' : 'opacity:.5'}" onclick="SEL&&face()">ENTRAR</button></div></div>`
}
function face() {
  const u = DB.usuarios.find((x) => x.id === SEL)
  if (!u) return
  const rosto = `<svg viewBox="0 0 120 140" width="150" fill="none" stroke="#2fd47a" stroke-width="2"><path d="M60 10c-24 0-38 18-38 44 0 14 4 26 10 36 6 10 16 22 28 22s22-12 28-22c6-10 10-22 10-36 0-26-14-44-38-44z"/><path d="M38 56h16M66 56h16M60 60v22l-6 4M48 104q12 8 24 0"/></svg>`
  $('#root').innerHTML =
    `<div class="fid"><div class="fid-tab" id="ft"><h2>Reconhecimento Facial</h2><div class="fid-frame"><i style="top:0;left:0;border-right:0;border-bottom:0"></i><i style="top:0;right:0;border-left:0;border-bottom:0"></i><i style="bottom:0;left:0;border-right:0;border-top:0"></i><i style="bottom:0;right:0;border-left:0;border-top:0"></i><div id="fcam" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${rosto}</div><div class="fid-scan"></div></div><p id="fmsg" style="margin:20px 0 10px">Posicione seu rosto para liberar o acesso</p><div class="bar" style="background:#1b222d"><i id="fbar" style="width:0;transition:width 3.6s linear;background:#2fd47a"></i></div><small>${u.nome} · ${u.cargo}</small><br><button class="btn gr" onclick="home()">VOLTAR</button></div></div>`
  /* câmera é opcional: se permitir, aparece dentro da moldura */
  navigator.mediaDevices
    ?.getUserMedia({ video: true })
    .then((s) => {
      if (!$('#fcam')) return s.getTracks().forEach((t) => t.stop())
      stream = s
      $('#fcam').innerHTML =
        '<video autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video>'
      $('video').srcObject = s
    })
    .catch(() => {})
  const T = (fn, ms) => FT.push(setTimeout(fn, ms))
  T(() => {
    $('#fbar').style.width = '100%'
    $('#fmsg').textContent = 'Detectando rosto…'
  }, 100)
  T(() => ($('#fmsg').textContent = 'Analisando características…'), 1400)
  T(() => ($('#fmsg').textContent = 'Verificando identidade…'), 2600)
  T(() => {
    $('#ft').classList.add('ok')
    $('#fmsg').innerHTML = `✓ Rosto reconhecido<br><b>${u.nome}</b>`
  }, 3800)
  T(() => entrar(u.id), 4900)
}
function entrar(id) {
  U = DB.usuarios.find((u) => u.id == id)
  sessionStorage.u = id
  stopCam()
  $('#root').innerHTML =
    `<div class="center"><h2 style="color:var(--vd)">✓ Rosto reconhecido</h2><h3>${U.nome}</h3><p>${U.cargo}</p><p>Entrando no sistema…</p></div>`
  log('Login (demonstração facial)')
  V = TELA_INICIAL[U.permissao] || 'dash'
  setTimeout(draw, 1400)
}
initializeDatabase()
if (sessionStorage.u) {
  U = DB.usuarios.find((u) => u.id == sessionStorage.u)
  V = TELA_INICIAL[U.permissao] || 'dash'
  draw()
} else home()
