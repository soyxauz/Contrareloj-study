import React from 'react';
import type { PodcastFormat, PodcastDuration } from '../../types';
import { BookOpen, Zap, Award, MessageSquare } from 'lucide-react';

export interface PodcastFormatOption {
  id: PodcastFormat;
  title: string;
  description: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

export const PODCAST_FORMAT_OPTIONS: PodcastFormatOption[] = [
  {
    id: 'detailed',
    title: 'Información detallada',
    description: 'Una animada conversación entre dos presentadores que analizan y conectan temas de tus fuentes.',
    badge: 'Recomendado',
    icon: BookOpen,
    accentColor: 'amber',
  },
  {
    id: 'brief',
    title: 'Breve',
    description: 'Un resumen breve que sirve para que captes rápidamente las ideas principales de tus fuentes.',
    badge: 'Rápido',
    icon: Zap,
    accentColor: 'blue',
  },
  {
    id: 'critique',
    title: 'Crítica',
    description: 'Una revisión experta de tus fuentes, con comentarios constructivos para ayudarte a mejorar tu material.',
    badge: 'Evaluación',
    icon: Award,
    accentColor: 'rose',
  },
  {
    id: 'debate',
    title: 'Debate',
    description: 'Un debate reflexivo entre dos presentadores que arroja luz sobre diferentes perspectivas de tus fuentes.',
    badge: 'Perspectivas',
    icon: MessageSquare,
    accentColor: 'violet',
  },
];

export interface PodcastDurationOption {
  id: PodcastDuration;
  title: string;
  subtitle: string;
  detail: string;
}

export const PODCAST_DURATION_OPTIONS: PodcastDurationOption[] = [
  {
    id: 'short',
    title: 'Corto',
    subtitle: '-2 minutos',
    detail: '6 a 8 turnos rápidos (~200 palabras), ideal para un repaso ultra rápido.',
  },
  {
    id: 'normal',
    title: 'Normal',
    subtitle: '4 a 6 minutos',
    detail: '14 a 18 turnos equilibrados (~700 palabras), análisis completo del tema.',
  },
  {
    id: 'long',
    title: 'Largo',
    subtitle: '10 a 30 minutos',
    detail: 'Explicación exhaustiva y profunda (10 a 30 min, hasta 43 min máx). Desglose paso a paso sin bajar de 10 min.',
  },
];
