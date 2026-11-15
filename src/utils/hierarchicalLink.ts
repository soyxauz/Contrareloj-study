/**
 * Utilidades para construir, sincronizar y compartir enlaces jerárquicos
 * para ContraReloj+:
 * - contrareloj.study/study/{kitId}?st={subtopicToken}
 * - contrareloj.study/smartStudy/{kitId}?st={subtopicToken}
 */

/**
 * Genera un token hash consistente y determinista de 8 caracteres hexadecimales
 * para representar el subtema jerárquico activo.
 */
export function generateSubtopicToken(subtopic: string): string {
  if (!subtopic) return '';
  let hash = 0;
  for (let i = 0; i < subtopic.length; i++) {
    hash = ((hash << 5) - hash) + subtopic.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

export interface HierarchicalLinkInfo {
  theaDisplayUrl: string;
  contrarelojDisplayUrl: string;
  absoluteUrl: string;
  subtopicToken: string;
}

/**
 * Construye tanto la URL canónica de visualización estilo ContraReloj (contrareloj.study/...)
 * como la URL absoluta del entorno local o desplegado lista para compartir y copiar al portapapeles.
 */
export function buildTheaHierarchicalUrl(
  mode: 'study' | 'smartStudy',
  kitId: string,
  subtopic?: string
): HierarchicalLinkInfo {
  const token = subtopic ? generateSubtopicToken(subtopic) : '';
  const query = token ? `?st=${token}` : '';
  const path = `/${mode}/${kitId}${query}`;

  const contrarelojDisplayUrl = `contrareloj.study${path}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const absoluteUrl = `${origin}${path}`;

  return {
    theaDisplayUrl: contrarelojDisplayUrl,
    contrarelojDisplayUrl,
    absoluteUrl,
    subtopicToken: token,
  };
}

/**
 * Actualiza de forma atómica y sin recarga la barra de direcciones del navegador
 * usando la API nativa de History.
 */
export function syncBrowserHierarchicalUrl(
  mode: 'study' | 'smartStudy',
  kitId: string,
  subtopic?: string
): void {
  if (typeof window === 'undefined') return;
  const { absoluteUrl } = buildTheaHierarchicalUrl(mode, kitId, subtopic);
  const currentUrl = window.location.pathname + window.location.search;
  const targetPathAndQuery = absoluteUrl.replace(window.location.origin, '');

  if (currentUrl !== targetPathAndQuery) {
    window.history.replaceState(
      {
        ...window.history.state,
        hierarchicalPath: targetPathAndQuery,
        subtopic,
      },
      '',
      targetPathAndQuery
    );
  }
}
