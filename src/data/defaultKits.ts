import type { StudyKit } from '../types';

export const DEFAULT_STUDY_KITS: StudyKit[] = [
  {
    id: 'bio-respiration',
    title: 'Biología Celular: Respiración & Metabolismo',
    category: 'Biología / Medicina',
    icon: 'Microscope',
    color: 'from-emerald-500 to-teal-700',
    description: 'Glucólisis, Ciclo de Krebs, Cadena de Transporte de Electrones y Fosforilación Oxidativa.',
    questions: [
      // ── NIVEL 1: FÁCIL (Fundamentos) ───────────────────────────────────
      {
        id: 'bio-q1',
        type: 'multiple-choice',
        question: '¿En qué compartimento celular tiene lugar la glucólisis anaeróbica?',
        options: ['Citoplasma / Citosol', 'Matriz mitocondrial', 'Espacio intermembrana', 'Crestas mitocondriales'],
        correctIndex: 0,
        difficulty: 'easy',
        topic: 'Glucólisis',
        explanation: 'La glucólisis ocurre enteramente en el citosol y no requiere oxígeno elemental. Convierte glucosa en 2 piruvatos, rindiendo 2 ATP netos y 2 NADH.'
      },
      {
        id: 'bio-q2',
        type: 'true-false',
        question: 'La respiración celular aeróbica degrada glucosa en presencia de oxígeno para producir energía metabólica en forma de ATP.',
        options: ['Verdadero', 'Falso'],
        correctIndex: 0,
        difficulty: 'easy',
        topic: 'Metabolismo General',
        explanation: 'Verdadero. La respiración aeróbica es la vía catabólica principal que extrae energía de los enlaces químicos de la glucosa.'
      },
      {
        id: 'bio-q3',
        type: 'matching',
        question: 'Empareja cada concepto clave con su localización celular correspondiente:',
        matchingPairs: [
          { term: 'Glucólisis', definition: 'Citosol celular' },
          { term: 'Ciclo de Krebs', definition: 'Matriz mitocondrial' },
          { term: 'Cadena de Electrones', definition: 'Membrana interna mitocondrial' },
          { term: 'Gradiente de Protones', definition: 'Espacio intermembrana' }
        ],
        difficulty: 'easy',
        topic: 'Compartimentación Celular',
        explanation: 'Correspondencias correctas:\n• Glucólisis: Citosol celular\n• Ciclo de Krebs: Matriz mitocondrial\n• Cadena de Electrones: Membrana interna mitocondrial\n• Gradiente: Espacio intermembrana'
      },
      {
        id: 'bio-q-diagram',
        type: 'image-labeling',
        question: 'Ubica cada etapa metabólica en su compartimento correspondiente del esquema celular:',
        diagramTitle: 'Esquema de Respiración Celular y Compartimentación',
        imageHotspots: [
          { id: 'pin-1', label: 'Glucólisis', xPercent: 22, yPercent: 40, hint: 'Citosol' },
          { id: 'pin-2', label: 'Ciclo de Krebs', xPercent: 55, yPercent: 50, hint: 'Matriz' },
          { id: 'pin-3', label: 'Cadena Respiratoria', xPercent: 80, yPercent: 65, hint: 'Membrana Interna' }
        ],
        imageWordBank: ['Glucólisis', 'Ciclo de Krebs', 'Cadena Respiratoria', 'Ciclo de Calvin', 'Fermentación Láctica'],
        difficulty: 'easy',
        topic: 'Compartimentación Celular',
        explanation: 'En el citosol ocurre la glucólisis, en la matriz mitocondrial el ciclo de Krebs, y en las crestas mitocondriales la cadena respiratoria acoplada a la ATP sintasa.'
      },
      {
        id: 'bio-q4',
        type: 'multiple-choice',
        question: '¿Cuál es la ganancia neta directa de ATP por cada molécula de glucosa durante la glucólisis?',
        options: ['2 ATP netos', '4 ATP netos', '32 ATP netos', '0 ATP netos'],
        correctIndex: 0,
        difficulty: 'easy',
        topic: 'Rendimiento Glucolítico',
        explanation: 'Aunque se producen 4 ATP en total, se consumen 2 ATP en la fase de inversión, dejando un balance neto de +2 ATP.'
      },
      {
        id: 'bio-q5',
        type: 'drag-drop',
        question: 'Arrastra las fichas para completar la ecuación fundamental de la respiración celular:',
        templateSentence: 'La oxidación de una molécula de {0} en presencia de oxígeno rinde dióxido de carbono, agua y {1}.',
        blanksCorrect: ['glucosa', 'ATP'],
        wordBank: ['glucosa', 'ATP', 'lactato', 'etanol'],
        difficulty: 'easy',
        topic: 'Resumen Global',
        explanation: 'La ecuación global es: C6H12O6 + 6 O2 -> 6 CO2 + 6 H2O + 30-32 ATP.'
      },

      // ── NIVEL 2: INTERMEDIO (Relaciones y Causalidad) ──────────────────
      {
        id: 'bio-q6',
        type: 'multiple-choice',
        question: '¿Cuál es el aceptor final de electrones en la fosforilación oxidativa mitocondrial?',
        options: ['Oxígeno molecular (O₂)', 'NAD+', 'FAD', 'Citrato'],
        correctIndex: 0,
        difficulty: 'medium',
        topic: 'Cadena de Transporte',
        explanation: 'El O₂ actúa como aceptor final en el Complejo IV. Al aceptar electrones y protones, se reduce para formar H₂O.'
      },
      {
        id: 'bio-q7',
        type: 'multi-select',
        question: 'Selecciona todas las coenzimas reducidas que donan electrones a la cadena respiratoria mitocondrial:',
        options: [
          'NADH (Nicotinamida adenina dinucleótido)',
          'FADH₂ (Flavina adenina dinucleótido)',
          'Acetil-CoA oxidado',
          'Lactato deshidrogenasa'
        ],
        correctIndices: [0, 1],
        difficulty: 'medium',
        topic: 'Coenzimas Transportadoras',
        explanation: 'Tanto el NADH (en el Complejo I) como el FADH₂ (en el Complejo II) entregan electrones de alta energía para impulsar el bombeo de protones.'
      },
      {
        id: 'bio-q8',
        type: 'drag-drop',
        question: 'Arrastra y coloca las fichas conceptuales para completar el mecanismo del Ciclo de Krebs:',
        templateSentence: 'El {0} de dos carbonos se condensa con el {1} de cuatro carbonos para formar citrato.',
        blanksCorrect: ['Acetil-CoA', 'oxalacetato'],
        wordBank: ['Acetil-CoA', 'oxalacetato', 'piruvato', 'succinato'],
        difficulty: 'medium',
        topic: 'Ciclo del Ácido Cítrico',
        explanation: 'La reacción inicial catalizada por la citrato sintasa une Acetil-CoA (2C) y oxalacetato (4C) dando citrato (6C).'
      },
      {
        id: 'bio-q9',
        type: 'matching',
        question: 'Empareja cada enzima o transportador con su función específica:',
        matchingPairs: [
          { term: 'ATP Sintasa', definition: 'Sintetiza ATP impulsada por la fuerza protón-motriz' },
          { term: 'PFK-1', definition: 'Principal enzima reguladora y marcapasos de la glucólisis' },
          { term: 'Citocromo c', definition: 'Transporta electrones entre el Complejo III y el IV' },
          { term: 'Ubiquinona (CoQ)', definition: 'Transportador lipídico móvil en la membrana interna' }
        ],
        difficulty: 'medium',
        topic: 'Enzimas y Complejos',
        explanation: 'Relaciones enzimáticas correctas verificadas.'
      },
      {
        id: 'bio-q10',
        type: 'true-false',
        question: 'En condiciones anaeróbicas (ausencia de oxígeno), la fermentación láctica permite oxidar NADH a NAD+ para que la glucólisis no se detenga.',
        options: ['Verdadero', 'Falso'],
        correctIndex: 0,
        difficulty: 'medium',
        topic: 'Vía Anaeróbica',
        explanation: 'Verdadero. La fermentación no genera ATP adicional, pero regenera el NAD+ indispensable para el paso 6 de la glucólisis.'
      },

      // ── NIVEL 3: DIFÍCIL (Dominio Crítico y Bioenergética) ──────────────
      {
        id: 'bio-q11',
        type: 'multiple-choice',
        question: '¿Qué complejo respiratorio transfiere electrones sin bombear ningún protón al espacio intermembrana?',
        options: [
          'Complejo II (Succinato deshidrogenasa)',
          'Complejo I (NADH deshidrogenasa)',
          'Complejo III (Citocromo bc1)',
          'Complejo IV (Citocromo c oxidasa)'
        ],
        correctIndex: 0,
        difficulty: 'hard',
        topic: 'Bioenergética Mitocondrial',
        explanation: 'El Complejo II (succinato deshidrogenasa) no atraviesa completamente la membrana interna y no bombea protones; por eso el FADH₂ rinde menos ATP que el NADH.'
      },
      {
        id: 'bio-q12',
        type: 'true-false',
        question: 'Un desacoplador como el DNP (2,4-dinitrofenol) detiene el transporte de electrones al inhibir directamente el Complejo I.',
        options: ['Verdadero', 'Falso'],
        correctIndex: 1,
        difficulty: 'hard',
        topic: 'Desacopladores Metabólicos',
        explanation: 'Falso. Los desacopladores disipan el gradiente de protones permeabilizando la membrana interna; el transporte de electrones continúa al máximo disipando energía como calor sin sintetizar ATP.'
      },
      {
        id: 'bio-q13',
        type: 'multi-select',
        question: 'Selecciona todas las moléculas o condiciones que actúan como inhibidores alostéricos directos de la fosfofructocinasa-1 (PFK-1):',
        options: [
          'Concentraciones intracelulares elevadas de ATP',
          'Altos niveles de Citrato citosólico',
          'Elevada concentración de AMP celular',
          'Fructosa-2,6-bisfosfato'
        ],
        correctIndices: [0, 1],
        difficulty: 'hard',
        topic: 'Regulación Alostérica',
        explanation: 'El ATP y el citrato son inhibidores alostéricos de la PFK-1 (señal de abundancia energética). En cambio, el AMP y la Fructosa-2,6-bisfosfato son potentes activadores.'
      },
      {
        id: 'bio-q14',
        type: 'drag-drop',
        question: 'Arrastra los conceptos para describir el acoplamiento quimiosmótico propuesto por Peter Mitchell:',
        templateSentence: 'La energía del transporte de electrones crea un {0} a través de la membrana, cuya disipación activa la {1}.',
        blanksCorrect: ['gradiente de protones', 'ATP sintasa'],
        wordBank: ['gradiente de protones', 'ATP sintasa', 'fermentación', 'osmosis inversa'],
        difficulty: 'hard',
        topic: 'Hipótesis Quimiosmótica',
        explanation: 'La teoría quimiosmótica demostró que el gradiente electroquímico protón-motriz es la fuerza motriz para la fosforilación oxidativa.'
      },
      {
        id: 'bio-q15',
        type: 'matching',
        question: 'Empareja los inhibidores metabólicos clásicos con su diana molecular exacta:',
        matchingPairs: [
          { term: 'Cianuro / Monóxido de Carbono', definition: 'Inhibe el Complejo IV (citocromo oxidasa)' },
          { term: 'Oligomicina', definition: 'Bloquea la subunidad F0 de la ATP sintasa' },
          { term: 'Rotenona', definition: 'Inhibe el flujo electrónico en el Complejo I' },
          { term: 'Antimicina A', definition: 'Bloquea el Complejo III (citocromo bc1)' }
        ],
        difficulty: 'hard',
        topic: 'Inhibidores Farmacológicos',
        explanation: 'Relaciones de inhibición toxicológica mitocondrial comprobadas.'
      }
    ],
    flashcards: [
      { id: 'f1', term: 'Glucólisis', definition: 'Ruta catabólica en el citosol que descompone glucosa en 2 piruvatos, rindiendo 2 ATP y 2 NADH.', mastery: 'mastered' },
      { id: 'f2', term: 'Ciclo de Krebs', definition: 'Ruta cíclica en la matriz mitocondrial que oxida grupos acetilo, liberando CO2 y generando NADH, FADH2 y GTP.', mastery: 'known' },
      { id: 'f3', term: 'ATP Sintasa', definition: 'Complejo enzimático rotatorio que utiliza la fuerza protón-motriz para fosforilar ADP en ATP.', mastery: 'to-learn' },
      { id: 'f4', term: 'Fosforilación Oxidativa', definition: 'Acoplamiento entre el transporte de electrones y la síntesis quimiosmótica de ATP.', mastery: 'known' },
      { id: 'f5', term: 'Fermentación Láctica', definition: 'Reducción del piruvato a lactato en ausencia de O2 para regenerar NAD+ y mantener la glucólisis activa.', mastery: 'to-learn' }
    ],
    studyGuideMarkdown: `# Guía de Estudio: Respiración Celular

## 1. Visión General del Proceso
La **respiración celular** es el conjunto de reacciones metabólicas mediante las cuales las células obtienen energía química (ATP) oxidando nutrientes orgánicos, principalmente glucosa:
$$\\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2 \\rightarrow 6\\text{CO}_2 + 6\\text{H}_2\\text{O} + 30-32\\text{ ATP}$$

### Etapas Principales:
1. **Glucólisis (Citosol):** 1 Glucosa $\\rightarrow$ 2 Piruvato + 2 ATP netos + 2 NADH.
2. **Descarboxilación del Piruvato (Matriz):** 2 Piruvato $\\rightarrow$ 2 Acetil-CoA + 2 CO₂ + 2 NADH.
3. **Ciclo de Krebs (Matriz):** 2 Acetil-CoA $\\rightarrow$ 4 CO₂ + 6 NADH + 2 FADH₂ + 2 ATP/GTP.
4. **Cadena de Transporte y Fosforilación Oxidativa (Membrana interna):** Transferencia de electrones al O₂ y síntesis masiva de ATP (~26-28 ATP).

## 2. Puntos Clave para Exámenes
* **Hipótesis Quimiosmótica de Peter Mitchell:** Los complejos I, III y IV bombean protones creando un gradiente electroquímico.
* **Control Alostérico:** La fosfofructocinasa-1 (PFK-1) es el principal punto de regulación de la glucólisis, inhibida por altos niveles de ATP y citrato.`,
    podcast: {
      id: 'pod-1',
      title: 'Episodio 1: Respiración Celular y el Flujo de Energía',
      duration: '4:15 min',
      hosts: [
        { name: 'Dr. Lucas (Tutor IA)', role: 'Bioquímico', avatar: 'L' },
        { name: 'Sofia (Host)', role: 'Estudiante', avatar: 'S' }
      ],
      dialogue: [
        { speaker: 'Sofia (Host)', time: '0:00', text: '¡Bienvenidos a Contrareloj Review Podcast! Hoy desarmamos la respiración celular en 4 minutos exactos, sin rodeos.' },
        { speaker: 'Dr. Lucas (Tutor IA)', time: '0:18', text: 'Exacto Sofía. Si hay una sola cosa que debes memorizar para el examen de mañana: la glucólisis ocurre en el citosol, mientras que Krebs y la cadena de electrones suceden en la mitocondria.' },
        { speaker: 'Sofia (Host)', time: '0:45', text: '¿Y por qué siempre preguntan sobre el aceptor final de electrones?' },
        { speaker: 'Dr. Lucas (Tutor IA)', time: '1:10', text: 'Porque es la razón biológica exacta por la que respiramos oxígeno. El O₂ recoge los electrones al final de la cadena formando agua; si no hay oxígeno, todo el tren de electrones se atasca.' },
        { speaker: 'Sofia (Host)', time: '2:15', text: '¡Increíble! Recordemos que el Complejo II no bombea protones, trampa clásica de opción múltiple.' },
        { speaker: 'Dr. Lucas (Tutor IA)', time: '3:20', text: 'Totalmente. Con 30 a 32 ATP por molécula de glucosa, la célula exprime cada joule de energía.' }
      ]
    }
  },
  {
    id: 'cs-algorithms',
    title: 'Estructuras de Datos & Algoritmos',
    category: 'Computer Science',
    icon: 'Binary',
    color: 'from-violet-600 to-indigo-800',
    description: 'Complejidad asintótica Big-O, Grafos, Árboles AVL, Tablas Hash y Programación Dinámica.',
    questions: [
      // ── NIVEL 1: FÁCIL (Conceptos Básicos de Algoritmia) ───────────────
      {
        id: 'cs-q1',
        type: 'multiple-choice',
        question: '¿Cuál es la complejidad temporal promedio de búsqueda en una Tabla Hash con función hash uniforme?',
        options: ['O(1) - Tiempo constante', 'O(log n) - Tiempo logarítmico', 'O(n) - Tiempo lineal', 'O(n²) - Tiempo cuadrático'],
        correctIndex: 0,
        difficulty: 'easy',
        topic: 'Hash Tables',
        explanation: 'En promedio, el cálculo del índice hash permite acceder a la cubeta en O(1) tiempo constante.'
      },
      {
        id: 'cs-q2',
        type: 'true-false',
        question: 'Una estructura de datos Pila (Stack) sigue el principio LIFO (Last In, First Out).',
        options: ['Verdadero', 'Falso'],
        correctIndex: 0,
        difficulty: 'easy',
        topic: 'Estructuras Lineales',
        explanation: 'Verdadero. En una pila, el último elemento apilado es el primero en desapilarse (LIFO).'
      },
      {
        id: 'cs-q3',
        type: 'matching',
        question: 'Empareja cada estructura de datos fundamental con su principio operativo:',
        matchingPairs: [
          { term: 'Pila (Stack)', definition: 'LIFO (Último en entrar, primero en salir)' },
          { term: 'Cola (Queue)', definition: 'FIFO (Primero en entrar, primero en salir)' },
          { term: 'Array Dinámico', definition: 'Acceso indexado por posición en tiempo O(1)' },
          { term: 'Lista Enlazada', definition: 'Nodos conectados por punteros sin contigüidad' }
        ],
        difficulty: 'easy',
        topic: 'Estructuras Básicas',
        explanation: 'Correspondencias de estructuras fundamentales comprobadas.'
      },
      {
        id: 'cs-q-diagram',
        type: 'image-labeling',
        question: 'Ubica las partes estructurales de un Árbol Binario de Búsqueda en el esquema:',
        diagramTitle: 'Anatomía de un Árbol Binario de Búsqueda (BST)',
        imageHotspots: [
          { id: 'pin-1', label: 'Nodo Raíz', xPercent: 50, yPercent: 22, hint: 'Origen' },
          { id: 'pin-2', label: 'Subárbol Izquierdo (<)', xPercent: 25, yPercent: 55, hint: 'Menores' },
          { id: 'pin-3', label: 'Subárbol Derecho (>)', xPercent: 75, yPercent: 55, hint: 'Mayores' }
        ],
        imageWordBank: ['Nodo Raíz', 'Subárbol Izquierdo (<)', 'Subárbol Derecho (>)', 'Puntero Nulo', 'Grafo Cíclico'],
        difficulty: 'easy',
        topic: 'Árboles y Grafos',
        explanation: 'En un BST, todo nodo en el subárbol izquierdo contiene un valor menor que la raíz, y todo nodo en el subárbol derecho contiene un valor mayor.'
      },
      {
        id: 'cs-q4',
        type: 'drag-drop',
        question: 'Arrastra las fichas para completar la definición de Búsqueda Binaria:',
        templateSentence: 'La búsqueda binaria requiere que el arreglo esté previamente {0} y tiene una complejidad de {1}.',
        blanksCorrect: ['ordenado', 'O(log n)'],
        wordBank: ['ordenado', 'O(log n)', 'desordenado', 'O(n²)'],
        difficulty: 'easy',
        topic: 'Búsqueda Binaria',
        explanation: 'La búsqueda binaria divide el espacio a la mitad en cada paso, requiriendo un arreglo ordenado.'
      },

      // ── NIVEL 2: INTERMEDIO (Algoritmos y Grafos) ──────────────────────
      {
        id: 'cs-q5',
        type: 'multiple-choice',
        question: '¿Qué algoritmo de ordenamiento por comparación garantiza un peor caso O(n log n) in-place?',
        options: ['HeapSort', 'QuickSort', 'MergeSort', 'BubbleSort'],
        correctIndex: 0,
        difficulty: 'medium',
        topic: 'Algoritmos de Ordenamiento',
        explanation: 'HeapSort garantiza O(n log n) en el peor caso y utiliza memoria auxiliar O(1) modificando el propio montículo en el arreglo.'
      },
      {
        id: 'cs-q6',
        type: 'multi-select',
        question: 'Selecciona todos los algoritmos aplicables para encontrar caminos mínimos o árboles de recubrimiento en grafos:',
        options: [
          'Algoritmo de Dijkstra (Caminos mínimos con pesos no negativos)',
          'Algoritmo de Kruskal (Árbol de recubrimiento mínimo)',
          'Búsqueda Binaria en Árboles Rojo-Negro',
          'Algoritmo de Bellman-Ford (Tolera pesos negativos)'
        ],
        correctIndices: [0, 1, 3],
        difficulty: 'medium',
        topic: 'Algoritmos de Grafos',
        explanation: 'Dijkstra y Bellman-Ford encuentran caminos mínimos, mientras que Kruskal calcula el Minimum Spanning Tree.'
      },
      {
        id: 'cs-q7',
        type: 'drag-drop',
        question: 'Arrastra y coloca las fichas para completar el principio de Programación Dinámica:',
        templateSentence: 'La programación dinámica se fundamenta en la {0} y la existencia de subproblemas {1}.',
        blanksCorrect: ['subestructura óptima', 'superpuestos'],
        wordBank: ['subestructura óptima', 'superpuestos', 'aleatorización', 'inmutables'],
        difficulty: 'medium',
        topic: 'Programación Dinámica',
        explanation: 'Las dos propiedades clave de la programación dinámica son la subestructura óptima y los subproblemas superpuestos.'
      },
      {
        id: 'cs-q8',
        type: 'matching',
        question: 'Empareja cada problema clásico con su técnica de resolución óptima:',
        matchingPairs: [
          { term: 'Mochila 0/1 (Knapsack)', definition: 'Programación Dinámica bidimensional' },
          { term: 'Actividades Compatibles', definition: 'Estrategia Voraz (Greedy por tiempo final)' },
          { term: 'Ordenación Topológica', definition: 'Recorrido DFS en grafo dirigido acíclico' },
          { term: 'Camino más corto no ponderado', definition: 'Búsqueda en Anchura (BFS)' }
        ],
        difficulty: 'medium',
        topic: 'Paradigmas de Diseño',
        explanation: 'Asignaciones de técnicas algorítmicas validadas.'
      },

      // ── NIVEL 3: DIFÍCIL (Dominio Teórico y Complejidad Asintótica) ─────
      {
        id: 'cs-q9',
        type: 'multiple-choice',
        question: 'En un Árbol AVL, ¿cuál es el factor de balance máximo permitido para cualquier nodo antes de requerir rotación?',
        options: ['Entre -1, 0 y +1', 'Exactamente 0', 'Cualquier valor menor a 3', 'No tiene límite si es binario'],
        correctIndex: 0,
        difficulty: 'hard',
        topic: 'Árboles Auto-balanceables',
        explanation: 'La propiedad invariante de un árbol AVL exige que para todo nodo, |altura(izq) - altura(der)| <= 1. Si llega a ±2, se aplica una rotación simple o doble.'
      },
      {
        id: 'cs-q10',
        type: 'true-false',
        question: 'El Algoritmo de Dijkstra produce resultados correctos garantizados incluso si el grafo contiene ciclos con aristas de peso negativo.',
        options: ['Verdadero', 'Falso'],
        correctIndex: 1,
        difficulty: 'hard',
        topic: 'Límites de Algoritmos',
        explanation: 'Falso. Dijkstra asume vorazmente que una vez visitado un nodo su distancia es final. Ante aristas negativas se debe utilizar Bellman-Ford.'
      },
      {
        id: 'cs-q11',
        type: 'multi-select',
        question: 'Selecciona todas las afirmaciones correctas sobre la clase de complejidad NP-Completo:',
        options: [
          'Un problema NP-Completo pertenece a NP (su solución se verifica en tiempo polinomial)',
          'Todo problema en NP puede reducirse en tiempo polinomial a cualquier problema NP-Completo',
          'Si se demuestra que un problema NP-Completo puede resolverse en P, entonces P = NP',
          'Los problemas NP-Completos son aquellos que ninguna computadora puede resolver jamás'
        ],
        correctIndices: [0, 1, 2],
        difficulty: 'hard',
        topic: 'Teoría de la Computación',
        explanation: 'Las tres primeras son definiciones formales de NP-Completo de Cook-Levin. La cuarta es falsa (son decidibles, solo que en tiempo superpolinomial/exponencial actualmente conocido).'
      },
      {
        id: 'cs-q12',
        type: 'drag-drop',
        question: 'Arrastra las fichas para completar el teorema del límite de ordenamiento por comparación:',
        templateSentence: 'Cualquier algoritmo de ordenamiento basado en comparaciones requiere al menos {0} comparaciones en el peor caso, representable mediante un {1}.',
        blanksCorrect: ['Ω(n log n)', 'árbol de decisión'],
        wordBank: ['Ω(n log n)', 'árbol de decisión', 'O(n)', 'grafo acíclico'],
        difficulty: 'hard',
        topic: 'Límites Teóricos',
        explanation: 'El modelo del árbol de decisión con n! hojas demuestra una cota inferior de log2(n!) = Ω(n log n) comparaciones.'
      }
    ],
    flashcards: [
      { id: 'cs-f1', term: 'Big-O O(1)', definition: 'Tiempo constante: el tiempo de ejecución no depende del tamaño de entrada.', mastery: 'mastered' },
      { id: 'cs-f2', term: 'Árbol AVL', definition: 'Árbol binario de búsqueda auto-balanceable donde la diferencia de alturas no supera 1.', mastery: 'known' },
      { id: 'cs-f3', term: 'Algoritmo de Dijkstra', definition: 'Encuentra el camino más corto desde un nodo origen a todos los demás en grafos con pesos no negativos.', mastery: 'to-learn' }
    ],
    studyGuideMarkdown: `# Guía de Estudio: Estructuras de Datos y Complejidad

## 1. Tabla de Complejidades Esenciales
* **Array estático:** Búsqueda por índice $O(1)$, Búsqueda por valor $O(n)$, Inserción/Borrado $O(n)$.
* **Binary Search Tree (Balanceado):** Búsqueda, inserción y borrado en $O(\\log n)$.
* **Hash Map:** Promedio $O(1)$, Peor caso $O(n)$.

## 2. Patrones de Entrevistas Técnicas
* **Two Pointers:** Arreglos ordenados o detección de palíndromos.
* **Sliding Window:** Subarreglos de longitud fija o variable con condiciones de suma máxima.`,
    podcast: {
      id: 'cs-pod',
      title: 'Episodio 2: Dominando Big-O y Árboles en Entrevistas',
      duration: '5:20 min',
      hosts: [
        { name: 'Alex (Senior Engineer)', role: 'Ingeniero de Software', avatar: 'A' },
        { name: 'Camila (Host)', role: 'Junior Dev', avatar: 'C' }
      ],
      dialogue: [
        { speaker: 'Camila (Host)', time: '0:00', text: '¡Hola! Hoy en Contrareloj Podcast revisamos cómo no confundirse entre tiempo y espacio al calcular Big-O.' },
        { speaker: 'Alex (Senior Engineer)', time: '0:35', text: 'Exacto. Muchas personas olvidan el espacio de la pila de recursión (call stack). Una recursión profunda de orden N consume O(N) espacio auxiliar.' }
      ]
    }
  }
];
