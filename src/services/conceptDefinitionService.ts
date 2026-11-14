/**
 * Servicio de Definiciones Conceptuales Certeras (Estilo Google / Enciclopedia / Diccionario RAE & Médico)
 * Reemplaza frases de estudio informales o mnemotecnias por definiciones académicas rigurosas.
 */

const STORAGE_CACHE_KEY = 'thea_google_definitions_cache_v1';

// Diccionario académico de definiciones certeras de alta fidelidad (estilo Google/Wikipedia)
const CURATED_DEFINITIONS: Record<string, string> = {
  // Fisiología del Entrenamiento y Ciencias del Deporte
  'hipertrofia':
    'Aumento del tamaño y volumen de las fibras musculares (y de la masa muscular total), originado por un incremento en la síntesis y depósito de proteínas contráctiles (actina y miosina) en respuesta a sobrecarga.',
  'hipertrofia muscular':
    'Aumento del tamaño y volumen de las fibras musculares (y de la masa muscular total), originado por un incremento en la síntesis y depósito de proteínas contráctiles (actina y miosina) en respuesta a sobrecarga.',
  'continuo de repeticiones':
    'Principio fisiológico que postula que diferentes rangos de repeticiones y cargas (fuerza máxima 1-5 RM, hipertrofia 6-12 RM y resistencia >15 RM) inducen adaptaciones neuromusculares y estructurales específicas.',
  'zona de fuerza':
    'Rango de entrenamiento de alta intensidad (≥85% de 1RM, de 1 a 5 repeticiones) enfocado en maximizar el reclutamiento de unidades motoras y adaptaciones del sistema nervioso central.',
  'zona de hipertrofia':
    'Rango de entrenamiento (tradicionalmente entre 6 y 12 repeticiones con 65-80% de 1RM) orientado a acumular suficiente volumen y tensión mecánica para el crecimiento del tejido muscular.',
  'zona de resistencia':
    'Rango de trabajo neuromuscular con cargas ligeras (<60% de 1RM) y repeticiones elevadas (>15-20) destinado a mejorar la capacidad oxidativa celular y la tolerancia a la fatiga.',
  'tensión mecánica':
    'Fuerza o carga física externa ejercida sobre las fibras musculares durante la contracción muscular, detectada por mecanosensores celulares como el principal estímulo para la síntesis proteica.',
  'estrés metabólico':
    'Acumulación de metabolitos intramusculares (iones de hidrógeno H⁺, lactato y fosfatos inorgánicos) resultante de la glucólisis anaeróbica durante series de ejercicio intenso y continuo.',
  '1rm':
    'Repetición Máxima: peso o resistencia máxima que un individuo puede desplazar en un ejercicio determinado durante una sola repetición completa con técnica adecuada.',
  'repetición máxima':
    'Peso o resistencia máxima que un individuo puede desplazar en un ejercicio determinado durante una sola repetición completa con técnica adecuada.',
  'volumen de entrenamiento':
    'Cantidad total de trabajo realizado en una sesión o período, calculado generalmente como el producto de series × repeticiones × peso levantado.',
  'fallo muscular':
    'Punto durante una serie de ejercicio en el que el músculo fatigado no puede generar la fuerza mecánica suficiente para completar otra repetición con técnica adecuada.',
  'sobrecarga progresiva':
    'Aumento gradual y planificado del estímulo de entrenamiento (peso, repeticiones o series) a lo largo del tiempo para forzar al organismo a producir nuevas adaptaciones.',
  'reclutamiento de unidades motoras':
    'Activación progresiva de motoneuronas y sus fibras musculares asociadas por parte del sistema nervioso central para incrementar la fuerza de contracción.',
  'principio de henneman':
    'Regla fisiológica según la cual las unidades motoras se reclutan en orden de tamaño creciente, activando primero las fibras lentas (Tipo I) y progresando hacia las fibras rápidas (Tipo II) según la demanda de fuerza.',

  // Medicina, Embriología y Fisiopatología
  'sincitiotrofoblasto':
    'Capa externa multinucleada continua del trofoblasto placentario que invade el endometrio uterino, establece la circulación materno-fetal, sintetiza la hormona hCG y modula la tolerancia inmunitaria hacia el feto.',
  'trofoblasto':
    'Capa celular externa del blastocisto en las fases iniciales del desarrollo embrionario que da origen a la placenta y proporciona nutrientes al embrión.',
  'ley de laplace':
    'Principio biofísico ($T = \\frac{P \\cdot r}{2h}$) que establece que la tensión de la pared en una estructura hueca aumenta proporcionalmente a la presión interna y al radio, y disminuye con el grosor de la pared.',
  'obstrucción intestinal':
    'Detención mecánica o funcional del tránsito normal del contenido digestivo a través de la luz del intestino delgado o grueso.',
  'citoquinas':
    'Proteínas de bajo peso molecular que actúan como mediadores intercelulares en la respuesta inmune, la inflamación y la hematopoyesis.',
  'citoquinas placentarias':
    'Factores de señalización inmunitaria (como IL-10 y TGF-β) secretados en la interfase materno-fetal para inducir tolerancia inmunológica hacia los antígenos paternos.',
  'hla-g':
    'Molécula de histocompatibilidad no clásica expresada en las células trofoblásticas que inhibe los linfocitos citotóxicos y células NK para prevenir el rechazo materno del embrión.',
  'ido':
    'Indoleamina 2,3-dioxigenasa: enzima que degrada el triptófano en la placenta, privando a los linfocitos T maternos de este aminoácido esencial e induciendo tolerancia inmunitaria fetal.',
  'peristaltismo':
    'Conjunto de contracciones y relajaciones musculares coordinadas del tubo digestivo que impulsan el bolo alimentario o quimo en dirección aboral.',
  'isquemia':
    'Disminución transitoria o permanente del flujo sanguíneo arterial en un tejido, que ocasiona déficit de oxígeno y nutrientes esenciales.',
  'necrosis':
    'Muerte celular no programada y patológica provocada por un daño irreversible como isquemia severa, traumatismo o infección.',
  'volemia':
    'Volumen total de sangre circulante en el sistema cardiovascular de un organismo.',
  'alcalosis metabólica':
    'Trastorno del equilibrio ácido-base caracterizado por un incremento en la concentración plasmática de bicarbonato ($HCO_3^-$) y elevación del pH sanguíneo.',
  'acidosis metabólica':
    'Alteración clínica caracterizada por una reducción primaria de la concentración de bicarbonato en sangre y descenso del pH sistémico.',
  'ruidos hidroaéreos':
    'Sonidos fisiológicos generados por la interacción entre el gas y el líquido impulsados por el peristaltismo a través de la luz intestinal.',

  // Bioquímica y Biología Celular
  'homeostasis':
    'Estado de equilibrio dinámico mediante el cual los seres vivos regulan sus procesos fisiológicos internos para mantener la estabilidad frente a variaciones externas.',
  'atp':
    'Adenosín trifosfato: principal molécula transportadora de energía química utilizada en el metabolismo celular y la contracción muscular.',
  'glucólisis':
    'Vía metabólica citosólica que oxida la glucosa para obtener energía en forma de ATP y piruvato sin requerir oxígeno directo.',
  'mitocondria':
    'Orgánulo celular delimitado por doble membrana encargado de la respiración celular y la producción mayoritaria de ATP por fosforilación oxidativa.',
  'fosforilación oxidativa':
    'Vía metabólica mitocondrial en la que se sintetiza ATP acoplando la cadena transportadora de electrones con el gradiente electroquímico de protones.',
};

/**
 * Normaliza una clave conceptual para búsqueda en minúsculas y sin acentos.
 */
function normalizeConceptKey(term: string): string {
  return term
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const NORMALIZED_CURATED = new Map<string, string>();
for (const [k, v] of Object.entries(CURATED_DEFINITIONS)) {
  NORMALIZED_CURATED.set(normalizeConceptKey(k), v);
}

/**
 * Lee la caché persistente de definiciones de LocalStorage.
 */
function getMemoryCache(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Guarda una definición certera en la caché de LocalStorage.
 */
function saveMemoryCache(term: string, definition: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const cache = getMemoryCache();
    cache[normalizeConceptKey(term)] = definition;
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently ignore storage quota
  }
}

/**
 * Obtiene la definición certera (estilo Google / Enciclopedia) para un concepto.
 * Si existe en el diccionario curado o en caché, la devuelve de inmediato de forma síncrona.
 */
export function getAccurateDefinitionSync(term: string, fallbackDefinition?: string): string {
  const norm = normalizeConceptKey(term);

  // 1. Diccionario Curado de Alta Fidelidad
  if (NORMALIZED_CURATED.has(norm)) {
    return NORMALIZED_CURATED.get(norm)!;
  }

  // 2. Caché Persistente en LocalStorage
  const cache = getMemoryCache();
  if (cache[norm]) {
    return cache[norm];
  }

  // 3. Si la definición que venía en la guía ya es una definición formal (sin mnemotecnia informal)
  if (fallbackDefinition && fallbackDefinition.length >= 25) {
    const isMnemonicOrTip = /^(?:piensa en|recuerda que|para el examen|en el test|como regla|clave:|atencion:)/i.test(
      fallbackDefinition.trim()
    );
    if (!isMnemonicOrTip) {
      return fallbackDefinition;
    }
  }

  return fallbackDefinition || `Definición de ${term} en el contexto del material de estudio.`;
}

/**
 * Consulta a la IA para obtener la definición certera que aparece en Google / Enciclopedia
 * si el término no está en el diccionario precompilado.
 */
export async function fetchGoogleAccurateDefinition(
  term: string,
  contextSnippet?: string
): Promise<string> {
  const norm = normalizeConceptKey(term);

  // Verificar caché síncrona primero
  if (NORMALIZED_CURATED.has(norm)) {
    return NORMALIZED_CURATED.get(norm)!;
  }
  const cache = getMemoryCache();
  if (cache[norm]) {
    return cache[norm];
  }

  // Importar dinámicamente el servicio de IA para evitar ciclos de importación
  try {
    const { queryAICompletion } = await import('./aiService');

    const prompt = `Proporciona la definición formal, exacta y certera del siguiente concepto científico/médico/académico, exactamente como aparece al buscar su definición en Google o en una enciclopedia de referencia (Wikipedia / Diccionario Médico):

Concepto: "${term}"
${contextSnippet ? `Contexto del tema: "${contextSnippet.slice(0, 150)}"` : ''}

REGLAS ESTRICTAS:
1. Longitud máxima: 1 o 2 oraciones breves (de 25 a 45 palabras).
2. Tono formal, riguroso, objetivo y enciclopédico.
3. Prohibido incluir trucos de memoria o mnemotecnias ("Piensa en...", "Recuerda que...").
4. Prohibido usar introducciones como "La definición es...". Comienza directamente con la descripción del término.
5. Si incluye fórmulas relevantes (como la Ley de Laplace), usa KaTeX ($...$).`;

    const aiResponse = await queryAICompletion(
      [
        {
          role: 'system',
          content: 'Eres la enciclopedia de definiciones certeras de Google y Wikipedia. Proporciona solo la definición formal y directa.',
        },
        { role: 'user', content: prompt },
      ],
      false,
      undefined,
      {
        temperature: 0.2,
        max_tokens: 150,
      }
    );

    const cleaned = aiResponse
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^Definición:\s*/i, '')
      .trim();

    if (cleaned && cleaned.length >= 20) {
      saveMemoryCache(term, cleaned);
      return cleaned;
    }
  } catch (err) {
    console.warn('[conceptDefinitionService] No se pudo conectar a la IA, usando fallback:', err);
  }

  return getAccurateDefinitionSync(term, contextSnippet);
}
