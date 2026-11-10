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
    description: 'Diálogo profundo que conecta y explica todos los conceptos clave de tus fuentes.',
    badge: 'Recomendado',
    icon: BookOpen,
    accentColor: 'amber',
  },
  {
    id: 'brief',
    title: 'Breve',
    description: 'Síntesis directa y ágil para captar lo esencial en pocos minutos.',
    badge: 'Rápido',
    icon: Zap,
    accentColor: 'blue',
  },
  {
    id: 'critique',
    title: 'Crítica',
    description: 'Evaluación analítica de tus apuntes con observaciones y matices expertos.',
    badge: 'Evaluación',
    icon: Award,
    accentColor: 'rose',
  },
  {
    id: 'debate',
    title: 'Debate',
    description: 'Contraste dinámico de posturas entre ambos presentadores sobre el material.',
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
    subtitle: '-2 min',
    detail: '6–8 turnos ágiles (~200 palabras).',
  },
  {
    id: 'normal',
    title: 'Normal',
    subtitle: '4–6 min',
    detail: '14–18 turnos equilibrados (~700 palabras).',
  },
  {
    id: 'long',
    title: 'Largo',
    subtitle: '10–30 min',
    detail: 'Desglose exhaustivo de todo el tema.',
  },
];
