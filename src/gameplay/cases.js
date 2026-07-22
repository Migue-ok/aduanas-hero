/**
 * cases.js — el set de referencia CASO-101…106, transcrito del Vault
 * (`04 - Casos Aduaneros`). Los modelos psicológicos, señales, diálogos y tablas
 * de resolución vienen de esos documentos: aquí no se inventa nada.
 *
 * `psique.temas`: mapa tema → pico de estrés (topología del culpable).
 * `tipo`: 'culpable' | 'inocente' | 'profesional' — gobierna la respuesta a Calmar/Silencio.
 */

export const TEMAS = [
  { id: 'motivo', label: 'Motivo de viaje' },
  { id: 'itinerario', label: 'Itinerario' },
  { id: 'equipaje', label: 'Su equipaje' },
  { id: 'dinero', label: 'Dinero y pagos' },
  { id: 'contactos', label: 'Contactos y familia' },
];

export const CASOS = {
  'CASO-101': {
    id: 'CASO-101',
    titulo: 'El Comerciante Hormiga',
    gravedad: 'G1',
    perfil: {
      nombre: 'Ricardo Paredes', edad: 38, origen: 'Vuelo comercial de Miami · 3.ª vez este mes',
      presentacion: 'Polo de marca, apurado pero cordial. Maletas rígidas grandes. Te saluda por tu nombre.',
      colorRopa: 0x1a86e0, colorPiel: 0xc79b76, colorPelo: 0x2a1c12,
      patronCamisa: 'hawaiana', // camisa azul brillante con flores amarillas (ADR-005 / dir. arte)
      equipaje: 'maletas_rigidas', colorEquipaje: 0x555c66,
    },
    psique: {
      tipo: 'culpable', lineaBase: 20, umbral: 85,
      temas: { dinero: 15, itinerario: 15 }, // valor de la mercancía · frecuencia de viajes
    },
    dialogos: {
      saludo: '«Jefe, ¿cómo está? Rapidito nomás, que tengo taxi esperando.»',
      porTema: {
        motivo: '«Turismo, jefe. Ya sabe… compras, familia.»',
        itinerario: '«Miami, cuatro días. Vengo seguido, sí… la familia, pues.»',
        equipaje: '«Ropa, mis cosas. Dos laptops usadas, ahí está declarado.»',
        dinero: '«Trescientos dólares, lo que dice el papel. Eso está baratísimo allá, ¿ah?»',
        contactos: '«Mi hermana vive allá. Le llevo y le traigo encargos.»',
      },
      silencio: '«…Eso está baratísimo allá, por eso la gente compra. Yo no soy el único que viene, ¿ah?»',
      calmado: '«Así me gusta, jefe, gente razonable.»',
      presionado: '«Ya, ya… no se me ponga así. Todo tiene su papel, mire.»',
      confrontado: '«…Ya pues, jefe. Póngale el monto que es y no perdamos tiempo.»',
      quiebre: '«Ok, ok. Son nuevas. Usted gana. ¿Cuánto sale el impuesto?»',
    },
    documentos: [
      {
        id: 'pasaporte', titulo: 'PASAPORTE · R. PAREDES',
        lineas: [
          { texto: 'Nacionalidad: PERÚ · 38 años' },
          { texto: 'Sellos: 5 ENTRADAS EN 30 DÍAS', señal: 's_sellos' },
          { texto: 'Motivo declarado: turismo' },
        ],
      },
      {
        id: 'declaracion', titulo: 'DECLARACIÓN JURADA',
        lineas: [
          { texto: '«Efectos personales y 2 laptops usadas»' },
          { texto: 'Valor declarado: USD 300' },
        ],
      },
      {
        id: 'factura', titulo: 'FACTURA COMERCIAL',
        lineas: [
          { texto: 'Sin membrete · genérica' },
          { texto: 'Laptop ×2 · USD 150 c/u — catálogo ref.: USD 900 c/u', señal: 's_factura' },
        ],
      },
    ],
    xray: {
      items: [
        { forma: 'rect', material: 'mixto', x: 0.28, y: 0.45, w: 0.3, h: 0.2, etiqueta: 'Electrónica apilada, orden de fábrica', señal: 's_precintos' },
        { forma: 'blob', material: 'organico', x: 0.62, y: 0.5, w: 0.24, h: 0.3, etiqueta: 'Ropa con etiquetas' },
        { forma: 'rect', material: 'inorganico', x: 0.78, y: 0.65, w: 0.1, h: 0.16, etiqueta: '4 perfumes' },
      ],
    },
    justus: { objetivo: 'nada' },
    señales: {
      s_sellos: 'Pasaporte: 5 entradas en 30 días — un «turista» frecuente',
      s_factura: 'Factura genérica: USD 150 por laptop; catálogo dice USD 900 (subvaluación ×6)',
      s_precintos: 'Las laptops «usadas» vienen en caja sellada con precintos de fábrica',
    },
    decisiones: {
      correcta: ['COBRO'],
      COBRO: {
        calidad: 'solida',
        escena: 'El ticket sale con el valor real. Ricardo paga resoplando: «La próxima declaro, jefe.» La fila avanza.',
        diferida: 'Ricardo reaparecerá en tu puesto… declarando bien. El mundo aprende de ti.',
      },
      PASE: {
        calidad: 'fallo',
        escena: 'Cruza rápido y te deja un guiño de vendedor.',
        diferida: 'Noticia del cierre: fiscalización lo detecta en su próxima entrada. Tu sello aparece en el informe.',
      },
      RETENIDO: {
        calidad: 'fallo',
        escena: 'La revisión no encuentra delito: es una falta, no un crimen. Ricardo exige el libro de reclamaciones.',
        diferida: 'Queja formal. Asuntos Internos anota el exceso. −Reputación.',
      },
      DERIVADO: {
        calidad: 'fallo',
        escena: 'La unidad te lo devuelve en veinte minutos con una nota ácida: «Esto es un COBRO, colega.»',
        diferida: 'Queja formal. Asuntos Internos anota el exceso. −Reputación.',
      },
    },
  },

  'CASO-102': {
    id: 'CASO-102',
    titulo: 'La Primera Vez de Doña Rosa',
    gravedad: 'G0',
    perfil: {
      nombre: 'Rosa Quispe', edad: 67, origen: 'Vuelve de visitar a su hijo · primer vuelo internacional de su vida',
      presentacion: 'Abrigo grueso, bolsas de mano atadas con pita, papeles arrugados en una bolsa de plástico.',
      colorRopa: 0x5c4632, colorPiel: 0xa9825e, colorPelo: 0x9a9a9a,
      equipaje: 'bolsas', colorEquipaje: 0xcfcabb,
    },
    psique: {
      tipo: 'inocente', lineaBase: 45, umbral: 55,
      temas: {}, // LA CLAVE: estrés altísimo pero uniforme — sin picos temáticos
    },
    dialogos: {
      saludo: '«Buenas noches señor… ¿aquí está bien? ¿Me pongo aquí?»',
      porTema: {
        motivo: '«Fui a ver a mi hijo, señor. Tres años sin verlo… ¿está mal eso?»',
        itinerario: '«Él me compró el pasaje. Yo no sé de esas cosas, él lo arregló todo.»',
        equipaje: '«¿La maleta? Mi hijo la compró, ¿está mal? Son regalos, cositas…»',
        dinero: '«Casi nada, señor. Mi hijo me dio para el taxi nomás.»',
        contactos: '«Mi hijo, pues. Y mi comadre que me va a recoger… si no se ha dormido.»',
      },
      silencio: '«…¿Hice algo malo, señor? Dígame nomás, yo no sé de estos trámites…»',
      calmado: '«Gracias, señor… es que una se asusta. Todo es tan grande aquí.» (Sus manos se aquietan de verdad.)',
      presionado: '«¡Yo no traigo nada malo, señor, por Dios! ¡Revise, revise todo!» (Tiembla más.)',
      confrontado: '«No… no entiendo qué me está preguntando, señor…»',
      quiebre: 'Rosa se quiebra en llanto. La fila entera lo vio. No traía absolutamente nada.',
    },
    documentos: [
      {
        id: 'pasaporte', titulo: 'PASAPORTE · R. QUISPE',
        lineas: [
          { texto: 'Pasaporte NUEVO · un solo sello' },
          { texto: '67 años · Perú' },
        ],
      },
      {
        id: 'declaracion', titulo: 'DECLARACIÓN JURADA',
        lineas: [
          { texto: 'Letra temblorosa, llenada con ayuda' },
          { texto: 'Una casilla sin marcar (ruido, no dolo)', señal: 's_docs_ok' },
          { texto: 'Todo cuadra… si te tomas 20 segundos.' },
        ],
      },
    ],
    xray: {
      items: [
        { forma: 'blob', material: 'organico', x: 0.3, y: 0.5, w: 0.2, h: 0.26, etiqueta: 'Frascos con comida casera (ají, dulces)' },
        { forma: 'blob', material: 'organico', x: 0.55, y: 0.45, w: 0.26, h: 0.3, etiqueta: 'Regalos envueltos, ropa' },
        { forma: 'rect', material: 'inorganico', x: 0.78, y: 0.6, w: 0.08, h: 0.1, etiqueta: 'Marcos de fotos' },
      ],
    },
    justus: { objetivo: 'nada' },
    señales: {
      s_uniforme: 'Estrés alto pero UNIFORME: suda con todo, sin picos temáticos — topología de inocente',
      s_calma: 'Al calmarla, se calma DE VERDAD: los tells ceden — la firma del inocente',
      s_docs_ok: 'Documentos coherentes bajo el ruido: pasaporte nuevo, todo cuadra',
    },
    decisiones: {
      correcta: ['PASE'],
      PASE: {
        calidad: 'solida',
        escena: 'Rosa te bendice, recoge sus bolsas con las dos manos y se va. La fila respira.',
        diferida: 'El supervisor comenta tu manejo: «Así se trata a la gente.» +Reputación.',
      },
      COBRO: {
        calidad: 'fallo',
        escena: 'No hay nada que cobrar. Rosa paga confundida un tributo que no debe. Alguien de la fila graba con su celular.',
        diferida: 'La grabación llega a la prensa local. −Reputación.',
      },
      RETENIDO: {
        calidad: 'fallo',
        escena: 'Sus regalos desenvueltos sobre el mostrador. La fila mira. No hay nada. Ella recoge todo en silencio.',
        diferida: 'Queja formal del hijo (con abogado). Audiencia con el supervisor. −Reputación fuerte.',
      },
      DERIVADO: {
        calidad: 'fallo',
        escena: 'La unidad la devuelve en una hora. Una señora de 67 años, en un cuarto frío, por nada.',
        diferida: 'Queja formal del hijo (con abogado). −Reputación fuerte.',
      },
    },
  },

  'CASO-103': {
    id: 'CASO-103',
    titulo: 'El Mochilero de Madrugada',
    gravedad: 'G3',
    esTrama: true,
    perfil: {
      nombre: 'Joel Ramos', edad: 23, origen: 'Vuelo de madrugada · escala en ruta caliente (frontera norte)',
      presentacion: 'Mochila pequeña para «dos semanas». Ropa limpia pero dormido en los pies. No ha comido.',
      colorRopa: 0x37414f, colorPiel: 0x8a6244, colorPelo: 0x14100c,
      equipaje: 'mochila', colorEquipaje: 0x2f4034,
    },
    psique: {
      tipo: 'culpable', lineaBase: 28, umbral: 65,
      temas: { dinero: 35, itinerario: 25, contactos: 20 }, // quién pagó el pasaje · la escala · su familia
    },
    dialogos: {
      saludo: '«Buenas.» (No te mira. Aprieta las correas de la mochila.)',
      porTema: {
        motivo: '«Turismo. Dos semanas. Ya vuelvo, tengo… tengo cosas que hacer acá.»',
        itinerario: '«La escala… la eligió la agencia. Yo solo… era lo más barato, me dijeron.» (Traga en seco.)',
        equipaje: '«Ropa nomás. Puede ver. No es mía la… o sea, sí es mía. Ropa.»',
        dinero: '«…¿El pasaje? Lo… lo pagó un amigo. Me lo va a descontar. ¿Eso es un problema?» (Mira la salida.)',
        contactos: '«Mi familia no… ellos no saben que viajé. Era una sorpresa.» (La voz se le quiebra a media frase.)',
      },
      silencio: '«…Es que mi mamá está enferma, ¿ya? Por eso el apuro. Yo no… yo no quería ni viajar.»',
      calmado: '«Sí. Tranquilo. Estoy tranquilo.» (La pierna no deja de moverse.)',
      presionado: '«¡No tengo nada! ¡Revisen la mochila, no tengo NADA!» (Y es verdad. La mochila está limpia.)',
      confrontado: '«…» (Cierra los ojos. Sabe que se acabó.)',
      quiebre: '«Me dijeron que era un trabajo simple… Yo debía plata, ¿ya? Ellos pagaron el pasaje. No me deje ir, señor. Si me suben a otro avión, me muero.»',
    },
    documentos: [
      {
        id: 'pasaporte', titulo: 'PASAPORTE · J. RAMOS',
        lineas: [
          { texto: 'Pasaporte casi nuevo · 23 años' },
        ],
      },
      {
        id: 'boleto', titulo: 'BOLETO AÉREO',
        lineas: [
          { texto: 'Comprado AYER · en EFECTIVO' },
          { texto: 'Agencia a nombre de un TERCERO', señal: 's_boleto' },
          { texto: 'Escala: ruta caliente (alerta del turno)' },
        ],
      },
      {
        id: 'declaracion', titulo: 'DECLARACIÓN JURADA',
        lineas: [
          { texto: 'Impecable. Demasiado.' },
          { texto: 'La letra no parece suya…' },
        ],
      },
    ],
    xray: {
      items: [
        { forma: 'blob', material: 'organico', x: 0.35, y: 0.5, w: 0.22, h: 0.24, etiqueta: 'Ropa doblada' },
        { forma: 'rect', material: 'inorganico', x: 0.6, y: 0.55, w: 0.07, h: 0.14, etiqueta: 'Botella vacía' },
        { forma: 'rect', material: 'mixto', x: 0.72, y: 0.48, w: 0.1, h: 0.12, etiqueta: 'Un libro' },
      ],
      nota: 'La mochila está LIMPIA. Ese es el punto.',
    },
    justus: { objetivo: 'persona', señal: 's_justus' },
    escanerCorporal: {
      requiereSeñales: 1,
      señal: 's_cuerpo',
      texto: 'Sombras de densidad en el abdomen (silueta, protocolo §28)',
    },
    señales: {
      s_boleto: 'Boleto comprado ayer, en efectivo, por una agencia a nombre de un tercero',
      s_justus: 'Justus marca a la PERSONA, no a la mochila',
      s_picos: 'Picos de estrés localizados: el pasaje y la escala lo desarman; el resto fluye',
      s_cuerpo: 'Escáner corporal: sombras de densidad en el abdomen',
    },
    decisiones: {
      correcta: ['DERIVADO'],
      DERIVADO: {
        calidad: 'solida',
        escena: 'La unidad se lo lleva. Joel te sostiene la mirada un segundo — alivio y terror a la vez. Corte a negro.',
        diferida: 'CAPÍTULO 1 DE LA RED: «El detenido no declara quién lo contrató.» La Red toma nota de tu puesto.',
      },
      RETENIDO: {
        calidad: 'parcial',
        escena: 'Vacías la mochila sobre el mostrador. Nada. Sin escáner corporal, la retención no sostiene.',
        diferida: 'Sale libre. La noticia diferida revela el hospital de destino: la carga se le rompió adentro. Lo tuviste y lo soltaste.',
      },
      PASE: {
        calidad: 'fallo',
        escena: 'Cruza. La cámara se queda en su espalda medio segundo de más.',
        diferida: 'Noticia de hospital, con tu sello en el informe. −Reputación fuerte. La Red sigue — y te persigue.',
      },
      COBRO: {
        calidad: 'fallo',
        escena: 'No hay nada que cobrar.',
        diferida: 'Noticia de hospital, con tu sello en el informe. −Reputación fuerte.',
      },
    },
  },

  'CASO-104': {
    id: 'CASO-104',
    titulo: 'El Coleccionista Educado',
    gravedad: 'G2',
    perfil: {
      nombre: 'Álvaro Ferrand', edad: 55, origen: 'Doble nacionalidad · marchante de arte · sale con «réplicas certificadas»',
      presentacion: 'Saco de lino, trato encantador, ofrece su tarjeta. Coopera en todo. La cooperación es su camuflaje.',
      colorRopa: 0xcfc6ae, colorPiel: 0xd9b08c, colorPelo: 0xb8b0a4,
      equipaje: 'caja', colorEquipaje: 0x8a6a4a,
    },
    psique: {
      tipo: 'profesional', lineaBase: 12, umbral: 95,
      temas: { equipaje: 8 }, // procedencia de las piezas — amortiguado: esquiva, no suda
    },
    dialogos: {
      saludo: '«Oficial, buenas noches. Álvaro Ferrand, marchante. Mi tarjeta. Estoy a su entera disposición.»',
      porTema: {
        motivo: '«Negocios. Llevo réplicas artesanales a una galería. Todo certificado, por supuesto.»',
        itinerario: '«Salgo esta noche, vuelvo el mes próximo. La rutina del oficio.»',
        equipaje: '«Seis piezas. Réplicas de taller, certificadas… ¿Le comenté que la galería es suiza? Gente muy seria.» (Cambió de tema.)',
        dinero: '«Todo bancarizado, oficial. En mi rubro la informalidad es una vulgaridad.»',
        contactos: '«Mi taller de siempre. Veinte años trabajando juntos.»',
      },
      silencio: '«…» (Sonríe, paciente. El silencio no le pesa a él: te pesa a ti.)',
      calmado: '«Se lo agradezco, aunque le aseguro que estoy perfectamente.»',
      presionado: '«Oficial, con todo respeto: o me imputa algo, o le pediré que llamemos a mi abogado. Usted decide cómo usamos su tiempo.» (Se cierra.)',
      confrontado: '«…Esa fecha debe ser un error del taller.» (La sonrisa no cambia. Pero llama a su abogado ANTES de que digas nada más.)',
      quiebre: null, // no se quiebra: se DETECTA
    },
    documentos: [
      {
        id: 'certificados', titulo: 'CERTIFICADOS DE RÉPLICA ×6',
        lineas: [
          { texto: 'Taller «Manos del Norte» · 6 piezas' },
          { texto: 'Fecha de emisión: ANTERIOR a la fecha de fabricación declarada en factura', señal: 's_fechas' },
        ],
      },
      {
        id: 'permiso', titulo: 'PERMISO DE EXPORTACIÓN CULTURAL',
        lineas: [
          { texto: 'Cubre RÉPLICAS…' },
          { texto: '…no originales. La letra del permiso importa.' },
        ],
      },
    ],
    xray: {
      items: [
        { forma: 'blob', material: 'mixto', x: 0.22, y: 0.5, w: 0.11, h: 0.2, etiqueta: 'Pieza 1: densidad homogénea (cerámica moderna)' },
        { forma: 'blob', material: 'mixto', x: 0.36, y: 0.48, w: 0.11, h: 0.2, etiqueta: 'Pieza 2: densidad homogénea' },
        { forma: 'blob', material: 'mixto', x: 0.5, y: 0.52, w: 0.11, h: 0.2, etiqueta: 'Pieza 3: densidad homogénea' },
        { forma: 'blob', material: 'denso', x: 0.64, y: 0.5, w: 0.11, h: 0.2, etiqueta: 'Pieza 4: densidad IRREGULAR, restauraciones', señal: 's_densidad' },
        { forma: 'blob', material: 'mixto', x: 0.78, y: 0.49, w: 0.11, h: 0.2, etiqueta: 'Pieza 5: densidad homogénea' },
        { forma: 'blob', material: 'mixto', x: 0.9, y: 0.51, w: 0.09, h: 0.18, etiqueta: 'Pieza 6: densidad homogénea' },
      ],
    },
    justus: { objetivo: 'nada' },
    señales: {
      s_fechas: 'El certificado fue emitido ANTES de que la pieza «se fabricara» — fechas cruzadas',
      s_densidad: 'Una pieza lee densidad irregular con restauraciones: no es cerámica moderna',
      s_esquiva: 'Esquiva el tema de la procedencia con elegancia — dos veces. No suda: esquiva',
    },
    decisiones: {
      correcta: ['RETENIDO', 'DERIVADO'],
      RETENIDO: {
        calidad: 'solida',
        escena: 'Levantas la pieza. Su sonrisa no cambia — pero llama a su abogado antes de que digas nada. Se sabía atrapado.',
        diferida: 'Noticia: la pieza era un huaco Moche AUTÉNTICO. El museo lo recibe. +Reputación fuerte.',
      },
      DERIVADO: {
        calidad: 'aceptable',
        escena: 'La unidad de patrimonio se hace cargo, con menos protagonismo tuyo.',
        diferida: 'La pieza era auténtica. El museo la recibe.',
      },
      PASE: {
        calidad: 'fallo',
        escena: 'Se despide con una inclinación de cabeza perfecta.',
        diferida: 'La pieza aparece en una subasta extranjera. El reportaje rastrea su salida… hasta tu sello.',
      },
      COBRO: {
        calidad: 'fallo',
        escena: 'El patrimonio no se subsana con tributo.',
        diferida: 'La pieza aparece en una subasta extranjera. Nota del supervisor. −Reputación.',
      },
    },
  },

  'CASO-105': {
    id: 'CASO-105',
    titulo: 'El Maletín del Empresario',
    gravedad: 'G3',
    perfil: {
      nombre: 'Gustavo Linares', edad: 46, origen: '«Consultor de inversiones» · 3 países en 5 días',
      presentacion: 'Traje caro con arrugas de vuelo largo. Impaciente de entrada: la impaciencia como arma.',
      colorRopa: 0x23262e, colorPiel: 0xc79b76, colorPelo: 0x3a332c,
      equipaje: 'maletin', colorEquipaje: 0x3a2c1e,
    },
    psique: {
      tipo: 'culpable', lineaBase: 30, umbral: 75,
      temas: { dinero: 30, contactos: 25 }, // el origen del dinero · su cliente
    },
    dialogos: {
      saludo: '«Oficial. Tengo una reunión en cuarenta minutos. ¿Esto va a demorar?» (Consulta el reloj. La mano izquierda no suelta el maletín.)',
      porTema: {
        motivo: '«Negocios. Consultoría. ¿Necesita el organigrama también?»',
        itinerario: '«Tres países en cinco días. Así es mi trabajo. Algunos trabajamos, oficial.»',
        equipaje: '«Documentos. Contratos. Papeles que no le van a interesar.»',
        dinero: '«…¿Perdón? Está todo declarado. Siguiente pregunta.» (El fastidio tarda un segundo de más en armarse.)',
        contactos: '«Mi cliente es confidencial. Secreto profesional, ¿le suena?» (El reloj otra vez.)',
      },
      silencio: '«¿Vamos a quedarnos mirándonos? Mire, oficial, todos tenemos jefes. El mío es menos paciente que el suyo.»',
      calmado: '«No necesito que me calme. Necesito que me despache.» (La mano sigue en el maletín.)',
      presionado: '«¿Sabe con quién…? Olvídelo. Apúrese.» (Ironiza, pero el maletín no se mueve de su mano.)',
      confrontado: '«…» (El fastidio se desarma en dos segundos. Silencio.) «…Esto se puede arreglar, ¿no? Entre gente razonable.» (EL INTENTO DE COIMA QUEDA REGISTRADO COMO EVIDENCIA.)',
      quiebre: '«Quiero a mi abogado. No digo nada más.» (Se quiebra en frío: no llora — negocia.)',
    },
    documentos: [
      {
        id: 'declaracion', titulo: 'DECLARACIÓN JURADA',
        lineas: [
          { texto: 'Casilla «¿Transporta más de USD 10 000?»' },
          { texto: 'Marcada: NO', señal: 's_casilla' },
        ],
      },
      {
        id: 'itinerario', titulo: 'ITINERARIO',
        lineas: [
          { texto: '3 países en 5 días' },
          { texto: 'Todos, centros financieros.' },
        ],
      },
    ],
    xray: {
      items: [
        { forma: 'lamina', material: 'denso', x: 0.45, y: 0.5, w: 0.34, h: 0.22, etiqueta: 'Bloque denso y LAMINADO: masa homogénea inconfundible', señal: 's_bloque' },
        { forma: 'rect', material: 'mixto', x: 0.75, y: 0.42, w: 0.12, h: 0.1, etiqueta: 'Documentos, un celular' },
      ],
    },
    justus: { objetivo: 'nada' },
    señales: {
      s_casilla: 'Declaración: marcó «NO» en efectivo > USD 10 000 — la mentira formal',
      s_bloque: 'Rayos X: bloque denso laminado — fajos apilados leen como masa homogénea',
      s_coima: 'Intento de coima: «Esto se puede arreglar, ¿no?» — registrado como evidencia',
    },
    decisiones: {
      correcta: ['DERIVADO'],
      DERIVADO: {
        calidad: 'solida',
        escena: 'La unidad fiscal cuenta los fajos a cámara: USD 48 000, fajillas de dos bancos distintos. Linares llama a alguien que no contesta.',
        diferida: 'Noticia: el «cliente» era una fachada. Posible gancho a la Red.',
      },
      COBRO: {
        calidad: 'fallo',
        escena: 'El efectivo no declarado no es un tributo pendiente: es un delito en curso.',
        diferida: 'El monto reaparece en una investigación que te cita como el oficial que «lo tarificó».',
      },
      PASE: {
        calidad: 'fallo',
        escena: 'Se va sin despedirse. La mano izquierda, siempre en el maletín.',
        diferida: 'Noticia de lavado con tu sello en el informe. −Reputación fuerte.',
      },
      RETENIDO: {
        calidad: 'fallo',
        escena: 'La retención sin derivación se cae por forma: esto es competencia de la unidad fiscal.',
        diferida: 'El caso se cae en mesa de partes. −Reputación.',
      },
    },
  },

  'CASO-106': {
    id: 'CASO-106',
    titulo: 'La Jaula Silenciosa',
    gravedad: 'G2',
    perfil: {
      nombre: 'Sandra Meneses', edad: 34, origen: '«Exportadora de artesanía» · viaje de negocios corto',
      presentacion: 'Amable, organizada. Carpeta con TODOS los papeles listos antes de que los pidas.',
      colorRopa: 0x4a3a50, colorPiel: 0xd9b08c, colorPelo: 0x241a12,
      equipaje: 'caja', colorEquipaje: 0xb09a72,
    },
    psique: {
      tipo: 'culpable', lineaBase: 25, umbral: 60,
      temas: { equipaje: 25, itinerario: 20 }, // el contenido «frágil» · los tiempos de su vuelo
    },
    dialogos: {
      saludo: '«Buenas noches, oficial. Aquí tiene: pasaporte, declaración, factura, permiso de exportación. Todo en orden.» (Todo listo antes de que lo pidas.)',
      porTema: {
        motivo: '«Negocios. Exporto artesanía, cerámica sobre todo. Pequeña empresa, mucha ilusión.»',
        itinerario: '«Salgo en el vuelo de las 2:40… ¿falta mucho? Lo digo por el embarque.» (Segunda vez que pregunta la hora.)',
        equipaje: '«Cerámica embalada. Es… es frágil. Preferiría que no se manipule mucho, se rompe con nada.» (La sonrisa se tensa.)',
        dinero: '«Lo normal de un viaje corto. Está en la declaración.»',
        contactos: '«Mi socio me espera allá. Cliente nuevo, feria de artesanía.»',
      },
      silencio: '«…¿Falta mucho? De verdad lo digo solo por el embarque.» (Tercera vez.)',
      calmado: '«Estoy bien, gracias. Solo… los tiempos. Ya sabe cómo son los vuelos.» (La pierna sigue.)',
      presionado: '«¡Es cerámica! ¡Mire los papeles, está TODO en regla!» (Y los papeles, en efecto, están en regla.)',
      confrontado: '«…Iban a morir allá igual.» (Lo dice bajito. Su racionalización, y su confesión.)',
      quiebre: '«…Iban a morir allá igual, ¿ya? Al menos así… — ¿están vivos? Dígame si están vivos.» (Se quiebra por culpa, no por miedo.)',
    },
    documentos: [
      {
        id: 'carpeta', titulo: 'CARPETA COMPLETA · S. MENESES',
        lineas: [
          { texto: 'Pasaporte, declaración, factura, permiso: TODO EN REGLA.' },
          { texto: 'Este caso no se gana con papeles.' },
        ],
      },
    ],
    xray: {
      items: [
        { forma: 'blob', material: 'mixto', x: 0.3, y: 0.42, w: 0.12, h: 0.18, etiqueta: 'Cerámica embalada: siluetas regulares' },
        { forma: 'blob', material: 'mixto', x: 0.46, y: 0.44, w: 0.12, h: 0.18, etiqueta: 'Cerámica embalada' },
        { forma: 'blob', material: 'mixto', x: 0.62, y: 0.42, w: 0.12, h: 0.18, etiqueta: 'Cerámica embalada' },
        { forma: 'lamina', material: 'denso', x: 0.5, y: 0.78, w: 0.5, h: 0.07, etiqueta: 'FRANJA de densidad anómala en la base: doble fondo', señal: 's_fondo' },
        { forma: 'blob', material: 'organico', x: 0.38, y: 0.78, w: 0.06, h: 0.05, etiqueta: 'Masa orgánica pequeña, contorno irregular', señal: 's_masas' },
        { forma: 'blob', material: 'organico', x: 0.58, y: 0.79, w: 0.06, h: 0.05, etiqueta: 'Masa orgánica pequeña, contorno irregular', señal: 's_masas' },
      ],
    },
    justus: { objetivo: 'maleta', señal: 's_justus', insistente: true },
    señales: {
      s_fondo: 'Franja de densidad anómala en la base de la caja: doble fondo',
      s_masas: 'Pequeñas masas orgánicas de contorno irregular dentro del doble fondo',
      s_justus: 'Justus marca la caja con insistencia inusual — y esta vez el perro NO se equivoca',
    },
    decisiones: {
      correcta: ['RETENIDO', 'DERIVADO'],
      RETENIDO: {
        calidad: 'solida',
        escena: 'El doble fondo cede. Tubos con polluelos sedados — vivos. El veterinario del aeropuerto los recibe. Uno mueve la cabeza. Justus recibe su ovillo: se lo ganó.',
        diferida: 'Noticia: los polluelos, en el centro de rescate. Imagen sobria de recuperación. +Reputación.',
      },
      DERIVADO: {
        calidad: 'aceptable',
        escena: 'La unidad de fauna/CITES se hace cargo.',
        diferida: 'Los polluelos llegan al centro de rescate.',
      },
      PASE: {
        calidad: 'fallo',
        escena: 'La caja rueda hacia la salida. Justus la sigue con la mirada y gime bajito — el reproche más duro del juego no usa palabras.',
        diferida: 'Incautación en destino: la mitad no sobrevivió el viaje. El silencio de Justus en el siguiente turno.',
      },
      COBRO: {
        calidad: 'fallo',
        escena: 'No hay tributo que blanquee esto.',
        diferida: 'Incautación en destino: la mitad no sobrevivió el viaje. −Reputación.',
      },
    },
  },
};

/**
 * Generador de turno (curva de tensión del Bucle Principal §Estructura):
 * calentamiento legible → grises → clímax de trama al final.
 */
export function generarTurno() {
  const medios = ['CASO-102', 'CASO-104', 'CASO-105', 'CASO-106'].sort(() => Math.random() - 0.5);
  return ['CASO-101', medios[0], medios[1], 'CASO-103'];
}
